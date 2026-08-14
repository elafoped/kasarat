import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../core/database';
import { Validators } from '../../core/validation';
import { formatCurrency, formatDate } from '../utils/formatters';

function Customers({ showToast, success, error, warning, settings, onRefresh }) {
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ============================================================
  // تحميل البيانات
  // ============================================================
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [customersData, salesData, paymentsData] = await Promise.all([
        db.getAll('customers'),
        db.getAll('sales'),
        db.getAll('payments')
      ]);
      setCustomers(customersData);
      setSales(salesData);
      setPayments(paymentsData);
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
  // حساب إجمالي المشتريات والرصيد لكل زبون
  // ============================================================
  const getCustomerStats = (customerId) => {
    const customerSales = sales.filter(s => s.customerId === customerId && s.status === 'active');
    const total = customerSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const customerPayments = payments.filter(p => p.customerId === customerId && p.status === 'active');
    const paid = customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const count = customerSales.length;
    return { total, paid, balance: total - paid, count };
  };

  // ============================================================
  // التحقق من صحة البيانات
  // ============================================================
  const validateForm = () => {
    const newErrors = {};
    
    const nameCheck = Validators.validateCustomerName(formData.name);
    if (!nameCheck.valid) {
      newErrors.name = nameCheck.message;
    }
    
    if (formData.phone) {
      const phoneCheck = Validators.validatePhone(formData.phone);
      if (!phoneCheck.valid) {
        newErrors.phone = phoneCheck.message;
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ============================================================
  // إضافة أو تحديث زبون
  // ============================================================
  const handleSubmit = async () => {
    setErrors({});
    
    if (!validateForm()) {
      warning('يوجد أخطاء في النموذج');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const now = new Date().toISOString();
      const phoneCheck = Validators.validatePhone(formData.phone);
      const cleanedData = {
        name: formData.name.trim(),
        phone: phoneCheck.valid ? phoneCheck.cleaned : '',
        address: formData.address.trim(),
        notes: formData.notes.trim()
      };

      // التحقق من وجود زبون بنفس الاسم
      const existing = customers.find(c => 
        c.name.toLowerCase() === cleanedData.name.toLowerCase() && 
        c.id !== editingCustomer?.id
      );
      
      if (existing) {
        warning('⚠️ يوجد زبون بنفس الاسم');
        setIsSubmitting(false);
        return;
      }

      if (editingCustomer) {
        await db.put('customers', {
          ...editingCustomer,
          ...cleanedData,
          updatedAt: now
        });
        success('✅ تم تحديث الزبون بنجاح');
      } else {
        await db.add('customers', {
          ...cleanedData,
          createdAt: now
        });
        success('✅ تم إضافة الزبون بنجاح');
      }

      // ============================================================
      // إغلاق الديالوغ - تحديث فوري
      // ============================================================
      setShowModal(false);
      setEditingCustomer(null);
      setFormData({ name: '', phone: '', address: '', notes: '' });
      setErrors({});
      
      await loadData();
      if (onRefresh) onRefresh();

    } catch (e) {
      error('❌ خطأ: ' + e.message);
      console.error('خطأ في حفظ الزبون:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================
  // حذف زبون
  // ============================================================
  const handleDelete = async (id) => {
    if (!window.confirm('⚠️ هل أنت متأكد من حذف هذا الزبون؟')) return;
    
    try {
      const salesList = await db.getByIndex('sales', 'customerId', id);
      if (salesList.length > 0) {
        error(`❌ لا يمكن حذف زبون لديه ${salesList.length} مبيعات`);
        return;
      }
      
      const vehiclesList = await db.getByIndex('vehicles', 'customerId', id);
      if (vehiclesList.length > 0) {
        error(`❌ لا يمكن حذف زبون لديه ${vehiclesList.length} سيارات`);
        return;
      }
      
      await db.delete('customers', id);
      success('✅ تم حذف الزبون');
      
      await loadData();
      if (onRefresh) onRefresh();
      
    } catch (e) {
      error('❌ خطأ: ' + e.message);
    }
  };

  // ============================================================
  // فتح وإغلاق الديالوغ
  // ============================================================
  const openModal = (customer = null) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name || '',
        phone: customer.phone || '',
        address: customer.address || '',
        notes: customer.notes || ''
      });
    } else {
      setEditingCustomer(null);
      setFormData({ name: '', phone: '', address: '', notes: '' });
    }
    setErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setShowModal(false);
    setEditingCustomer(null);
    setErrors({});
    setFormData({ name: '', phone: '', address: '', notes: '' });
  };

  // ============================================================
  // البحث المتقدم
  // ============================================================
  const getFilteredCustomers = useCallback(() => {
    if (!search || search.trim() === '') {
      return customers;
    }
    
    const q = search.trim().toLowerCase();
    const results = [];
    const seen = new Set();
    const limit = 100;
    
    for (const c of customers) {
      if (seen.has(c.id)) continue;
      if (c.name.toLowerCase().includes(q)) {
        results.push(c);
        seen.add(c.id);
        if (results.length >= limit) break;
      }
    }
    
    if (results.length < limit) {
      for (const c of customers) {
        if (seen.has(c.id)) continue;
        if (c.phone && c.phone.includes(q)) {
          results.push(c);
          seen.add(c.id);
          if (results.length >= limit) break;
        }
      }
    }
    
    return results;
  }, [customers, search]);

  const filtered = getFilteredCustomers();

  return (
    <div className="page-section active">
      {/* ============================================================ */}
      {/* شريط الأدوات */}
      {/* ============================================================ */}
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => openModal()}>
          ➕ زبون جديد
        </button>
        <div className="spacer"></div>
        <div className="search-box">
          <span>🔍</span>
          <input 
            type="text" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder={`بحث بالاسم أو الهاتف (${customers.length} زبون)...`}
          />
        </div>
        <button className="btn btn-outline btn-sm" onClick={loadData}>
          🔄 تحديث
        </button>
        <span className="text-muted" style={{fontSize: '0.75rem'}}>
          {customers.length} زبون
        </span>
      </div>

      {/* ============================================================ */}
      {/* إحصائيات سريعة */}
      {/* ============================================================ */}
      <div className="stats-mini">
        <div className="stat-item">
          <div className="label">👤 إجمالي الزبائن</div>
          <div className="value">{customers.length}</div>
        </div>
        <div className="stat-item">
          <div className="label">📊 نتائج البحث</div>
          <div className="value">{filtered.length}</div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* جدول الزبائن */}
      {/* ============================================================ */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>العنوان</th>
                <th>المشتريات</th>
                <th>المدفوع</th>
                <th>الرصيد</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="text-center">⏳ جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="8" className="text-center">
                  {search ? '🔍 لا توجد نتائج للبحث' : '📭 لا يوجد زبائن'}
                </td></tr>
              ) : (
                filtered.map((c, index) => {
                  const stats = getCustomerStats(c.id);
                  return (
                    <tr key={c.id}>
                      <td>{index + 1}</td>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.phone || '-'}</td>
                      <td>{c.address || '-'}</td>
                      <td>{formatCurrency(stats.total, settings.currency)}</td>
                      <td>{formatCurrency(stats.paid, settings.currency)}</td>
                      <td className={stats.balance > 0 ? 'text-danger' : 'text-success'}>
                        {formatCurrency(stats.balance, settings.currency)}
                      </td>
                      <td>
                        <button className="btn btn-primary btn-xs" onClick={() => {}}>📋 عرض</button>
                        <button className="btn btn-warning btn-xs" onClick={() => openModal(c)}>✏️ تعديل</button>
                        <button className="btn btn-danger btn-xs" onClick={() => handleDelete(c.id)}>🗑️ حذف</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Modal إضافة/تعديل زبون */}
      {/* ============================================================ */}
      {showModal && (
        <div 
          className="modal-overlay open" 
          onClick={(e) => { 
            if (e.target === e.currentTarget && !isSubmitting) {
              closeModal(); 
            }
          }}
        >
          <div className="modal-box">
            <div className="modal-header">
              <h3>{editingCustomer ? '✏️ تعديل زبون' : '➕ زبون جديد'}</h3>
              <button 
                className="modal-close" 
                onClick={closeModal}
                disabled={isSubmitting}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {/* الاسم */}
              <div className="form-group">
                <label>الاسم <span className="required">*</span></label>
                <input 
                  className={`form-control ${errors.name ? 'is-invalid' : ''}`}
                  value={formData.name} 
                  onChange={(e) => {
                    setFormData({...formData, name: e.target.value});
                    if (errors.name) setErrors({...errors, name: ''});
                  }} 
                  placeholder="أدخل اسم الزبون"
                  disabled={isSubmitting}
                />
                {errors.name && <div className="error-text">{errors.name}</div>}
              </div>

              {/* الهاتف */}
              <div className="form-group">
                <label>الهاتف</label>
                <input 
                  className={`form-control ${errors.phone ? 'is-invalid' : ''}`}
                  value={formData.phone} 
                  onChange={(e) => {
                    setFormData({...formData, phone: e.target.value});
                    if (errors.phone) setErrors({...errors, phone: ''});
                  }} 
                  placeholder="09xxxxxxxx (10 أرقام)"
                  maxLength="10"
                  disabled={isSubmitting}
                />
                {errors.phone && <div className="error-text">{errors.phone}</div>}
                <div className="helper-text">📱 يجب أن يبدأ بـ 09 ويتكون من 10 أرقام</div>
              </div>

              {/* العنوان */}
              <div className="form-group">
                <label>العنوان</label>
                <input 
                  className="form-control" 
                  value={formData.address} 
                  onChange={(e) => setFormData({...formData, address: e.target.value})} 
                  placeholder="العنوان"
                  disabled={isSubmitting}
                />
              </div>

              {/* ملاحظات */}
              <div className="form-group">
                <label>ملاحظات</label>
                <textarea 
                  className="form-control" 
                  value={formData.notes} 
                  onChange={(e) => setFormData({...formData, notes: e.target.value})} 
                  placeholder="ملاحظات إضافية"
                  rows="2"
                  disabled={isSubmitting}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-outline" 
                onClick={closeModal}
                disabled={isSubmitting}
              >
                إلغاء
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? '⏳ جاري الحفظ...' : editingCustomer ? '💾 تحديث' : '💾 إضافة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Customers;