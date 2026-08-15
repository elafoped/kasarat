import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../core/database';
import { Validators } from '../../core/validation';
import { formatCurrency } from '../utils/formatters';

function Materials({ success, error, warning, settings, onRefresh }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    unit: '',
    price: 0,
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
      const data = await db.getAll('materials');
      setMaterials(data);
    } catch (e) {
      error('خطأ في تحميل المواد: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ============================================================
  // التحقق من صحة البيانات
  // ============================================================
  const validateForm = () => {
    const newErrors = {};
    
    const nameCheck = Validators.validateMaterialName(formData.name);
    if (!nameCheck.valid) {
      newErrors.name = nameCheck.message;
    }
    
    const priceCheck = Validators.validatePrice(formData.price);
    if (!priceCheck.valid) {
      newErrors.price = priceCheck.message;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ============================================================
  // إضافة أو تحديث مادة
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
        name: formData.name.trim(),
        category: formData.category.trim(),
        unit: formData.unit.trim(),
        price: Number(formData.price) || 0,
        notes: formData.notes.trim()
      };

      if (editingMaterial) {
        await db.put('materials', {
          ...editingMaterial,
          ...cleanedData,
          updatedAt: now
        });
        success('✅ تم تحديث المادة بنجاح');
      } else {
        // التحقق من وجود مادة بنفس الاسم
        const existing = materials.find(m => 
          m.name.toLowerCase() === cleanedData.name.toLowerCase()
        );
        
        if (existing) {
          await db.put('materials', {
            ...existing,
            price: cleanedData.price || existing.price,
            category: cleanedData.category || existing.category,
            unit: cleanedData.unit || existing.unit,
            notes: cleanedData.notes || existing.notes,
            updatedAt: now
          });
          success('✅ تم تحديث بيانات المادة الموجودة');
        } else {
          await db.add('materials', {
            ...cleanedData,
            createdAt: now
          });
          success('✅ تم إضافة المادة بنجاح');
        }
      }

      // ============================================================
      // إغلاق الديالوغ - تحديث فوري
      // ============================================================
      setShowModal(false);
      setEditingMaterial(null);
      setFormData({ name: '', category: '', unit: '', price: 0, notes: '' });
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
  // حذف مادة
  // ============================================================
  const handleDelete = async (id) => {
    if (!window.confirm('⚠️ هل أنت متأكد من حذف هذه المادة؟')) return;
    
    try {
      // التحقق من وجود مبيعات مرتبطة
      const allSales = await db.getAll('sales');
      const relatedSales = allSales.filter(s => s.materialId === id);
      
      if (relatedSales.length > 0) {
        error(`❌ لا يمكن حذف مادة لها ${relatedSales.length} مبيعات`);
        return;
      }
      
      await db.delete('materials', id);
      success('✅ تم حذف المادة');
      
      await loadData();
      if (onRefresh) onRefresh();
      
    } catch (e) {
      error('❌ خطأ: ' + e.message);
    }
  };

  const openModal = (material = null) => {
    if (material) {
      setEditingMaterial(material);
      setFormData({
        name: material.name || '',
        category: material.category || '',
        unit: material.unit || '',
        price: material.price || 0,
        notes: material.notes || ''
      });
    } else {
      setEditingMaterial(null);
      setFormData({ name: '', category: '', unit: '', price: 0, notes: '' });
    }
    setErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setShowModal(false);
    setEditingMaterial(null);
    setErrors({});
  };

  // ============================================================
  // البحث
  // ============================================================
  const filtered = materials.filter(m => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || (m.category || '').toLowerCase().includes(q);
  });

  return (
    <div className="page-section active">
      <div className="toolbar">
      
        <div className="spacer"></div>
        <div className="search-box">
          <span>🔍</span>
          <input 
            type="text" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder={`بحث بالاسم أو التصنيف (${materials.length} مادة)...`}
          />
        </div>
        <button className="btn btn-outline btn-sm" onClick={loadData}>
          🔄 تحديث
        </button>
        <span className="text-muted" style={{fontSize: '0.75rem'}}>
          {materials.length} مادة
        </span>
      </div>

      {/* إحصائيات سريعة */}
      <div className="stats-mini">
        <div className="stat-item">
          <div className="label">📦 إجمالي المواد</div>
          <div className="value">{materials.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>الاسم</th>
                <th>التصنيف</th>
                <th>الوحدة</th>
                <th>السعر</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center">⏳ جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="6" className="text-center">
                  {search ? '🔍 لا توجد نتائج للبحث' : '📭 لا توجد مواد'}
                </td></tr>
              ) : (
                filtered.map((m, index) => {
                  return (
                    <tr key={m.id}>
                      <td>{index + 1}</td>
                      <td><strong>{m.name}</strong></td>
                      <td>{m.category || '-'}</td>
                      <td>{m.unit || '-'}</td>
                      <td>{formatCurrency(m.price || 0, settings.currency)}</td>
                      <td>
                        <button className="btn btn-warning btn-xs" onClick={() => openModal(m)}>✏️ تعديل</button>
                        <button className="btn btn-danger btn-xs" onClick={() => handleDelete(m.id)}>🗑️ حذف</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
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
              <h3>{editingMaterial ? '✏️ تعديل مادة' : '➕ مادة جديدة'}</h3>
              <button className="modal-close" onClick={closeModal} disabled={isSubmitting}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>الاسم <span className="required">*</span></label>
                <input 
                  className={`form-control ${errors.name ? 'is-invalid' : ''}`}
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                  placeholder="أدخل اسم المادة"
                  disabled={isSubmitting}
                />
                {errors.name && <div className="error-text">{errors.name}</div>}
              </div>

              <div className="form-group">
                <label>التصنيف</label>
                <input 
                  className="form-control" 
                  value={formData.category} 
                  onChange={(e) => setFormData({...formData, category: e.target.value})} 
                  placeholder="مثل: بناء، صناعي"
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label>وحدة القياس</label>
                <input 
                  className="form-control" 
                  value={formData.unit} 
                  onChange={(e) => setFormData({...formData, unit: e.target.value})} 
                  placeholder="مثل: متر مكعب، طن، كيس"
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label>السعر</label>
                <input 
                  className={`form-control ${errors.price ? 'is-invalid' : ''}`}
                  type="number" 
                  step="0.01" 
                  value={formData.price} 
                  onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value) || 0})} 
                  disabled={isSubmitting}
                />
                {errors.price && <div className="error-text">{errors.price}</div>}
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea 
                  className="form-control" 
                  value={formData.notes} 
                  onChange={(e) => setFormData({...formData, notes: e.target.value})} 
                  rows="2"
                  disabled={isSubmitting}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal} disabled={isSubmitting}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? '⏳ جاري الحفظ...' : editingMaterial ? '💾 تحديث' : '💾 إضافة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Materials;
