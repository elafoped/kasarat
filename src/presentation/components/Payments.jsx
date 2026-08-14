import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../core/database';
import { Validators } from '../../core/validation';
import { formatCurrency, formatDate } from '../utils/formatters';
import CustomerSearch from './CustomerSearch';
import { SaleService } from '../../domain/services/SaleService';

function Payments({ success, error, warning, settings, onRefresh }) {
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [formData, setFormData] = useState({
    customerId: '',
    amount: 0,
    method: 'نقدي',
    notes: '',
    paymentDate: new Date().toISOString().split('T')[0]
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // تحميل البيانات
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [paymentsData, customersData] = await Promise.all([
        db.getAll('payments'),
        db.getAll('customers')
      ]);
      setPayments(paymentsData);
      setCustomers(customersData);
    } catch (e) {
      error('خطأ في تحميل البيانات: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // التحقق من صحة النموذج
  const validateForm = () => {
    const newErrors = {};

    if (!selectedCustomer) {
      newErrors.customerId = 'الزبون مطلوب';
    }

    const amountCheck = Validators.validatePrice(formData.amount);
    if (!amountCheck.valid) {
      newErrors.amount = amountCheck.message;
    } else if (amountCheck.value <= 0) {
      newErrors.amount = 'المبلغ يجب أن يكون أكبر من صفر';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // تسجيل دفعة جديدة
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

      // ⭐ لازم نمرّ من SaleService.recordPayment دائماً، وليس db.add مباشرة.
      // db.add كان يضيف سطر دفعة "معلّق" لا يمس sales.paidAmount ولا
      // sales.remainingBalance ولا invoices إطلاقاً — وهذا هو سبب اختلاف
      // الأرقام بين صفحة "الدفعات" وصفحة "المبيعات/الديون".
      // recordPayment يوزّع المبلغ FIFO على أقدم الفواتير ويحدّث كل شيء
      // بشكل متسق مع نفس منطق التقريب المستخدم بباقي النظام.
      await SaleService.recordPayment({
        customerId: selectedCustomer.id,
        amount: Number(formData.amount),
        method: formData.method,
        notes: formData.notes,
        paymentDate: formData.paymentDate || now
      });

      success('✅ تم تسجيل الدفعة وتوزيعها على الفواتير بنجاح');

      setShowModal(false);
      setSelectedCustomer(null);
      setFormData({
        customerId: '',
        amount: 0,
        method: 'نقدي',
        notes: '',
        paymentDate: new Date().toISOString().split('T')[0]
      });
      setErrors({});

      await loadData();
      if (onRefresh) onRefresh();

    } catch (e) {
      if (e.message && e.message.includes('تم حذف الرصيد المتبقي الصغير')) {
        warning('⚠️ ' + e.message);
        setShowModal(false);
        await loadData();
        if (onRefresh) onRefresh();
      } else {
        error('❌ خطأ: ' + e.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // حذف دفعة
  // ⚠️ منعنا الحذف المباشر: الدفعات الآن موزّعة تلقائياً (FIFO) على فواتير
  // محددة وتُحدّث sales.paidAmount / remainingBalance عند إنشائها.
  // حذفها من هنا مباشرة (db.delete) كان يترك رصيد البيع "مدفوعاً" بشكل
  // وهمي رغم حذف الدفعة، فيصير فرق دائم لا يُصحَّح تلقائياً.
  // الحل الصحيح هو الإلغاء (الذي يعكس المبلغ على الفاتورة)، وليس الحذف.
  const handleDelete = async (id) => {
    warning('⚠️ لا يمكن حذف الدفعات مباشرة لأن ذلك يسبب اختلال أرصدة الفواتير. استخدم "إلغاء الدفعة" بدلاً من ذلك.');
  };

  // إلغاء دفعة — يعكس المبلغ على البيع/الفاتورة المرتبطة بها بدل ترك أثر وهمي
  const handleCancel = async (id) => {
    const reason = window.prompt('أدخل سبب الإلغاء:');
    if (reason === null) return;
    if (!reason.trim()) {
      warning('السبب مطلوب');
      return;
    }

    try {
      await SaleService.cancelPaymentAndRestoreBalance(id, reason.trim());
      success('✅ تم إلغاء الدفعة وإعادة المبلغ لرصيد الفاتورة');
      await loadData();
      if (onRefresh) onRefresh();
    } catch (e) {
      error('❌ خطأ: ' + e.message);
    }
  };

  const openModal = () => {
    setSelectedCustomer(null);
    setFormData({
      customerId: '',
      amount: 0,
      method: 'نقدي',
      notes: '',
      paymentDate: new Date().toISOString().split('T')[0]
    });
    setErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setShowModal(false);
    setSelectedCustomer(null);
    setErrors({});
  };

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setFormData(prev => ({
      ...prev,
      customerId: customer?.id || ''
    }));
    if (errors.customerId) {
      setErrors({ ...errors, customerId: '' });
    }
  };

  // الفلترة
  const getFilteredPayments = useCallback(() => {
    let filtered = [...payments];

    // فلترة حسب الزبون
    if (filterCustomer) {
      filtered = filtered.filter(p => p.customerId === parseInt(filterCustomer));
    }

    // فلترة حسب التاريخ
    if (filterDateFrom) {
      filtered = filtered.filter(p => p.paymentDate && p.paymentDate >= filterDateFrom);
    }
    if (filterDateTo) {
      filtered = filtered.filter(p => p.paymentDate && p.paymentDate <= filterDateTo + 'T23:59:59');
    }

    // فلترة حسب البحث
    if (search) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(p => {
        const customer = customers.find(c => c.id === p.customerId);
        return (customer && customer.name.toLowerCase().includes(q)) ||
          (p.notes || '').toLowerCase().includes(q);
      });
    }

    return filtered.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
  }, [payments, customers, filterCustomer, filterDateFrom, filterDateTo, search]);

  const filteredPayments = getFilteredPayments();

  // الحصول على اسم الزبون
  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.name : 'غير معروف';
  };

  // حساب إجمالي الدفعات
  const totalPayments = filteredPayments
    .filter(p => p.status !== 'cancelled')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="page-section active">
      <div className="toolbar">
       
        <div className="spacer"></div>

        <div className="filter-group">
          <select
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
          >
            <option value="">كل الزبائن</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            placeholder="من"
          />
          <span>→</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            placeholder="إلى"
          />
        </div>

        <div className="search-box">
          <span>🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالزبون أو الملاحظات..."
          />
        </div>

        <button className="btn btn-outline btn-sm" onClick={loadData}>
          🔄 تحديث
        </button>
      </div>

      {/* إحصائيات سريعة */}
      <div className="stats-mini">
        <div className="stat-item">
          <div className="label">💵 إجمالي الدفعات</div>
          <div className="value">{formatCurrency(totalPayments, settings.currency)}</div>
        </div>
        <div className="stat-item">
          <div className="label">📊 عدد الدفعات</div>
          <div className="value">{filteredPayments.filter(p => p.status !== 'cancelled').length}</div>
        </div>
        <div className="stat-item">
          <div className="label">📋 عدد الملغاة</div>
          <div className="value">{filteredPayments.filter(p => p.status === 'cancelled').length}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>التاريخ</th>
                <th>الزبون</th>
                <th>المبلغ</th>
                <th>طريقة الدفع</th>
                <th>ملاحظات</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="text-center">⏳ جاري التحميل...</td></tr>
              ) : filteredPayments.length === 0 ? (
                <tr><td colSpan="8" className="text-center">📭 لا توجد دفعات</td></tr>
              ) : (
                filteredPayments.map((p, index) => {
                  const isCancelled = p.status === 'cancelled';
                  return (
                    <tr key={p.id} className={isCancelled ? 'status-cancelled' : ''}>
                      <td>{index + 1}</td>
                      <td>{formatDate(p.paymentDate)}</td>
                      <td><strong>{getCustomerName(p.customerId)}</strong></td>
                      <td className={isCancelled ? 'text-muted' : 'text-success'}>
                        {formatCurrency(p.amount, settings.currency)}
                      </td>
                      <td>{p.method || 'نقدي'}</td>
                      <td>{p.notes || '-'}</td>
                      <td>
                        <span className={`badge-status ${isCancelled ? 'badge-danger' : 'badge-success'}`}>
                          {isCancelled ? '❌ ملغى' : '✅ نشط'}
                        </span>
                      </td>
                      <td>
                        {!isCancelled && (
                          <>
                            <button className="btn btn-danger btn-xs" onClick={() => handleCancel(p.id)}>
                              ❌ إلغاء
                            </button>
                           
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination-controls">
          <span>إجمالي الدفعات: {filteredPayments.length}</span>
        </div>
      </div>

      {/* Modal تسجيل دفعة */}
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
              <h3>💵 دفعة جديدة</h3>
              <button className="modal-close" onClick={closeModal} disabled={isSubmitting}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>الزبون <span className="required">*</span></label>
                <CustomerSearch
                  customers={customers}
                  onSelect={handleCustomerSelect}
                  selectedCustomer={selectedCustomer}
                  placeholder="ابحث عن زبون..."
                  required={true}
                />
                {errors.customerId && <div className="error-text">{errors.customerId}</div>}
              </div>

              <div className="form-group">
                <label>المبلغ <span className="required">*</span></label>
                <input
                  className={`form-control ${errors.amount ? 'is-invalid' : ''}`}
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.amount}
                  onChange={(e) => {
                    setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 });
                    if (errors.amount) setErrors({ ...errors, amount: '' });
                  }}
                  disabled={isSubmitting}
                  placeholder="أدخل المبلغ"
                />
                {errors.amount && <div className="error-text">{errors.amount}</div>}
              </div>

              <div className="form-group">
                <label>طريقة الدفع</label>
                <select
                  className="form-control"
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                  disabled={isSubmitting}
                >
                  <option value="نقدي">💰 نقدي</option>
                  <option value="تحويل بنكي">🏦 تحويل بنكي</option>
                  <option value="شيك">📄 شيك</option>
                  <option value="بطاقة">💳 بطاقة</option>
                </select>
              </div>

              <div className="form-group">
                <label>تاريخ الدفع</label>
                <input
                  className="form-control"
                  type="date"
                  value={formData.paymentDate}
                  onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  className="form-control"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="2"
                  placeholder="ملاحظات إضافية"
                  disabled={isSubmitting}
                />
              </div>

              {selectedCustomer && (
                <div style={{
                  background: 'var(--gray-50)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.85rem'
                }}>
                  👤 {selectedCustomer.name}
                  {selectedCustomer.phone && <span style={{ marginRight: '1rem' }}>📱 {selectedCustomer.phone}</span>}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal} disabled={isSubmitting}>
                إلغاء
              </button>
              <button className="btn btn-success" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? '⏳ جاري الحفظ...' : '💾 تسجيل الدفعة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Payments;