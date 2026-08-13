import React, { useState, useEffect, useRef } from 'react';
import { DashboardService } from '../../domain/services/DashboardService';
import { formatCurrency, formatDate, formatNumber } from '../utils/formatters';
import { config } from '../../core/config';

function Dashboard({ showToast, settings }) {
  const [period, setPeriod] = useState('week');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [chartInstances, setChartInstances] = useState({});
  const chartRefs = useRef({});

  useEffect(() => {
    loadDashboard();
  }, [period]);

  useEffect(() => {
    if (stats && !loading) {
      renderCharts();
    }
    return () => {
      // تنظيف الرسوم البيانية عند إلغاء التحميل
      Object.values(chartInstances).forEach(chart => {
        if (chart && chart.destroy) chart.destroy();
      });
    };
  }, [stats, loading]);

  // ============================================================
  // تحميل البيانات
  // ============================================================
  const loadDashboard = async () => {
    try {
      setLoading(true);
      const data = await DashboardService.getDashboardStats(period);
      setStats(data);
    } catch (e) {
      console.error('فشل تحميل الداشبورد:', e);
      showToast('حدث خطأ في تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // رسم الرسوم البيانية
  // ============================================================
  const renderCharts = () => {
    if (!stats) return;

    // تنظيف الرسوم القديمة
    Object.values(chartInstances).forEach(chart => {
      if (chart && chart.destroy) chart.destroy();
    });

    const newCharts = {};

    // 1. رسم المبيعات اليومية
    if (stats.charts?.dailySales && window.Chart) {
      const ctx = document.getElementById('dailySalesChart')?.getContext('2d');
      if (ctx) {
        const dailyData = stats.charts.dailySales;
        newCharts.dailySales = new window.Chart(ctx, {
          type: 'bar',
          data: {
            labels: dailyData.map(d => d.label),
            datasets: [
              {
                label: 'المبيعات',
                data: dailyData.map(d => d.total),
                backgroundColor: 'rgba(37, 99, 235, 0.7)',
                borderColor: 'rgba(37, 99, 235, 1)',
                borderWidth: 2,
                borderRadius: 6,
              },
              {
                label: 'عدد العمليات',
                data: dailyData.map(d => d.count * 10),
                backgroundColor: 'rgba(16, 185, 129, 0.3)',
                borderColor: 'rgba(16, 185, 129, 0.8)',
                borderWidth: 2,
                borderRadius: 6,
                yAxisID: 'y1',
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { 
                position: 'top', 
                labels: { 
                  boxWidth: 14, 
                  font: { size: 11, weight: '600' } 
                } 
              }
            },
            scales: {
              y: { 
                beginAtZero: true, 
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: { callback: (value) => formatCurrency(value, settings.currency) }
              },
              y1: {
                position: 'right',
                beginAtZero: true,
                grid: { display: false },
                ticks: { callback: (value) => value / 10 + ' عمليات' }
              },
              x: { grid: { display: false } }
            }
          }
        });
      }
    }

    // 2. رسم توزيع المصروفات
    if (stats.charts?.expensesByCategory && window.Chart) {
      const ctx = document.getElementById('expensesChart')?.getContext('2d');
      if (ctx) {
        const categories = stats.charts.expensesByCategory;
        const colors = ['#2563eb', '#dc2626', '#d97706', '#059669', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b'];
        newCharts.expenses = new window.Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: categories.map(c => c.category),
            datasets: [{
              data: categories.map(c => c.total),
              backgroundColor: colors.slice(0, categories.length),
              borderWidth: 3,
              borderColor: '#fff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { 
                position: 'bottom', 
                labels: { 
                  boxWidth: 12, 
                  font: { size: 10 },
                  padding: 10
                } 
              }
            },
            cutout: '60%'
          }
        });
      }
    }

    // 3. رسم اتجاه المبيعات
    if (stats.trends && window.Chart) {
      const ctx = document.getElementById('trendsChart')?.getContext('2d');
      if (ctx) {
        const trends = stats.trends;
        newCharts.trends = new window.Chart(ctx, {
          type: 'line',
          data: {
            labels: ['الشهر الماضي', 'الشهر الحالي'],
            datasets: [
              {
                label: 'المبيعات',
                data: [trends.previousSales || 0, trends.currentSales || 0],
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 6,
                pointBackgroundColor: '#2563eb'
              },
              {
                label: 'المصروفات',
                data: [trends.previousExpenses || 0, trends.currentExpenses || 0],
                borderColor: '#dc2626',
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 6,
                pointBackgroundColor: '#dc2626'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { 
                position: 'top', 
                labels: { 
                  boxWidth: 14, 
                  font: { size: 11, weight: '600' } 
                } 
              }
            },
            scales: {
              y: { 
                beginAtZero: true, 
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: { callback: (value) => formatCurrency(value, settings.currency) }
              },
              x: { grid: { display: false } }
            }
          }
        });
      }
    }

    setChartInstances(newCharts);
  };

  // ============================================================
  // البطاقات الإحصائية الرئيسية
  // ============================================================
  const renderMainCards = () => {
    if (!stats) return null;
    const s = stats.summary;
    
    const cards = [
      {
        id: 'sales',
        icon: '💰',
        title: 'إجمالي المبيعات',
        value: formatCurrency(s.totalSales, settings.currency),
        sub: stats.period.label,
        color: 'primary',
        trend: stats.trends?.salesGrowth
      },
      {
        id: 'expenses',
        icon: '💸',
        title: 'إجمالي المصروفات',
        value: formatCurrency(s.totalExpenses, settings.currency),
        sub: stats.period.label,
        color: 'danger',
        trend: stats.trends?.expenseGrowth
      },
      {
        id: 'profit',
        icon: '📊',
        title: 'صافي الربح',
        value: formatCurrency(s.netProfit, settings.currency),
        sub: stats.period.label,
        color: s.netProfit >= 0 ? 'success' : 'danger',
        trend: stats.trends?.profitGrowth
      },
      {
        id: 'salesCount',
        icon: '📈',
        title: 'عدد المبيعات',
        value: formatNumber(s.salesCount),
        sub: 'عملية بيع',
        color: 'warning'
      },
      {
        id: 'customers',
        icon: '👥',
        title: 'الزبائن',
        value: formatNumber(s.customersCount),
        sub: 'زبون مسجل',
        color: 'purple'
      },
      {
        id: 'debt',
        icon: '📋',
        title: 'إجمالي الديون',
        value: formatCurrency(s.totalDebt, settings.currency),
        sub: `${s.debtorsCount} زبون مدين`,
        color: 'indigo'
      },
      {
        id: 'materials',
        icon: '📦',
        title: 'المواد',
        value: formatNumber(s.materialsCount),
        sub: 'مادة مسجلة',
        color: 'teal'
      },
      {
        id: 'vehicles',
        icon: '🚗',
        title: 'السيارات',
        value: formatNumber(s.vehiclesCount),
        sub: 'سيارة مسجلة',
        color: 'pink'
      }
    ];

    return (
      <div className="grid-cards">
        {cards.map(card => (
          <div key={card.id} className={`card card-${card.color}`}>
            <div className="card-title">
              <span className="card-icon">{card.icon}</span>
              {card.title}
              {card.trend !== undefined && card.trend !== null && (
                <span className={`trend-badge ${card.trend >= 0 ? 'trend-up' : 'trend-down'}`}>
                  {card.trend >= 0 ? '↑' : '↓'} {Math.abs(card.trend).toFixed(1)}%
                </span>
              )}
            </div>
            <div className="card-value">{card.value}</div>
            <div className="card-sub">{card.sub}</div>
          </div>
        ))}
      </div>
    );
  };

  // ============================================================
  // تحليل الاتجاهات المتقدم
  // ============================================================
  const renderAdvancedTrends = () => {
    if (!stats || !stats.trends) return null;
    const t = stats.trends;

    const trendsData = [
      { label: '📈 نمو المبيعات', value: t.salesGrowth, color: t.salesGrowth >= 0 ? '#059669' : '#dc2626' },
      { label: '📉 نمو المصروفات', value: -t.expenseGrowth, color: -t.expenseGrowth >= 0 ? '#059669' : '#dc2626' },
      { label: '💰 نمو الأرباح', value: t.profitGrowth, color: t.profitGrowth >= 0 ? '#059669' : '#dc2626' }
    ];

    // مؤشرات الأداء الرئيسية
    const kpis = [
      { label: 'هامش الربح', value: stats.summary.totalSales > 0 
          ? ((stats.summary.netProfit / stats.summary.totalSales) * 100).toFixed(1) + '%' 
          : '0%', 
        status: stats.summary.totalSales > 0 && stats.summary.netProfit > 0 ? 'good' : 'warning' },
      { label: 'نسبة التحصيل', value: stats.summary.totalSales > 0 
          ? ((stats.summary.totalPaid / stats.summary.totalSales) * 100).toFixed(1) + '%' 
          : '0%',
        status: stats.summary.totalPaid / stats.summary.totalSales > 0.7 ? 'good' : 'warning' },
      { label: 'متوسط الفاتورة', value: formatCurrency(stats.summary.avgInvoice, settings.currency),
        status: stats.summary.avgInvoice > 100 ? 'good' : 'warning' }
    ];

    return (
      <div className="card">
        <div className="card-title">📊 تحليل الأداء المتقدم</div>
        
        {/* مؤشرات الأداء */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
          gap: '0.75rem',
          marginBottom: '1rem'
        }}>
          {kpis.map((kpi, i) => (
            <div key={i} style={{
              background: kpi.status === 'good' ? 'var(--secondary-50)' : 'var(--warning-50)',
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--radius)',
              border: `1px solid ${kpi.status === 'good' ? 'var(--secondary-200)' : 'var(--warning-200)'}`
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{kpi.label}</div>
              <div style={{ 
                fontSize: '1.2rem', 
                fontWeight: 'bold',
                color: kpi.status === 'good' ? 'var(--secondary-600)' : 'var(--warning-600)'
              }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* اتجاهات النمو */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
          gap: '0.75rem'
        }}>
          {trendsData.map((item, i) => (
            <div key={i} style={{
              textAlign: 'center',
              padding: '0.5rem',
              background: item.value >= 0 ? 'var(--secondary-50)' : 'var(--danger-50)',
              borderRadius: 'var(--radius)'
            }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{item.label}</div>
              <div style={{ 
                fontSize: '1.3rem', 
                fontWeight: 'bold',
                color: item.color
              }}>
                {item.value >= 0 ? '+' : ''}{item.value.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>

        {/* رسوم بيانية للاتجاهات */}
        <div style={{ marginTop: '1rem', height: '200px' }}>
          <canvas id="trendsChart"></canvas>
        </div>
      </div>
    );
  };

  // ============================================================
  // أفضل الزبائن
  // ============================================================
  const renderTopCustomers = () => {
    if (!stats || !stats.charts?.topCustomers || stats.charts.topCustomers.length === 0) {
      return (
        <div className="card">
          <div className="card-title">🏆 أفضل الزبائن</div>
          <div className="text-muted" style={{ padding: '1rem' }}>لا توجد بيانات كافية</div>
        </div>
      );
    }
    
    const customers = stats.charts.topCustomers;
    
    return (
      <div className="card">
        <div className="card-title">🏆 أفضل الزبائن</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>الزبون</th>
                <th>المشتريات</th>
                <th>المبلغ</th>
                <th>المتوسط</th>
                <th>النسبة</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => {
                const maxTotal = customers[0]?.total || 1;
                const percentage = (c.total / maxTotal) * 100;
                return (
                  <tr key={c.customerId}>
                    <td>
                      <span className={`rank-badge ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td><strong>{c.customerName}</strong></td>
                    <td>{c.count}</td>
                    <td>{formatCurrency(c.total, settings.currency)}</td>
                    <td>{formatCurrency(c.avg, settings.currency)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ 
                          width: '60px', 
                          height: '6px', 
                          background: 'var(--gray-200)',
                          borderRadius: '3px',
                          overflow: 'hidden'
                        }}>
                          <div style={{ 
                            width: `${percentage}%`, 
                            height: '100%', 
                            background: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : '#8b5cf6',
                            borderRadius: '3px'
                          }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                          {percentage.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ============================================================
  // أكثر المواد مبيعاً
  // ============================================================
  const renderTopMaterials = () => {
    if (!stats || !stats.charts?.topMaterials || stats.charts.topMaterials.length === 0) {
      return (
        <div className="card">
          <div className="card-title">🧱 أكثر المواد مبيعاً</div>
          <div className="text-muted" style={{ padding: '1rem' }}>لا توجد بيانات كافية</div>
        </div>
      );
    }
    
    const materials = stats.charts.topMaterials;
    
    return (
      <div className="card">
        <div className="card-title">🧱 أكثر المواد مبيعاً</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>المادة</th>
                <th>الكمية</th>
                <th>الإيرادات</th>
                <th>النسبة</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m, i) => {
                const maxQty = materials[0]?.quantity || 1;
                const percentage = (m.quantity / maxQty) * 100;
                return (
                  <tr key={m.materialId}>
                    <td>{i + 1}</td>
                    <td><strong>{m.materialName}</strong></td>
                    <td>{m.quantity}</td>
                    <td>{formatCurrency(m.revenue, settings.currency)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ 
                          width: '60px', 
                          height: '6px', 
                          background: 'var(--gray-200)',
                          borderRadius: '3px',
                          overflow: 'hidden'
                        }}>
                          <div style={{ 
                            width: `${percentage}%`, 
                            height: '100%', 
                            background: '#14b8a6',
                            borderRadius: '3px'
                          }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                          {percentage.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ============================================================
  // المبيعات اليومية
  // ============================================================
  const renderDailySales = () => {
    if (!stats || !stats.charts?.dailySales || stats.charts.dailySales.length === 0) {
      return (
        <div className="card">
          <div className="card-title">📊 المبيعات اليومية</div>
          <div className="text-muted" style={{ padding: '1rem' }}>لا توجد بيانات كافية</div>
        </div>
      );
    }
    
    return (
      <div className="card">
        <div className="card-title">📊 المبيعات اليومية (آخر 7 أيام)</div>
        <div style={{ height: '220px' }}>
          <canvas id="dailySalesChart"></canvas>
        </div>
      </div>
    );
  };

  // ============================================================
  // توزيع المصروفات
  // ============================================================
  const renderExpensesDistribution = () => {
    if (!stats || !stats.charts?.expensesByCategory || stats.charts.expensesByCategory.length === 0) {
      return (
        <div className="card">
          <div className="card-title">🧩 توزيع المصروفات</div>
          <div className="text-muted" style={{ padding: '1rem' }}>لا توجد بيانات كافية</div>
        </div>
      );
    }
    
    return (
      <div className="card">
        <div className="card-title">🧩 توزيع المصروفات حسب التصنيف</div>
        <div style={{ height: '220px' }}>
          <canvas id="expensesChart"></canvas>
        </div>
      </div>
    );
  };

  // ============================================================
  // قائمة المدينون
  // ============================================================
  const renderDebtors = () => {
    if (!stats || !stats.debtors || stats.debtors.length === 0) {
      return (
        <div className="card">
          <div className="card-title">📋 المدينون</div>
          <div className="text-muted" style={{ padding: '1rem' }}>
            ✅ لا يوجد مدينون
          </div>
        </div>
      );
    }
    
    return (
      <div className="card">
        <div className="card-title">📋 قائمة المدينون</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>الزبون</th>
                <th>إجمالي المشتريات</th>
                <th>المدفوع</th>
                <th>الرصيد المتبقي</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {stats.debtors.map((d, i) => {
                const debtRatio = d.total > 0 ? (d.balance / d.total) * 100 : 0;
                const status = debtRatio > 70 ? 'خطير' : debtRatio > 40 ? 'متوسط' : 'منخفض';
                const statusColor = debtRatio > 70 ? '#dc2626' : debtRatio > 40 ? '#d97706' : '#059669';
                return (
                  <tr key={d.customerId}>
                    <td>{i + 1}</td>
                    <td><strong>{d.customerName}</strong></td>
                    <td>{formatCurrency(d.total, settings.currency)}</td>
                    <td>{formatCurrency(d.paid, settings.currency)}</td>
                    <td className="text-danger">{formatCurrency(d.balance, settings.currency)}</td>
                    <td>
                      <span style={{ 
                        color: statusColor,
                        fontWeight: 'bold',
                        fontSize: '0.75rem'
                      }}>
                        ● {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ============================================================
  // ملخص سريع
  // ============================================================
  const renderQuickSummary = () => {
    if (!stats) return null;
    const s = stats.summary;

    return (
      <div className="card">
        <div className="card-title">📊 ملخص سريع</div>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
          gap: '0.75rem'
        }}>
          <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>📊 متوسط الفاتورة</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
              {formatCurrency(s.avgInvoice, settings.currency)}
            </div>
          </div>
          <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>📋 عدد العمليات</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
              {formatNumber(s.salesCount)}
            </div>
          </div>
          <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>💰 المتبقي</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--danger-600)' }}>
              {formatCurrency(s.remainingBalance, settings.currency)}
            </div>
          </div>
          <div style={{ background: 'var(--gray-50)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>📈 نسبة الربح</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: s.totalSales > 0 && s.netProfit > 0 ? 'var(--secondary-600)' : 'var(--danger-600)' }}>
              {s.totalSales > 0 ? ((s.netProfit / s.totalSales) * 100).toFixed(1) + '%' : '0%'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // عرض حالة التحميل
  // ============================================================
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', flexDirection: 'column', gap: '1rem' }}>
        <div className="spinner"></div>
        <span style={{ color: 'var(--gray-500)' }}>⏳ جاري تحميل البيانات...</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="empty-state">
        <div className="icon">📊</div>
        <p>لا توجد بيانات لعرضها</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
          قم بإضافة بعض البيانات أولاً
        </p>
      </div>
    );
  }

  // ============================================================
  // العرض الرئيسي
  // ============================================================
  return (
    <div className="page-section active">
      {/* شريط الأدوات */}
      <div className="toolbar">
        <div className="filter-group">
          <label>📅 الفترة:</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="day">اليوم</option>
            <option value="week">الأسبوع</option>
            <option value="month">الشهر</option>
            <option value="year">السنة</option>
            <option value="all">الكل</option>
          </select>
        </div>
        <div className="spacer"></div>
        <span className="text-muted">
          📆 {stats.period.label} ({stats.period.fromDate} → {stats.period.toDate})
        </span>
        <button className="btn btn-outline btn-sm" onClick={loadDashboard}>
          🔄 تحديث
        </button>
      </div>

      {/* البطاقات الرئيسية */}
      {renderMainCards()}

      {/* تحليل الاتجاهات المتقدم */}
      {renderAdvancedTrends()}

      {/* علامات التبويب */}
      <div className="tab-group">
        <button className={selectedTab === 'overview' ? 'active' : ''} onClick={() => setSelectedTab('overview')}>
          📊 نظرة عامة
        </button>
        <button className={selectedTab === 'customers' ? 'active' : ''} onClick={() => setSelectedTab('customers')}>
          🏆 أفضل الزبائن
        </button>
        <button className={selectedTab === 'materials' ? 'active' : ''} onClick={() => setSelectedTab('materials')}>
          🧱 أكثر المواد مبيعاً
        </button>
        <button className={selectedTab === 'daily' ? 'active' : ''} onClick={() => setSelectedTab('daily')}>
          📅 المبيعات اليومية
        </button>
        <button className={selectedTab === 'expenses' ? 'active' : ''} onClick={() => setSelectedTab('expenses')}>
          💸 المصروفات
        </button>
        <button className={selectedTab === 'debts' ? 'active' : ''} onClick={() => setSelectedTab('debts')}>
          📋 المدينون
        </button>
      </div>

      {/* محتوى التبويبات */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {selectedTab === 'overview' && (
          <>
            {renderTopCustomers()}
            {renderTopMaterials()}
            {renderDailySales()}
            {renderExpensesDistribution()}
          </>
        )}
        
        {selectedTab === 'customers' && (
          <div style={{ gridColumn: '1 / -1' }}>
            {renderTopCustomers()}
          </div>
        )}
        
        {selectedTab === 'materials' && (
          <div style={{ gridColumn: '1 / -1' }}>
            {renderTopMaterials()}
          </div>
        )}
        
        {selectedTab === 'daily' && (
          <div style={{ gridColumn: '1 / -1' }}>
            {renderDailySales()}
          </div>
        )}
        
        {selectedTab === 'expenses' && (
          <div style={{ gridColumn: '1 / -1' }}>
            {renderExpensesDistribution()}
          </div>
        )}
        
        {selectedTab === 'debts' && (
          <div style={{ gridColumn: '1 / -1' }}>
            {renderDebtors()}
          </div>
        )}
      </div>

      {/* ملخص سريع */}
      {renderQuickSummary()}
    </div>
  );
}

export default Dashboard;