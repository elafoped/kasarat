import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../core/database';
import { Validators } from '../../core/validation';
import { formatCurrency, formatDate } from '../utils/formatters';

function Expenses({ success, error, warning, settings, onRefresh }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '',
    amount: 0,
    description: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ============================================================
  // تحميل البيانات
  // ============================================================
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await db.getAll('expenses');
      setExpenses(data);
    } catch (e) {
      error('خطأ في تحميل المصروفات: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ============================================================
  // التحقق من صحة النموذج
  // ============================================================
  const validateForm = () => {
    const newErrors = {};

    if (!formData.date) {
      newErrors.date = 'التاريخ مطلوب';
    }

    if (!formData.category || formData.category.trim() === '') {
      newErrors.category = 'التصنيف مطلوب';
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

  // ============================================================
  // إضافة أو تحديث مصروف
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
      const cleanedData = {
        date: formData.date,
        category: formData.category.trim(),
        amount: Number(formData.amount),
        description: formData.description.trim()
      };

      if (editingExpense) {
        await db.put('expenses', {
          ...editingExpense,
          ...cleanedData,
          updatedAt: now
        });
        success('✅ تم تحديث المصروف بنجاح');
      } else {
        await db.add('expenses', {
          ...cleanedData,
          createdAt: now
        });
        success('✅ تم إضافة المصروف بنجاح');
      }

      // إغلاق الديالوغ - تحديث فوري
      setShowModal(false);
      setEditingExpense(null);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        category: '',
        amount: 0,
        description: ''
      });
      setErrors({});

      await loadData();
      if (onRefresh) onRefresh();

    } catch (e) {
      error('❌ خطأ: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================
  // حذف مصروف
  // ============================================================
  const handleDelete = async (id) => {
    if (!window.confirm('⚠️ هل أنت متأكد من حذف هذا المصروف؟')) return;

    try {
      await db.delete('expenses', id);
      success('✅ تم حذف المصروف');
      await loadData();
      if (onRefresh) onRefresh();
    } catch (e) {
      error('❌ خطأ: ' + e.message);
    }
  };

  // ============================================================
  // فتح وإغلاق الديالوغ
  // ============================================================
  const openModal = (expense = null) => {
    if (expense) {
      setEditingExpense(expense);
      setFormData({
        date: expense.date || new Date().toISOString().split('T')[0],
        category: expense.category || '',
        amount: expense.amount || 0,
        description: expense.description || ''
      });
    } else {
      setEditingExpense(null);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        category: '',
        amount: 0,
        description: ''
      });
    }
    setErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setShowModal(false);
    setEditingExpense(null);
    setErrors({});
  };

  // ============================================================
  // الفلترة
  // ============================================================
  const getFilteredExpenses = useCallback(() => {
    let filtered = [...expenses];

    // فلترة حسب التصنيف
    if (filterCategory) {
      filtered = filtered.filter(e => e.category === filterCategory);
    }

    // فلترة حسب التاريخ
    if (filterDateFrom) {
      filtered = filtered.filter(e => e.date && e.date >= filterDateFrom);
    }
    if (filterDateTo) {
      filtered = filtered.filter(e => e.date && e.date <= filterDateTo + 'T23:59:59');
    }

    // فلترة حسب البحث
    if (search) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(e =>
        (e.description || '').toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    }

    return filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [expenses, filterCategory, filterDateFrom, filterDateTo, search]);

  const filteredExpenses = getFilteredExpenses();

  // ============================================================
  // إحصائيات
  // ============================================================
  const totalAmount = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const categories = [...new Set(filteredExpenses.map(e => e.category))];
  const today = new Date().toISOString().split('T')[0];
  const todayExpenses = filteredExpenses.filter(e => e.date === today);
  const todayTotal = todayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // إحصائيات حسب التصنيف
  const categoryStats = {};
  filteredExpenses.forEach(e => {
    const cat = e.category || 'أخرى';
    if (!categoryStats[cat]) categoryStats[cat] = 0;
    categoryStats[cat] += e.amount || 0;
  });

  // التصنيفات المتاحة للفلترة
  const allCategories = [...new Set(expenses.map(e => e.category))].filter(Boolean);

  return (
    <div className="page-section active">
      {/* ============================================================ */}
      {/* شريط الأدوات */}
      {/* ============================================================ */}
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => openModal()}>
          💸 مصروف جديد
        </button>
        <div className="spacer"></div>

        <div className="filter-group">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">كل التصنيفات</option>
            {allCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
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
            placeholder="بحث بالوصف أو التصنيف..."
          />
        </div>

        <button className="btn btn-outline btn-sm" onClick={loadData}>
          🔄 تحديث
        </button>
      </div>

      {/* ============================================================ */}
      {/* إحصائيات سريعة */}
      {/* ============================================================ */}
      <div className="stats-mini">
        <div className="stat-item danger">
          <div className="label">💰 إجمالي المصروفات</div>
          <div className="value">{formatCurrency(totalAmount, settings.currency)}</div>
        </div>
        <div className="stat-item">
          <div className="label">📊 عدد المصروفات</div>
          <div className="value">{filteredExpenses.length}</div>
        </div>
        <div className="stat-item">
          <div className="label">📋 عدد التصنيفات</div>
          <div className="value">{categories.length}</div>
        </div>
        <div className="stat-item warning">
          <div className="label">📅 مصروفات اليوم</div>
          <div className="value">{formatCurrency(todayTotal, settings.currency)}</div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* توزيع المصروفات حسب التصنيف */}
      {/* ============================================================ */}
      {Object.keys(categoryStats).length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-title">📊 توزيع المصروفات حسب التصنيف</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
            {Object.keys(categoryStats).map(cat => {
              const total = categoryStats[cat];
              const percentage = totalAmount > 0 ? (total / totalAmount) * 100 : 0;
              return (
                <div key={cat} style={{
                  background: 'var(--gray-50)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>{cat}</div>
                  <div style={{ fontWeight: 'bold' }}>{formatCurrency(total, settings.currency)}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)' }}>{percentage.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* جدول المصروفات */}
      {/* ============================================================ */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>التاريخ</th>
                <th>التصنيف</th>
                <th>الوصف</th>
                <th>المبلغ</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center">⏳ جاري التحميل...</td></tr>
              ) : filteredExpenses.length === 0 ? (
                <tr><td colSpan="6" className="text-center">
                  {search || filterCategory || filterDateFrom ? '🔍 لا توجد نتائج للبحث' : '📭 لا توجد مصروفات'}
                </td></tr>
              ) : (
                filteredExpenses.map((e, index) => (
                  <tr key={e.id}>
                    <td>{index + 1}</td>
                    <td>{formatDate(e.date)}</td>
                    <td>
                      <span className="badge-status badge-primary">{e.category}</span>
                    </td>
                    <td>{e.description || '-'}</td>
                    <td className="text-danger">{formatCurrency(e.amount, settings.currency)}</td>
                    <td>
                      <button className="btn btn-warning btn-xs" onClick={() => openModal(e)}>
                        ✏️ تعديل
                      </button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDelete(e.id)}>
                        🗑️ حذف
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination-controls">
          <span>إجمالي المصروفات: {formatCurrency(totalAmount, settings.currency)}</span>
          <span style={{ marginRight: '1rem' }}>|</span>
          <span>عدد المصروفات: {filteredExpenses.length}</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Modal إضافة/تعديل مصروف */}
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
              <h3>{editingExpense ? '✏️ تعديل مصروف' : '💸 مصروف جديد'}</h3>
              <button className="modal-close" onClick={closeModal} disabled={isSubmitting}>✕</button>
            </div>
            <div className="modal-body">
              {/* التاريخ */}
              <div className="form-group">
                <label>التاريخ <span className="required">*</span></label>
                <input
                  className={`form-control ${errors.date ? 'is-invalid' : ''}`}
                  type="date"
                  value={formData.date}
                  onChange={(e) => {
                    setFormData({ ...formData, date: e.target.value });
                    if (errors.date) setErrors({ ...errors, date: '' });
                  }}
                  disabled={isSubmitting}
                />
                {errors.date && <div className="error-text">{errors.date}</div>}
              </div>

              {/* التصنيف */}
              <div className="form-group">
                <label>التصنيف <span className="required">*</span></label>
                <select
                  className={`form-control ${errors.category ? 'is-invalid' : ''}`}
                  value={formData.category}
                  onChange={(e) => {
                    setFormData({ ...formData, category: e.target.value });
                    if (errors.category) setErrors({ ...errors, category: '' });
                  }}
                  disabled={isSubmitting}
                >
                  <option value="">اختر التصنيف</option>
                  <option value="محروقات">⛽ محروقات</option>
                  <option value="زيوت">🛢️ زيوت</option>
                  <option value="معدات صناعية">🔧 معدات صناعية</option>
                  <option value="أجار عمال">👷 أجار عمال</option>
                  <option value="طعام">🍽️ طعام</option>
                  <option value="خدمات أخرى">📋 خدمات أخرى</option>
                  <option value="صيانة">🔩 صيانة</option>
                  <option value="نقل">🚛 نقل</option>
                  <option value="كهرباء">💡 كهرباء</option>
                  <option value="ماء">💧 ماء</option>
                </select>
                {errors.category && <div className="error-text">{errors.category}</div>}
              </div>

              {/* المبلغ */}
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

              {/* الوصف */}
              <div className="form-group">
                <label>الوصف</label>
                <input
                  className="form-control"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="وصف المصروف (اختياري)"
                  disabled={isSubmitting}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal} disabled={isSubmitting}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? '⏳ جاري الحفظ...' : editingExpense ? '💾 تحديث' : '💾 إضافة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Expenses;