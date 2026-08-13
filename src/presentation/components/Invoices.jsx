import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../core/database';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';
import { config } from '../../core/config';

function Invoices({ settings, showToast }) {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // تحميل البيانات
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [invoicesData, customersData, materialsData, vehiclesData] = await Promise.all([
        db.getAll('invoices'),
        db.getAll('customers'),
        db.getAll('materials'),
        db.getAll('vehicles')
      ]);
      setInvoices(invoicesData);
      setCustomers(customersData);
      setMaterials(materialsData);
      setVehicles(vehiclesData);
    } catch (e) {
      console.error('خطأ في تحميل البيانات:', e);
      showToast('خطأ في تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // الفلترة
  const getFilteredInvoices = useCallback(() => {
    let filtered = [...invoices];

    // فلترة حسب الزبون
    if (filterCustomer) {
      filtered = filtered.filter(inv => inv.customerId === parseInt(filterCustomer));
    }

    // فلترة حسب التاريخ
    if (filterDateFrom) {
      filtered = filtered.filter(inv => inv.invoiceDate && inv.invoiceDate >= filterDateFrom);
    }
    if (filterDateTo) {
      filtered = filtered.filter(inv => inv.invoiceDate && inv.invoiceDate <= filterDateTo + 'T23:59:59');
    }

    // فلترة حسب الحالة
    if (filterStatus !== 'all') {
      filtered = filtered.filter(inv => inv.status === filterStatus);
    }

    // فلترة حسب البحث (رقم الفاتورة أو الزبون)
    if (search) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(inv => {
        const customer = customers.find(c => c.id === inv.customerId);
        return (inv.invoiceNumber || '').toLowerCase().includes(q) ||
          (customer && customer.name.toLowerCase().includes(q));
      });
    }

    return filtered.sort((a, b) => (b.invoiceDate || '').localeCompare(a.invoiceDate || ''));
  }, [invoices, customers, filterCustomer, filterDateFrom, filterDateTo, filterStatus, search]);

  const filteredInvoices = getFilteredInvoices();

  // الحصول على اسم الزبون
  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.name : 'غير معروف';
  };

  // الحصول على اسم المادة
  const getMaterialName = (materialId) => {
    const material = materials.find(m => m.id === materialId);
    return material ? material.name : 'غير معروف';
  };

  // الحصول على رقم السيارة
  const getVehiclePlate = (vehicleId) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? vehicle.plateNumber : 'غير معروف';
  };

  // عرض تفاصيل الفاتورة
  const viewInvoice = (invoice) => {
    setSelectedInvoice(invoice);
  };

  // طباعة الفاتورة
  const printInvoice = (invoice) => {
    const customer = customers.find(c => c.id === invoice.customerId);
    const material = materials.find(m => m.id === invoice.materialId);
    const vehicle = vehicles.find(v => v.id === invoice.vehicleId);

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      showToast('الرجاء السماح للنوافذ المنبثقة', 'warning');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>فاتورة ${invoice.invoiceNumber}</title>
        <style>
          body { font-family: 'Cairo', sans-serif; padding: 2rem; direction: rtl; }
          .invoice { max-width: 800px; margin: 0 auto; border: 1px solid #ddd; padding: 2rem; border-radius: 8px; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 1rem; margin-bottom: 1.5rem; }
          .company-name { font-size: 1.5rem; font-weight: bold; color: #1e40af; }
          .details { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1.5rem; }
          table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
          th, td { padding: 0.5rem; border-bottom: 1px solid #eee; text-align: right; }
          th { background: #f3f4f6; font-weight: bold; }
          .total { display: flex; justify-content: flex-end; font-size: 1.2rem; font-weight: bold; margin-top: 1rem; padding-top: 1rem; border-top: 2px solid #333; }
          .total .row { display: flex; justify-content: space-between; padding: 0.2rem 0; }
          .text-danger { color: #dc2626; }
          .text-success { color: #059669; }
          .footer { margin-top: 2rem; text-align: center; color: #666; font-size: 0.8rem; border-top: 1px solid #ddd; padding-top: 1rem; }
          .status { display: inline-block; padding: 0.2rem 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: bold; }
          .status-active { background: #d1fae5; color: #065f46; }
          .status-cancelled { background: #fee2e2; color: #991b1b; }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <div>
              <div class="company-name">${settings.companyName || 'منشأة الكسارات'}</div>
              <div style="font-size: 0.8rem; color: #666;">نظام إدارة الكسارات</div>
            </div>
            <div style="text-align: left;">
              <div><strong>رقم الفاتورة:</strong> ${invoice.invoiceNumber}</div>
              <div><strong>التاريخ:</strong> ${formatDate(invoice.invoiceDate)}</div>
              <div><strong>الحالة:</strong> <span class="status ${invoice.status === 'active' ? 'status-active' : 'status-cancelled'}">${invoice.status === 'active' ? 'نشط' : 'ملغى'}</span></div>
            </div>
          </div>

          <div class="details">
            <div><strong>الزبون:</strong> ${customer ? customer.name : 'غير معروف'}</div>
            <div><strong>الهاتف:</strong> ${customer ? customer.phone : '-'}</div>
            <div><strong>السيارة:</strong> ${vehicle ? vehicle.plateNumber : 'غير معروف'}</div>
            <div><strong>المادة:</strong> ${material ? material.name : 'غير معروف'}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>البيان</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${material ? material.name : 'غير معروف'}</td>
                <td>${invoice.quantity || 0}</td>
                <td>${formatCurrency(invoice.pricePerUnit, settings.currency)}</td>
                <td>${formatCurrency(invoice.totalAmount, settings.currency)}</td>
              </tr>
            </tbody>
          </table>

          <div class="total">
            <div>
              <div class="row"><span>الإجمالي:</span><span>${formatCurrency(invoice.totalAmount, settings.currency)}</span></div>
              <div class="row"><span>المدفوع:</span><span>${formatCurrency(invoice.paidAmount, settings.currency)}</span></div>
              <div class="row" style="font-size:1.3rem; color: ${invoice.remainingBalance > 0 ? '#dc2626' : '#059669'};">
                <span>المتبقي:</span>
                <span>${formatCurrency(invoice.remainingBalance, settings.currency)}</span>
              </div>
            </div>
          </div>

          ${invoice.notes ? `<div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee;"><strong>ملاحظات:</strong> ${invoice.notes}</div>` : ''}

          <div class="footer">
            ${settings.companyName || 'منشأة الكسارات'} - نسخة مطبوعة ${new Date().toLocaleString('ar-EG')}
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); setTimeout(window.close, 1000); };
        <\/script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  // إلغاء فاتورة
 // ============================================================
// إلغاء فاتورة - تحديث الحالة إلى cancelled
// ============================================================
const cancelInvoice = async (id) => {
  const reason = window.prompt('أدخل سبب إلغاء الفاتورة:');
  if (reason === null) return;
  if (!reason.trim()) {
    showToast('السبب مطلوب', 'warning');
    return;
  }

  try {
    const invoice = await db.get('invoices', id);
    if (!invoice) {
      showToast('الفاتورة غير موجودة', 'error');
      return;
    }

    // ============================================================
    // تحديث الفاتورة إلى ملغاة
    // ============================================================
    await db.put('invoices', {
      ...invoice,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason.trim()
    });

    // ============================================================
    // إذا كانت الفاتورة مرتبطة ببيع، نلغي البيع أيضاً
    // ============================================================
    if (invoice.saleId) {
      const sale = await db.get('sales', invoice.saleId);
      if (sale && sale.status === 'active') {
        await db.put('sales', {
          ...sale,
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancellationReason: reason.trim()
        });
        
        // إلغاء الدفعات المرتبطة
        const relatedPayments = await db.getByIndex('payments', 'saleId', invoice.saleId);
        for (const p of relatedPayments) {
          if (p.status === 'active') {
            await db.put('payments', {
              ...p,
              status: 'cancelled',
              cancelledAt: new Date().toISOString(),
              cancellationReason: reason.trim()
            });
          }
        }
      }
    }

    showToast('✅ تم إلغاء الفاتورة', 'success');
    await loadData();
  } catch (e) {
    showToast('❌ خطأ: ' + e.message, 'error');
  }
};

  // إحصائيات الفواتير
  const totalActive = filteredInvoices.filter(inv => inv.status === 'active').length;
  const totalCancelled = filteredInvoices.filter(inv => inv.status === 'cancelled').length;
  const totalAmount = filteredInvoices
    .filter(inv => inv.status === 'active')
    .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

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
          />
          <span>→</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">كل الحالات</option>
            <option value="active">✅ نشط</option>
            <option value="cancelled">❌ ملغى</option>
          </select>
        </div>

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
      </div>

      {/* إحصائيات سريعة */}
      <div className="stats-mini">
        <div className="stat-item">
          <div className="label">📄 إجمالي الفواتير</div>
          <div className="value">{filteredInvoices.length}</div>
        </div>
        <div className="stat-item success">
          <div className="label">✅ النشطة</div>
          <div className="value">{totalActive}</div>
        </div>
        <div className="stat-item danger">
          <div className="label">❌ الملغاة</div>
          <div className="value">{totalCancelled}</div>
        </div>
        <div className="stat-item">
          <div className="label">💰 الإجمالي</div>
          <div className="value">{formatCurrency(totalAmount, settings.currency)}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
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
              ) : filteredInvoices.length === 0 ? (
                <tr><td colSpan="10" className="text-center">📭 لا توجد فواتير</td></tr>
              ) : (
                filteredInvoices.map(inv => {
                  const isCancelled = inv.status === 'cancelled';
                  return (
                    <tr key={inv.id} className={isCancelled ? 'status-cancelled' : ''}>
                      <td><strong>{inv.invoiceNumber}</strong></td>
                      <td>{formatDate(inv.invoiceDate)}</td>
                      <td>{getCustomerName(inv.customerId)}</td>
                      <td>{getMaterialName(inv.materialId)}</td>
                      <td>{inv.quantity || 0}</td>
                      <td>{formatCurrency(inv.totalAmount, settings.currency)}</td>
                      <td>{formatCurrency(inv.paidAmount, settings.currency)}</td>
                      <td className={inv.remainingBalance > 0 ? 'text-danger' : 'text-success'}>
                        {formatCurrency(inv.remainingBalance, settings.currency)}
                      </td>
                      <td>
                        <span className={`badge-status ${isCancelled ? 'badge-danger' : 'badge-success'}`}>
                          {isCancelled ? '❌ ملغى' : '✅ نشط'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-primary btn-xs" onClick={() => viewInvoice(inv)}>
                          📋 عرض
                        </button>
                        <button className="btn btn-outline btn-xs" onClick={() => printInvoice(inv)}>
                          🖨️ طباعة
                        </button>
                        {!isCancelled && (
                          <button className="btn btn-danger btn-xs" onClick={() => cancelInvoice(inv.id)}>
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

      {/* Modal عرض تفاصيل الفاتورة */}
      {selectedInvoice && (
        <div className="modal-overlay open" onClick={(e) => {
          if (e.target === e.currentTarget) setSelectedInvoice(null);
        }}>
          <div className="modal-box" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h3>📄 تفاصيل الفاتورة: {selectedInvoice.invoiceNumber}</h3>
              <button className="modal-close" onClick={() => setSelectedInvoice(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                <div><strong>التاريخ:</strong> {formatDateTime(selectedInvoice.invoiceDate)}</div>
                <div><strong>الزبون:</strong> {getCustomerName(selectedInvoice.customerId)}</div>
                <div><strong>السيارة:</strong> {getVehiclePlate(selectedInvoice.vehicleId)}</div>
                <div><strong>المادة:</strong> {getMaterialName(selectedInvoice.materialId)}</div>
                <div><strong>الكمية:</strong> {selectedInvoice.quantity || 0}</div>
                <div><strong>سعر الوحدة:</strong> {formatCurrency(selectedInvoice.pricePerUnit, settings.currency)}</div>
                <div><strong>الإجمالي:</strong> {formatCurrency(selectedInvoice.totalAmount, settings.currency)}</div>
                <div><strong>المدفوع:</strong> {formatCurrency(selectedInvoice.paidAmount, settings.currency)}</div>
                <div><strong>المتبقي:</strong> <span className={selectedInvoice.remainingBalance > 0 ? 'text-danger' : 'text-success'}>
                  {formatCurrency(selectedInvoice.remainingBalance, settings.currency)}
                </span></div>
                <div><strong>الحالة:</strong> {selectedInvoice.status === 'active' ? '✅ نشط' : '❌ ملغى'}</div>
              </div>

              {selectedInvoice.notes && (
                <div style={{ padding: '0.5rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)' }}>
                  <strong>ملاحظات:</strong> {selectedInvoice.notes}
                </div>
              )}

              {selectedInvoice.cancellationReason && (
                <div style={{ padding: '0.5rem', background: 'var(--danger-50)', borderRadius: 'var(--radius)', marginTop: '0.5rem' }}>
                  <strong>سبب الإلغاء:</strong> {selectedInvoice.cancellationReason}
                </div>
              )}

              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setSelectedInvoice(null)}>إغلاق</button>
                <button className="btn btn-primary" onClick={() => {
                  const inv = selectedInvoice;
                  setSelectedInvoice(null);
                  printInvoice(inv);
                }}>🖨️ طباعة</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Invoices;