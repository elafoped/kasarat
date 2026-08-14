import React, { useState, useEffect } from 'react';
import { BackupService } from '../../domain/services/BackupService';
import { formatDateTime } from '../utils/formatters';

function Backup({ success, error, warning, info, settings, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [backupHistory, setBackupHistory] = useState([]);
  const [secureBackups, setSecureBackups] = useState([]);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [folderName, setFolderName] = useState('');
  const [fileName, setFileName] = useState('');

  // ============================================================
  // تحميل المعلومات
  // ============================================================
  useEffect(() => {
    loadData();
    checkAutoBackup();
    startAutoBackupTimer();
    loadSavedFolder();
    generateDefaultFileName();
  }, []);

  const loadData = () => {
    try {
      const history = JSON.parse(localStorage.getItem('backup_history') || '[]');
      setBackupHistory(history);
      
      const secure = BackupService.getSecureBackupsInfo();
      setSecureBackups(secure);
    } catch (e) {
      console.error('فشل تحميل البيانات:', e);
    }
  };

  const loadSavedFolder = () => {
    const folder = localStorage.getItem('backup_folder');
    if (folder) {
      setSelectedFolder(folder);
      setFolderName(folder);
    }
  };

  // ============================================================
  // توليد اسم ملف افتراضي
  // ============================================================
  const generateDefaultFileName = () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    setFileName(`backup_${dateStr}_${timeStr}`);
  };

  const checkAutoBackup = () => {
    const auto = localStorage.getItem('auto_backup_enabled');
    setAutoBackupEnabled(auto !== 'false');
    
    const lastAuto = localStorage.getItem('last_auto_backup_time');
    if (lastAuto && autoBackupEnabled) {
      const hours = (Date.now() - parseInt(lastAuto)) / (1000 * 60 * 60);
      if (hours >= 24) {
        BackupService.performAutoBackup().then(() => loadData());
      }
    }
  };

  const startAutoBackupTimer = () => {
    setInterval(() => {
      if (autoBackupEnabled) {
        const lastAuto = localStorage.getItem('last_auto_backup_time');
        if (lastAuto) {
          const hours = (Date.now() - parseInt(lastAuto)) / (1000 * 60 * 60);
          if (hours >= 24) {
            BackupService.performAutoBackup().then(() => loadData());
          }
        }
      }
    }, 60000);
  };

  // ============================================================
  // اختيار مجلد باستخدام showDirectoryPicker
  // ============================================================
  const selectFolder = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        const folder = window.prompt('أدخل مسار المجلد لحفظ النسخ الاحتياطية:', selectedFolder || 'C:\\Backups\\');
        if (folder) {
          setSelectedFolder(folder);
          setFolderName(folder.split(/[\\/]/).pop() || folder);
          localStorage.setItem('backup_folder', folder);
          success('✅ تم تحديد المجلد: ' + folder);
        }
        return;
      }

      const dirHandle = await window.showDirectoryPicker();
      const name = dirHandle.name;
      
      setSelectedFolder(name);
      setFolderName(name);
      localStorage.setItem('backup_folder', name);
      
      success('✅ تم اختيار المجلد: ' + name);
    } catch (e) {
      if (e.name !== 'AbortError') {
        error('❌ فشل اختيار المجلد: ' + e.message);
      }
    }
  };

  // ============================================================
  // التحقق من وجود ملف بنفس الاسم وإضافة رقم
  // ============================================================
  const getUniqueFileName = async (dirHandle, baseName) => {
    try {
      let counter = 1;
      let testName = baseName;
      
      // التحقق من وجود الملف
      while (true) {
        try {
          await dirHandle.getFileHandle(testName + '.json');
          // الملف موجود، جرب الاسم التالي
          testName = `${baseName}_${counter}`;
          counter++;
        } catch (e) {
          // الملف غير موجود، نستخدم هذا الاسم
          return testName;
        }
      }
    } catch (e) {
      // في حالة خطأ، نستخدم الاسم الأصلي مع إضافة رقم عشوائي
      return `${baseName}_${Date.now()}`;
    }
  };

  // ============================================================
  // إنشاء نسخة احتياطية مع إمكانية تسمية الملف
  // ============================================================
  const handleCreateBackup = async () => {
    try {
      setLoading(true);
      
      // 1. تصدير البيانات
      const backup = await BackupService.export();
      
      // 2. فتح نافذة اختيار المجلد
      if (!('showDirectoryPicker' in window)) {
        const folder = window.prompt('أدخل مسار المجلد لحفظ النسخة:', selectedFolder || 'C:\\Backups\\');
        if (!folder) {
          setLoading(false);
          return;
        }
        await BackupService.exportToFile(backup, folder);
        success(`✅ تم حفظ النسخة في المجلد: ${folder}`);
        loadData();
        if (onRefresh) onRefresh();
        setLoading(false);
        return;
      }

      // 3. فتح نافذة اختيار المجلد
      const dirHandle = await window.showDirectoryPicker();
      
      // 4. اسم الملف
      let finalFileName = fileName.trim() || `backup_${new Date().toISOString().split('T')[0]}`;
      
      // 5. التحقق من وجود ملف بنفس الاسم وإضافة رقم تلقائي
      const uniqueName = await getUniqueFileName(dirHandle, finalFileName);
      finalFileName = uniqueName;
      
      const fullFileName = finalFileName + '.json';
      
      // 6. إنشاء الملف في المجلد
      const fileHandle = await dirHandle.getFileHandle(fullFileName, { create: true });
      const writable = await fileHandle.createWritable();
      const json = JSON.stringify(backup, null, 2);
      await writable.write(json);
      await writable.close();
      
      // 7. حفظ اسم المجلد والملف
      setSelectedFolder(dirHandle.name);
      setFolderName(dirHandle.name);
      localStorage.setItem('backup_folder', dirHandle.name);
      
      // 8. تحديث التاريخ
      const history = JSON.parse(localStorage.getItem('backup_history') || '[]');
      history.unshift({
        timestamp: new Date().toISOString(),
        records: backup.totalRecords || 0,
        size: json.length,
        auto: false,
        type: 'يدوي',
        folder: dirHandle.name,
        fileName: fullFileName
      });
      localStorage.setItem('backup_history', JSON.stringify(history.slice(0, 20)));
      
      success(`✅ تم حفظ النسخة في المجلد: ${dirHandle.name}\n📄 اسم الملف: ${fullFileName}`);
      loadData();
      if (onRefresh) onRefresh();
      
    } catch (e) {
      console.error('خطأ في إنشاء النسخة:', e);
      if (e.name === 'AbortError') {
        warning('تم إلغاء عملية الحفظ');
      } else {
        error('❌ خطأ في إنشاء النسخة: ' + e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // استعادة نسخة محمية
  // ============================================================
  const handleRestoreSecure = async (index) => {
    if (!window.confirm(`⚠️ سيتم استعادة النسخة المحمية رقم ${index}. هل أنت متأكد؟`)) {
      return;
    }

    try {
      setLoading(true);
      const backup = BackupService.getSecureBackup(index);
      if (!backup) {
        warning('النسخة غير موجودة');
        return;
      }
      await BackupService.import(backup);
      success('✅ تم استعادة النسخة المحمية بنجاح');
      loadData();
      if (onRefresh) onRefresh();
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) {
      error('❌ خطأ في الاستعادة: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // حذف جميع البيانات
  // ============================================================
  const confirmDeleteAllData = async () => {
    if (deletePassword !== '123123123delet') {
      setDeleteError('❌ كلمة السر غير صحيحة');
      return;
    }

    if (!window.confirm('⚠️ سيتم حذف جميع البيانات نهائياً! النسخ المحمية ستبقى. هل أنت متأكد؟')) {
      return;
    }

    try {
      setLoading(true);
      await BackupService.deleteAllDataWithPassword(deletePassword);
      success('✅ تم حذف جميع البيانات، النسخ المحمية محفوظة');
      setShowDeleteModal(false);
      setDeletePassword('');
      loadData();
      if (onRefresh) onRefresh();
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) {
      error('❌ خطأ في الحذف: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // استعادة من ملف
  // ============================================================
  const handleRestoreFromFile = async () => {
    const fileInput = document.getElementById('restoreFileInput');
    if (!fileInput.files || !fileInput.files[0]) {
      warning('⚠️ اختر ملف النسخة الاحتياطية');
      return;
    }

    if (!window.confirm('⚠️ سيتم استبدال جميع البيانات الحالية. هل أنت متأكد؟')) {
      return;
    }

    try {
      setLoading(true);
      const backup = await BackupService.readFromFile(fileInput.files[0]);
      
      const summary = [
        `📅 التاريخ: ${backup.exportedAt || 'غير معروف'}`,
        `📦 الإصدار: ${backup.version || 'غير معروف'}`,
        `📊 عدد السجلات: ${backup.totalRecords || 0}`,
        `👤 الزبائن: ${backup.data.customers?.length || 0}`,
        `🧱 المواد: ${backup.data.materials?.length || 0}`,
        `💰 المبيعات: ${backup.data.sales?.length || 0}`
      ].join('\n');
      
      if (!window.confirm(`📋 ملخص النسخة:\n\n${summary}\n\nهل تريد المتابعة؟`)) {
        setLoading(false);
        return;
      }
      
      await BackupService.import(backup);
      success(`✅ تم استعادة البيانات بنجاح`);
      fileInput.value = '';
      loadData();
      if (onRefresh) onRefresh();
      setTimeout(() => window.location.reload(), 2000);
      
    } catch (e) {
      error('❌ خطأ في الاستعادة: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // عرض النسخ المحمية
  // ============================================================
  const renderSecureBackups = () => {
    if (secureBackups.length === 0) {
      return <div className="text-muted" style={{ padding: '0.5rem 0' }}>لا توجد نسخ محمية</div>;
    }
    
    return secureBackups.map((b, index) => (
      <div key={index} style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5rem 0.75rem',
        marginBottom: '0.25rem',
        background: index === 0 ? '#d1fae5' : '#ecfdf5',
        borderRadius: 'var(--radius)',
        border: index === 0 ? '2px solid #34d399' : '1px solid #a7f3d0'
      }}>
        <div>
          <span style={{ fontWeight: 'bold' }}>
            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🛡️'} 
            نسخة #{index + 1}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginRight: '0.5rem' }}>
            {formatDateTime(b.date)}
          </span>
          <span className="badge-status badge-success" style={{ fontSize: '0.6rem' }}>
            {index === 0 ? 'الأحدث' : 'محمية'}
          </span>
        </div>
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginRight: '0.5rem' }}>
            {(b.size / 1024).toFixed(1)} KB | {b.records} سجل
          </span>
          <button 
            className="btn btn-primary btn-xs" 
            onClick={() => handleRestoreSecure(index + 1)}
            disabled={loading}
          >
            استعادة
          </button>
        </div>
      </div>
    ));
  };

  return (
    <div className="page-section active">
      {/* ============================================================ */}
      {/* النسخ المحمية (آخر 5) */}
      {/* ============================================================ */}
      <div className="card" style={{ borderColor: '#34d399', background: '#f0fdf4' }}>
        <div className="card-title" style={{ color: '#065f46' }}>
          🛡️ النسخ المحمية (آخر 5)
          <span className="badge-status badge-success" style={{ marginRight: '0.5rem' }}>
            {secureBackups.length}/5
          </span>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
          هذه النسخ <strong>لا يمكن حذفها</strong> حتى عند مسح جميع البيانات
        </div>
        {renderSecureBackups()}
      </div>

    

      {/* ============================================================ */}
      {/* إنشاء نسخة */}
      {/* ============================================================ */}
      <div className="card mt-2">
        <div className="card-title">💾 إنشاء نسخة احتياطية</div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            className="btn btn-primary" 
            onClick={handleCreateBackup} 
            disabled={loading}
            style={{ padding: '0.6rem 1.5rem', fontSize: '1rem' }}
          >
            {loading ? '⏳ جاري الإنشاء...' : '📥 إنشاء نسخة الآن'}
          </button>
          
          <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
            {fileName ? (
              <span style={{ color: 'var(--success-600)' }}>
                📄 اسم الملف: <strong>{fileName}.json</strong>
              </span>
            ) : (
              <span style={{ color: 'var(--warning-600)' }}>
                ⚠️ سيتم استخدام اسم تلقائي
              </span>
            )}
          </div>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
          💾 سيتم فتح نافذة لاختيار المجلد، ثم حفظ الملف بالاسم المحدد
        </div>
      </div>

      {/* ============================================================ */}
      {/* النسخ التلقائي */}
      {/* ============================================================ */}
      <div className="card mt-2">
        <div className="card-title">⏰ النسخ التلقائي</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={autoBackupEnabled}
            onChange={(e) => {
              setAutoBackupEnabled(e.target.checked);
              localStorage.setItem('auto_backup_enabled', e.target.checked.toString());
              if (e.target.checked) {
                BackupService.performAutoBackup().then(() => loadData());
              }
            }}
          />
          تفعيل النسخ التلقائي (كل 24 ساعة)
        </label>
      </div>

      {/* ============================================================ */}
      {/* استعادة من ملف */}
      {/* ============================================================ */}
      <div className="card mt-2">
        <div className="card-title">📂 استعادة من ملف</div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input type="file" id="restoreFileInput" accept=".json" disabled={loading} />
          <button className="btn btn-warning" onClick={handleRestoreFromFile} disabled={loading}>
            {loading ? '⏳ جاري الاستعادة...' : '⚠️ استعادة'}
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* حذف جميع البيانات */}
      {/* ============================================================ */}
      <div className="card mt-2" style={{ borderColor: '#fca5a5' }}>
        <div className="card-title" style={{ color: '#dc2626' }}>🔥 حذف جميع البيانات</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)' }}>
          ⚠️ سيتم حذف جميع البيانات نهائياً. <strong>النسخ المحمية (آخر 5) ستبقى</strong>
        </p>
        <button className="btn btn-danger" onClick={() => setShowDeleteModal(true)} disabled={loading}>
          🗑️ حذف جميع البيانات
        </button>
      </div>


      {/* ============================================================ */}
      {/* Modal حذف البيانات */}
      {/* ============================================================ */}
      {showDeleteModal && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}>
          <div className="modal-box">
            <div className="modal-header">
              <h3>🔥 تأكيد حذف جميع البيانات</h3>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ 
                background: '#fef2f2', 
                padding: '0.75rem', 
                borderRadius: 'var(--radius)',
                marginBottom: '1rem'
              }}>
                ⚠️ <strong>سيتم حذف جميع البيانات التالية:</strong><br />
                • الزبائن • السيارات • المواد • المبيعات • الدفعات • الفواتير • المصروفات • المستخدمين
                <br /><br />
                ✅ <strong>سيتم الاحتفاظ بـ:</strong> آخر 5 نسخ احتياطية محمية
              </div>

              <div className="form-group">
                <label>🔑 كلمة السر لتأكيد الحذف</label>
                <input
                  className={`form-control ${deleteError ? 'is-invalid' : ''}`}
                  type="password"
                  value={deletePassword}
                  onChange={(e) => {
                    setDeletePassword(e.target.value);
                    setDeleteError('');
                  }}
                  placeholder="أدخل كلمة السر"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmDeleteAllData();
                  }}
                />
                {deleteError && <div className="error-text">{deleteError}</div>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowDeleteModal(false)}>إلغاء</button>
              <button className="btn btn-danger" onClick={confirmDeleteAllData} disabled={loading}>
                {loading ? '⏳ جاري الحذف...' : '🗑️ تأكيد الحذف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Backup;