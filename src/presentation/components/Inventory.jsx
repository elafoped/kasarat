import React, { useState, useEffect } from 'react';
import { db } from '../../core/database';
import { formatCurrency, formatDate } from '../utils/formatters';

function Inventory({ showToast, settings }) {
  const [materials, setMaterials] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    materialId: '',
    type: 'add',
    quantity: 1,
    reason: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [mats, moves] = await Promise.all([
        db.getAll('materials'),
        db.getAll('inventory_movements')
      ]);
      setMaterials(mats);
      setMovements(moves.sort((a, b) => (b.movementDate || '').localeCompare(a.movementDate || '')).slice(0, 50));
    } catch (e) {
      showToast('خطأ في تحميل المخزون: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAdjust = async () => {
    try {
      if (!formData.materialId) {
        showToast('اختر مادة', 'error');
        return;
      }
      if (formData.quantity <= 0) {
        showToast('الكمية يجب أن تكون أكبر من صفر', 'error');
        return;
      }

      const material = await db.get('materials', formData.materialId);
      if (!material) {
        showToast('المادة غير موجودة', 'error');
        return;
      }

      let newQty = material.currentQuantity || 0;
      if (formData.type === 'add') {
        newQty += formData.quantity;
      } else if (formData.type === 'subtract') {
        newQty -= formData.quantity;
        if (newQty < 0) {
          showToast('الكمية لا يمكن أن تكون سالبة', 'error');
          return;
        }
      } else {
        newQty = formData.quantity;
      }

      await db.put('materials', { ...material, currentQuantity: newQty, updatedAt: new Date().toISOString() });
      
      await db.add('inventory_movements', {
        materialId: formData.materialId,
        type: formData.type === 'add' ? 'إدخال' : formData.type === 'subtract' ? 'إخراج' : 'تعديل',
        quantity: formData.quantity,
        reason: formData.reason || 'تعديل يدوي',
        movementDate: new Date().toISOString()
      });

      showToast('تم تحديث المخزون', 'success');
      closeModal();
      loadData();
    } catch (e) {
      showToast('خطأ: ' + e.message, 'error');
    }
  };

  const openModal = () => {
    setFormData({ materialId: '', type: 'add', quantity: 1, reason: '' });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const filteredMaterials = filter ? materials.filter(m => m.id == filter) : materials;

  return (
    <div className="page-section active">
      <div className="toolbar">
        <button className="btn btn-success" onClick={openModal}>📦 تعديل المخزون</button>
        <div className="spacer"></div>
        <div className="filter-group">
          <select onChange={(e) => setFilter(e.target.value)} value={filter}>
            <option value="">كل المواد</option>
            {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>المادة</th>
                <th>الوحدة</th>
                <th>الكمية الحالية</th>
                <th>الحد الأدنى</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center">جاري التحميل...</td></tr>
              ) : filteredMaterials.length === 0 ? (
                <tr><td colSpan="5" className="text-center">لا توجد مواد</td></tr>
              ) : (
                filteredMaterials.map(m => {
                  const stock = m.currentQuantity || 0;
                  const min = m.minStock || 0;
                  const status = stock < min ? '⚠️ منخفض' : '✅ جيد';
                  const cls = stock < min ? 'text-danger' : 'text-success';
                  return <tr key={m.id}>
                    <td><strong>{m.name}</strong></td>
                    <td>{m.unit || '-'}</td>
                    <td>{stock}</td>
                    <td>{min}</td>
                    <td className={cls}>{status}</td>
                  </tr>;
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-title">📜 حركات المخزون (آخر 50)</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المادة</th>
                <th>النوع</th>
                <th>الكمية</th>
                <th>السبب</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 ? (
                <tr><td colSpan="5" className="text-center text-muted">لا توجد حركات</td></tr>
              ) : (
                movements.map(mv => {
                  const mat = materials.find(a => a.id === mv.materialId);
                  return <tr key={mv.id}>
                    <td>{formatDate(mv.movementDate)}</td>
                    <td>{mat ? mat.name : '?'}</td>
                    <td>{mv.type || 'تعديل'}</td>
                    <td>{mv.quantity || 0}</td>
                    <td>{mv.reason || '-'}</td>
                  </tr>;
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal-box">
            <div className="modal-header">
              <h3>تعديل المخزون</h3>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>المادة <span className="required">*</span></label>
                <select className="form-control" value={formData.materialId} onChange={(e) => setFormData({...formData, materialId: parseInt(e.target.value)})}>
                  <option value="">اختر مادة</option>
                  {materials.map(m => <option key={m.id} value={m.id}>{m.name} (المخزون: {m.currentQuantity || 0})</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>نوع الحركة</label>
                <select className="form-control" value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})}>
                  <option value="add">➕ إدخال</option>
                  <option value="subtract">➖ إخراج</option>
                  <option value="set">✏️ تعديل يدوي</option>
                </select>
              </div>

              <div className="form-group">
                <label>الكمية</label>
                <input className="form-control" type="number" step="0.01" value={formData.quantity} onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value) || 0})} />
              </div>

              <div className="form-group">
                <label>السبب</label>
                <input className="form-control" value={formData.reason} onChange={(e) => setFormData({...formData, reason: e.target.value})} placeholder="سبب التعديل" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleAdjust}>تطبيق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inventory;