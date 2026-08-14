// src/pages/Dashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { DashboardService } from '../../domain/services/DashboardService';
import { formatCurrency, formatDate, formatNumber } from '../utils/formatters';
import Chart from 'chart.js/auto';

function Dashboard({ showToast, settings }) {
  const [period, setPeriod] = useState('week');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [chartInstances, setChartInstances] = useState({});

  // تحميل البيانات عند تغيير الفترة
  useEffect(() => {
    loadDashboard();
  }, [period]);

  // رسم الرسوم البيانية عند توفر البيانات أو تغيير التبويب
  useEffect(() => {
    if (stats && !loading) {
      const timer = setTimeout(() => renderAllCharts(), 150);
      return () => clearTimeout(timer);
    }
    return () => {
      Object.values(chartInstances).forEach(chart => chart?.destroy());
    };
  }, [stats, loading, selectedTab]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const data = await DashboardService.getDashboardStats(period);
      setStats(data);
    } catch (e) {
      console.error('فشل تحميل الداشبورد:', e);
      if (showToast) showToast('حدث خطأ في تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // دالة رئيسية لرسم جميع الرسوم البيانية
  // ============================================================
  const renderAllCharts = () => {
    if (!stats) return;
    // تدمير القديمة
    Object.values(chartInstances).forEach(chart => chart?.destroy());
    const newCharts = {};

    // 1. المبيعات اليومية (بار)
    if (stats.charts?.dailySales?.length) {
      const ctx = document.getElementById('dailySalesChart')?.getContext('2d');
      if (ctx) {
        const dailyData = stats.charts.dailySales;
        newCharts.dailySales = new Chart(ctx, {
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
                yAxisID: 'y',
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
              legend: { position: 'top', labels: { boxWidth: 14, font: { size: 11, weight: '600' } } }
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: { callback: (value) => formatCurrency(value, settings?.currency || 'ل.س') }
              },
              y1: {
                position: 'right',
                beginAtZero: true,
                grid: { display: false },
                ticks: { callback: (value) => (value / 10) + ' عمليات' }
              },
              x: { grid: { display: false } }
            }
          }
        });
      }
    }

    // 2. توزيع المصروفات (دونات)
    if (stats.charts?.expensesByCategory?.length) {
      const ctx = document.getElementById('expensesChart')?.getContext('2d');
      if (ctx) {
        const categories = stats.charts.expensesByCategory;
        const colors = ['#2563eb', '#dc2626', '#d97706', '#059669', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b'];
        newCharts.expenses = new Chart(ctx, {
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
              legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 }, padding: 10 } }
            },
            cutout: '60%'
          }
        });
      }
    }

    // 3. الرسم البياني الديناميكي للاتجاهات (خطي)
    if (stats.timeSeries && stats.timeSeries.labels?.length > 0) {
      const ctx = document.getElementById('trendsDynamicChart')?.getContext('2d');
      if (ctx) {
        const ts = stats.timeSeries;
        newCharts.trendsDynamic = new Chart(ctx, {
          type: 'line',
          data: {
            labels: ts.labels,
            datasets: [
              {
                label: 'المبيعات',
                data: ts.sales,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#2563eb',
                pointBorderColor: '#fff',
                borderWidth: 3,
              },
              {
                label: 'المصروفات',
                data: ts.expenses,
                borderColor: '#dc2626',
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#dc2626',
                pointBorderColor: '#fff',
                borderWidth: 3,
              },
              {
                label: 'صافي الربح',
                data: ts.profit,
                borderColor: '#059669',
                backgroundColor: 'rgba(5, 150, 105, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#059669',
                pointBorderColor: '#fff',
                borderWidth: 3,
                borderDash: [5, 5],
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'top',
                labels: { boxWidth: 14, font: { size: 11, weight: '600' } }
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                      label += ': ';
                    }
                    if (context.parsed.y !== null) {
                      label += formatCurrency(context.parsed.y, settings?.currency || 'ل.س');
                    }
                    return label;
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: { callback: (value) => formatCurrency(value, settings?.currency || 'ل.س') }
              },
              x: { grid: { display: false } }
            }
          }
        });
      }
    }

    // 4. رسم بياني إضافي لتوزيع العملاء (بي)
    if (stats.charts?.topCustomers?.length) {
      const ctx = document.getElementById('customersChart')?.getContext('2d');
      if (ctx) {
        const topC = stats.charts.topCustomers;
        newCharts.customers = new Chart(ctx, {
          type: 'pie',
          data: {
            labels: topC.map(c => c.customerName),
            datasets: [{
              data: topC.map(c => c.total),
              backgroundColor: ['#f59e0b', '#9ca3af', '#8b5cf6', '#ec4899', '#14b8a6'],
              borderWidth: 2,
              borderColor: '#fff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 }, padding: 10 } }
            }
          }
        });
      }
    }

    setChartInstances(newCharts);
  };

  // ============================================================
  // دوال التنسيق والعرض
  // ============================================================
  const formatLargeNumber = (value) => {
    const num = Number(value);
    if (isNaN(num)) return '0';
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return num.toString();
  };

  // ============================================================
  // بطاقات الإحصائيات الرئيسية
  // ============================================================
  const renderMainCards = () => {
    if (!stats) return null;
    const s = stats.summary;
    const currency = settings?.currency || 'ل.س';

    const cards = [
      {
        id: 'sales',
        icon: '💰',
        title: 'إجمالي المبيعات',
        value: formatCurrency(s.totalSales, currency),
        valueShort: formatLargeNumber(s.totalSales) + ' ' + currency,
        sub: stats.period.label,
        color: 'primary',
        trend: stats.trends?.salesGrowth,
        isLarge: s.totalSales > 1_000_000,
      },
      {
        id: 'expenses',
        icon: '💸',
        title: 'إجمالي المصروفات',
        value: formatCurrency(s.totalExpenses, currency),
        valueShort: formatLargeNumber(s.totalExpenses) + ' ' + currency,
        sub: stats.period.label,
        color: 'danger',
        trend: stats.trends?.expenseGrowth,
        isLarge: s.totalExpenses > 1_000_000,
      },
      {
        id: 'profit',
        icon: '📊',
        title: 'صافي الربح',
        value: formatCurrency(s.netProfit, currency),
        valueShort: formatLargeNumber(s.netProfit) + ' ' + currency,
        sub: stats.period.label,
        color: s.netProfit >= 0 ? 'success' : 'danger',
        trend: stats.trends?.profitGrowth,
        isLarge: Math.abs(s.netProfit) > 1_000_000,
      },
      {
        id: 'salesCount',
        icon: '📈',
        title: 'عدد المبيعات',
        value: formatNumber(s.salesCount),
        valueShort: formatNumber(s.salesCount),
        sub: 'عملية بيع',
        color: 'warning',
        isLarge: false,
      },
      {
        id: 'customers',
        icon: '👥',
        title: 'الزبائن',
        value: formatNumber(s.customersCount),
        valueShort: formatNumber(s.customersCount),
        sub: 'زبون مسجل',
        color: 'purple',
        isLarge: false,
      },
      {
        id: 'debt',
        icon: '📋',
        title: 'إجمالي الديون',
        value: formatCurrency(s.totalDebt, currency),
        valueShort: formatLargeNumber(s.totalDebt) + ' ' + currency,
        sub: `${s.debtorsCount} زبون مدين`,
        color: 'indigo',
        isLarge: s.totalDebt > 1_000_000,
      },
      {
        id: 'materials',
        icon: '📦',
        title: 'المواد',
        value: formatNumber(s.materialsCount),
        valueShort: formatNumber(s.materialsCount),
        sub: 'مادة مسجلة',
        color: 'teal',
        isLarge: false,
      },
      {
        id: 'vehicles',
        icon: '🚗',
        title: 'السيارات',
        value: formatNumber(s.vehiclesCount),
        valueShort: formatNumber(s.vehiclesCount),
        sub: 'سيارة مسجلة',
        color: 'pink',
        isLarge: false,
      },
    ];

    return (
      <div className="grid-cards">
        {cards.map((card) => (
          <div key={card.id} className={`card card-${card.color}`}>
            <div className="card-title">
              <span className="card-icon">{card.icon}</span>
              {card.title}
              {card.trend !== undefined && card.trend !== null && (
                <span
                  className={`trend-badge ${card.trend >= 0 ? 'trend-up' : 'trend-down'}`}
                >
                  {card.trend >= 0 ? '↑' : '↓'} {Math.abs(card.trend).toFixed(1)}%
                </span>
              )}
            </div>
            <div
              className="card-value"
              style={{
                fontSize: card.isLarge ? '1.2rem' : '2rem',
                wordBreak: 'break-all',
                overflowWrap: 'break-word',
                lineHeight: '1.3',
              }}
            >
              {card.isLarge ? card.valueShort : card.value}
              {card.isLarge && (
                <div
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--gray-500)',
                    fontWeight: 'normal',
                  }}
                >
                  {card.value}
                </div>
              )}
            </div>
            <div className="card-sub">{card.sub}</div>
          </div>
        ))}
      </div>
    );
  };

  // ============================================================
  // تحليل الأداء المتقدم (مع الرسم البياني الديناميكي)
  // ============================================================
  const renderAdvancedTrends = () => {
    if (!stats) return null;
    const t = stats.trends;
    const currency = settings?.currency || 'ل.س';

    const kpis = [
      {
        label: 'هامش الربح',
        value:
          stats.summary.totalSales > 0
            ? ((stats.summary.netProfit / stats.summary.totalSales) * 100).toFixed(1) + '%'
            : '0%',
        status:
          stats.summary.totalSales > 0 && stats.summary.netProfit > 0 ? 'good' : 'warning',
      },
      {
        label: 'نسبة التحصيل',
        value:
          stats.summary.totalSales > 0
            ? ((stats.summary.totalPaid / stats.summary.totalSales) * 100).toFixed(1) + '%'
            : '0%',
        status: stats.summary.totalPaid / stats.summary.totalSales > 0.7 ? 'good' : 'warning',
      },
      {
        label: 'متوسط الفاتورة',
        value: formatCurrency(stats.summary.avgInvoice, currency),
        status: stats.summary.avgInvoice > 100 ? 'good' : 'warning',
      },
    ];

    const trendsData = t
      ? [
          
        ]
      : [];

    return (
      <div className="card">
        <div className="card-title">
          📊 تحليل الأداء المتقدم –{' '}
          <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>
            ({stats.period.label})
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          {kpis.map((kpi, i) => (
            <div
              key={i}
              style={{
                background: kpi.status === 'good' ? 'var(--secondary-50)' : 'var(--warning-50)',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius)',
                border: `1px solid ${
                  kpi.status === 'good' ? 'var(--secondary-200)' : 'var(--warning-200)'
                }`,
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                {kpi.label}
              </div>
              <div
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  color: kpi.status === 'good' ? 'var(--secondary-600)' : 'var(--warning-600)',
                }}
              >
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {trendsData.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            {trendsData.map((item, i) => (
              <div
                key={i}
                style={{
                  textAlign: 'center',
                  padding: '0.5rem',
                  background: item.value >= 0 ? 'var(--secondary-50)' : 'var(--danger-50)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: '1.3rem',
                    fontWeight: 'bold',
                    color: item.color,
                  }}
                >
                  {item.value >= 0 ? '+' : ''}
                  {item.value.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        )}

        {stats.timeSeries && stats.timeSeries.labels?.length > 0 ? (
          <div style={{ height: '280px' }}>
            <canvas id="trendsDynamicChart"></canvas>
          </div>
        ) : (
          <div className="text-muted" style={{ padding: '1rem', textAlign: 'center' }}>
            لا توجد بيانات كافية لعرض الاتجاهات
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // عرض أفضل الزبائن (جدول + رسم بياني)
  // ============================================================
  const renderTopCustomers = () => {
    if (!stats || !stats.charts?.topCustomers?.length) {
      return (
        <div className="card">
          <div className="card-title">🏆 أفضل الزبائن</div>
          <div className="text-muted" style={{ padding: '1rem' }}>
            لا توجد بيانات كافية
          </div>
        </div>
      );
    }
    const customers = stats.charts.topCustomers;
    const currency = settings?.currency || 'ل.س';
    const maxTotal = customers[0]?.total || 1;

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
                const percentage = (c.total / maxTotal) * 100;
                const rankClass =
                  i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
                return (
                  <tr key={c.customerId}>
                    <td>
                      <span className={`rank-badge ${rankClass}`}>{i + 1}</span>
                    </td>
                    <td>
                      <strong>{c.customerName}</strong>
                    </td>
                    <td>{c.count}</td>
                    <td>{formatCurrency(c.total, currency)}</td>
                    <td>{formatCurrency(c.avg, currency)}</td>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <div
                          style={{
                            width: '60px',
                            height: '6px',
                            background: 'var(--gray-200)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${percentage}%`,
                              height: '100%',
                              background:
                                i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : '#8b5cf6',
                              borderRadius: '3px',
                            }}
                          ></div>
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
        <div style={{ height: '200px', marginTop: '1rem' }}>
          <canvas id="customersChart"></canvas>
        </div>
      </div>
    );
  };

  // ============================================================
  // عرض أكثر المواد مبيعاً (جدول)
  // ============================================================
  const renderTopMaterials = () => {
    if (!stats || !stats.charts?.topMaterials?.length) {
      return (
        <div className="card">
          <div className="card-title">🧱 أكثر المواد مبيعاً</div>
          <div className="text-muted" style={{ padding: '1rem' }}>
            لا توجد بيانات كافية
          </div>
        </div>
      );
    }
    const materials = stats.charts.topMaterials;
    const currency = settings?.currency || 'ل.س';
    const maxQty = materials[0]?.quantity || 1;

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
                const percentage = (m.quantity / maxQty) * 100;
                return (
                  <tr key={m.materialId}>
                    <td>{i + 1}</td>
                    <td>
                      <strong>{m.materialName}</strong>
                    </td>
                    <td>{m.quantity}</td>
                    <td>{formatCurrency(m.revenue, currency)}</td>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <div
                          style={{
                            width: '60px',
                            height: '6px',
                            background: 'var(--gray-200)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${percentage}%`,
                              height: '100%',
                              background: '#14b8a6',
                              borderRadius: '3px',
                            }}
                          ></div>
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
  // عرض المبيعات اليومية (رسم بياني)
  // ============================================================
  const renderDailySales = () => {
    if (!stats || !stats.charts?.dailySales?.length) {
      return (
        <div className="card">
          <div className="card-title">📊 المبيعات اليومية</div>
          <div className="text-muted" style={{ padding: '1rem' }}>
            لا توجد بيانات كافية
          </div>
        </div>
      );
    }
    return (
      <div className="card">
        <div className="card-title">📊 المبيعات اليومية (آخر 7 أيام)</div>
        <div style={{ height: '280px' }}>
          <canvas id="dailySalesChart"></canvas>
        </div>
      </div>
    );
  };

  // ============================================================
  // عرض توزيع المصروفات (رسم بياني)
  // ============================================================
  const renderExpensesDistribution = () => {
    if (!stats || !stats.charts?.expensesByCategory?.length) {
      return (
        <div className="card">
          <div className="card-title">🧩 توزيع المصروفات</div>
          <div className="text-muted" style={{ padding: '1rem' }}>
            لا توجد بيانات كافية
          </div>
        </div>
      );
    }
    return (
      <div className="card">
        <div className="card-title">🧩 توزيع المصروفات حسب التصنيف</div>
        <div style={{ height: '280px' }}>
          <canvas id="expensesChart"></canvas>
        </div>
      </div>
    );
  };

  // ============================================================
  // عرض قائمة المدينون (جدول)
  // ============================================================
  const renderDebtors = () => {
    if (!stats || !stats.debtors?.length) {
      return (
        <div className="card">
          <div className="card-title">📋 المدينون</div>
          <div className="text-muted" style={{ padding: '1rem' }}>
            ✅ لا يوجد مدينون
          </div>
        </div>
      );
    }
    const currency = settings?.currency || 'ل.س';

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
                const status =
                  debtRatio > 70 ? 'خطير' : debtRatio > 40 ? 'متوسط' : 'منخفض';
                const statusColor =
                  debtRatio > 70 ? '#dc2626' : debtRatio > 40 ? '#d97706' : '#059669';
                return (
                  <tr key={d.customerId}>
                    <td>{i + 1}</td>
                    <td>
                      <strong>{d.customerName}</strong>
                    </td>
                    <td>{formatCurrency(d.total, currency)}</td>
                    <td>{formatCurrency(d.paid, currency)}</td>
                    <td className="text-danger">
                      {formatCurrency(d.balance, currency)}
                    </td>
                    <td>
                      <span
                        style={{
                          color: statusColor,
                          fontWeight: 'bold',
                          fontSize: '0.75rem',
                        }}
                      >
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
  // ملخص سريع (بطاقات صغيرة)
  // ============================================================
  const renderQuickSummary = () => {
    if (!stats) return null;
    const s = stats.summary;
    const currency = settings?.currency || 'ل.س';

    const items = [
      {
        label: '📊 متوسط الفاتورة',
        value: formatCurrency(s.avgInvoice, currency),
        color: 'var(--gray-600)',
      },
      {
        label: '📋 عدد العمليات',
        value: formatNumber(s.salesCount),
        color: 'var(--gray-600)',
      },
      {
        label: '💰 المتبقي',
        value: formatCurrency(s.remainingBalance, currency),
        color: 'var(--danger-600)',
      },
      {
        label: '📈 نسبة الربح',
        value:
          s.totalSales > 0 ? ((s.netProfit / s.totalSales) * 100).toFixed(1) + '%' : '0%',
        color:
          s.totalSales > 0 && s.netProfit > 0
            ? 'var(--secondary-600)'
            : 'var(--danger-600)',
      },
    ];

    return (
      <div className="card">
        <div className="card-title">📊 ملخص سريع</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                background: 'var(--gray-50)',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                {item.label}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: item.color }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ============================================================
  // حالة التحميل والعرض الرئيسي
  // ============================================================
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '400px',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
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

  return (
    <div className="page-section active">
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
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
          📄 تصدير التقرير
        </button>
      </div>

      {renderMainCards()}
      {renderAdvancedTrends()}

      <div className="tab-group">
        <button
          className={selectedTab === 'overview' ? 'active' : ''}
          onClick={() => setSelectedTab('overview')}
        >
          📊 نظرة عامة
        </button>
        <button
          className={selectedTab === 'customers' ? 'active' : ''}
          onClick={() => setSelectedTab('customers')}
        >
          🏆 أفضل الزبائن
        </button>
        <button
          className={selectedTab === 'materials' ? 'active' : ''}
          onClick={() => setSelectedTab('materials')}
        >
          🧱 أكثر المواد مبيعاً
        </button>
        <button
          className={selectedTab === 'daily' ? 'active' : ''}
          onClick={() => setSelectedTab('daily')}
        >
          📅 المبيعات اليومية
        </button>
        <button
          className={selectedTab === 'expenses' ? 'active' : ''}
          onClick={() => setSelectedTab('expenses')}
        >
          💸 المصروفات
        </button>
        <button
          className={selectedTab === 'debts' ? 'active' : ''}
          onClick={() => setSelectedTab('debts')}
        >
          📋 المدينون
        </button>
      </div>

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
          <div style={{ gridColumn: '1 / -1' }}>{renderTopCustomers()}</div>
        )}
        {selectedTab === 'materials' && (
          <div style={{ gridColumn: '1 / -1' }}>{renderTopMaterials()}</div>
        )}
        {selectedTab === 'daily' && (
          <div style={{ gridColumn: '1 / -1' }}>{renderDailySales()}</div>
        )}
        {selectedTab === 'expenses' && (
          <div style={{ gridColumn: '1 / -1' }}>{renderExpensesDistribution()}</div>
        )}
        {selectedTab === 'debts' && (
          <div style={{ gridColumn: '1 / -1' }}>{renderDebtors()}</div>
        )}
      </div>

      {renderQuickSummary()}
    </div>
  );
}

export default Dashboard;