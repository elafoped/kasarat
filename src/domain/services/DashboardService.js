// src/domain/services/DashboardService.js
import { db } from '../../core/database';

export const DashboardService = {
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

    // جلب جميع البيانات
    const [sales, expenses, customers, materials, payments, vehicles] = await Promise.all([
      db.getAll('sales'),
      db.getAll('expenses'),
      db.getAll('customers'),
      db.getAll('materials'),
      db.getAll('payments'),
      db.getAll('vehicles')
    ]);

    // دوال مساعدة للتصفية بالتاريخ
    const isDateInRange = (dateStr, fromDate) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);
      return d >= fromDate;
    };

    const filterByDate = (arr, dateKey) => {
      if (!arr || arr.length === 0) return [];
      if (period === 'all') return arr;
      return arr.filter(item => item && item[dateKey] && isDateInRange(item[dateKey], fromDate));
    };

    // تصفية المبيعات النشطة
    const activeSales = sales.filter(s => s && s.status === 'active');
    const filteredSales = filterByDate(activeSales, 'saleDate');
    const filteredExpenses = filterByDate(expenses, 'date');
    const filteredPayments = filterByDate(payments, 'paymentDate');

    // جمع القيم
    const sum = (arr, key) => arr.reduce((s, a) => s + (a?.[key] || 0), 0);

    const totalSales = sum(filteredSales, 'totalAmount');
    const totalExpenses = sum(filteredExpenses, 'amount');
    const totalPaid = sum(filteredPayments, 'amount');
    const netProfit = totalSales - totalExpenses;

    // خرائط الأسماء
    const customerMap = Object.fromEntries((customers || []).map(c => [c.id, c.name || 'غير معروف']));
    const materialMap = Object.fromEntries((materials || []).map(m => [m.id, m.name || 'غير معروف']));

    // حساب الديون (لكل المبيعات النشطة)
    // ⭐ نقرأ s.paidAmount مباشرة (نفس الحقل الذي يديره SaleService بتقريب
    // موحّد) بدل إعادة جمع جدول payments بمنطق منفصل هنا، لتفادي ظهور
    // أرقام مختلفة عن باقي شاشات النظام (المبيعات/الديون).
    const debtMap = {};
    activeSales.forEach(s => {
      if (s?.customerId) {
        const cid = s.customerId;
        if (!debtMap[cid]) debtMap[cid] = { total: 0, paid: 0 };
        debtMap[cid].total += s.totalAmount || 0;
        debtMap[cid].paid += s.paidAmount || 0;
      }
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

    // إحصائيات أساسية
    const salesCount = filteredSales.length;
    const expensesCount = filteredExpenses.length;
    const customersCount = customers ? customers.length : 0;
    const materialsCount = materials ? materials.length : 0;
    const vehiclesCount = vehicles ? vehicles.length : 0;
    const avgInvoice = salesCount > 0 ? totalSales / salesCount : 0;

    // تحليلات متقدمة (ثابتة – تعتمد على الفترة المفلترة)
    const dailySales = this._getDailySales(filteredSales, 7);
    const expensesByCategory = this._groupByCategory(filteredExpenses);
    const topCustomers = this._getTopCustomers(filteredSales, customerMap, 5);
    const topMaterials = this._getTopMaterials(filteredSales, materialMap, 5);

    // ================================================================
    // ★★★ البيانات الزمنية (Time Series) الديناميكية حسب الفترة ★★★
    // ================================================================
    const timeSeries = this._getTimeSeriesData(activeSales, expenses, period, fromDate, now);

    // تحليل الاتجاهات القديم (مقارنة شهرين) – يمكن الاحتفاظ به أو إزالته
    const trends = this._getTrends(sales, expenses);

    // قائمة المدينون
    const debtors = Object.keys(debtMap).map(cid => ({
      customerId: parseInt(cid),
      customerName: customerMap[cid] || 'غير معروف',
      total: Math.round(debtMap[cid].total * 100) / 100,
      paid: Math.round(debtMap[cid].paid * 100) / 100,
      balance: Math.round((debtMap[cid].total - debtMap[cid].paid) * 100) / 100
    })).filter(d => d.balance > 0).sort((a, b) => b.balance - a.balance);

    return {
      period: {
        key: period,
        label: periodLabel,
        fromDate: fromDate.toISOString().split('T')[0],
        toDate: now.toISOString().split('T')[0]
      },
      summary: {
        totalSales: Math.round(totalSales * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        remainingBalance: Math.round((totalSales - totalPaid) * 100) / 100,
        salesCount,
        expensesCount,
        customersCount,
        materialsCount,
        vehiclesCount,
        avgInvoice: Math.round(avgInvoice * 100) / 100,
        totalDebt: Math.round(totalDebt * 100) / 100,
        debtorsCount
      },
      charts: {
        dailySales,
        expensesByCategory,
        topCustomers,
        topMaterials
      },
      trends, // يمكن الاحتفاظ به أو حذفه
      timeSeries, // ★ البيانات الجديدة للرسم البياني الديناميكي
      debtors
    };
  },

  // ============================================================
  // دالة توليد البيانات الزمنية حسب الفترة (يومي، أسبوعي، شهري، سنوي)
  // ============================================================
  _getTimeSeriesData(sales, expenses, period, fromDate, toDate) {
    const result = {
      labels: [],
      sales: [],
      expenses: [],
      profit: []
    };

    // إذا كانت الفترة 'all'، نأخذ السنوات المتاحة
    if (period === 'all') {
      // نحدد أقدم سنة وأحدث سنة من البيانات
      let minYear = Infinity;
      let maxYear = -Infinity;
      const allItems = [...sales, ...expenses];
      allItems.forEach(item => {
        const dateStr = item?.saleDate || item?.date;
        if (dateStr) {
          const year = new Date(dateStr).getFullYear();
          if (year < minYear) minYear = year;
          if (year > maxYear) maxYear = year;
        }
      });
      if (minYear === Infinity || maxYear === -Infinity) {
        // لا توجد بيانات، نعيد فارغاً
        return result;
      }
      // ننشئ مصفوفة السنوات من minYear إلى maxYear
      for (let y = minYear; y <= maxYear; y++) {
        const yearStr = y.toString();
        const yearSales = sales.filter(s => s?.saleDate && new Date(s.saleDate).getFullYear() === y);
        const yearExpenses = expenses.filter(e => e?.date && new Date(e.date).getFullYear() === y);
        const totalSales = yearSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
        const totalExpenses = yearExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        result.labels.push(yearStr);
        result.sales.push(Math.round(totalSales * 100) / 100);
        result.expenses.push(Math.round(totalExpenses * 100) / 100);
        result.profit.push(Math.round((totalSales - totalExpenses) * 100) / 100);
      }
      return result;
    }

    // الفترات الأخرى: نحدد عدد النقاط ونوع التجميع
    let startDate = new Date(fromDate);
    let endDate = new Date(toDate);
    let interval = 'day'; // افتراضي

    if (period === 'day') {
      // نأخذ 24 ساعة (لكننا نريد عرض ساعات؟) – الأفضل عرض ساعات اليوم
      // لكننا سنكتفي بيوم واحد فقط، نعرض ساعات؟ نقترح عرض آخر 24 ساعة كل ساعة
      // لكن لدينا بيانات يومية، سنعرض نقاط لكل ساعة إذا كانت البيانات متوفرة.
      // للتبسيط، سنعرض يوم واحد فقط (نقطة واحدة) – لكن الأفضل عرض آخر 7 أيام إذا كان اليوم.
      // لنجعل 'day' تعرض آخر 7 أيام (نفس week) لكن يمكن تخصيصها.
      // سأجعل 'day' تعرض الأيام السبعة الأخيرة أيضاً لتكون غنية.
      // إذا أردت ساعات، يجب تعديل الدالة.
      // هنا سنعرض الأيام السبعة الأخيرة.
      interval = 'day';
      // نعيد استخدام دالة _getDailySales ولكن نمرر المصفوفة الكاملة
      const daily = this._getDailySales(sales, 7);
      result.labels = daily.map(d => d.label);
      result.sales = daily.map(d => d.total);
      // المصروفات اليومية ليست محسوبة في _getDailySales، لذا نحسبها بشكل منفصل
      // سنقوم بحساب المصروفات لكل يوم
      const expensesByDay = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(toDate);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayExpenses = expenses.filter(e => e?.date && e.date.startsWith(dateStr));
        const totalExp = dayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        expensesByDay[dateStr] = totalExp;
      }
      // نعيد ترتيب النتائج حسب الأيام
      const sortedLabels = daily.map(d => d.date);
      result.expenses = sortedLabels.map(date => expensesByDay[date] || 0);
      result.profit = result.sales.map((s, i) => Math.round((s - result.expenses[i]) * 100) / 100);
      return result;
    }

    if (period === 'week') {
      // نعرض الأيام السبعة
      const daily = this._getDailySales(sales, 7);
      result.labels = daily.map(d => d.label);
      result.sales = daily.map(d => d.total);
      // Expenses for each day
      const expensesByDay = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(toDate);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayExpenses = expenses.filter(e => e?.date && e.date.startsWith(dateStr));
        expensesByDay[dateStr] = dayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      }
      const sortedLabels = daily.map(d => d.date);
      result.expenses = sortedLabels.map(date => expensesByDay[date] || 0);
      result.profit = result.sales.map((s, i) => Math.round((s - result.expenses[i]) * 100) / 100);
      return result;
    }

    if (period === 'month') {
      // نعرض أيام الشهر الحالي
      const year = toDate.getFullYear();
      const month = toDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const labels = [];
      const salesArr = [];
      const expensesArr = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(year, month, d);
        const dateStr = dateObj.toISOString().split('T')[0];
        labels.push(d.toString());
        const daySales = sales.filter(s => s?.saleDate && s.saleDate.startsWith(dateStr));
        const dayExpenses = expenses.filter(e => e?.date && e.date.startsWith(dateStr));
        salesArr.push(daySales.reduce((sum, s) => sum + (s.totalAmount || 0), 0));
        expensesArr.push(dayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0));
      }
      result.labels = labels;
      result.sales = salesArr.map(v => Math.round(v * 100) / 100);
      result.expenses = expensesArr.map(v => Math.round(v * 100) / 100);
      result.profit = result.sales.map((s, i) => Math.round((s - result.expenses[i]) * 100) / 100);
      return result;
    }

    if (period === 'year') {
      // نعرض أشهر السنة الحالية
      const year = toDate.getFullYear();
      const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
      const labels = [];
      const salesArr = [];
      const expensesArr = [];
      for (let m = 0; m < 12; m++) {
        const monthStr = `${year}-${String(m + 1).padStart(2, '0')}`;
        labels.push(months[m]);
        const monthSales = sales.filter(s => s?.saleDate && s.saleDate.startsWith(monthStr));
        const monthExpenses = expenses.filter(e => e?.date && e.date.startsWith(monthStr));
        salesArr.push(monthSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0));
        expensesArr.push(monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0));
      }
      result.labels = labels;
      result.sales = salesArr.map(v => Math.round(v * 100) / 100);
      result.expenses = expensesArr.map(v => Math.round(v * 100) / 100);
      result.profit = result.sales.map((s, i) => Math.round((s - result.expenses[i]) * 100) / 100);
      return result;
    }

    // fallback
    return result;
  },

  // ============================================================
  // دوال مساعدة أخرى (كما هي)
  // ============================================================
  _getDailySales(sales, days = 7) {
    const result = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const daySales = sales.filter(s => s && s.saleDate && s.saleDate.startsWith(dateStr));
      const total = daySales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
      const count = daySales.length;
      result.push({
        date: dateStr,
        label: d.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric' }),
        total: Math.round(total * 100) / 100,
        count: count,
        avg: count > 0 ? Math.round((total / count) * 100) / 100 : 0
      });
    }
    return result;
  },

  _groupByCategory(expenses) {
    const categories = {};
    if (expenses && expenses.length > 0) {
      expenses.forEach(e => {
        if (e) {
          const cat = e.category || 'أخرى';
          if (!categories[cat]) categories[cat] = 0;
          categories[cat] += (e.amount || 0);
        }
      });
    }
    const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
    return Object.keys(categories).map(key => ({
      category: key,
      total: Math.round((categories[key] || 0) * 100) / 100,
      percentage: total > 0 ? Math.round(((categories[key] / total) * 100) * 100) / 100 : 0
    })).sort((a, b) => b.total - a.total);
  },

  _getTopCustomers(sales, customerMap, limit = 5) {
    const map = {};
    if (sales && sales.length > 0) {
      sales.forEach(s => {
        if (s && s.customerId) {
          const cid = s.customerId;
          if (!map[cid]) map[cid] = { total: 0, count: 0 };
          map[cid].total += (s.totalAmount || 0);
          map[cid].count++;
        }
      });
    }
    const sorted = Object.entries(map)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, limit);
    return sorted.map(([cid, data]) => ({
      customerId: parseInt(cid),
      customerName: customerMap[parseInt(cid)] || 'غير معروف',
      total: Math.round((data.total || 0) * 100) / 100,
      count: data.count || 0,
      avg: data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0
    }));
  },

  _getTopMaterials(sales, materialMap, limit = 5) {
    const map = {};
    if (sales && sales.length > 0) {
      sales.forEach(s => {
        if (s && s.materialId) {
          const mid = s.materialId;
          if (!map[mid]) map[mid] = { quantity: 0, revenue: 0 };
          map[mid].quantity += (s.quantity || 0);
          map[mid].revenue += (s.totalAmount || 0);
        }
      });
    }
    const sorted = Object.entries(map)
      .sort((a, b) => b[1].quantity - a[1].quantity)
      .slice(0, limit);
    return sorted.map(([mid, data]) => ({
      materialId: parseInt(mid),
      materialName: materialMap[parseInt(mid)] || 'غير معروف',
      quantity: data.quantity || 0,
      revenue: Math.round((data.revenue || 0) * 100) / 100
    }));
  },

  _getTrends(sales, expenses) {
    // بقيت كما هي (اختياري)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const isSameMonth = (dateStr, year, month) => {
      if (!dateStr) return false;
      try {
        const d = new Date(dateStr);
        return d.getFullYear() === year && d.getMonth() === month;
      } catch {
        return false;
      }
    };
    const getMonthData = (year, month) => {
      const monthSales = (sales || []).filter(s => s && isSameMonth(s.saleDate, year, month));
      const monthExpenses = (expenses || []).filter(e => e && isSameMonth(e.date, year, month));
      return {
        sales: monthSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0),
        expenses: monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
      };
    };
    const current = getMonthData(currentYear, currentMonth);
    let prevYear = currentYear, prevMonth = currentMonth - 1;
    if (prevMonth < 0) { prevMonth = 11; prevYear--; }
    const previous = getMonthData(prevYear, prevMonth);
    const currentProfit = current.sales - current.expenses;
    const previousProfit = previous.sales - previous.expenses;
    return {
      currentSales: Math.round(current.sales * 100) / 100,
      previousSales: Math.round(previous.sales * 100) / 100,
      currentExpenses: Math.round(current.expenses * 100) / 100,
      previousExpenses: Math.round(previous.expenses * 100) / 100,
      salesGrowth: previous.sales !== 0 ? Math.round(((current.sales - previous.sales) / previous.sales) * 10000) / 100 : 0,
      expenseGrowth: previous.expenses !== 0 ? Math.round(((current.expenses - previous.expenses) / previous.expenses) * 10000) / 100 : 0,
      profitGrowth: previousProfit !== 0 ? Math.round(((currentProfit - previousProfit) / Math.abs(previousProfit)) * 10000) / 100 : 0
    };
  }
};