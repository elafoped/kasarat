// ============================================================
// Debts.js - الكود الكامل المعدل مع عرض جميع الفواتير
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../core/database';
import { formatCurrency, formatDate } from '../utils/formatters';

function Debts({ settings, showToast }) {
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMinDebt, setFilterMinDebt] = useState('');
  const [filterMaxDebt, setFilterMaxDebt] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('balance');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedTab, setSelectedTab] = useState('debts'); // 'debts' or 'invoices'
  
  // State للفواتير
  const [invoiceFilter, setInvoiceFilter] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
  const [invoiceSortField, setInvoiceSortField] = useState('date');
  const [invoiceSortDirection, setInvoiceSortDirection] = useState('desc');

  // ============================================================
  // تحميل البيانات
  // ============================================================
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [customersData, salesData, paymentsData, invoicesData, materialsData] = await Promise.all([
        db.getAll('customers'),
        db.getAll('sales'),
        db.getAll('payments'),
        db.getAll('invoices'),
        db.getAll('materials').catch(() => [])
      ]);
      setCustomers(customersData);
      setMaterials(materialsData || []);
      
      // المبيعات النشطة
      const activeSales = salesData.filter(s => s.status === 'active');
      setSales(activeSales);
      
      // الدفعات النشطة
      const activePayments = paymentsData.filter(p => p.status === 'active');
      setPayments(activePayments);
      
      // الفواتير النشطة
      const activeInvoices = invoicesData.filter(inv => inv.status === 'active');
      setInvoices(activeInvoices);
      
      console.log('📊 المبيعات النشطة:', activeSales.length);
      console.log('💵 الدفعات النشطة:', activePayments.length);
      console.log('📄 الفواتير النشطة:', activeInvoices.length);
      
    } catch (e) {
      console.error('خطأ في تحميل البيانات:', e);
      if (showToast) showToast('خطأ في تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ============================================================
  // حساب الديون لكل زبون - فقط من الفواتير النشطة
  // ============================================================
  const calculateDebts = useCallback(() => {
    const debtMap = {};

    // ⭐ نقرأ paidAmount / remainingBalance مباشرة من كل بيع (وهي القيم
    // "المصدر الوحيد للحقيقة" اللي يحسبها SaleService بتقريب وتنظيف
    // موحّدين)، بدل ما نعيد جمع جدول payments من الصفر بمنطق منفصل.
    // جمع payments لوحده كان يمكن يختلف عن sale.paidAmount في حالات
    // كثيرة (مثلاً دفعات قديمة قبل إصلاح صفحة "الدفعات")، وهذا بالضبط
    // كان سبب ظهور أرقام مختلفة بين صفحة الديون وصفحة المبيعات.
    sales.forEach(sale => {
      const cid = sale.customerId;
      if (!cid) return;
      if (sale.status !== 'active') return;

      if (!debtMap[cid]) {
        debtMap[cid] = {
          totalSales: 0,
          totalPayments: 0,
          salesCount: 0,
          lastSale: null,
          customerId: cid,
          saleIds: [],
          invoices: []
        };
      }
      debtMap[cid].totalSales += (sale.totalAmount || 0);
      debtMap[cid].totalPayments += (sale.paidAmount || 0);
      debtMap[cid].salesCount++;
      debtMap[cid].saleIds.push(sale.id);

      // ⭐ الفاتورة مرتبطة بالبيع عبر invoice.saleId (وليس sale.invoiceId
      // الذي لا وجود له إطلاقاً بكائن البيع)، لذلك الربط القديم هنا كان
      // لا يطابق أبداً ويترك هذه القائمة فاضية دوماً.
      const invoice = invoices.find(inv => inv.saleId === sale.id);
      if (invoice) {
        debtMap[cid].invoices.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber || `INV-${invoice.id}`,
          saleId: sale.id,
          amount: sale.totalAmount || 0,
          date: sale.saleDate || invoice.invoiceDate || new Date().toISOString(),
          status: invoice.status || 'active'
        });
      }

      if (!debtMap[cid].lastSale || sale.saleDate > debtMap[cid].lastSale) {
        debtMap[cid].lastSale = sale.saleDate;
      }
    });

    // نحسب عدد الدفعات النشطة فقط للعرض (بدون أن نجمع مبالغها من هنا)
    const paymentCountByCustomer = {};
    payments.forEach(payment => {
      if (payment.status !== 'active') return;
      const cid = payment.customerId;
      if (!cid || !debtMap[cid]) return;
      paymentCountByCustomer[cid] = (paymentCountByCustomer[cid] || 0) + 1;
    });

    // بناء قائمة الديون النهائية
    const debts = Object.keys(debtMap).map(cid => {
      const customer = customers.find(c => c.id === parseInt(cid));
      const data = debtMap[cid];

      const totalSales = Math.round((data.totalSales || 0) * 100) / 100;
      const totalPayments = Math.round((data.totalPayments || 0) * 100) / 100;
      let balance = Math.round((totalSales - totalPayments) * 100) / 100;
      if (balance < 0.1) balance = 0; // نفس عتبة MIN_BALANCE بباقي النظام

      return {
        customerId: parseInt(cid),
        customerName: customer ? customer.name : 'غير معروف',
        phone: customer ? customer.phone : '-',
        totalSales: totalSales,
        totalPayments: totalPayments,
        balance: balance,
        salesCount: data.salesCount || 0,
        lastSale: data.lastSale || null,
        paymentCount: paymentCountByCustomer[cid] || 0,
        invoices: data.invoices || []
      };
    });

    // فلترة حسب الزبون
    let filtered = debts;
    if (filterCustomer) {
      filtered = filtered.filter(d => d.customerId === parseInt(filterCustomer));
    }

    // فلترة حسب البحث
    if (search) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(d => d.customerName.toLowerCase().includes(q));
    }

    // فلترة حسب المبلغ
    if (filterMinDebt) {
      const min = parseFloat(filterMinDebt);
      if (!isNaN(min)) {
        filtered = filtered.filter(d => d.balance >= min);
      }
    }
    if (filterMaxDebt) {
      const max = parseFloat(filterMaxDebt);
      if (!isNaN(max)) {
        filtered = filtered.filter(d => d.balance <= max);
      }
    }

    // فرز
    filtered.sort((a, b) => {
      let valA = a[sortBy] || 0;
      let valB = b[sortBy] || 0;
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (sortOrder === 'asc') {
        return valA > valB ? 1 : -1;
      } else {
        return valA < valB ? 1 : -1;
      }
    });

    return filtered;
  }, [sales, payments, customers, invoices, filterCustomer, search, filterMinDebt, filterMaxDebt, sortBy, sortOrder]);

  const debts = calculateDebts();

  // ============================================================
  // عرض جميع الفواتير
  // ============================================================
  const getAllInvoices = useCallback(() => {
    if (!invoices || invoices.length === 0) return [];
    
    // إنشاء خريطة للزبائن
    const customerMap = {};
    customers.forEach(c => {
      customerMap[c.id] = c.name || 'غير معروف';
    });
    
    // إنشاء خريطة للمبيعات
    const salesMap = {};
    sales.forEach(s => {
      salesMap[s.id] = s;
    });
    
    // بناء قائمة الفواتير
    let invoiceList = invoices.map(invoice => {
      // ⭐ الربط الصحيح: كل فاتورة تحمل saleId يشير للبيع الذي أنشأها،
      // وليس العكس (sale.invoiceId غير موجود إطلاقاً بكائن البيع، لذلك
      // كان هذا الربط القديم يفشل دائماً ويُظهر كل الفواتير بمبلغ 0).
      const relatedSales = sales.filter(s => s.id === invoice.saleId);
      const totalAmount = relatedSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
      const totalPaid = relatedSales.reduce((sum, s) => sum + (s.paidAmount || 0), 0);
      const remaining = totalAmount - totalPaid;
      
      // جلب اسم الزبون من أول بيع مرتبط
      const firstSale = relatedSales[0];
      const customerName = firstSale ? (customerMap[firstSale.customerId] || 'غير معروف') : 'غير معروف';
      
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber || `INV-${invoice.id}`,
        date: invoice.invoiceDate || invoice.createdAt || new Date().toISOString(),
        customerName: customerName,
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        salesCount: relatedSales.length,
        status: invoice.status || 'active',
        paymentStatus: remaining > 0 ? 'partially_paid' : 'paid',
        notes: invoice.notes || '',
        items: relatedSales.map(s => {
          const material = materials.find(m => m.id === s.materialId);
          return {
            saleId: s.id,
            invoiceNumber: s.invoiceNumber || `#${s.id}`,
            date: s.saleDate,
            materialId: s.materialId,
            materialName: material ? material.name : 'غير معروف',
            unit: material ? material.unit : '',
            quantity: s.quantity || 0,
            unitPrice: s.pricePerUnit || 0,
            total: s.totalAmount || 0,
            paid: s.paidAmount || 0,
            remaining: s.remainingBalance || 0,
            notes: s.notes || ''
          };
        })
      };
    });
    
    // تصفية حسب النص
    if (invoiceFilter) {
      const searchTerm = invoiceFilter.toLowerCase();
      invoiceList = invoiceList.filter(inv => 
        inv.customerName.toLowerCase().includes(searchTerm) ||
        inv.invoiceNumber.toLowerCase().includes(searchTerm) ||
        inv.id.toString().includes(searchTerm)
      );
    }
    
    // تصفية حسب الحالة
    if (invoiceStatusFilter !== 'all') {
      invoiceList = invoiceList.filter(inv => 
        inv.paymentStatus === invoiceStatusFilter
      );
    }
    
    // ترتيب
    invoiceList = invoiceList.sort((a, b) => {
      let aVal = a[invoiceSortField];
      let bVal = b[invoiceSortField];
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (aVal < bVal) return invoiceSortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return invoiceSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    return invoiceList;
  }, [invoices, sales, customers, materials, invoiceFilter, invoiceStatusFilter, invoiceSortField, invoiceSortDirection]);

  const allInvoices = getAllInvoices();

  // ============================================================
  // ⭐ طباعة كشف حساب كامل لزبون واحد: يجمع كل فواتيره (كل مادة/بيع)
  // بمستند طباعة واحد بدل ما تطبع كل فاتورة لحالها.
  // إذا انمرر onlySaleIds (مصفوفة saleId) بيطبع بس الفواتير المحددة،
  // وإلا بيطبع كل الفواتير النشطة للزبون.
  // ============================================================
  const printCustomerStatement = (customerId, onlySaleIds = null) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) {
      if (showToast) showToast('الزبون غير موجود', 'error');
      return;
    }

    let customerSales = sales.filter(s => s.customerId === customerId && s.status === 'active');
    if (onlySaleIds && onlySaleIds.length > 0) {
      customerSales = customerSales.filter(s => onlySaleIds.includes(s.id));
    }
    customerSales = customerSales.sort((a, b) => (a.saleDate || '').localeCompare(b.saleDate || ''));

    if (customerSales.length === 0) {
      if (showToast) showToast('لا توجد فواتير لطباعتها لهذا الزبون', 'warning');
      return;
    }

    const currency = settings?.currency || 'ل.س';
    const companyName = settings?.companyName || 'منشأة الكسارات';

    const totalAmount = customerSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const totalPaid = customerSales.reduce((sum, s) => sum + (s.paidAmount || 0), 0);
    const totalRemaining = Math.round((totalAmount - totalPaid) * 100) / 100;

    const rowsHtml = customerSales.map((s, idx) => {
      const material = materials.find(m => m.id === s.materialId);
      const bal = Math.round(((s.totalAmount || 0) - (s.paidAmount || 0)) * 100) / 100;
      return `<tr>
        <td>${idx + 1}</td>
        <td>${s.invoiceNumber || '#' + s.id}</td>
        <td>${formatDate(s.saleDate)}</td>
        <td>${material ? material.name : 'غير معروف'}</td>
        <td>${s.quantity || 0} ${material ? (material.unit || '') : ''}</td>
        <td>${formatCurrency(s.pricePerUnit, currency)}</td>
        <td>${formatCurrency(s.totalAmount, currency)}</td>
        <td>${formatCurrency(s.paidAmount, currency)}</td>
        <td style="color:${bal > 0 ? '#dc2626' : '#059669'};font-weight:bold;">${formatCurrency(bal, currency)}</td>
      </tr>`;
    }).join('');

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      if (showToast) showToast('الرجاء السماح للنوافذ المنبثقة', 'warning');
      return;
    }

    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>كشف حساب - ${customer.name}</title>
    <style>
      body{font-family:'Cairo',sans-serif;padding:2rem;direction:rtl;}
      .sheet{max-width:1000px;margin:0 auto;}
      .header{display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:1rem;margin-bottom:1.5rem;}
      .company-name{font-size:1.5rem;font-weight:bold;color:#1e40af;}
      .customer-info{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1.5rem;padding:0.75rem;background:#f3f4f6;border-radius:8px;}
      table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:0.9rem;}
      th,td{padding:0.5rem;border-bottom:1px solid #eee;text-align:right;}
      th{background:#f3f4f6;font-weight:bold;}
      .totals{display:flex;justify-content:flex-end;margin-top:1.5rem;}
      .totals table{width:320px;}
      .totals td{padding:0.4rem 0.6rem;}
      .totals .final td{font-size:1.2rem;font-weight:bold;border-top:2px solid #333;}
      .footer{margin-top:2rem;text-align:center;color:#666;font-size:0.8rem;border-top:1px solid #ddd;padding-top:1rem;}
    </style></head><body>
    <div class="sheet">
      <div class="header">
        <div><div class="company-name">${companyName}</div><div style="font-size:0.8rem;color:#666;">كشف حساب زبون</div></div>
        <div style="text-align:left;"><div><strong>تاريخ الطباعة:</strong> ${new Date().toLocaleDateString('ar-EG')}</div>
        <div><strong>عدد الفواتير:</strong> ${customerSales.length}</div></div>
      </div>
      <div class="customer-info">
        <div><strong>الزبون:</strong> ${customer.name}</div>
        <div><strong>الهاتف:</strong> ${customer.phone || '-'}</div>
        <div><strong>العنوان:</strong> ${customer.address || '-'}</div>
      </div>
      <table>
        <thead><tr><th>#</th><th>رقم الفاتورة</th><th>التاريخ</th><th>المادة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="totals">
        <table>
          <tr><td>إجمالي المشتريات:</td><td>${formatCurrency(totalAmount, currency)}</td></tr>
          <tr><td>إجمالي المدفوع:</td><td>${formatCurrency(totalPaid, currency)}</td></tr>
          <tr class="final" style="color:${totalRemaining > 0 ? '#dc2626' : '#059669'};"><td>الرصيد المتبقي:</td><td>${formatCurrency(totalRemaining, currency)}</td></tr>
        </table>
      </div>
      <div class="footer">${companyName} - كشف حساب مطبوع بتاريخ ${new Date().toLocaleString('ar-EG')}</div>
    </div>
    <script>window.onload=function(){window.print();};<\/script>
    </body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  // ============================================================
  // إحصائيات الديون
  // ============================================================
  const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
  const debtorsCount = debts.filter(d => d.balance > 0).length;
  const paidCount = debts.filter(d => d.balance <= 0).length;
  const totalSalesAll = debts.reduce((sum, d) => sum + d.totalSales, 0);
  const totalPaymentsAll = debts.reduce((sum, d) => sum + d.totalPayments, 0);

  // إحصائيات الفواتير
  const totalInvoices = allInvoices.length;
  const paidInvoices = allInvoices.filter(inv => inv.paymentStatus === 'paid').length;
  const partialInvoices = allInvoices.filter(inv => inv.paymentStatus === 'partially_paid').length;
  const totalInvoiceAmount = allInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalInvoiceRemaining = allInvoices.reduce((sum, inv) => sum + inv.remaining, 0);

  // ============================================================
  // تغيير الترتيب
  // ============================================================
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // ============================================================
  // عرض جميع الفواتير
  // ============================================================
  const renderAllInvoices = () => {
    if (loading) {
      return (
        <div className="card">
          <div className="card-title">📄 جميع الفواتير</div>
          <div className="text-center" style={{ padding: '2rem' }}>
            ⏳ جاري تحميل الفواتير...
          </div>
        </div>
      );
    }

    if (allInvoices.length === 0) {
      return (
        <div className="card">
          <div className="card-title">📄 جميع الفواتير</div>
          <div className="text-muted" style={{ padding: '2rem', textAlign: 'center' }}>
            📭 لا توجد فواتير لعرضها
          </div>
        </div>
      );
    }

    return (
      <div className="card">
        <div className="card-title">
          📄 جميع الفواتير
          <span style={{ fontSize: '0.8rem', fontWeight: 'normal', marginRight: '1rem', color: 'var(--gray-500)' }}>
            ({totalInvoices} فاتورة)
          </span>
        </div>

        {/* إحصائيات سريعة */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
          gap: '0.5rem',
          marginBottom: '1rem',
          padding: '0.5rem',
          background: 'var(--gray-50)',
          borderRadius: 'var(--radius)'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)' }}>📄 إجمالي الفواتير</div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{totalInvoices}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)' }}>✅ مدفوعة</div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--secondary-600)' }}>{paidInvoices}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)' }}>⏳ غير مدفوعة</div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--danger-600)' }}>{partialInvoices}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)' }}>💰 إجمالي المبلغ</div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{formatCurrency(totalInvoiceAmount, settings.currency)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)' }}>📋 المتبقي</div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--danger-600)' }}>{formatCurrency(totalInvoiceRemaining, settings.currency)}</div>
          </div>
        </div>

        {/* أدوات البحث والتصفية */}
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          flexWrap: 'wrap',
          marginBottom: '1rem',
          padding: '0.5rem',
          background: 'var(--gray-50)',
          borderRadius: 'var(--radius)',
          alignItems: 'center'
        }}>
          <input
            type="text"
            placeholder="🔍 بحث عن فاتورة..."
            value={invoiceFilter}
            onChange={(e) => setInvoiceFilter(e.target.value)}
            style={{
              flex: '1',
              minWidth: '150px',
              padding: '0.4rem 0.75rem',
              border: '1px solid var(--gray-300)',
              borderRadius: 'var(--radius)',
              fontSize: '0.9rem'
            }}
          />
          
          <select
            value={invoiceStatusFilter}
            onChange={(e) => setInvoiceStatusFilter(e.target.value)}
            style={{
              padding: '0.4rem 0.75rem',
              border: '1px solid var(--gray-300)',
              borderRadius: 'var(--radius)',
              fontSize: '0.9rem',
              background: 'white'
            }}
          >
            <option value="all">جميع الفواتير</option>
            <option value="paid">✅ مدفوعة</option>
            <option value="partially_paid">⏳ غير مدفوعة</option>
          </select>

          <select
            value={invoiceSortField}
            onChange={(e) => setInvoiceSortField(e.target.value)}
            style={{
              padding: '0.4rem 0.75rem',
              border: '1px solid var(--gray-300)',
              borderRadius: 'var(--radius)',
              fontSize: '0.9rem',
              background: 'white'
            }}
          >
            <option value="date">📅 التاريخ</option>
            <option value="customerName">👤 الزبون</option>
            <option value="totalAmount">💰 المبلغ</option>
            <option value="remaining">📋 المتبقي</option>
            <option value="invoiceNumber">🔢 رقم الفاتورة</option>
          </select>

          <button
            onClick={() => setInvoiceSortDirection(invoiceSortDirection === 'asc' ? 'desc' : 'asc')}
            style={{
              padding: '0.4rem 0.75rem',
              border: '1px solid var(--gray-300)',
              borderRadius: 'var(--radius)',
              fontSize: '0.9rem',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            {invoiceSortDirection === 'asc' ? '↑ تصاعدي' : '↓ تنازلي'}
          </button>

          <button
            onClick={() => {
              setInvoiceFilter('');
              setInvoiceStatusFilter('all');
              setInvoiceSortField('date');
              setInvoiceSortDirection('desc');
            }}
            style={{
              padding: '0.4rem 0.75rem',
              border: '1px solid var(--gray-300)',
              borderRadius: 'var(--radius)',
              fontSize: '0.9rem',
              background: 'var(--gray-200)',
              cursor: 'pointer'
            }}
          >
            ✖ إعادة تعيين
          </button>
        </div>

        {/* جدول الفواتير */}
        <div className="table-wrap" style={{ maxHeight: '500px', overflowY: 'auto' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 10 }}>
              <tr>
                <th>#</th>
                <th>رقم الفاتورة</th>
                <th>التاريخ</th>
                <th>الزبون</th>
                <th>عدد العناصر</th>
                <th>الإجمالي</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>الحالة</th>
                <th>ملاحظات</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {allInvoices.map((invoice, index) => {
                const isPaid = invoice.paymentStatus === 'paid';
                const isPartial = invoice.paymentStatus === 'partially_paid';
                const relatedSale = sales.find(s => invoice.items.some(it => it.saleId === s.id));
                
                return (
                  <tr key={invoice.id} style={{ 
                    background: isPaid ? 'rgba(5, 150, 105, 0.05)' : isPartial ? 'rgba(220, 38, 38, 0.05)' : 'transparent'
                  }}>
                    <td>{index + 1}</td>
                    <td>
                      <strong style={{ color: 'var(--primary-600)' }}>
                        {invoice.invoiceNumber}
                      </strong>
                    </td>
                    <td>{formatDate(invoice.date)}</td>
                    <td>
                      <strong>{invoice.customerName}</strong>
                    </td>
                    <td>{invoice.salesCount}</td>
                    <td>
                      <strong>{formatCurrency(invoice.totalAmount, settings.currency)}</strong>
                    </td>
                    <td style={{ color: 'var(--secondary-600)' }}>
                      {formatCurrency(invoice.totalPaid, settings.currency)}
                    </td>
                    <td style={{ color: invoice.remaining > 0 ? 'var(--danger-600)' : 'var(--secondary-600)', fontWeight: 'bold' }}>
                      {formatCurrency(invoice.remaining, settings.currency)}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.15rem 0.6rem',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        background: isPaid ? 'rgba(5, 150, 105, 0.15)' : 'rgba(220, 38, 38, 0.15)',
                        color: isPaid ? '#059669' : '#dc2626'
                      }}>
                        {isPaid ? '✅ مدفوعة' : '⏳ غير مدفوعة'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                      {invoice.notes ? `📝 ${invoice.notes}` : '-'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {relatedSale && (
                        <>
                          <button
                            className="btn btn-outline btn-xs"
                            title="طباعة هذه الفاتورة فقط"
                            onClick={() => printCustomerStatement(relatedSale.customerId, invoice.items.map(it => it.saleId))}
                            style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem', marginLeft: '0.25rem' }}
                          >
                            🖨️ هذه فقط
                          </button>
                          <button
                            className="btn btn-primary btn-xs"
                            title={`طباعة كل فواتير ${invoice.customerName}`}
                            onClick={() => printCustomerStatement(relatedSale.customerId)}
                            style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}
                          >
                            🖨️ كل فواتير الزبون
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {allInvoices.length === 0 && (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--gray-500)' }}>
            لا توجد فواتير تطابق معايير البحث
          </div>
        )}

        {/* تفاصيل الفاتورة عند الضغط عليها */}
        <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--gray-400)' }}>
          💡 انقر على رقم الفاتورة لعرض التفاصيل
        </div>
      </div>
    );
  };

  // ============================================================
  // تغيير التبويب
  // ============================================================
  const renderTabContent = () => {
    if (selectedTab === 'invoices') {
      return renderAllInvoices();
    }
    
    // عرض الديون (الجدول الأصلي)
    return (
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('customerName')}>
                  الزبون {sortBy === 'customerName' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('totalSales')}>
                  إجمالي المشتريات {sortBy === 'totalSales' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('totalPayments')}>
                  إجمالي المدفوع {sortBy === 'totalPayments' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('balance')}>
                  الرصيد المتبقي {sortBy === 'balance' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('salesCount')}>
                  عدد المبيعات {sortBy === 'salesCount' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th>آخر عملية</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="text-center">⏳ جاري التحميل...</td></tr>
              ) : debts.length === 0 ? (
                <tr><td colSpan="8" className="text-center">📭 لا توجد ديون</td></tr>
              ) : (
                debts.map((d, index) => (
                  <tr key={d.customerId}>
                    <td>{index + 1}</td>
                    <td><strong>{d.customerName}</strong></td>
                    <td>{formatCurrency(d.totalSales, settings.currency)}</td>
                    <td>{formatCurrency(d.totalPayments, settings.currency)}</td>
                    <td className={d.balance > 0 ? 'text-danger' : 'text-success'}>
                      <strong>{formatCurrency(d.balance, settings.currency)}</strong>
                    </td>
                    <td>{d.salesCount}</td>
                    <td>{formatDate(d.lastSale)}</td>
                    <td>
                      <button
                        className="btn btn-primary btn-xs"
                        title={`طباعة كل فواتير ${d.customerName} (${d.salesCount})`}
                        onClick={() => printCustomerStatement(d.customerId)}
                        style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        🖨️ طباعة الكل
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination-controls">
          <span>إجمالي الديون: {formatCurrency(totalDebt, settings.currency)}</span>
          <span style={{ marginRight: '1rem' }}>|</span>
          <span>إجمالي المشتريات: {formatCurrency(totalSalesAll, settings.currency)}</span>
          <span style={{ marginRight: '1rem' }}>|</span>
          <span>إجمالي المدفوع: {formatCurrency(totalPaymentsAll, settings.currency)}</span>
        </div>
      </div>
    );
  };

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
            type="number"
            placeholder="الحد الأدنى"
            value={filterMinDebt}
            onChange={(e) => setFilterMinDebt(e.target.value)}
            style={{ width: '100px' }}
          />
          <span>→</span>
          <input
            type="number"
            placeholder="الحد الأعلى"
            value={filterMaxDebt}
            onChange={(e) => setFilterMaxDebt(e.target.value)}
            style={{ width: '100px' }}
          />
        </div>

        <div className="search-box">
          <span>🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالزبون..."
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
          <div className="label">📋 إجمالي الديون</div>
          <div className="value">{formatCurrency(totalDebt, settings.currency)}</div>
        </div>
        <div className="stat-item danger">
          <div className="label">👤 عدد المدينين</div>
          <div className="value">{debtorsCount}</div>
        </div>
        <div className="stat-item success">
          <div className="label">✅ عدد المدفوعين</div>
          <div className="value">{paidCount}</div>
        </div>
        <div className="stat-item">
          <div className="label">📊 إجمالي الزبائن</div>
          <div className="value">{debts.length}</div>
        </div>
        <div className="stat-item info">
          <div className="label">📄 إجمالي الفواتير</div>
          <div className="value">{invoices.length}</div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* تبويبات */}
      {/* ============================================================ */}
      <div className="tab-group">
        <button 
          className={selectedTab === 'debts' ? 'active' : ''} 
          onClick={() => setSelectedTab('debts')}
        >
          📋 الديون
        </button>
        <button 
          className={selectedTab === 'invoices' ? 'active' : ''} 
          onClick={() => setSelectedTab('invoices')}
        >
          📄 جميع الفواتير ({invoices.length})
        </button>
      </div>

      {/* ============================================================ */}
      {/* المحتوى */}
      {/* ============================================================ */}
      {renderTabContent()}
    </div>
  );
}

export default Debts;