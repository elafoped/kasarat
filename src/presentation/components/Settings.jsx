import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../core/database';
import { config } from '../../core/config';
import { formatCurrency, formatDate } from '../utils/formatters';
import { BackupService } from '../../domain/services/BackupService';
import { security } from '../../core/security';

function Settings({ settings, onUpdateSettings, showToast, success, error, warning }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [users, setUsers] = useState([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ username: '', password: '', name: '', role: 'user' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // إعدادات التطبيق
  const [appSettings, setAppSettings] = useState({
    companyName: settings.companyName || 'منشأة الكسارات',
    currency: settings.currency || 'ل.س',
    taxRate: settings.taxRate || 0,
    defaultReportGroup: settings.defaultReportGroup || 'week',
    autoBackup: settings.autoBackup !== undefined ? settings.autoBackup : true,
    backupInterval: settings.backupInterval || 24,
    showInvoices: settings.showInvoices !== undefined ? settings.showInvoices : true,
    showPayments: settings.showPayments !== undefined ? settings.showPayments : true,
    showDebts: settings.showDebts !== undefined ? settings.showDebts : true,
    showExpenses: settings.showExpenses !== undefined ? settings.showExpenses : true,
    showReports: settings.showReports !== undefined ? settings.showReports : true
  });

  // ============================================================
  // تحميل البيانات
  // ============================================================
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // إحصائيات النظام
      const [customers, vehicles, materials, sales, payments, invoices, expenses] = await Promise.all([
        db.getAll('customers'),
        db.getAll('vehicles'),
        db.getAll('materials'),
        db.getAll('sales'),
        db.getAll('payments'),
        db.getAll('invoices'),
        db.getAll('expenses')
      ]);

      const activeSales = sales.filter(s => s.status === 'active');
      const totalSales = activeSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
      const totalPayments = payments.filter(p => p.status === 'active').reduce((sum, p) => sum + (p.amount || 0), 0);

      setStats({
        customers: customers.length,
        vehicles: vehicles.length,
        materials: materials.length,
        sales: sales.length,
        activeSales: activeSales.length,
        payments: payments.length,
        invoices: invoices.length,
        expenses: expenses.length,
        totalSales: totalSales,
        totalPayments: totalPayments,
        totalDebt: totalSales - totalPayments,
        lastBackup: BackupService.getLastBackupInfo()
      });

      // تحميل المستخدمين
      const usersData = await db.getAll('users');
      setUsers(usersData || []);

    } catch (e) {
      error('خطأ في تحميل البيانات: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ============================================================
  // حفظ الإعدادات العامة
  // ============================================================
  const handleSaveSettings = () => {
    try {
      const newSettings = {
        companyName: appSettings.companyName.trim(),
        currency: appSettings.currency.trim() || 'ل.س',
        taxRate: parseFloat(appSettings.taxRate) || 0,
        defaultReportGroup: appSettings.defaultReportGroup,
        autoBackup: appSettings.autoBackup,
        backupInterval: parseInt(appSettings.backupInterval) || 24,
        showInvoices: appSettings.showInvoices,
        showPayments: appSettings.showPayments,
        showDebts: appSettings.showDebts,
        showExpenses: appSettings.showExpenses,
        showReports: appSettings.showReports
      };
      
      onUpdateSettings(newSettings);
      success('✅ تم حفظ الإعدادات بنجاح');
    } catch (e) {
      error('❌ خطأ في حفظ الإعدادات: ' + e.message);
    }
  };

  // ============================================================
  // تصدير نسخة احتياطية
  // ============================================================
  const handleExportBackup = async () => {
    try {
      setLoading(true);
      const backup = await BackupService.export();
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      success('✅ تم تصدير النسخة الاحتياطية بنجاح');
      await loadData();
    } catch (e) {
      error('❌ خطأ في التصدير: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // استعادة نسخة احتياطية
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
      const text = await fileInput.files[0].text();
      const backup = JSON.parse(text);
      await BackupService.import(backup);
      success('✅ تم استعادة النسخة الاحتياطية بنجاح');
      fileInput.value = '';
      await loadData();
      window.location.reload();
    } catch (e) {
      error('❌ خطأ في الاستعادة: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // إنشاء مستخدم جديد
  // ============================================================
  const handleCreateUser = async () => {
    if (!userForm.username.trim()) {
      warning('اسم المستخدم مطلوب');
      return;
    }
    if (!userForm.password || userForm.password.length < 4) {
      warning('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
      return;
    }

    try {
      setIsSubmitting(true);
      await security.createUser(
        userForm.username.trim(),
        userForm.password,
        userForm.name.trim() || userForm.username.trim(),
        userForm.role
      );
      success('✅ تم إنشاء المستخدم بنجاح');
      setShowUserModal(false);
      setUserForm({ username: '', password: '', name: '', role: 'user' });
      await loadData();
    } catch (e) {
      error('❌ خطأ: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================
  // حذف مستخدم
  // ============================================================
  const handleDeleteUser = async (id) => {
    if (!window.confirm('⚠️ هل أنت متأكد من حذف هذا المستخدم؟')) return;

    try {
      await security.deleteUser(id);
      success('✅ تم حذف المستخدم');
      await loadData();
    } catch (e) {
      error('❌ خطأ: ' + e.message);
    }
  };

  // ============================================================
  // تحديث الحقول
  // ============================================================
  const handleSettingChange = (field, value) => {
    setAppSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleUserChange = (field, value) => {
    setUserForm(prev => ({ ...prev, [field]: value }));
  };

  // ============================================================
  // عرض الإحصائيات
  // ============================================================
  const renderStats = () => {
    return (
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
        gap: '0.75rem',
        marginBottom: '1rem'
      }}>
        <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>👤 الزبائن</div>
          <div style={{ fontWeight: 'bold' }}>{stats.customers || 0}</div>
        </div>
        <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>🚗 السيارات</div>
          <div style={{ fontWeight: 'bold' }}>{stats.vehicles || 0}</div>
        </div>
        <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>🧱 المواد</div>
          <div style={{ fontWeight: 'bold' }}>{stats.materials || 0}</div>
        </div>
        <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>💰 المبيعات</div>
          <div style={{ fontWeight: 'bold' }}>{stats.activeSales || 0}</div>
        </div>
        <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>💵 الدفعات</div>
          <div style={{ fontWeight: 'bold' }}>{stats.payments || 0}</div>
        </div>
        <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>📄 الفواتير</div>
          <div style={{ fontWeight: 'bold' }}>{stats.invoices || 0}</div>
        </div>
        <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>💸 المصروفات</div>
          <div style={{ fontWeight: 'bold' }}>{stats.expenses || 0}</div>
        </div>
        <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>📊 إجمالي المبيعات</div>
          <div style={{ fontWeight: 'bold' }}>{formatCurrency(stats.totalSales || 0, settings.currency)}</div>
        </div>
        <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>📋 إجمالي الديون</div>
          <div style={{ fontWeight: 'bold', color: 'var(--danger-600)' }}>{formatCurrency(stats.totalDebt || 0, settings.currency)}</div>
        </div>
        <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>💾 آخر نسخة</div>
          <div style={{ fontWeight: 'bold' }}>
            {stats.lastBackup ? formatDate(stats.lastBackup.date) : 'لا توجد'}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-section active">
      {/* ============================================================ */}
      {/* الإعدادات العامة */}
      {/* ============================================================ */}
      <div className="card">
        <div className="card-title">⚙️ الإعدادات العامة</div>
        <div className="form-row">
          <div className="form-group">
            <label>اسم المنشأة</label>
            <input
              className="form-control"
              value={appSettings.companyName}
              onChange={(e) => handleSettingChange('companyName', e.target.value)}
              placeholder="اسم المنشأة"
            />
          </div>
          <div className="form-group">
            <label>العملة</label>
            <input
              className="form-control"
              value={appSettings.currency}
              onChange={(e) => handleSettingChange('currency', e.target.value)}
              placeholder="مثل: ل.س"
            />
          </div>
        </div>
        <div className="form-row">
       
          <div className="form-group">
            <label>التجميع الافتراضي للتقارير</label>
            <select
              className="form-control"
              value={appSettings.defaultReportGroup}
              onChange={(e) => handleSettingChange('defaultReportGroup', e.target.value)}
            >
              <option value="day">يومي</option>
              <option value="week">أسبوعي</option>
              <option value="month">شهري</option>
              <option value="year">سنوي</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleSaveSettings}>
          💾 حفظ الإعدادات
        </button>
      </div>

  

    


      {/* ============================================================ */}
      {/* إحصائيات النظام */}
      {/* ============================================================ */}
      <div className="card mt-2">
        <div className="card-title">📊 إحصائيات النظام</div>
        {loading ? (
          <div className="text-center">⏳ جاري التحميل...</div>
        ) : (
          renderStats()
        )}
        <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
          الإصدار: {config.VERSION} | آخر تحديث: {formatDate(new Date())}
        </div>
      </div>

      {/* ============================================================ */}
      {/* Modal إضافة مستخدم */}
      {/* ============================================================ */}
      {showUserModal && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) setShowUserModal(false); }}>
          <div className="modal-box">
            <div className="modal-header">
              <h3>➕ مستخدم جديد</h3>
              <button className="modal-close" onClick={() => setShowUserModal(false)} disabled={isSubmitting}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>اسم المستخدم <span className="required">*</span></label>
                <input
                  className="form-control"
                  value={userForm.username}
                  onChange={(e) => handleUserChange('username', e.target.value)}
                  placeholder="أدخل اسم المستخدم"
                  disabled={isSubmitting}
                />
              </div>
              <div className="form-group">
                <label>كلمة المرور <span className="required">*</span></label>
                <input
                  className="form-control"
                  type="password"
                  value={userForm.password}
                  onChange={(e) => handleUserChange('password', e.target.value)}
                  placeholder="أدخل كلمة المرور (4 أحرف على الأقل)"
                  disabled={isSubmitting}
                />
              </div>
              <div className="form-group">
                <label>الاسم</label>
                <input
                  className="form-control"
                  value={userForm.name}
                  onChange={(e) => handleUserChange('name', e.target.value)}
                  placeholder="الاسم الظاهر"
                  disabled={isSubmitting}
                />
              </div>
              <div className="form-group">
                <label>الدور</label>
                <select
                  className="form-control"
                  value={userForm.role}
                  onChange={(e) => handleUserChange('role', e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="admin">مدير</option>
                  <option value="manager">مدير تنفيذي</option>
                  <option value="accountant">محاسب</option>
                  <option value="warehouse">مستودعات</option>
                  <option value="user">مستخدم</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowUserModal(false)} disabled={isSubmitting}>
                إلغاء
              </button>
              <button className="btn btn-success" onClick={handleCreateUser} disabled={isSubmitting}>
                {isSubmitting ? '⏳ جاري الإنشاء...' : '💾 إنشاء'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  {/* ============================================================ */}
{/* إدارة المستخدمين */}
{/* ============================================================ */}
<div className="card mt-2">
  <div className="card-title">👥 إدارة المستخدمين</div>
  
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
    <span style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
      {users.length} مستخدم
    </span>
    <button className="btn btn-success btn-sm" onClick={() => setShowUserModal(true)}>
      ➕ مستخدم جديد
    </button>
  </div>

  <div className="table-wrap">
    <table>
      <thead>
        <tr>
          <th>اسم المستخدم</th>
          <th>الاسم</th>
          <th>الدور</th>
          <th>الحالة</th>
          <th>تاريخ الإنشاء</th>
          <th>الإجراءات</th>
        </tr>
      </thead>
      <tbody>
        {users.length === 0 ? (
          <tr><td colSpan="6" className="text-center">لا يوجد مستخدمين</td></tr>
        ) : (
          users.map(u => {
            const isCurrentUser = security.currentUser?.id === u.id;
            const roleNames = {
              admin: '👑 مدير',
              manager: '📋 مدير تنفيذي',
              accountant: '💰 محاسب',
              warehouse: '📦 مستودعات',
              user: '👤 مستخدم'
            };
            return (
              <tr key={u.id}>
                <td><strong>{u.username}</strong></td>
                <td>{u.name || u.username}</td>
                <td>
                  <span className="badge-status badge-primary">
                    {roleNames[u.role] || u.role}
                  </span>
                </td>
                <td>
                  <span className={`badge-status ${u.active !== false ? 'badge-success' : 'badge-danger'}`}>
                    {u.active !== false ? '✅ نشط' : '❌ غير نشط'}
                  </span>
                </td>
                <td>{new Date(u.createdAt).toLocaleDateString('ar-EG')}</td>
                <td>
                  {!isCurrentUser ? (
                    <>
                      <button 
                        className="btn btn-warning btn-xs" 
                        onClick={() => handleToggleUserStatus(u.id)}
                      >
                        {u.active !== false ? '⏸️' : '▶️'}
                      </button>
                      <button 
                        className="btn btn-danger btn-xs" 
                        onClick={() => handleDeleteUser(u.id)}
                      >
                        🗑️
                      </button>
                    </>
                  ) : (
                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                      (حسابك الحالي)
                    </span>
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </div>
</div>

}

export default Settings;