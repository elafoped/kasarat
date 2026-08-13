import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../core/database';
import { Validators } from '../../core/validation';
import { formatCurrency, formatDate } from '../utils/formatters';
import { SaleService } from '../../domain/services/SaleService';
import CustomerSearch from './CustomerSearch';

function Sales({ success, error, warning, settings, onRefresh }) {
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [formData, setFormData] = useState({
    customerId: '',
    vehicleId: '',
    materialId: '',
    quantity: 1,
    pricePerUnit: 0,
    paidAmount: 0,
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // ============================================================
  // حساب القيم تلقائياً
  // ============================================================
  const total = (formData.quantity || 0) * (formData.pricePerUnit || 0);
  const remaining = total - (formData.paidAmount || 0);

  // ============================================================
  // تحميل البيانات
  // ============================================================
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [salesData, customersData, vehiclesData, materialsData] = await Promise.all([
        db.getAll('sales'),
        db.getAll('customers'),
        db.getAll('vehicles'),
        db.getAll('materials')
      ]);
      setSales(salesData);
      setCustomers(customersData);
      setVehicles(vehiclesData);
      setMaterials(materialsData);
      
      console.log('🚗 السيارات المحملة:', vehiclesData.length);
      console.log('👤 الزبائن المحملين:', customersData.length);
      
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
  // تحديث قائمة السيارات عند اختيار زبون
  // ============================================================
  const getFilteredVehicles = useCallback(() => {
    // إذا لم يتم اختيار زبون، عرض جميع السيارات
    if (!selectedCustomer) {
      return vehicles;
    }
    // عرض سيارات الزبون المحدد فقط
    return vehicles.filter(v => v.customerId === selectedCustomer.id);
  }, [vehicles, selectedCustomer]);

  // ============================================================
  // التحقق من صحة النموذج
  // ============================================================
  const validateForm = () => {
    const newErrors = {};

    if (!selectedCustomer) {
      newErrors.customerId = 'الزبون مطلوب';
    }

    if (!formData.vehicleId) {
      newErrors.vehicleId = 'السيارة مطلوبة';
    }

    if (!formData.materialId) {
      newErrors.materialId = 'المادة مطلوبة';
    }

    const qtyCheck = Validators.validateQuantity(formData.quantity);
    if (!qtyCheck.valid) {
      newErrors.quantity = qtyCheck.message;
    } else if (qtyCheck.value <= 0) {
      newErrors.quantity = 'الكمية يجب أن تكون أكبر من صفر';
    }

    const priceCheck = Validators.validatePrice(formData.pricePerUnit);
    if (!priceCheck.valid) {
      newErrors.pricePerUnit = priceCheck.message;
    } else if (priceCheck.value <= 0) {
      newErrors.pricePerUnit = 'السعر يجب أن يكون أكبر من صفر';
    }

    if (formData.materialId && qtyCheck.valid) {
      const material = materials.find(m => m.id === formData.materialId);
      const stockCheck = Validators.validateStock(material, qtyCheck.value);
      if (!stockCheck.valid) {
        newErrors.stock = stockCheck.message;
      }
    }

    if (formData.paidAmount !== undefined) {
      const paidCheck = Validators.validatePaidAmount(formData.paidAmount, total);
      if (!paidCheck.valid) {
        newErrors.paidAmount = paidCheck.message;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ============================================================
  // إنشاء بيع جديد
  // ============================================================
  const handleCreateSale = async () => {
    setErrors({});
    
    if (!validateForm()) {
      warning('يوجد أخطاء في النموذج');
      const firstError = Object.values(errors)[0];
      if (firstError) {
        warning(firstError);
      }
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const data = {
        customerId: selectedCustomer.id,
        vehicleId: parseInt(formData.vehicleId),
        materialId: parseInt(formData.materialId),
        quantity: Number(formData.quantity),
        pricePerUnit: Number(formData.pricePerUnit),
        paidAmount: Number(formData.paidAmount) || 0,
        notes: formData.notes,
        paymentMethod: 'نقدي'
      };

      const saleValidation = Validators.validateSale(data);
      if (!saleValidation.valid) {
        error(saleValidation.errors.join('، '));
        setIsSubmitting(false);
        return;
      }

      await SaleService.createSale(saleValidation.data);
      success('✅ تم تسجيل البيع والفواتير تلقائياً');

      setShowModal(false);
      setSelectedCustomer(null);
      setFormData({
        customerId: '',
        vehicleId: '',
        materialId: '',
        quantity: 1,
        pricePerUnit: 0,
        paidAmount: 0,
        notes: ''
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
  // إلغاء بيع
  // ============================================================
  const handleCancelSale = async (id) => {
    const reason = window.prompt('أدخل سبب الإلغاء:');
    if (reason === null) return;
    if (!reason.trim()) {
      warning('السبب مطلوب');
      return;
    }

    try {
      await SaleService.cancelSale(id, reason.trim());
      success('✅ تم إلغاء البيع');
      await loadData();
      if (onRefresh) onRefresh();
    } catch (e) {
      error('❌ خطأ: ' + e.message);
    }
  };

  // ============================================================
  // فتح وإغلاق الديالوغ
  // ============================================================
  const openModal = () => {
    setSelectedCustomer(null);
    setFormData({
      customerId: '',
      vehicleId: '',
      materialId: '',
      quantity: 1,
      pricePerUnit: 0,
      paidAmount: 0,
      notes: ''
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

  // ============================================================
  // اختيار الزبون
  // ============================================================
  const handleCustomerSelect = (customer) => {
    console.log('👤 تم اختيار الزبون:', customer);
    setSelectedCustomer(customer);
    setFormData(prev => ({
      ...prev,
      customerId: customer?.id || '',
      vehicleId: '' // إعادة تعيين السيارة
    }));
    if (errors.customerId) {
      setErrors({...errors, customerId: ''});
    }
  };

  // ============================================================
  // اختيار المادة - تحديث السعر تلقائياً
  // ============================================================
  const handleMaterialChange = (materialId) => {
    const material = materials.find(m => m.id === parseInt(materialId));
    setFormData(prev => ({
      ...prev,
      materialId: parseInt(materialId),
      pricePerUnit: material?.price || 0
    }));
    if (errors.materialId) {
      setErrors({...errors, materialId: ''});
    }
    if (errors.stock) {
      setErrors({...errors, stock: ''});
    }
  };

  // ============================================================
  // البحث في المبيعات
  // ============================================================
  const filteredSales = sales.filter(s => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const c = customers.find(a => a.id === s.customerId);
    const m = materials.find(a => a.id === s.materialId);
    return (s.invoiceNumber || '').toLowerCase().includes(q) ||
      (c && c.name.toLowerCase().includes(q)) ||
      (m && m.name.toLowerCase().includes(q));
  });

  // ============================================================
  // الحصول على اسم الزبون
  // ============================================================
  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.name : 'غير معروف';
  };

  // ============================================================
  // الحصول على اسم المادة
  // ============================================================
  const getMaterialName = (materialId) => {
    const material = materials.find(m => m.id === materialId);
    return material ? material.name : 'غير معروف';
  };

  // ============================================================
  // السيارات المفلترة
  // ============================================================
  const filteredVehicles = getFilteredVehicles();

  return (
    <div className="page-section active">
      <div className="toolbar">
        <button className="btn btn-primary" onClick={openModal}>
          💰 بيع جديد
        </button>
        <div className="spacer"></div>
        <div className="search-box">
          <span>🔍</span>
          <input 
            type="text" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="بحث برقم الفاتورة أو الزبون..."
          />
        </div>
        <button className="btn btn-outline btn-sm" onClick={loadData}>
          🔄 تحديث
        </button>
        <span className="text-muted" style={{fontSize: '0.75rem'}}>
          {sales.filter(s => s.status === 'active').length} مبيعات نشطة
        </span>
      </div>

      {/* إحصائيات سريعة */}
      <div className="stats-mini">
        <div className="stat-item">
          <div className="label">💰 إجمالي المبيعات</div>
          <div className="value">{sales.length}</div>
        </div>
        <div className="stat-item success">
          <div className="label">✅ المبيعات النشطة</div>
          <div className="value">{sales.filter(s => s.status === 'active').length}</div>
        </div>
        <div className="stat-item">
          <div className="label">📊 نتائج البحث</div>
          <div className="value">{filteredSales.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#الفاتورة</th>
                <th>التاريخ</th>
                <th>الزبون</th>
                <th>المادة</th>
                <th>الكمية</th>
                <th>الإجمالي</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="10" className="text-center">⏳ جاري التحميل...</td></tr>
              ) : filteredSales.length === 0 ? (
                <tr><td colSpan="10" className="text-center">
                  {search ? '🔍 لا توجد نتائج للبحث' : '📭 لا توجد مبيعات'}
                </td></tr>
              ) : (
                filteredSales.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || '')).map(s => {
                  const bal = (s.totalAmount || 0) - (s.paidAmount || 0);
                  const statusMap = { active: '✅ نشط', cancelled: '❌ ملغى' };
                  const statusClass = s.status === 'cancelled' ? 'status-cancelled' : '';
                  return (
                    <tr key={s.id} className={statusClass}>
                      <td><strong>{s.invoiceNumber || '#' + s.id}</strong></td>
                      <td>{formatDate(s.saleDate)}</td>
                      <td>{getCustomerName(s.customerId)}</td>
                      <td>{getMaterialName(s.materialId)}</td>
                      <td>{s.quantity || 0}</td>
                      <td>{formatCurrency(s.totalAmount, settings.currency)}</td>
                      <td>{formatCurrency(s.paidAmount, settings.currency)}</td>
                      <td className={bal > 0 ? 'text-danger' : 'text-success'}>
                        {formatCurrency(bal, settings.currency)}
                      </td>
                      <td>
                        <span className={`badge-status ${s.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                          {statusMap[s.status] || s.status}
                        </span>
                      </td>
                      <td>
                        {s.status === 'active' && (
                          <button className="btn btn-danger btn-xs" onClick={() => handleCancelSale(s.id)}>
                            ❌ إلغاء
                          </button>
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

      {/* ============================================================ */}
      {/* Modal إنشاء بيع */}
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
          <div className="modal-box" style={{maxWidth: '800px'}}>
            <div className="modal-header">
              <h3>💰 بيع جديد</h3>
              <button className="modal-close" onClick={closeModal} disabled={isSubmitting}>✕</button>
            </div>
            <div className="modal-body">
              {/* اختيار الزبون */}
              <div className="form-group">
                <label>الزبون <span className="required">*</span></label>
                <CustomerSearch
                  customers={customers}
                  onSelect={handleCustomerSelect}
                  selectedCustomer={selectedCustomer}
                  placeholder="ابحث عن زبون (اكتب اسم أو رقم هاتف)..."
                  required={true}
                />
                {errors.customerId && <div className="error-text">{errors.customerId}</div>}
              </div>

              {/* ============================================================ */}
              {/* اختيار السيارة - تم إصلاحها */}
              {/* ============================================================ */}
              <div className="form-group">
                <label>السيارة <span className="required">*</span></label>
                <select 
                  className={`form-control ${errors.vehicleId ? 'is-invalid' : ''}`}
                  value={formData.vehicleId} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData({...formData, vehicleId: val});
                    if (errors.vehicleId) setErrors({...errors, vehicleId: ''});
                  }}
                  disabled={isSubmitting}
                >
                  <option value="">-- اختر سيارة --</option>
                  {filteredVehicles.length === 0 ? (
                    <option value="" disabled>
                      {selectedCustomer ? '⚠️ لا توجد سيارات لهذا الزبون' : '⚠️ اختر زبون أولاً'}
                    </option>
                  ) : (
                    filteredVehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        🚗 {v.plateNumber} {v.type ? `(${v.type})` : ''}
                      </option>
                    ))
                  )}
                </select>
                {errors.vehicleId && <div className="error-text">{errors.vehicleId}</div>}
                {filteredVehicles.length === 0 && selectedCustomer && (
                  <div className="helper-text" style={{color: 'var(--warning-600)'}}>
                    ⚠️ هذا الزبون ليس لديه سيارات مسجلة. أضف سيارة أولاً.
                  </div>
                )}
              </div>

              {/* اختيار المادة */}
              <div className="form-group">
                <label>المادة <span className="required">*</span></label>
                <select 
                  className={`form-control ${errors.materialId ? 'is-invalid' : ''}`}
                  value={formData.materialId} 
                  onChange={(e) => handleMaterialChange(e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="">-- اختر مادة --</option>
                  {materials.length === 0 ? (
                    <option value="" disabled>⚠️ لا توجد مواد مسجلة</option>
                  ) : (
                    materials.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} (المخزون: {m.currentQuantity || 0} {m.unit || ''})
                      </option>
                    ))
                  )}
                </select>
                {errors.materialId && <div className="error-text">{errors.materialId}</div>}
                {errors.stock && <div className="error-text text-danger">{errors.stock}</div>}
              </div>

              {/* الكمية والسعر */}
              <div className="form-row">
                <div className="form-group">
                  <label>الكمية <span className="required">*</span></label>
                  <input 
                    className={`form-control ${errors.quantity ? 'is-invalid' : ''}`}
                    type="number" 
                    step="0.01" 
                    min="0.01"
                    value={formData.quantity} 
                    onChange={(e) => {
                      setFormData({...formData, quantity: parseFloat(e.target.value) || 0});
                      if (errors.quantity) setErrors({...errors, quantity: ''});
                    }} 
                    disabled={isSubmitting}
                  />
                  {errors.quantity && <div className="error-text">{errors.quantity}</div>}
                </div>
                <div className="form-group">
                  <label>سعر الوحدة <span className="required">*</span></label>
                  <input 
                    className={`form-control ${errors.pricePerUnit ? 'is-invalid' : ''}`}
                    type="number" 
                    step="0.01" 
                    min="0.01"
                    value={formData.pricePerUnit} 
                    onChange={(e) => {
                      setFormData({...formData, pricePerUnit: parseFloat(e.target.value) || 0});
                      if (errors.pricePerUnit) setErrors({...errors, pricePerUnit: ''});
                    }} 
                    disabled={isSubmitting}
                  />
                  {errors.pricePerUnit && <div className="error-text">{errors.pricePerUnit}</div>}
                </div>
              </div>

              {/* الإجمالي والمدفوع */}
              <div style={{
                background: total > 0 ? 'var(--primary-50)' : 'var(--gray-50)',
                padding: '1rem',
                borderRadius: 'var(--radius)',
                marginBottom: '0.75rem'
              }}>
                <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem'}}>
                  <span>💰 الإجمالي:</span>
                  <span style={{color: 'var(--primary-700)'}}>{formatCurrency(total, settings.currency)}</span>
                </div>
                
                <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem'}}>
                  <span>💵 المدفوع:</span>
                  <input 
                    className={`form-control ${errors.paidAmount ? 'is-invalid' : ''}`}
                    style={{width: '150px', display: 'inline-block'}} 
                    type="number" 
                    step="0.01"
                    min="0"
                    value={formData.paidAmount}
                    onChange={(e) => {
                      setFormData({...formData, paidAmount: parseFloat(e.target.value) || 0});
                      if (errors.paidAmount) setErrors({...errors, paidAmount: ''});
                    }}
                    disabled={isSubmitting}
                  />
                </div>
                {errors.paidAmount && <div className="error-text">{errors.paidAmount}</div>}
                
                <div style={{
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  fontWeight: 'bold', 
                  fontSize: '1.1rem',
                  marginTop: '0.5rem',
                  paddingTop: '0.5rem',
                  borderTop: '1px solid var(--gray-200)',
                  color: remaining > 0 ? 'var(--danger-600)' : 'var(--success)'
                }}>
                  <span>📋 المتبقي:</span>
                  <span>{formatCurrency(remaining, settings.currency)}</span>
                </div>

                {remaining < 0 && (
                  <div className="error-text" style={{marginTop: '0.5rem'}}>
                    ⚠️ المدفوع لا يمكن أن يتجاوز الإجمالي
                  </div>
                )}
              </div>

              {/* ملاحظات */}
              <div className="form-group">
                <label>ملاحظات</label>
                <textarea 
                  className="form-control" 
                  value={formData.notes} 
                  onChange={(e) => setFormData({...formData, notes: e.target.value})} 
                  rows="2"
                  placeholder="ملاحظات إضافية"
                  disabled={isSubmitting}
                />
              </div>

              {/* معلومات الزبون المختار */}
              {selectedCustomer && (
                <div style={{
                  background: 'var(--gray-50)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius)',
                  marginTop: '0.5rem',
                  fontSize: '0.85rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap'
                }}>
                  <span>👤 {selectedCustomer.name}</span>
                  {selectedCustomer.phone && <span>📱 {selectedCustomer.phone}</span>}
                  {selectedCustomer.address && <span>📍 {selectedCustomer.address}</span>}
                  <span style={{color: 'var(--gray-500)'}}>
                    🚗 {filteredVehicles.length} سيارة
                  </span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal} disabled={isSubmitting}>
                إلغاء
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleCreateSale} 
                disabled={isSubmitting || remaining < 0 || filteredVehicles.length === 0}
              >
                {isSubmitting ? '⏳ جاري الحفظ...' : '💾 حفظ البيع'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sales;