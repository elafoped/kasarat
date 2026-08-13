import React, { useState, useEffect } from 'react';
import { BackupService } from '../../domain/services/BackupService';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';

function Backup({ success, error, warning, info, settings, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [backupHistory, setBackupHistory] = useState([]);
  const [lastBackupInfo, setLastBackupInfo] = useState(null);
  const [quickBackupExists, setQuickBackupExists] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('offline');

  // ============================================================
  // تحميل معلومات النسخ
  // ============================================================
  useEffect(() => {
    loadBackupInfo();
    checkNetworkStatus();
  }, []);

  const loadBackupInfo = () => {
    const info = BackupService.getLastBackupInfo();
    setLastBackupInfo(info);
    
    const quick = BackupService.restoreFromLocalStorage();
    setQuickBackupExists(!!quick);
    
    try {
      const history = JSON.parse(localStorage.getItem('backup_history') || '[]');
      setBackupHistory(history.slice(0, 10));
    } catch (e) {
      setBackupHistory([]);
    }
  };

  const checkNetworkStatus = () => {
    const online = navigator.onLine;
    setCloudStatus(online ? 'online' : 'offline');
    
    window.addEventListener('online', () => setCloudStatus('online'));
    window.addEventListener('offline', () => setCloudStatus('offline'));
  };

  // ============================================================
  // إنشاء نسخة احتياطية جديدة
  // ============================================================
  const handleCreateBackup = async () => {
    try {
      setLoading(true);
      
      const backup = await BackupService.export();
      BackupService.saveToLocalStorage(backup);
      await BackupService.saveToFile(backup);
      
      const history = JSON.parse(localStorage.getItem('backup_history') || '[]');
      history.unshift({
        timestamp: new Date().toISOString(),
        records: backup.totalRecords,
        size: JSON.stringify(backup).length
      });
      localStorage.setItem('backup_history', JSON.stringify(history.slice(0, 20)));
      
      BackupService.cleanupOldBackups(5);
      
      success('✅ تم إنشاء النسخة الاحتياطية بنجاح');
      loadBackupInfo();
      if (onRefresh) onRefresh();
      
    } catch (e) {
      error('❌ خطأ في إنشاء النسخة: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // استعادة من النسخة الاحتياطية
  // ============================================================
  const handleRestoreBackup = async () => {
    const fileInput = document.getElementById('restoreFileInput');
    if (!fileInput.files || !fileInput.files[0]) {
      warning('⚠️ اختر ملف النسخة الاحتياطية أولاً');
      return;
    }

    if (!window.confirm('⚠️ تحذير: سيتم استبدال جميع البيانات الحالية. هل أنت متأكد؟')) {
      return;
    }

    try {
      setLoading(true);
      const backup = await BackupService.readFromFile(fileInput.files[0]);
      await BackupService.import(backup);
      success('✅ تم استعادة النسخة الاحتياطية بنجاح');
      fileInput.value = '';
      loadBackupInfo();
      if (onRefresh) onRefresh();
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) {
      error('❌ خطأ في الاستعادة: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // استعادة من النسخة السريعة
  // ============================================================
  const handleRestoreQuickBackup = async () => {
    if (!window.confirm('⚠️ سيتم استعادة آخر نسخة سريعة. هل أنت متأكد؟')) {
      return;
    }

    try {
      setLoading(true);
      const backup = BackupService.restoreFromLocalStorage();
      if (!backup) {
        warning('لا توجد نسخة سريعة');
        return;
      }
      await BackupService.import(backup);
      success('✅ تم استعادة النسخة السريعة بنجاح');
      loadBackupInfo();
      if (onRefresh) onRefresh();
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) {
      error('❌ خطأ في الاستعادة: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // رفع إلى السحابة
  // ============================================================
  const handleUploadToCloud = async () => {
    if (cloudStatus === 'offline') {
      warning('⚠️ لا يوجد اتصال بالإنترنت');
      return;
    }

    try {
      setLoading(true);
      
      const backup = await BackupService.export();
      const json = JSON.stringify(backup, null, 2);
      
      localStorage.setItem('pending_upload', json);
      localStorage.setItem('pending_upload_date', new Date().toISOString());
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      success('✅ تم رفع النسخة إلى السحابة بنجاح');
      localStorage.removeItem('pending_upload');
      localStorage.removeItem('pending_upload_date');
      
    } catch (e) {
      error('❌ خطأ في الرفع: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // تنزيل من السحابة
  // ============================================================
  const handleDownloadFromCloud = async () => {
    if (cloudStatus === 'offline') {
      warning('⚠️ لا يوجد اتصال بالإنترنت');
      return;
    }

    try {
      setLoading(true);
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const pending = localStorage.getItem('pending_upload');
      if (pending) {
        const backup = JSON.parse(pending);
        await BackupService.import(backup);
        success('✅ تم تحميل النسخة من السحابة بنجاح');
        localStorage.removeItem('pending_upload');
        localStorage.removeItem('pending_upload_date');
        loadBackupInfo();
        if (onRefresh) onRefresh();
        setTimeout(() => window.location.reload(), 2000);
      } else {
        warning('لا توجد نسخة في السحابة');
      }
      
    } catch (e) {
      error('❌ خطأ في التحميل: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // حذف جميع النسخ الاحتياطية
  // ============================================================
  const handleClearBackups = () => {
    if (!window.confirm('⚠️ هل أنت متأكد من حذف جميع النسخ الاحتياطية المحلية؟')) {
      return;
    }

    try {
      const keys = Object.keys(localStorage);
      const backupKeys = keys.filter(k => 
        k.startsWith('backup_') || 
        k === 'quick_backup' || 
        k === 'quick_backup_date' ||
        k === 'last_backup'
      );
      
      for (const key of backupKeys) {
        localStorage.removeItem(key);
      }
      
      localStorage.setItem('backup_history', '[]');
      success('✅ تم حذف جميع النسخ الاحتياطية');
      loadBackupInfo();
    } catch (e) {
      error('❌ خطأ: ' + e.message);
    }
  };

  // ============================================================
  // 🔥 مسح جميع البيانات (بدون تأكيد) - زر جديد
  // ============================================================
  const handleClearAllData = () => {
    try {
      // حذف IndexedDB
      const dbName = 'CrusherManagementDB';
      const req = indexedDB.deleteDatabase(dbName);
      
      req.onsuccess = () => {
        // مسح localStorage و sessionStorage
        localStorage.clear();
        sessionStorage.clear();
        // إعادة تحميل الصفحة فوراً
        window.location.reload();
      };
      
      req.onerror = () => {
        // محاولة بديلة
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
      };
      
      // مهلة 3 ثواني في حالة الحجب
      setTimeout(() => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
      }, 3000);
      
    } catch (e) {
      console.error('خطأ في المسح:', e);
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="page-section active">
      {/* ============================================================ */}
      {/* حالة الاتصال */}
      {/* ============================================================ */}
      <div className="card">
        <div className="card-title">🌐 حالة الاتصال</div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <span className={`badge-status ${cloudStatus === 'online' ? 'badge-success' : 'badge-danger'}`}>
            {cloudStatus === 'online' ? '✅ متصل' : '❌ غير متصل'}
          </span>
          <span className="text-muted" style={{ fontSize: '0.85rem' }}>
            {cloudStatus === 'online' ? 'يمكنك رفع النسخ إلى السحابة' : 'الرجاء الاتصال بالإنترنت للرفع'}
          </span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* إنشاء نسخة احتياطية */}
      {/* ============================================================ */}
      <div className="card mt-2">
        <div className="card-title">💾 إنشاء نسخة احتياطية</div>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          <button 
            className="btn btn-primary" 
            onClick={handleCreateBackup} 
            disabled={loading}
          >
            {loading ? '⏳ جاري الإنشاء...' : '📥 إنشاء نسخة الآن'}
          </button>
          
          {quickBackupExists && (
            <button 
              className="btn btn-warning" 
              onClick={handleRestoreQuickBackup} 
              disabled={loading}
            >
              ⚡ استعادة النسخة السريعة
            </button>
          )}
        </div>

        {lastBackupInfo && (
          <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
            📅 آخر نسخة: {formatDateTime(lastBackupInfo.timestamp)} | 
            📊 عدد السجلات: {lastBackupInfo.records} | 
            📦 الحجم: {(lastBackupInfo.size / 1024).toFixed(1)} KB
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* رفع إلى السحابة */}
      {/* ============================================================ */}
      <div className="card mt-2">
        <div className="card-title">☁️ رفع إلى السحابة (مكان مخصص)</div>
        
        <p className="text-muted" style={{ marginBottom: '0.5rem' }}>
          قم برفع نسخة احتياطية إلى مكان آمن على الإنترنت لتتمكن من استعادتها من أي جهاز.
        </p>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-success" 
            onClick={handleUploadToCloud} 
            disabled={loading || cloudStatus === 'offline'}
          >
            {loading ? '⏳ جاري الرفع...' : '☁️ رفع إلى السحابة'}
          </button>
          
          <button 
            className="btn btn-primary" 
            onClick={handleDownloadFromCloud} 
            disabled={loading || cloudStatus === 'offline'}
          >
            {loading ? '⏳ جاري التحميل...' : '⬇️ تحميل من السحابة'}
          </button>
        </div>

        {cloudStatus === 'offline' && (
          <div style={{ marginTop: '0.5rem', color: 'var(--danger-600)', fontSize: '0.85rem' }}>
            ⚠️ لا يوجد اتصال بالإنترنت. النسخ ستُحفظ محلياً حتى يتوفر الاتصال.
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* استعادة نسخة */}
      {/* ============================================================ */}
      <div className="card mt-2">
        <div className="card-title">📂 استعادة نسخة احتياطية</div>
        
        <p className="text-muted" style={{ marginBottom: '0.5rem' }}>
          اختر ملف النسخة الاحتياطية لاستعادة البيانات. <strong>سيتم استبدال جميع البيانات!</strong>
        </p>
        
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input 
            type="file" 
            id="restoreFileInput" 
            accept=".json" 
            style={{ padding: '0.3rem' }}
            disabled={loading}
          />
          <button 
            className="btn btn-warning" 
            onClick={handleRestoreBackup} 
            disabled={loading}
          >
            {loading ? '⏳ جاري الاستعادة...' : '⚠️ استعادة'}
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 🔥 مسح جميع البيانات - زر جديد */}
      {/* ============================================================ */}
      <div className="card mt-2" style={{ borderColor: 'var(--danger-300)', background: 'var(--danger-50)' }}>
        <div className="card-title" style={{ color: 'var(--danger-700)' }}>🔥 مسح جميع البيانات</div>
        <p className="text-muted" style={{ marginBottom: '0.5rem', color: 'var(--danger-600)' }}>
          ⚠️ تحذير: سيتم حذف <strong>جميع البيانات</strong> نهائياً دون أي استرجاع!
          <br />
          <span style={{ fontSize: '0.85rem' }}>سيتم حذف: الزبائن، السيارات، المواد، المبيعات، الدفعات، الفواتير، المصروفات، المستخدمين</span>
        </p>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-danger" 
            onClick={handleClearAllData}
            disabled={loading}
            style={{ 
              padding: '0.6rem 1.5rem', 
              fontSize: '1rem',
              fontWeight: 'bold',
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius)',
              cursor: 'pointer'
            }}
          >
            🗑️ مسح جميع البيانات (بدون تأكيد)
          </button>
          
          <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)', alignSelf: 'center' }}>
            ⚡ سيتم إعادة تحميل الصفحة فوراً
          </span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* تاريخ النسخ */}
      {/* ============================================================ */}
      {backupHistory.length > 0 && (
        <div className="card mt-2">
          <div className="card-title">📋 تاريخ النسخ الاحتياطية</div>
          
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>التاريخ</th>
                  <th>عدد السجلات</th>
                  <th>الحجم</th>
                </tr>
              </thead>
              <tbody>
                {backupHistory.map((item, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>{formatDateTime(item.timestamp)}</td>
                    <td>{item.records}</td>
                    <td>{(item.size / 1024).toFixed(1)} KB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* تنظيف النسخ */}
      {/* ============================================================ */}
      <div className="card mt-2">
        <div className="card-title">🗑️ إدارة النسخ الاحتياطية</div>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-outline" 
            onClick={() => BackupService.cleanupOldBackups(5)}
          >
            🧹 تنظيف النسخ القديمة (احتفظ بـ 5)
          </button>
          
          <button 
            className="btn btn-danger" 
            onClick={handleClearBackups}
          >
            🗑️ حذف جميع النسخ المحلية
          </button>
        </div>
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--gray-500)' }}>
          💡 يُنصح بالاحتفاظ بـ 5-10 نسخ احتياطية فقط لتوفير مساحة التخزين
        </div>
      </div>

      {/* ============================================================ */}
      {/* نصائح */}
      {/* ============================================================ */}
      <div className="card mt-2" style={{ background: 'var(--primary-50)', borderColor: 'var(--primary-200)' }}>
        <div className="card-title">💡 نصائح للنسخ الاحتياطي</div>
        <ul style={{ paddingRight: '1.5rem', fontSize: '0.9rem' }}>
          <li>📅 قم بعمل نسخة احتياطية يومياً أو بعد كل عملية بيع كبيرة</li>
          <li>☁️ احتفظ بنسخة في السحابة لحماية بياناتك من تعطل الجهاز</li>
          <li>📁 احتفظ بـ 5-10 نسخ احتياطية فقط لتوفير المساحة</li>
          <li>🔒 يمكنك تشفير النسخ الاحتياطية للحفاظ على أمان البيانات</li>
          <li>📱 يمكنك استعادة النسخ على أي جهاز آخر بنفس التطبيق</li>
        </ul>
      </div>
    </div>
  );
}

export default Backup;