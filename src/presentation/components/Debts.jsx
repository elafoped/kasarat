import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../core/database';
import { formatCurrency, formatDate } from '../utils/formatters';

function Debts({ settings, showToast }) {
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMinDebt, setFilterMinDebt] = useState('');
  const [filterMaxDebt, setFilterMaxDebt] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('balance');
  const [sortOrder, setSortOrder] = useState('desc');

  // ============================================================
  // تحميل البيانات
  // ============================================================
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [customersData, salesData, paymentsData, invoicesData] = await Promise.all([
        db.getAll('customers'),
        db.getAll('sales'),
        db.getAll('payments'),
        db.getAll('invoices')
      ]);
      setCustomers(customersData);
      
      // ============================================================
      // مهم جداً: فقط المبيعات النشطة (status === 'active')
      // ============================================================
      const activeSales = salesData.filter(s => s.status === 'active');
      setSales(activeSales);
      
      // ============================================================
      // مهم جداً: فقط الدفعات النشطة (status === 'active')
      // ============================================================
      const activePayments = paymentsData.filter(p => p.status === 'active');
      setPayments(activePayments);
      
      // ============================================================
      // مهم جداً: فقط الفواتير النشطة (status === 'active')
      // ============================================================
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

    // ============================================================
    // 1. حساب إجمالي المبيعات النشطة فقط لكل زبون
    // ============================================================
    sales.forEach(sale => {
      const cid = sale.customerId;
      if (!cid) return;
      
      // تأكد من أن البيع نشط
      if (sale.status !== 'active') return;
      
      if (!debtMap[cid]) {
        debtMap[cid] = { 
          totalSales: 0, 
          totalPayments: 0, 
          salesCount: 0, 
          lastSale: null,
          customerId: cid,
          saleIds: [],
          paymentIds: []
        };
      }
      debtMap[cid].totalSales += (sale.totalAmount || 0);
      debtMap[cid].salesCount++;
      debtMap[cid].saleIds.push(sale.id);
      
      if (!debtMap[cid].lastSale || sale.saleDate > debtMap[cid].lastSale) {
        debtMap[cid].lastSale = sale.saleDate;
      }
    });

    // ============================================================
    // 2. حساب إجمالي المدفوعات من الدفعات النشطة فقط
    // ============================================================
    payments.forEach(payment => {
      const cid = payment.customerId;
      if (!cid) return;
      
      // تأكد من أن الدفعة نشطة
      if (payment.status !== 'active') return;
      
      // إذا كان الزبون موجود في المبيعات النشطة
      if (debtMap[cid]) {
        // ============================================================
        // نتحقق من أن الدفعة مرتبطة ببيع نشط
        // ============================================================
        const saleId = payment.saleId;
        let isLinkedToActiveSale = false;
        
        if (saleId) {
          // تحقق من أن البيع المرتبط نشط
          const relatedSale = sales.find(s => s.id === saleId);
          if (relatedSale && relatedSale.status === 'active') {
            isLinkedToActiveSale = true;
          }
        } else {
          // إذا كانت الدفعة بدون saleId، نعتبرها صالحة (دفعة يدوية)
          isLinkedToActiveSale = true;
        }
        
        // لا نحسب الدفعات المرتبطة بمبيعات ملغية
        if (!isLinkedToActiveSale) {
          console.log(`⏭️ تخطي دفعة ${payment.id} مرتبطة ببيع ملغى`);
          return;
        }
        
        const amount = payment.amount || 0;
        debtMap[cid].totalPayments += amount;
        debtMap[cid].paymentIds.push(payment.id);
      }
    });

    // ============================================================
    // 3. طباعة للتصحيح (Debug)
    // ============================================================
    console.log('📊 تفاصيل الحسابات (فقط الفواتير النشطة):');
    Object.keys(debtMap).forEach(cid => {
      const data = debtMap[cid];
      const customer = customers.find(c => c.id === parseInt(cid));
      console.log(`👤 ${customer ? customer.name : 'غير معروف'}:`);
      console.log(`   💰 إجمالي المشتريات (نشط): ${data.totalSales}`);
      console.log(`   💵 إجمالي المدفوعات (نشط): ${data.totalPayments}`);
      console.log(`   📋 عدد المبيعات النشطة: ${data.salesCount}`);
      console.log(`   📋 عدد الدفعات النشطة: ${data.paymentIds.length}`);
      console.log(`   📊 الرصيد: ${data.totalSales - data.totalPayments}`);
      console.log('---');
    });

    // ============================================================
    // 4. بناء قائمة الديون النهائية (فقط الزبائن الذين لديهم رصيد)
    // ============================================================
    const debts = Object.keys(debtMap).map(cid => {
      const customer = customers.find(c => c.id === parseInt(cid));
      const data = debtMap[cid];
      
      // تقريب الأرقام
      const totalSales = Math.round((data.totalSales || 0) * 100) / 100;
      const totalPayments = Math.round((data.totalPayments || 0) * 100) / 100;
      const balance = Math.round((totalSales - totalPayments) * 100) / 100;
      
      return {
        customerId: parseInt(cid),
        customerName: customer ? customer.name : 'غير معروف',
        phone: customer ? customer.phone : '-',
        totalSales: totalSales,
        totalPayments: totalPayments,
        balance: balance,
        salesCount: data.salesCount || 0,
        lastSale: data.lastSale || null,
        paymentCount: data.paymentIds ? data.paymentIds.length : 0
      };
    });

    // ============================================================
    // 5. فلترة حسب الزبون
    // ============================================================
    let filtered = debts;
    if (filterCustomer) {
      filtered = filtered.filter(d => d.customerId === parseInt(filterCustomer));
    }

    // ============================================================
    // 6. فلترة حسب البحث
    // ============================================================
    if (search) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(d => d.customerName.toLowerCase().includes(q));
    }

    // ============================================================
    // 7. فلترة حسب المبلغ (الرصيد فقط)
    // ============================================================
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

    // ============================================================
    // 8. فرز
    // ============================================================
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
  }, [sales, payments, customers, filterCustomer, search, filterMinDebt, filterMaxDebt, sortBy, sortOrder]);

  const debts = calculateDebts();

  // ============================================================
  // إحصائيات الديون
  // ============================================================
  const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
  const debtorsCount = debts.filter(d => d.balance > 0).length;
  const paidCount = debts.filter(d => d.balance <= 0).length;
  const totalSalesAll = debts.reduce((sum, d) => sum + d.totalSales, 0);
  const totalPaymentsAll = debts.reduce((sum, d) => sum + d.totalPayments, 0);

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
      </div>

      {/* ============================================================ */}
      {/* الجدول */}
      {/* ============================================================ */}
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
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center">⏳ جاري التحميل...</td></tr>
              ) : debts.length === 0 ? (
                <tr><td colSpan="7" className="text-center">📭 لا توجد ديون</td></tr>
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
    </div>
  );
}

export default Debts;