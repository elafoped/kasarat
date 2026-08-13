import { db } from '../../core/database';
import { config } from '../../core/config';

export const DashboardService = {
  // ============================================================
  // الحصول على إحصائيات كاملة حسب الفترة
  // ============================================================
  async getDashboardStats(period = 'week') {
    const now = new Date();
    let fromDate = new Date(0);
    let periodLabel = 'الكل';

    switch (period) {
      case 'day':
        fromDate = new Date(now);
        fromDate.setHours(0, 0, 0, 0);
        periodLabel = 'اليوم';
        break;
      case 'week':
        fromDate = new Date(now);
        fromDate.setDate(now.getDate() - now.getDay());
        fromDate.setHours(0, 0, 0, 0);
        periodLabel = 'هذا الأسبوع';
        break;
      case 'month':
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
        periodLabel = 'هذا الشهر';
        break;
      case 'year':
        fromDate = new Date(now.getFullYear(), 0, 1);
        periodLabel = 'هذه السنة';
        break;
      case 'all':
      default:
        fromDate = new Date(0);
        periodLabel = 'الكل';
    }

    const fromStr = fromDate.toISOString().split('T')[0];
    
    // جلب جميع البيانات
    const [sales, expenses, customers, materials, payments, vehicles] = await Promise.all([
      db.getAll('sales'),
      db.getAll('expenses'),
      db.getAll('customers'),
      db.getAll('materials'),
      db.getAll('payments'),
      db.getAll('vehicles')
    ]);

    const activeSales = sales.filter(s => s.status === 'active');
    
    // تصفية حسب الفترة
    const filterByDate = (arr, dateKey) => {
      if (period === 'all') return arr;
      return arr.filter(a => a[dateKey] && a[dateKey] >= fromStr);
    };

    const filteredSales = filterByDate(activeSales, 'saleDate');
    const filteredExpenses = filterByDate(expenses, 'date');
    const filteredPayments = filterByDate(payments, 'paymentDate');

    // الإحصائيات الأساسية
    const sum = (arr, key) => arr.reduce((s, a) => s + (a[key] || 0), 0);
    
    const totalSales = sum(filteredSales, 'totalAmount');
    const totalExpenses = sum(filteredExpenses, 'amount');
    const totalPaid = sum(filteredPayments, 'amount');
    const netProfit = totalSales - totalExpenses;

    // عدد العمليات
    const salesCount = filteredSales.length;
    const expensesCount = filteredExpenses.length;
    const customersCount = customers.length;
    const materialsCount = materials.length;
    const vehiclesCount = vehicles.length;

    // حساب الديون
    const debtMap = {};
    activeSales.forEach(s => {
      const cid = s.customerId;
      if (!debtMap[cid]) debtMap[cid] = { total: 0, paid: 0 };
      debtMap[cid].total += (s.totalAmount || 0);
    });
    payments.filter(p => p.status !== 'cancelled').forEach(p => {
      const cid = p.customerId;
      if (debtMap[cid]) debtMap[cid].paid += (p.amount || 0);
    });
    
    let totalDebt = 0;
    let debtorsCount = 0;
    for (const cid in debtMap) {
      const balance = debtMap[cid].total - debtMap[cid].paid;
      if (balance > 0) {
        totalDebt += balance;
        debtorsCount++;
      }
    }

    // متوسط قيمة الفاتورة
    const avgInvoice = salesCount > 0 ? totalSales / salesCount : 0;

    // تحليل المبيعات اليومية (آخر 7 أيام)
    const dailySales = await this._getDailySales(activeSales, 7);
    
    // تحليل المصروفات حسب التصنيف
    const expensesByCategory = this._groupByCategory(filteredExpenses);
    
    // أفضل الزبائن
    const topCustomers = await this._getTopCustomers(activeSales, customers, 5);
    
    // أكثر المواد مبيعاً
    const topMaterials = await this._getTopMaterials(activeSales, materials, 5);

    // تحليل الاتجاهات
    const trends = await this._getTrends(activeSales, expenses);

    return {
      period: {
        key: period,
        label: periodLabel,
        fromDate: fromStr,
        toDate: new Date().toISOString().split('T')[0]
      },
      summary: {
        totalSales,
        totalExpenses,
        netProfit,
        totalPaid,
        remainingBalance: totalSales - totalPaid,
        salesCount,
        expensesCount,
        customersCount,
        materialsCount,
        vehiclesCount,
        avgInvoice,
        totalDebt,
        debtorsCount
      },
      charts: {
        dailySales,
        expensesByCategory,
        topCustomers,
        topMaterials
      },
      trends,
      debtors: Object.keys(debtMap).map(cid => ({
        customerId: parseInt(cid),
        customerName: customers.find(c => c.id == cid)?.name || 'غير معروف',
        total: debtMap[cid].total,
        paid: debtMap[cid].paid,
        balance: debtMap[cid].total - debtMap[cid].paid
      })).filter(d => d.balance > 0).sort((a, b) => b.balance - a.balance)
    };
  },

  // ============================================================
  // المبيعات اليومية (آخر N أيام)
  // ============================================================
  async _getDailySales(sales, days = 7) {
    const result = [];
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const daySales = sales.filter(s => s.saleDate && s.saleDate.startsWith(dateStr));
      const total = daySales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
      const count = daySales.length;
      
      result.push({
        date: dateStr,
        label: d.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric' }),
        total,
        count,
        avg: count > 0 ? total / count : 0
      });
    }
    
    return result;
  },

  // ============================================================
  // تجميع المصروفات حسب التصنيف
  // ============================================================
  _groupByCategory(expenses) {
    const categories = {};
    expenses.forEach(e => {
      const cat = e.category || 'أخرى';
      if (!categories[cat]) categories[cat] = 0;
      categories[cat] += e.amount || 0;
    });
    
    return Object.keys(categories).map(key => ({
      category: key,
      total: categories[key],
      percentage: 0 // سيتم حسابه لاحقاً
    })).sort((a, b) => b.total - a.total);
  },

  // ============================================================
  // أفضل الزبائن
  // ============================================================
  async _getTopCustomers(sales, customers, limit = 5) {
    const map = {};
    sales.forEach(s => {
      const cid = s.customerId;
      if (!map[cid]) map[cid] = { total: 0, count: 0 };
      map[cid].total += (s.totalAmount || 0);
      map[cid].count++;
    });
    
    return Object.entries(map)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, limit)
      .map(([cid, data]) => ({
        customerId: parseInt(cid),
        customerName: customers.find(c => c.id == cid)?.name || 'غير معروف',
        total: data.total,
        count: data.count,
        avg: data.count > 0 ? data.total / data.count : 0
      }));
  },

  // ============================================================
  // أكثر المواد مبيعاً
  // ============================================================
  async _getTopMaterials(sales, materials, limit = 5) {
    const map = {};
    sales.forEach(s => {
      const mid = s.materialId;
      if (!map[mid]) map[mid] = { quantity: 0, revenue: 0 };
      map[mid].quantity += (s.quantity || 0);
      map[mid].revenue += (s.totalAmount || 0);
    });
    
    return Object.entries(map)
      .sort((a, b) => b[1].quantity - a[1].quantity)
      .slice(0, limit)
      .map(([mid, data]) => ({
        materialId: parseInt(mid),
        materialName: materials.find(m => m.id == mid)?.name || 'غير معروف',
        quantity: data.quantity,
        revenue: data.revenue
      }));
  },

  // ============================================================
  // تحليل الاتجاهات
  // ============================================================
  async _getTrends(sales, expenses) {
    const now = new Date();
    const trends = {
      salesGrowth: 0,
      expenseGrowth: 0,
      profitGrowth: 0
    };

    // مقارنة الشهر الحالي مع الشهر السابق
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const getMonthData = (month, year) => {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthSales = sales.filter(s => s.saleDate && s.saleDate.startsWith(monthStr));
      const monthExpenses = expenses.filter(e => e.date && e.date.startsWith(monthStr));
      
      return {
        sales: monthSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0),
        expenses: monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
      };
    };

    const current = getMonthData(currentMonth, currentYear);
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const previous = getMonthData(previousMonth, previousYear);

    trends.salesGrowth = previous.sales > 0 
      ? ((current.sales - previous.sales) / previous.sales) * 100 
      : 0;
    
    trends.expenseGrowth = previous.expenses > 0 
      ? ((current.expenses - previous.expenses) / previous.expenses) * 100 
      : 0;
    
    const currentProfit = current.sales - current.expenses;
    const previousProfit = previous.sales - previous.expenses;
    trends.profitGrowth = previousProfit !== 0 
      ? ((currentProfit - previousProfit) / Math.abs(previousProfit)) * 100 
      : 0;

    return trends;
  },

  // ============================================================
  // تقرير المبيعات المتقدم
  // ============================================================
  async getSalesReport(from, to, groupBy = 'day') {
    let sales = await db.getAll('sales');
    sales = sales.filter(s => s.status !== 'cancelled');

    if (from) sales = sales.filter(s => s.saleDate && s.saleDate >= from);
    if (to) sales = sales.filter(s => s.saleDate && s.saleDate <= to + 'T23:59:59');

    const groups = {};
    sales.forEach(s => {
      const d = new Date(s.saleDate);
      let key;
      if (groupBy === 'day') key = d.toISOString().slice(0, 10);
      else if (groupBy === 'week') {
        const start = new Date(d);
        start.setDate(d.getDate() - d.getDay());
        key = start.toISOString().slice(0, 10);
      } else if (groupBy === 'month') {
        key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      } else if (groupBy === 'year') {
        key = String(d.getFullYear());
      } else key = d.toISOString().slice(0, 10);

      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });

    const result = {};
    for (const key in groups) {
      const items = groups[key];
      result[key] = {
        count: items.length,
        total: items.reduce((sum, s) => sum + (s.totalAmount || 0), 0),
        paid: items.reduce((sum, s) => sum + (s.paidAmount || 0), 0),
        balance: items.reduce((sum, s) => sum + (s.remainingBalance || 0), 0),
        avg: items.length > 0 ? items.reduce((sum, s) => sum + (s.totalAmount || 0), 0) / items.length : 0
      };
    }

    return result;
  },

  // ============================================================
  // تقرير المصروفات المتقدم
  // ============================================================
  async getExpensesReport(from, to, groupBy = 'day') {
    let expenses = await db.getAll('expenses');

    if (from) expenses = expenses.filter(e => e.date && e.date >= from);
    if (to) expenses = expenses.filter(e => e.date && e.date <= to + 'T23:59:59');

    const groups = {};
    expenses.forEach(e => {
      const d = new Date(e.date);
      let key;
      if (groupBy === 'day') key = d.toISOString().slice(0, 10);
      else if (groupBy === 'week') {
        const start = new Date(d);
        start.setDate(d.getDate() - d.getDay());
        key = start.toISOString().slice(0, 10);
      } else if (groupBy === 'month') {
        key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      } else if (groupBy === 'year') {
        key = String(d.getFullYear());
      } else key = d.toISOString().slice(0, 10);

      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });

    const result = {};
    for (const key in groups) {
      const items = groups[key];
      result[key] = {
        count: items.length,
        total: items.reduce((sum, e) => sum + (e.amount || 0), 0),
        avg: items.length > 0 ? items.reduce((sum, e) => sum + (e.amount || 0), 0) / items.length : 0,
        byCategory: this._groupByCategory(items)
      };
    }

    return result;
  }
};