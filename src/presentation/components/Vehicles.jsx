import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../core/database';
import CustomerSearch from './CustomerSearch';

function Vehicles({ success, error, warning, onRefresh }) {
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [formData, setFormData] = useState({
    plateNumber: '',
    customerId: '',
    type: '',
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
      const [vehiclesData, customersData] = await Promise.all([
        db.getAll('vehicles'),
        db.getAll('customers')
      ]);
      setVehicles(vehiclesData);
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

  // ============================================================
  // التحقق من صحة النموذج
  // ============================================================
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.plateNumber || formData.plateNumber.trim() === '') {
      newErrors.plateNumber = 'رقم اللوحة مطلوب';
    }
    
    if (!selectedCustomer) {
      newErrors.customerId = 'الزبون مطلوب';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ============================================================
  // إضافة أو تحديث سيارة
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
        plateNumber: formData.plateNumber.trim(),
        customerId: selectedCustomer.id,
        type: formData.type.trim(),
        notes: formData.notes.trim()
      };

      // التحقق من عدم وجود سيارة بنفس رقم اللوحة
      const existing = vehicles.find(v => 
        v.plateNumber.toLowerCase() === cleanedData.plateNumber.toLowerCase() && 
        v.id !== editingVehicle?.id
      );
      
      if (existing) {
        warning('⚠️ يوجد سيارة بنفس رقم اللوحة');
        setIsSubmitting(false);
        return;
      }

      if (editingVehicle) {
        await db.put('vehicles', {
          ...editingVehicle,
          ...cleanedData,
          updatedAt: now
        });
        success('✅ تم تحديث السيارة بنجاح');
      } else {
        await db.add('vehicles', {
          ...cleanedData,
          createdAt: now
        });
        success('✅ تم إضافة السيارة بنجاح');
      }

      setShowModal(false);
      setEditingVehicle(null);
      setSelectedCustomer(null);
      setFormData({ plateNumber: '', customerId: '', type: '', notes: '' });
      setErrors({});
      
      await loadData();
      if (onRefresh) onRefresh();

    } catch (e) {
      error('❌ خطأ: ' + e.message);
      console.error('خطأ في حفظ السيارة:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================
  // حذف سيارة - تم إصلاح مشكلة الفهرسة
  // ============================================================
  const handleDelete = async (id) => {
    if (!window.confirm('⚠️ هل أنت متأكد من حذف هذه السيارة؟')) return;
    
    try {
      // ============================================================
      // الحل: جلب جميع المبيعات والبحث يدوياً عن vehicleId
      // بدلاً من استخدام فهرس غير موجود
      // ============================================================
      const allSales = await db.getAll('sales');
      const relatedSales = allSales.filter(s => s.vehicleId === id);
      
      if (relatedSales.length > 0) {
        error(`❌ لا يمكن حذف سيارة لها ${relatedSales.length} مبيعات`);
        return;
      }
      
      await db.delete('vehicles', id);
      success('✅ تم حذف السيارة');
      
      await loadData();
      if (onRefresh) onRefresh();
      
    } catch (e) {
      error('❌ خطأ: ' + e.message);
      console.error('خطأ في حذف السيارة:', e);
    }
  };

  // ============================================================
  // فتح وإغلاق الديالوغ
  // ============================================================
  const openModal = (vehicle = null) => {
    if (vehicle) {
      setEditingVehicle(vehicle);
      setSelectedCustomer(customers.find(c => c.id === vehicle.customerId) || null);
      setFormData({
        plateNumber: vehicle.plateNumber || '',
        customerId: vehicle.customerId || '',
        type: vehicle.type || '',
        notes: vehicle.notes || ''
      });
    } else {
      setEditingVehicle(null);
      setSelectedCustomer(null);
      setFormData({ plateNumber: '', customerId: '', type: '', notes: '' });
    }
    setErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setShowModal(false);
    setEditingVehicle(null);
    setSelectedCustomer(null);
    setErrors({});
    setFormData({ plateNumber: '', customerId: '', type: '', notes: '' });
  };

  // ============================================================
  // اختيار الزبون
  // ============================================================
  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setFormData(prev => ({
      ...prev,
      customerId: customer?.id || ''
    }));
    if (errors.customerId) {
      setErrors({...errors, customerId: ''});
    }
  };

  // ============================================================
  // البحث المتقدم
  // ============================================================
  const getFilteredVehicles = useCallback(() => {
    if (!search || search.trim() === '') {
      return vehicles;
    }
    
    const q = search.trim().toLowerCase();
    const results = [];
    const seen = new Set();
    const limit = 100;
    
    for (const v of vehicles) {
      if (seen.has(v.id)) continue;
      if (v.plateNumber.toLowerCase().includes(q)) {
        results.push(v);
        seen.add(v.id);
        if (results.length >= limit) break;
      }
    }
    
    if (results.length < limit) {
      for (const v of vehicles) {
        if (seen.has(v.id)) continue;
        const customer = customers.find(c => c.id === v.customerId);
        if (customer && customer.name.toLowerCase().includes(q)) {
          results.push(v);
          seen.add(v.id);
          if (results.length >= limit) break;
        }
      }
    }
    
    return results;
  }, [vehicles, customers, search]);

  const filtered = getFilteredVehicles();

  // ============================================================
  // الحصول على اسم الزبون
  // ============================================================
  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.name : 'غير معروف';
  };

  return (
    <div className="page-section active">
      {/* ============================================================ */}
      {/* شريط الأدوات */}
      {/* ============================================================ */}
      <div className="toolbar">
       
        <div className="spacer"></div>
        <div className="search-box">
          <span>🔍</span>
          <input 
            type="text" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder={`بحث برقم اللوحة أو اسم الزبون (${vehicles.length} سيارة)...`}
          />
        </div>
        <button className="btn btn-outline btn-sm" onClick={loadData}>
          🔄 تحديث
        </button>
        <span className="text-muted" style={{fontSize: '0.75rem'}}>
          {vehicles.length} سيارة
        </span>
      </div>

      {/* ============================================================ */}
      {/* إحصائيات سريعة */}
      {/* ============================================================ */}
      <div className="stats-mini">
        <div className="stat-item">
          <div className="label">🚗 إجمالي السيارات</div>
          <div className="value">{vehicles.length}</div>
        </div>
        <div className="stat-item">
          <div className="label">👤 عدد الزبائن</div>
          <div className="value">{customers.length}</div>
        </div>
        <div className="stat-item">
          <div className="label">📊 نتائج البحث</div>
          <div className="value">{filtered.length}</div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* جدول السيارات */}
      {/* ============================================================ */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>رقم اللوحة</th>
                <th>الزبون</th>
                <th>النوع</th>
                <th>ملاحظات</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center">⏳ جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="6" className="text-center">
                  {search ? '🔍 لا توجد نتائج للبحث' : '📭 لا توجد سيارات'}
                </td></tr>
              ) : (
                filtered.map((v, index) => (
                  <tr key={v.id}>
                    <td>{index + 1}</td>
                    <td><strong>{v.plateNumber}</strong></td>
                    <td>{getCustomerName(v.customerId)}</td>
                    <td>{v.type || '-'}</td>
                    <td>{v.notes || '-'}</td>
                    <td>
                      <button 
                        className="btn btn-warning btn-xs" 
                        onClick={() => openModal(v)}
                      >
                        ✏️ تعديل
                      </button>
                      <button 
                        className="btn btn-danger btn-xs" 
                        onClick={() => handleDelete(v.id)}
                      >
                        🗑️ حذف
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Modal إضافة/تعديل سيارة */}
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
              <h3>{editingVehicle ? '✏️ تعديل سيارة' : '🚗 سيارة جديدة'}</h3>
              <button 
                className="modal-close" 
                onClick={closeModal}
                disabled={isSubmitting}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {/* رقم اللوحة */}
              <div className="form-group">
                <label>رقم اللوحة <span className="required">*</span></label>
                <input 
                  className={`form-control ${errors.plateNumber ? 'is-invalid' : ''}`}
                  value={formData.plateNumber} 
                  onChange={(e) => {
                    setFormData({...formData, plateNumber: e.target.value});
                    if (errors.plateNumber) setErrors({...errors, plateNumber: ''});
                  }} 
                  placeholder="أدخل رقم اللوحة (مثل: ABC-123)"
                  disabled={isSubmitting}
                />
                {errors.plateNumber && <div className="error-text">{errors.plateNumber}</div>}
                <div className="helper-text">📝 أدخل رقم اللوحة كما هو</div>
              </div>

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

              {/* النوع */}
              <div className="form-group">
                <label>النوع</label>
                <input 
                  className="form-control" 
                  value={formData.type} 
                  onChange={(e) => setFormData({...formData, type: e.target.value})} 
                  placeholder="مثل: شاحنة، قلاب، بيك اب"
                  disabled={isSubmitting}
                />
                <div className="helper-text">🚛 اختر نوع السيارة (اختياري)</div>
              </div>

              {/* ملاحظات */}
              <div className="form-group">
                <label>ملاحظات</label>
                <textarea 
                  className="form-control" 
                  value={formData.notes} 
                  onChange={(e) => setFormData({...formData, notes: e.target.value})} 
                  placeholder="ملاحظات إضافية عن السيارة"
                  rows="2"
                  disabled={isSubmitting}
                />
              </div>

              {/* معلومات الزبون المختار */}
              {selectedCustomer && (
                <div style={{
                  background: 'var(--primary-50)',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius)',
                  marginTop: '0.5rem'
                }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', flexWrap: 'wrap'}}>
                    <span>👤 <strong>{selectedCustomer.name}</strong></span>
                    {selectedCustomer.phone && <span>📱 {selectedCustomer.phone}</span>}
                    {selectedCustomer.address && <span>📍 {selectedCustomer.address}</span>}
                  </div>
                </div>
              )}
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
                {isSubmitting ? '⏳ جاري الحفظ...' : editingVehicle ? '💾 تحديث' : '💾 إضافة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Vehicles;