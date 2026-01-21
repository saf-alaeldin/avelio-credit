// src/pages/Analytics.js
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement,
  Title, Tooltip, Legend, Filler, LineController, BarController, DoughnutController
} from 'chart.js';
import './Analytics.css';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement,
  Title, Tooltip, Legend, Filler, LineController, BarController, DoughnutController
);

// Auto-detect API URL based on window location
const getApiUrl = () => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  if (window.location.protocol === 'https:') {
    return '/api/v1';
  }
  const hostname = window.location.hostname;
  const port = 5001;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:${port}/api/v1`;
  }
  return 'http://localhost:5001/api/v1';
};
const API_BASE = getApiUrl();

async function apiGet(path) {
  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('token');
  
  if (!token) {
    throw new Error('No authentication token found');
  }

  const headers = { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  const res = await fetch(API_BASE + path, { headers });
  
  if (!res.ok) {
    // Try to parse JSON error first
    try {
      const errorData = await res.json();
      throw new Error(errorData.message || `HTTP ${res.status}`);
    } catch (e) {
      // If JSON parsing fails, use text
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
  }
  
  return await res.json();
}

const rollingAvg = (arr, n) => {
  if (n <= 1) return arr.slice();
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - n + 1);
    const slice = arr.slice(start, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
};

export default function Analytics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [data, setData]     = useState(null);

  // quick range: 6 months | 12 months | YTD
  const [range, setRange] = useState('6m'); // '6m' | '12m' | 'ytd'

  // charts
  const revTrendRef   = useRef(null);
  const statusRef     = useRef(null);
  const agenciesRef   = useRef(null);
  const countRef      = useRef(null);
  const stackedRef    = useRef(null); // paid vs pending counts (stacked)
  const paymentMethodRef = useRef(null); // payment method breakdown
  const agingRef = useRef(null); // pending aging analysis

  const chartsRef = useRef({});

  // fetch & compute
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError('');

        console.log('📊 Fetching analytics data...');

        // Fetch all receipts with a large pageSize for accurate analytics
        // We need ALL receipts, not just paginated results
        const res = await apiGet('/receipts?pageSize=10000');
        const receipts = res?.data?.receipts || res?.receipts || [];

        console.log('✅ Analytics data loaded:', receipts.length, 'receipts');

        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear  = now.getFullYear();
        const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
        const lastYear  = thisMonth === 0 ? thisYear - 1 : thisYear;

        const a = {
          totalRevenue: 0,
          paidRevenue: 0,
          pendingRevenue: 0,
          voidRevenue: 0,
          totalReceipts: receipts.length,
          paidReceipts: 0,
          pendingReceipts: 0,
          voidReceipts: 0,
          thisMonthRevenue: 0,
          lastMonthRevenue: 0,
          thisMonthReceipts: 0,
          lastMonthReceipts: 0,
          averageReceiptValue: 0,
          byStatus: { PAID: 0, PENDING: 0, VOID: 0 },
          byMonth: {},           // { 'YYYY-MM': { revenue, count } }
          byMonthStatus: {},     // { 'YYYY-MM': { PAID:count, PENDING:count, VOID:count } }
          topAgencies: {},       // { name: { count, revenue } }
          growthRate: 0,
          // New analytics data
          byPaymentMethod: {},   // { method: { count, revenue } }
          pendingAging: { '0-7': 0, '8-14': 0, '15-30': 0, '31-60': 0, '60+': 0 },
          avgDaysToPayment: 0,
          fastestPayers: {},     // { agency: avgDays }
          slowestPayers: {}      // { agency: avgDays }
        };

        receipts.forEach(r => {
          const amount = parseFloat(r.amount || 0);
          const status = (r.status || 'UNKNOWN').toUpperCase();
          const d = new Date(r.issue_date);
          const m = d.getMonth();
          const y = d.getFullYear();
          const key = `${y}-${String(m + 1).padStart(2,'0')}`;

          // Track all statuses for pie chart
          a.byStatus[status] = (a.byStatus[status] || 0) + amount;

          // Count receipts by status
          if (status === 'PAID') {
            a.paidRevenue += amount;
            a.paidReceipts++;
            a.totalRevenue += amount; // Only add PAID to total revenue
          }
          else if (status === 'PENDING') {
            a.pendingRevenue += amount;
            a.pendingReceipts++;
            a.totalRevenue += amount; // Only add PENDING to total revenue
          }
          else if (status === 'VOID') {
            a.voidRevenue += amount;
            a.voidReceipts++;
            // DO NOT add VOID to total revenue
          }

          // Monthly data - only include non-void receipts in revenue
          if (!a.byMonth[key]) a.byMonth[key] = { revenue: 0, count: 0 };
          if (status !== 'VOID') {
            a.byMonth[key].revenue += amount;
            a.byMonth[key].count++;
          }

          // Track status counts by month (for stacked chart)
          if (!a.byMonthStatus[key]) a.byMonthStatus[key] = { PAID: 0, PENDING: 0, VOID: 0 };
          a.byMonthStatus[key][status] = (a.byMonthStatus[key][status] || 0) + 1;

          // This month and last month - only non-void
          if (status !== 'VOID') {
            if (m === thisMonth && y === thisYear) {
              a.thisMonthRevenue += amount;
              a.thisMonthReceipts++;
            }
            if (m === lastMonth && y === lastYear) {
              a.lastMonthRevenue += amount;
              a.lastMonthReceipts++;
            }
          }

          // Top agencies - only non-void receipts
          if (status !== 'VOID') {
            const agency = r.agency?.agency_name || r.agency_name || 'Unknown';
            if (!a.topAgencies[agency]) a.topAgencies[agency] = { count: 0, revenue: 0 };
            a.topAgencies[agency].count++;
            a.topAgencies[agency].revenue += amount;
          }

          // Payment method analysis - only non-void
          if (status !== 'VOID') {
            const method = r.payment_method || 'Not Specified';
            if (!a.byPaymentMethod[method]) a.byPaymentMethod[method] = { count: 0, revenue: 0 };
            a.byPaymentMethod[method].count++;
            a.byPaymentMethod[method].revenue += amount;
          }

          // Aging analysis for PENDING receipts
          if (status === 'PENDING') {
            const issueDate = new Date(r.issue_date);
            const daysPending = Math.floor((now - issueDate) / (1000 * 60 * 60 * 24));

            if (daysPending <= 7) a.pendingAging['0-7']++;
            else if (daysPending <= 14) a.pendingAging['8-14']++;
            else if (daysPending <= 30) a.pendingAging['15-30']++;
            else if (daysPending <= 60) a.pendingAging['31-60']++;
            else a.pendingAging['60+']++;
          }
        });

        // Average receipt value - only count non-void receipts
        const nonVoidReceipts = a.paidReceipts + a.pendingReceipts;
        a.averageReceiptValue = nonVoidReceipts > 0 ? a.totalRevenue / nonVoidReceipts : 0;
        if (a.lastMonthRevenue > 0) {
          a.growthRate = ((a.thisMonthRevenue - a.lastMonthRevenue) / a.lastMonthRevenue) * 100;
        }

        a.topAgenciesList = Object.entries(a.topAgencies)
          .map(([name, v]) => ({ name, ...v }))
          .sort((x, y) => y.revenue - x.revenue)
          .slice(0, 10);

        setData(a);
      } catch (e) {
        console.error('❌ Analytics error:', e);
        const errorMsg = e.message || 'Failed to load analytics';
        setError(errorMsg);
        
        // If it's an auth error, redirect to login
        if (errorMsg.toLowerCase().includes('token') || errorMsg.toLowerCase().includes('auth')) {
          console.log('🚪 Auth error - redirecting to login');
          setTimeout(() => {
            localStorage.clear();
            navigate('/login');
          }, 2000);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  // charts render
  useEffect(() => {
    if (!data || loading) return;

    // destroy old
    Object.values(chartsRef.current).forEach(c => c && c.destroy());
    chartsRef.current = {};

    // prepare months range
    const allMonths = Object.keys(data.byMonth).sort();
    const months = (() => {
      if (range === 'ytd') {
        const y = new Date().getFullYear();
        return allMonths.filter(k => k.startsWith(String(y)));
      }
      if (range === '12m') return allMonths.slice(-12);
      return allMonths.slice(-6);
    })();

    const revArr = months.map(m => data.byMonth[m]?.revenue || 0);
    const cumRev = revArr.reduce((acc, v, i) => {
      acc.push(v + (acc[i-1] || 0));
      return acc;
    }, []);
    const movAvg = rollingAvg(revArr, 3);

    const labelsFull = months.map(m => {
      const [y, mo] = m.split('-');
      const d = new Date(y, parseInt(mo)-1);
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });

    // 1) Revenue Trend + 3M Moving Avg (line) + Cumulative (area)
    if (revTrendRef.current) {
      chartsRef.current.revenue = new ChartJS(revTrendRef.current, {
        type: 'line',
        data: {
          labels: labelsFull,
          datasets: [
            {
              label: 'Revenue',
              data: revArr,
              borderColor: '#0EA5E9',
              backgroundColor: 'rgba(14,165,233,0.12)',
              fill: true,
              tension: 0.4,
              borderWidth: 3,
              pointRadius: 4,
              pointBackgroundColor: '#0EA5E9'
            },
            {
              label: '3-mo Avg',
              data: movAvg,
              borderColor: '#0284C7',
              fill: false,
              tension: 0.3,
              borderDash: [6,4],
              borderWidth: 2,
              pointRadius: 0
            },
            {
              label: 'Cumulative',
              data: cumRev,
              borderColor: '#10B981',
              backgroundColor: 'rgba(16,185,129,0.08)',
              fill: true,
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: { backgroundColor: '#1A202C', padding: 12 }
          },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, grid: { color: '#E2E8F0' } }
          }
        }
      });
    }

    // 2) Revenue by Status (doughnut)
    if (statusRef.current) {
      chartsRef.current.status = new ChartJS(statusRef.current, {
        type: 'doughnut',
        data: {
          labels: ['Paid', 'Pending', 'Void'],
          datasets: [{
            data: [data.paidRevenue, data.pendingRevenue, data.voidRevenue],
            backgroundColor: ['rgba(16,185,129,.9)', 'rgba(245,158,11,.9)', 'rgba(239,68,68,.9)'],
            borderColor: ['#10B981', '#F59E0B', '#EF4444'],
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              backgroundColor: '#1A202C',
              padding: 12,
              callbacks: {
                label: (ctx) => {
                  const label = ctx.label || '';
                  const value = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ctx.raw);
                  return `${label}: ${value}`;
                }
              }
            }
          }
        }
      });
    }

    // 3) Top Agencies (horizontal bar)
    if (agenciesRef.current && data.topAgenciesList.length > 0) {
      const top5 = data.topAgenciesList.slice(0, 5);
      chartsRef.current.agencies = new ChartJS(agenciesRef.current, {
        type: 'bar',
        data: {
          labels: top5.map(a => a.name.length > 20 ? a.name.slice(0, 20) + '...' : a.name),
          datasets: [{
            label: 'Revenue',
            data: top5.map(a => a.revenue),
            backgroundColor: 'rgba(14,165,233,.9)',
            borderColor: '#0EA5E9',
            borderWidth: 1,
            borderRadius: 8
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1A202C',
              padding: 12,
              callbacks: {
                label: (ctx) => {
                  const value = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ctx.raw);
                  return `Revenue: ${value}`;
                }
              }
            }
          },
          scales: {
            x: { beginAtZero: true, grid: { color: '#E2E8F0' } },
            y: { grid: { display: false } }
          }
        }
      });
    }

    // 4) Receipt Count (bar)
    if (countRef.current) {
      const countArr = months.map(m => data.byMonth[m]?.count || 0);
      chartsRef.current.count = new ChartJS(countRef.current, {
        type: 'bar',
        data: {
          labels: labelsFull,
          datasets: [{
            label: 'Receipts',
            data: countArr,
            backgroundColor: 'rgba(14,165,233,.9)',
            borderColor: '#0EA5E9',
            borderWidth: 1,
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#1A202C', padding: 12 }
          },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, grid: { color: '#E2E8F0' } }
          }
        }
      });
    }

    // 5) Paid vs Pending (stacked bar)
    if (stackedRef.current) {
      const paid = months.map(m => data.byMonthStatus[m]?.PAID || 0);
      const pend = months.map(m => data.byMonthStatus[m]?.PENDING || 0);
      chartsRef.current.stacked = new ChartJS(stackedRef.current, {
        type: 'bar',
        data: {
          labels: labelsFull.map(l => l.split(' ')[0]),
          datasets: [
            { label:'Paid',    data: paid, backgroundColor:'rgba(16,185,129,.9)', borderColor:'#10B981', borderWidth:1, borderRadius:6, stack:'s' },
            { label:'Pending', data: pend, backgroundColor:'rgba(245,158,11,.9)', borderColor:'#F59E0B', borderWidth:1, borderRadius:6, stack:'s' },
          ]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins: {
            legend:{ position:'bottom' },
            tooltip:{ backgroundColor:'#1A202C', padding:12 }
          },
          scales: {
            x: { stacked:true, grid:{display:false} },
            y: { stacked:true, beginAtZero:true, grid:{color:'#E2E8F0'} }
          }
        }
      });
    }

    // 6) Payment Method Breakdown (doughnut)
    if (paymentMethodRef.current && Object.keys(data.byPaymentMethod).length > 0) {
      const methods = Object.entries(data.byPaymentMethod)
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 6);  // Top 6 methods

      chartsRef.current.paymentMethod = new ChartJS(paymentMethodRef.current, {
        type: 'doughnut',
        data: {
          labels: methods.map(([method]) => method),
          datasets: [{
            data: methods.map(([, v]) => v.revenue),
            backgroundColor: [
              'rgba(14,165,233,.9)',
              'rgba(16,185,129,.9)',
              'rgba(245,158,11,.9)',
              'rgba(139,92,246,.9)',
              'rgba(236,72,153,.9)',
              'rgba(59,130,246,.9)'
            ],
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              backgroundColor: '#1A202C',
              padding: 12,
              callbacks: {
                label: (ctx) => {
                  const label = ctx.label || '';
                  const value = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ctx.raw);
                  const method = methods.find(([m]) => m === label);
                  const count = method ? method[1].count : 0;
                  return `${label}: ${value} (${count} receipts)`;
                }
              }
            }
          }
        }
      });
    }

    // 7) Pending Aging Analysis (bar)
    if (agingRef.current) {
      const agingLabels = ['0-7 days', '8-14 days', '15-30 days', '31-60 days', '60+ days'];
      const agingData = [
        data.pendingAging['0-7'],
        data.pendingAging['8-14'],
        data.pendingAging['15-30'],
        data.pendingAging['31-60'],
        data.pendingAging['60+']
      ];

      chartsRef.current.aging = new ChartJS(agingRef.current, {
        type: 'bar',
        data: {
          labels: agingLabels,
          datasets: [{
            label: 'Pending Receipts',
            data: agingData,
            backgroundColor: [
              'rgba(16,185,129,.9)',   // 0-7: green (good)
              'rgba(59,130,246,.9)',    // 8-14: blue (ok)
              'rgba(245,158,11,.9)',    // 15-30: yellow (warning)
              'rgba(249,115,22,.9)',    // 31-60: orange (concerning)
              'rgba(239,68,68,.9)'      // 60+: red (critical)
            ],
            borderColor: [
              '#10B981',
              '#3B82F6',
              '#F59E0B',
              '#F97316',
              '#EF4444'
            ],
            borderWidth: 1,
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1A202C',
              padding: 12,
              callbacks: {
                label: (ctx) => `${ctx.parsed.y} receipts pending`
              }
            }
          },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, grid: { color: '#E2E8F0' }, ticks: { stepSize: 1 } }
          }
        }
      });
    }

    return () => {
      Object.values(chartsRef.current).forEach(c => c && c.destroy());
    };
  }, [data, loading, range]);

  const formatCurrency = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

  const exportSummaryCSV = () => {
    if (!data) return;
    const lines = [
      ['Metric','Value'],
      ['Total Revenue', data.totalRevenue],
      ['Paid Revenue', data.paidRevenue],
      ['Pending Revenue', data.pendingRevenue],
      ['Void Revenue', data.voidRevenue],
      ['Total Receipts', data.totalReceipts],
      ['Average Receipt', data.averageReceiptValue],
      ['This Month Revenue', data.thisMonthRevenue],
      ['Last Month Revenue', data.lastMonthRevenue],
      ['Growth Rate (%)', data.growthRate]
    ].map(r => r.join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'analytics-summary.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="analytics-page"><div className="analytics-loading">Loading analytics…</div></div>;
  }
  if (error) {
    return (
      <div className="analytics-page">
        <div className="analytics-error">
          {error}
          {error.toLowerCase().includes('token') && (
            <p style={{ marginTop: '12px', fontSize: '14px' }}>
              Redirecting to login...
            </p>
          )}
        </div>
      </div>
    );
  }

  const collectionRate = data.totalRevenue > 0 ? (data.paidRevenue / data.totalRevenue) * 100 : 0;
  const pendingRatio   = data.totalRevenue > 0 ? (data.pendingRevenue / data.totalRevenue) * 100 : 0;
  const top1 = data.topAgenciesList?.[0];

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <div>
          <h2 className="analytics-title">Analytics & Insights</h2>
          <p className="analytics-subtitle">Modern, actionable financial analytics for Avelio</p>
        </div>

        <div className="analytics-controls">
          <button className={`analytics-chip ${range==='6m' ? 'active':''}`} onClick={()=>setRange('6m')}>Last 6M</button>
          <button className={`analytics-chip ${range==='12m' ? 'active':''}`} onClick={()=>setRange('12m')}>Last 12M</button>
          <button className={`analytics-chip ${range==='ytd' ? 'active':''}`} onClick={()=>setRange('ytd')}>YTD</button>
          <button className="analytics-btn" onClick={exportSummaryCSV}>↧ Export</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-card">
          <div className="analytics-kpi-icon">💰</div>
          <div className="analytics-kpi-content">
            <div className="analytics-kpi-label">Total Revenue</div>
            <div className="analytics-kpi-value">{formatCurrency(data.totalRevenue)}</div>
            <div className="analytics-kpi-meta">{data.paidReceipts + data.pendingReceipts} active receipts ({data.voidReceipts} voided)</div>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-icon">📈</div>
          <div className="analytics-kpi-content">
            <div className="analytics-kpi-label">This Month</div>
            <div className="analytics-kpi-value">{formatCurrency(data.thisMonthRevenue)}</div>
            <div className={`analytics-kpi-change ${data.growthRate >= 0 ? 'positive':'negative'}`}>
              {data.growthRate >= 0 ? '↑' : '↓'} {Math.abs(data.growthRate).toFixed(1)}% vs last month
            </div>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-icon">🎯</div>
          <div className="analytics-kpi-content">
            <div className="analytics-kpi-label">Collection Rate</div>
            <div className="analytics-kpi-value">{collectionRate.toFixed(1)}%</div>
            <div className="analytics-kpi-meta">{formatCurrency(data.paidRevenue)} of {formatCurrency(data.totalRevenue)}</div>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-icon">⏳</div>
          <div className="analytics-kpi-content">
            <div className="analytics-kpi-label">Pending</div>
            <div className="analytics-kpi-value">{formatCurrency(data.pendingRevenue)}</div>
            <div className="analytics-kpi-meta">{data.pendingReceipts} receipts ({pendingRatio.toFixed(1)}% of total)</div>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-icon">📊</div>
          <div className="analytics-kpi-content">
            <div className="analytics-kpi-label">Avg Daily Revenue</div>
            <div className="analytics-kpi-value">{formatCurrency(data.thisMonthRevenue / new Date().getDate())}</div>
            <div className="analytics-kpi-meta">This month (MTD)</div>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-icon">🔔</div>
          <div className="analytics-kpi-content">
            <div className="analytics-kpi-label">Action Needed</div>
            <div className="analytics-kpi-value" style={{ color: data.pendingAging['31-60'] + data.pendingAging['60+'] > 0 ? '#DC2626' : '#10B981' }}>
              {data.pendingAging['31-60'] + data.pendingAging['60+']}
            </div>
            <div className="analytics-kpi-meta">Overdue 30+ days</div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="analytics-charts-grid">
        <div className="analytics-chart-card analytics-chart-card--wide">
          <div className="analytics-chart-header">
            <h3 className="analytics-chart-title">Revenue Trend</h3>
            <span className="analytics-chart-subtitle">Monthly revenue, 3-month moving average & cumulative</span>
          </div>
          <div className="analytics-chart-container"><canvas ref={revTrendRef} /></div>
        </div>

        <div className="analytics-chart-card">
          <div className="analytics-chart-header">
            <h3 className="analytics-chart-title">Revenue by Status</h3>
            <span className="analytics-chart-subtitle">Paid vs Pending vs Void</span>
          </div>
          <div className="analytics-chart-container"><canvas ref={statusRef} /></div>
        </div>

        <div className="analytics-chart-card">
          <div className="analytics-chart-header">
            <h3 className="analytics-chart-title">Receipts Count</h3>
            <span className="analytics-chart-subtitle">Monthly volume</span>
          </div>
          <div className="analytics-chart-container"><canvas ref={countRef} /></div>
        </div>

        <div className="analytics-chart-card">
          <div className="analytics-chart-header">
            <h3 className="analytics-chart-title">Paid vs Pending (Counts)</h3>
            <span className="analytics-chart-subtitle">Workload mix, stacked by month</span>
          </div>
          <div className="analytics-chart-container"><canvas ref={stackedRef} /></div>
        </div>

        <div className="analytics-chart-card">
          <div className="analytics-chart-header">
            <h3 className="analytics-chart-title">Top Agencies</h3>
            <span className="analytics-chart-subtitle">Highest revenue contributors</span>
          </div>
          <div className="analytics-chart-container"><canvas ref={agenciesRef} /></div>
        </div>

        <div className="analytics-chart-card">
          <div className="analytics-chart-header">
            <h3 className="analytics-chart-title">Payment Methods</h3>
            <span className="analytics-chart-subtitle">Revenue breakdown by payment method</span>
          </div>
          <div className="analytics-chart-container"><canvas ref={paymentMethodRef} /></div>
        </div>

        <div className="analytics-chart-card">
          <div className="analytics-chart-header">
            <h3 className="analytics-chart-title">Pending Aging Analysis</h3>
            <span className="analytics-chart-subtitle">Days pending by receipt count</span>
          </div>
          <div className="analytics-chart-container"><canvas ref={agingRef} /></div>
        </div>
      </div>

      {/* Insights */}
      <div className="analytics-insights">
        <h3 className="analytics-insights-title">Key Insights & Recommendations</h3>
        <div className="analytics-insights-grid">
          <div className="analytics-insight-card">
            <div className="analytics-insight-icon">🏆</div>
            <div className="analytics-insight-content">
              <div className="analytics-insight-label">Top Performer</div>
              <div className="analytics-insight-value">{top1?.name?.slice(0,24) || 'N/A'}</div>
              <div className="analytics-insight-desc">{formatCurrency(top1?.revenue || 0)} in revenue ({top1?.count || 0} receipts)</div>
            </div>
          </div>

          <div className="analytics-insight-card">
            <div className="analytics-insight-icon">📦</div>
            <div className="analytics-insight-content">
              <div className="analytics-insight-label">Avg Receipt Value</div>
              <div className="analytics-insight-value">{formatCurrency(data.averageReceiptValue)}</div>
              <div className="analytics-insight-desc">Across {data.paidReceipts + data.pendingReceipts} active receipts</div>
            </div>
          </div>

          <div className="analytics-insight-card">
            <div className="analytics-insight-icon">⚠️</div>
            <div className="analytics-insight-content">
              <div className="analytics-insight-label">Pending Exposure</div>
              <div className="analytics-insight-value">{pendingRatio.toFixed(1)}%</div>
              <div className="analytics-insight-desc">{formatCurrency(data.pendingRevenue)} outstanding ({data.pendingReceipts} receipts)</div>
            </div>
          </div>

          <div className="analytics-insight-card">
            <div className="analytics-insight-icon">⏰</div>
            <div className="analytics-insight-content">
              <div className="analytics-insight-label">Aging Alert</div>
              <div className="analytics-insight-value">{data.pendingAging['60+']}</div>
              <div className="analytics-insight-desc">
                {data.pendingAging['60+'] > 0
                  ? 'receipts overdue 60+ days - follow up needed'
                  : 'No critical overdue receipts'}
              </div>
            </div>
          </div>

          <div className="analytics-insight-card">
            <div className="analytics-insight-icon">💳</div>
            <div className="analytics-insight-content">
              <div className="analytics-insight-label">Payment Methods</div>
              <div className="analytics-insight-value">{Object.keys(data.byPaymentMethod).length}</div>
              <div className="analytics-insight-desc">
                {(() => {
                  const methods = Object.entries(data.byPaymentMethod).sort((a, b) => b[1].revenue - a[1].revenue);
                  const top = methods[0];
                  return top ? `Top: ${top[0]} (${formatCurrency(top[1].revenue)})` : 'No data';
                })()}
              </div>
            </div>
          </div>

          <div className="analytics-insight-card">
            <div className="analytics-insight-icon">🎯</div>
            <div className="analytics-insight-content">
              <div className="analytics-insight-label">Collection Efficiency</div>
              <div className="analytics-insight-value">{collectionRate.toFixed(1)}%</div>
              <div className="analytics-insight-desc">
                {collectionRate >= 80
                  ? 'Excellent collection rate'
                  : collectionRate >= 60
                    ? 'Good - room for improvement'
                    : 'Needs attention - increase follow-ups'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}