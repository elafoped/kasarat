import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../core/database';
import { formatCurrency, formatDate } from '../utils/formatters';

function Reports({ settings, showToast }) {
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState('sales');
  const [groupBy, setGroupBy] = useState('day');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reportData, setReportData] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [analysis, setAnalysis] = useState(null);

  // ============================================================
  // تحميل الزبائن
  // ============================================================
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const data = await db.getAll('customers');
        setCustomers(data || []);
      } catch (e) {
        console.error('خطأ في تحميل الزبائن:', e);
      }
    };
    loadCustomers();
  }, []);

  // ============================================================
  // تحليل البيانات المالية - النسخة المصححة
  // ============================================================
  const analyzeData = (data, type) => {
    // التحقق من وجود بيانات صالحة
    if (!data || !Array.isArray(data) || data.length === 0) {
      return {
        summary: {
          'إجمالي المبيعات': '0.00 ل.س',
          'إجمالي المدفوعات': '0.00 ل.س',
          'المتبقي من المبيعات': '0.00 ل.س',
          'عدد الفواتير': '0',
          'متوسط قيمة الفاتورة': '0.00 ل.س',
          'نسبة التحصيل': '0.0%',
          'أعلى فترة مبيعات': 'لا توجد بيانات',
          'أقل فترة مبيعات': 'لا توجد بيانات'
        },
        insights: ['📊 لا توجد بيانات كافية للتحليل'],
        recommendations: []
      };
    }

    const analysis = {
      summary: {},
      trends: [],
      insights: [],
      recommendations: []
    };

    if (type === 'sales' || type === 'customer') {
      // ============================================================
      // تحليل المبيعات - مع التحقق من القيم
      // ============================================================
      const totalSales = data.reduce((sum, d) => sum + (Number(d['إجمالي المبيعات']) || Number(d.total) || 0), 0);
      const totalPaid = data.reduce((sum, d) => sum + (Number(d['المدفوع']) || Number(d.paid) || 0), 0);
      const totalBalance = data.reduce((sum, d) => sum + (Number(d['المتبقي']) || Number(d.balance) || 0), 0);
      const totalCount = data.reduce((sum, d) => sum + (Number(d['عدد العمليات']) || Number(d.count) || 0), 0);
      
      // التحقق من صحة الأرقام
      const validTotalSales = isNaN(totalSales) ? 0 : totalSales;
      const validTotalPaid = isNaN(totalPaid) ? 0 : totalPaid;
      const validTotalBalance = isNaN(totalBalance) ? 0 : totalBalance;
      const validTotalCount = isNaN(totalCount) ? 0 : totalCount;
      
      const avgInvoice = validTotalCount > 0 ? validTotalSales / validTotalCount : 0;
      const collectionRate = validTotalSales > 0 ? (validTotalPaid / validTotalSales) * 100 : 0;

      // أفضل وأسوأ فترة - مع التحقق
      let bestPeriod = null;
      let worstPeriod = null;
      let bestValue = -Infinity;
      let worstValue = Infinity;

      data.forEach(d => {
        const val = Number(d['إجمالي المبيعات']) || Number(d.total) || 0;
        const period = d['الفترة'] || d.period || 'غير محدد';
        if (val > bestValue) {
          bestValue = val;
          bestPeriod = { period, value: val };
        }
        if (val < worstValue && val > 0) {
          worstValue = val;
          worstPeriod = { period, value: val };
        }
      });

      // الاتجاهات
      const trends = [];
      for (let i = 1; i < data.length; i++) {
        const prev = Number(data[i-1]['إجمالي المبيعات']) || Number(data[i-1].total) || 0;
        const curr = Number(data[i]['إجمالي المبيعات']) || Number(data[i].total) || 0;
        const change = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
        trends.push({
          period: data[i]['الفترة'] || data[i].period || 'غير محدد',
          change: isNaN(change) ? 0 : change,
          direction: change > 5 ? '📈 تصاعدي' : change < -5 ? '📉 تنازلي' : '➖ ثابت'
        });
      }

      analysis.summary = {
        'إجمالي المبيعات': formatCurrency(validTotalSales, settings.currency),
        'إجمالي المدفوعات': formatCurrency(validTotalPaid, settings.currency),
        'المتبقي من المبيعات': formatCurrency(validTotalBalance, settings.currency),
        'عدد الفواتير': validTotalCount,
        'متوسط قيمة الفاتورة': formatCurrency(avgInvoice, settings.currency),
        'نسبة التحصيل': collectionRate.toFixed(1) + '%',
        'أعلى فترة مبيعات': bestPeriod ? `${bestPeriod.period} (${formatCurrency(bestPeriod.value, settings.currency)})` : 'لا توجد بيانات',
        'أقل فترة مبيعات': worstPeriod ? `${worstPeriod.period} (${formatCurrency(worstPeriod.value, settings.currency)})` : 'لا توجد بيانات'
      };

      analysis.trends = trends;

      analysis.insights = [
        `📊 إجمالي المبيعات خلال الفترة بلغ ${formatCurrency(validTotalSales, settings.currency)}`,
        `💰 تم تحصيل ${formatCurrency(validTotalPaid, settings.currency)} بنسبة ${collectionRate.toFixed(1)}%`,
        `📋 عدد الفواتير ${validTotalCount}`,
        `📊 متوسط قيمة الفاتورة ${formatCurrency(avgInvoice, settings.currency)}`,
        bestPeriod ? `🏆 أفضل فترة كانت ${bestPeriod.period} بإجمالي ${formatCurrency(bestPeriod.value, settings.currency)}` : '🏆 لا توجد فترات كافية للتحليل',
        worstPeriod ? `⚠️ أقل فترة كانت ${worstPeriod.period} بإجمالي ${formatCurrency(worstPeriod.value, settings.currency)}` : '⚠️ لا توجد فترات كافية للتحليل'
      ];

      if (collectionRate < 70 && validTotalSales > 0) {
        analysis.recommendations.push('⚠️ نسبة التحصيل منخفضة، يُنصح بتحسين سياسة التحصيل');
      }
      if (avgInvoice < 100 && validTotalSales > 0) {
        analysis.recommendations.push('💡 متوسط الفاتورة منخفض، يُنصح بزيادة قيمة المبيعات');
      }
      if (trends.length > 0 && trends[trends.length - 1].change < -10) {
        analysis.recommendations.push('📉 المبيعات في انخفاض ملحوظ، يُنصح بمراجعة استراتيجية التسويق');
      }

    } else if (type === 'expenses') {
      // ============================================================
      // تحليل المصروفات
      // ============================================================
      const totalExpenses = data.reduce((sum, d) => sum + (Number(d['إجمالي المصروفات']) || Number(d.total) || 0), 0);
      const totalCount = data.reduce((sum, d) => sum + (Number(d['عدد المصروفات']) || Number(d.count) || 0), 0);
      
      const validTotalExpenses = isNaN(totalExpenses) ? 0 : totalExpenses;
      const validTotalCount = isNaN(totalCount) ? 0 : totalCount;
      const avgExpense = validTotalCount > 0 ? validTotalExpenses / validTotalCount : 0;

      analysis.summary = {
        'إجمالي المصروفات': formatCurrency(validTotalExpenses, settings.currency),
        'عدد المصروفات': validTotalCount,
        'متوسط قيمة المصروف': formatCurrency(avgExpense, settings.currency)
      };

      analysis.insights = [
        `💸 إجمالي المصروفات خلال الفترة بلغ ${formatCurrency(validTotalExpenses, settings.currency)}`,
        `📋 عدد المصروفات ${validTotalCount}`,
        `📊 متوسط قيمة المصروف ${formatCurrency(avgExpense, settings.currency)}`
      ];

    } else if (type === 'profit') {
      // ============================================================
      // تحليل الأرباح
      // ============================================================
      const totalSales = data.reduce((sum, d) => sum + (Number(d['إجمالي المبيعات']) || Number(d.sales) || 0), 0);
      const totalExpenses = data.reduce((sum, d) => sum + (Number(d['إجمالي المصروفات']) || Number(d.expenses) || 0), 0);
      const totalProfit = data.reduce((sum, d) => sum + (Number(d['صافي الأرباح']) || Number(d.profit) || 0), 0);
      
      const validTotalSales = isNaN(totalSales) ? 0 : totalSales;
      const validTotalExpenses = isNaN(totalExpenses) ? 0 : totalExpenses;
      const validTotalProfit = isNaN(totalProfit) ? 0 : totalProfit;
      
      const profitMargin = validTotalSales > 0 ? (validTotalProfit / validTotalSales) * 100 : 0;

      analysis.summary = {
        'إجمالي المبيعات': formatCurrency(validTotalSales, settings.currency),
        'إجمالي المصروفات': formatCurrency(validTotalExpenses, settings.currency),
        'صافي الأرباح': formatCurrency(validTotalProfit, settings.currency),
        'هامش الربح': profitMargin.toFixed(1) + '%'
      };

      analysis.insights = [
        `📊 إجمالي المبيعات ${formatCurrency(validTotalSales, settings.currency)}`,
        `💸 إجمالي المصروفات ${formatCurrency(validTotalExpenses, settings.currency)}`,
        `💰 صافي الأرباح ${formatCurrency(validTotalProfit, settings.currency)}`,
        `📈 هامش الربح ${profitMargin.toFixed(1)}%`
      ];

      if (profitMargin < 10 && validTotalSales > 0) {
        analysis.recommendations.push('⚠️ هامش الربح منخفض، يُنصح بمراجعة الأسعار أو تقليل المصروفات');
      }
      if (validTotalProfit < 0) {
        analysis.recommendations.push('❌ خسارة خلال الفترة، يُنصح بإجراء مراجعة مالية شاملة');
      }

    }

    return analysis;
  };

  // ============================================================
  // توليد التقرير - النسخة المصححة
  // ============================================================
  const generateReport = useCallback(async () => {
    try {
      setLoading(true);
      let data = [];
      let type = reportType;
      let title = '';

      // ============================================================
      // 1. تقرير المبيعات
      // ============================================================
      if (reportType === 'sales') {
        let sales = await db.getAll('sales');
        sales = (sales || []).filter(s => s.status === 'active');

        if (dateFrom) sales = sales.filter(s => s.saleDate && s.saleDate >= dateFrom);
        if (dateTo) sales = sales.filter(s => s.saleDate && s.saleDate <= dateTo + 'T23:59:59');

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

        data = Object.keys(groups).map(key => {
          const items = groups[key] || [];
          const totalAmount = items.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
          const paidAmount = items.reduce((sum, s) => sum + (Number(s.paidAmount) || 0), 0);
          return {
            'الفترة': key,
            'عدد العمليات': items.length,
            'إجمالي المبيعات': totalAmount,
            'المدفوع': paidAmount,
            'المتبقي': totalAmount - paidAmount,
            'متوسط الفاتورة': items.length > 0 ? totalAmount / items.length : 0
          };
        });
        title = '📊 تقرير المبيعات';
      }

      // ============================================================
      // 2. تقرير المصروفات
      // ============================================================
      else if (reportType === 'expenses') {
        let expenses = await db.getAll('expenses');
        expenses = expenses || [];

        if (dateFrom) expenses = expenses.filter(e => e.date && e.date >= dateFrom);
        if (dateTo) expenses = expenses.filter(e => e.date && e.date <= dateTo + 'T23:59:59');

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

        data = Object.keys(groups).map(key => {
          const items = groups[key] || [];
          const totalAmount = items.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
          const byCategory = {};
          items.forEach(e => {
            const cat = e.category || 'أخرى';
            if (!byCategory[cat]) byCategory[cat] = 0;
            byCategory[cat] += Number(e.amount) || 0;
          });
          return {
            'الفترة': key,
            'عدد المصروفات': items.length,
            'إجمالي المصروفات': totalAmount,
            'متوسط المصروف': items.length > 0 ? totalAmount / items.length : 0,
            'تفاصيل حسب التصنيف': byCategory
          };
        });
        title = '💸 تقرير المصروفات';
      }

      // ============================================================
      // 3. تقرير الأرباح
      // ============================================================
      else if (reportType === 'profit') {
        let sales = await db.getAll('sales');
        let expenses = await db.getAll('expenses');
        sales = (sales || []).filter(s => s.status === 'active');
        expenses = expenses || [];

        if (dateFrom) {
          sales = sales.filter(s => s.saleDate && s.saleDate >= dateFrom);
          expenses = expenses.filter(e => e.date && e.date >= dateFrom);
        }
        if (dateTo) {
          sales = sales.filter(s => s.saleDate && s.saleDate <= dateTo + 'T23:59:59');
          expenses = expenses.filter(e => e.date && e.date <= dateTo + 'T23:59:59');
        }

        const salesGroups = {};
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
          if (!salesGroups[key]) salesGroups[key] = [];
          salesGroups[key].push(s);
        });

        const expenseGroups = {};
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
          if (!expenseGroups[key]) expenseGroups[key] = [];
          expenseGroups[key].push(e);
        });

        const allKeys = new Set([...Object.keys(salesGroups), ...Object.keys(expenseGroups)]);
        data = Array.from(allKeys).sort().map(key => {
          const salesItems = salesGroups[key] || [];
          const expenseItems = expenseGroups[key] || [];
          const totalSales = salesItems.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
          const totalExpenses = expenseItems.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
          return {
            'الفترة': key,
            'إجمالي المبيعات': totalSales,
            'إجمالي المصروفات': totalExpenses,
            'صافي الأرباح': totalSales - totalExpenses,
            'عدد المبيعات': salesItems.length,
            'عدد المصروفات': expenseItems.length
          };
        });
        title = '📈 تقرير الأرباح';
      }

      // ============================================================
      // 5. تقرير زبون محدد
      // ============================================================
      else if (reportType === 'customer' && selectedCustomer) {
        let sales = await db.getByIndex('sales', 'customerId', parseInt(selectedCustomer));
        sales = (sales || []).filter(s => s.status === 'active');

        if (dateFrom) sales = sales.filter(s => s.saleDate && s.saleDate >= dateFrom);
        if (dateTo) sales = sales.filter(s => s.saleDate && s.saleDate <= dateTo + 'T23:59:59');

        const customer = (customers || []).find(c => c.id === parseInt(selectedCustomer));
        
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

        data = Object.keys(groups).map(key => {
          const items = groups[key] || [];
          const totalAmount = items.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
          const paidAmount = items.reduce((sum, s) => sum + (Number(s.paidAmount) || 0), 0);
          return {
            'الفترة': key,
            'عدد العمليات': items.length,
            'إجمالي المشتريات': totalAmount,
            'المدفوع': paidAmount,
            'المتبقي': totalAmount - paidAmount,
            'متوسط الفاتورة': items.length > 0 ? totalAmount / items.length : 0
          };
        });
        title = `📊 تقرير ${customer ? customer.name : 'الزبون'}`;
      }

      // تحليل البيانات
      const analysis = analyzeData(data, reportType);
      setAnalysis(analysis);

      setReportData({ data, title });

    } catch (e) {
      console.error('خطأ في توليد التقرير:', e);
      showToast('خطأ في توليد التقرير: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [reportType, groupBy, dateFrom, dateTo, selectedCustomer]);

  // ============================================================
  // تصدير CSV
  // ============================================================
  const exportCSV = () => {
    if (!reportData || !reportData.data || reportData.data.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }

    const headers = Object.keys(reportData.data[0]);
    let csv = '\uFEFF' + headers.join(',') + '\n';
    reportData.data.forEach(row => {
      const values = headers.map(h => {
        const val = row[h];
        if (typeof val === 'number') return val.toFixed(2);
        if (typeof val === 'object') return JSON.stringify(val);
        return val;
      });
      csv += values.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `تقرير_${reportType}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    showToast('✅ تم تصدير التقرير بنجاح', 'success');
  };

  // ============================================================
  // عرض التحليل - النسخة المصححة
  // ============================================================
  const renderAnalysis = () => {
    if (!analysis || !analysis.summary) return null;

    return (
      <div style={{ marginTop: '1.5rem' }}>
        <h4 style={{ marginBottom: '1rem' }}>📊 التحليل المالي والدراسة</h4>
        
        {/* ملخص البيانات */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '0.75rem',
          marginBottom: '1rem'
        }}>
          {Object.keys(analysis.summary).map(key => {
            const value = analysis.summary[key];
            // تخطي القيم undefined أو null
            if (value === undefined || value === null || value === 'undefined') return null;
            return (
              <div key={key} style={{
                background: 'var(--gray-50)',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--gray-200)'
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{key}</div>
                <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{value}</div>
              </div>
            );
          })}
        </div>

        {/* رؤى وتحليلات */}
        {analysis.insights && analysis.insights.length > 0 && (
          <div style={{ 
            background: 'var(--primary-50)', 
            padding: '1rem', 
            borderRadius: 'var(--radius)',
            marginBottom: '0.75rem',
            border: '1px solid var(--primary-200)'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>💡 رؤى وتحليلات</div>
            <ul style={{ margin: 0, paddingRight: '1.5rem' }}>
              {analysis.insights.map((insight, i) => (
                <li key={i} style={{ marginBottom: '0.25rem' }}>{insight}</li>
              ))}
            </ul>
          </div>
        )}

        {/* توصيات */}
        {analysis.recommendations && analysis.recommendations.length > 0 && (
          <div style={{ 
            background: 'var(--warning-50)', 
            padding: '1rem', 
            borderRadius: 'var(--radius)',
            border: '1px solid var(--warning-200)'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>📌 توصيات</div>
            <ul style={{ margin: 0, paddingRight: '1.5rem' }}>
              {analysis.recommendations.map((rec, i) => (
                <li key={i} style={{ marginBottom: '0.25rem' }}>{rec}</li>
              ))}
            </ul>
          </div>
        )}

        {/* الاتجاهات */}
        {analysis.trends && analysis.trends.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>📈 اتجاهات الفترات</div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
              gap: '0.5rem'
            }}>
              {analysis.trends.map((t, i) => {
                const change = Number(t.change) || 0;
                const bgColor = change > 5 ? '#d1fae5' : change < -5 ? '#fee2e2' : '#f3f4f6';
                const textColor = change > 5 ? '#065f46' : change < -5 ? '#991b1b' : '#6b7280';
                return (
                  <div key={i} style={{
                    background: bgColor,
                    padding: '0.3rem 0.5rem',
                    borderRadius: 'var(--radius)',
                    textAlign: 'center',
                    fontSize: '0.85rem',
                    color: textColor
                  }}>
                    <div>{t.period}</div>
                    <div style={{ fontWeight: 'bold' }}>
                      {t.direction} {change !== 0 ? `(${change.toFixed(1)}%)` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // عرض التقرير
  // ============================================================
  const renderReport = () => {
    if (loading) {
      return <div className="text-center" style={{ padding: '2rem' }}>⏳ جاري توليد التقرير...</div>;
    }

    if (!reportData || !reportData.data || reportData.data.length === 0) {
      return (
        <div className="empty-state">
          <div className="icon">📊</div>
          <p>لا توجد بيانات للفترة المحددة</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
            اختر نوع التقرير والفترة ثم اضغط "توليد التقرير"
          </p>
        </div>
      );
    }

    const { data, title } = reportData;
    const headers = Object.keys(data[0]);

    // تحديد أسماء الأعمدة العربية
    const columnNames = {
      'الفترة': '📅 الفترة',
      'عدد العمليات': '📋 عدد العمليات',
      'إجمالي المبيعات': '💰 إجمالي المبيعات',
      'المدفوع': '💵 المدفوع',
      'المتبقي': '📋 المتبقي',
      'متوسط الفاتورة': '📊 متوسط الفاتورة',
      'عدد المصروفات': '📋 عدد المصروفات',
      'إجمالي المصروفات': '💸 إجمالي المصروفات',
      'متوسط المصروف': '📊 متوسط المصروف',
      'إجمالي المشتريات': '💰 إجمالي المشتريات',
      'صافي الأرباح': '📈 صافي الأرباح',
      'عدد المبيعات': '📋 عدد المبيعات',
      'اسم المادة': '🧱 اسم المادة',
      'التصنيف': '📂 التصنيف',
      'الوحدة': '📏 الوحدة',
      'الكمية الحالية': '📦 الكمية الحالية',
      'الحد الأدنى': '⚠️ الحد الأدنى',
      'كمية الإدخال': '➕ كمية الإدخال',
      'كمية الإخراج': '➖ كمية الإخراج',
      'صافي التغير': '📊 صافي التغير',
      'الحالة': '📋 الحالة',
      'تفاصيل حسب التصنيف': '📊 تفاصيل حسب التصنيف'
    };

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h4>{title || 'التقرير'}</h4>
          <span style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
            {data.length} سجل | {dateFrom || 'من البداية'} → {dateTo || 'حتى اليوم'}
          </span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {headers.map(h => (
                  <th key={h}>{columnNames[h] || h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr key={index}>
                  {headers.map(h => {
                    const val = row[h];
                    if (typeof val === 'number' && 
                        h !== 'عدد العمليات' && 
                        h !== 'عدد المبيعات' && 
                        h !== 'عدد المصروفات' &&
                        h !== 'الكمية الحالية' &&
                        h !== 'الحد الأدنى' &&
                        h !== 'كمية الإدخال' &&
                        h !== 'كمية الإخراج' &&
                        h !== 'صافي التغير') {
                      return <td key={h}>{formatCurrency(val, settings.currency)}</td>;
                    }
                    if (typeof val === 'object') {
                      return <td key={h}>{JSON.stringify(val)}</td>;
                    }
                    if (typeof val === 'number') {
                      return <td key={h}>{val}</td>;
                    }
                    return <td key={h}>{val}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* التحليل المالي */}
        {renderAnalysis()}
      </div>
    );
  };

  return (
    <div className="page-section active">
      {/* ============================================================ */}
      {/* شريط التحكم */}
      {/* ============================================================ */}
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <div className="filter-group">
          <label>نوع التقرير:</label>
          <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
            <option value="sales">📊 المبيعات</option>
            <option value="expenses">💸 المصروفات</option>
            <option value="profit">📈 الأرباح</option>
            <option value="customer">👤 زبون محدد</option>
          </select>
        </div>

        {reportType === 'customer' && (
          <div className="filter-group">
            <label>الزبون:</label>
            <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)}>
              <option value="">اختر زبون</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="filter-group">
          <label>التجميع:</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="day">📅 يومي</option>
            <option value="week">📅 أسبوعي</option>
            <option value="month">📅 شهري</option>
            <option value="year">📅 سنوي</option>
          </select>
        </div>

        <div className="filter-group">
          <label>من:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <label>إلى:</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <button className="btn btn-primary" onClick={generateReport} disabled={loading}>
          {loading ? '⏳ جاري التوليد...' : '📊 توليد التقرير'}
        </button>

        <button className="btn btn-outline" onClick={exportCSV} disabled={!reportData}>
          📤 CSV
        </button>

        <button className="btn btn-outline" onClick={() => window.print()} disabled={!reportData}>
          🖨️ طباعة
        </button>
      </div>

      {/* ============================================================ */}
      {/* عرض التقرير */}
      {/* ============================================================ */}
      <div className="card" id="reportOutput">
        {renderReport()}
      </div>
    </div>
  );
}

export default Reports;