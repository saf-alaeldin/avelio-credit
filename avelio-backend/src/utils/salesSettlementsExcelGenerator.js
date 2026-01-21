const XLSX = require('xlsx');
const logger = require('./logger');

function formatCurrency(amount, currency = 'USD') {
  const n = isFinite(parseFloat(amount)) ? parseFloat(amount) : 0;
  return n.toFixed(2);
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Generate comprehensive Excel report with multiple sheets
 */
async function generateSalesSettlementsExcel({
  sales = [],
  settlements = [],
  analytics = {},
  period = 'monthly',
  periodLabel = ''
}) {
  try {
    const workbook = XLSX.utils.book_new();

    // ========== SHEET 1: EXECUTIVE SUMMARY ==========
    const totalUSD = analytics.byCurrency?.find(c => c.currency === 'USD')?.total || 0;
    const totalSSP = analytics.byCurrency?.find(c => c.currency === 'SSP')?.total || 0;
    const approvalRate = analytics.totalSettlements > 0
      ? Math.round((analytics.settlementStatus?.approved || 0) / analytics.totalSettlements * 100)
      : 0;

    const summaryData = [
      ['KUSH AIR - COMPREHENSIVE SALES & SETTLEMENTS REPORT'],
      [''],
      ['REPORT INFORMATION'],
      ['Report Period:', periodLabel],
      ['Generated:', new Date().toLocaleString()],
      ['Report Type:', 'Detailed Analysis'],
      [''],
      ['═══════════════════════════════════════════════════════════════'],
      [''],
      ['KEY PERFORMANCE INDICATORS'],
      [''],
      ['Metric', 'Value', 'Currency', 'Notes'],
      ['Total Sales Transactions', analytics.totalSales || 0, '-', 'Number of individual sales'],
      ['Total Revenue (USD)', formatCurrency(totalUSD), 'USD', 'Primary currency revenue'],
      ['Total Revenue (SSP)', formatCurrency(totalSSP), 'SSP', 'Local currency revenue'],
      ['Average Transaction Value', formatCurrency(analytics.avgTransaction || 0), 'USD', 'Average sale amount'],
      ['Active Stations', analytics.activeStations || 0, '-', 'Stations with transactions'],
      ['Active Agents', analytics.activeAgents || 0, '-', 'Agents with transactions'],
      [''],
      ['═══════════════════════════════════════════════════════════════'],
      [''],
      ['SETTLEMENT STATUS OVERVIEW'],
      [''],
      ['Status', 'Count', 'Percentage', 'Description'],
      ['Total Settlements', analytics.totalSettlements || 0, '100%', 'All settlements in period'],
      ['Approved', analytics.settlementStatus?.approved || 0, `${approvalRate}%`, 'Successfully approved'],
      ['Pending Review', analytics.settlementStatus?.submitted || 0, analytics.totalSettlements > 0 ? `${Math.round((analytics.settlementStatus?.submitted || 0) / analytics.totalSettlements * 100)}%` : '0%', 'Awaiting manager review'],
      ['Draft', analytics.settlementStatus?.draft || 0, analytics.totalSettlements > 0 ? `${Math.round((analytics.settlementStatus?.draft || 0) / analytics.totalSettlements * 100)}%` : '0%', 'Not yet submitted'],
      ['Rejected', analytics.settlementStatus?.rejected || 0, analytics.totalSettlements > 0 ? `${Math.round((analytics.settlementStatus?.rejected || 0) / analytics.totalSettlements * 100)}%` : '0%', 'Returned for correction'],
      [''],
      ['═══════════════════════════════════════════════════════════════'],
      [''],
      ['FINANCIAL SUMMARY'],
      [''],
      ['Category', 'USD Amount', 'SSP Amount', 'Notes'],
      ['Total Expected Cash', formatCurrency(analytics.totalExpectedUSD || totalUSD), formatCurrency(analytics.totalExpectedSSP || totalSSP), 'From all sales'],
      ['Total Expenses', formatCurrency(analytics.totalExpensesUSD || 0), formatCurrency(analytics.totalExpensesSSP || 0), 'Station-level expenses'],
      ['Net Cash Expected', formatCurrency((analytics.totalExpectedUSD || totalUSD) - (analytics.totalExpensesUSD || 0)), formatCurrency((analytics.totalExpectedSSP || totalSSP) - (analytics.totalExpensesSSP || 0)), 'After expenses'],
      ['Total Cash Received', formatCurrency(analytics.totalCashReceivedUSD || 0), formatCurrency(analytics.totalCashReceivedSSP || 0), 'Actual cash sent to HQ'],
      ['Total Variance', formatCurrency(analytics.totalVarianceUSD || 0), formatCurrency(analytics.totalVarianceSSP || 0), 'Difference (+ extra, - short)'],
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [
      { wch: 30 },
      { wch: 20 },
      { wch: 15 },
      { wch: 35 }
    ];
    summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Executive Summary');

    // ========== SHEET 2: STATION PERFORMANCE ==========
    const stationHeaders = [
      'Rank', 'Station Code', 'Station Name', 'Total Sales',
      'USD Revenue', 'SSP Revenue', 'Active Agents',
      'Avg Sale (USD)', 'Settlement Count', 'Approval Rate'
    ];

    const sortedStations = [...(analytics.byStation || [])].sort((a, b) =>
      (b.total_amount || 0) - (a.total_amount || 0)
    );

    const stationRows = sortedStations.map((station, index) => {
      const stationSettlements = settlements.filter(s => s.station_code === station.station_code);
      const approvedCount = stationSettlements.filter(s => s.status === 'APPROVED').length;
      const approvalPct = stationSettlements.length > 0
        ? Math.round(approvedCount / stationSettlements.length * 100) + '%'
        : 'N/A';

      return [
        index + 1,
        station.station_code || '',
        station.station_name || '',
        station.sales_count || 0,
        formatCurrency(station.total_amount || 0),
        formatCurrency(station.total_amount_ssp || 0),
        station.agent_count || 0,
        station.sales_count > 0 ? formatCurrency((station.total_amount || 0) / station.sales_count) : '0.00',
        stationSettlements.length,
        approvalPct
      ];
    });

    const stationData = [
      ['STATION PERFORMANCE ANALYSIS'],
      ['Period:', periodLabel],
      [''],
      stationHeaders,
      ...stationRows,
      [''],
      ['TOTALS'],
      [
        '',
        '',
        '',
        stationRows.reduce((sum, r) => sum + (r[3] || 0), 0),
        formatCurrency(stationRows.reduce((sum, r) => sum + parseFloat(r[4] || 0), 0)),
        formatCurrency(stationRows.reduce((sum, r) => sum + parseFloat(r[5] || 0), 0)),
        '',
        '',
        '',
        ''
      ]
    ];

    const stationSheet = XLSX.utils.aoa_to_sheet(stationData);
    stationSheet['!cols'] = [
      { wch: 6 }, { wch: 12 }, { wch: 25 }, { wch: 12 },
      { wch: 15 }, { wch: 15 }, { wch: 14 },
      { wch: 14 }, { wch: 15 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(workbook, stationSheet, 'Station Performance');

    // ========== SHEET 3: AGENT PERFORMANCE (ALL AGENTS) ==========
    const agentHeaders = [
      'Rank', 'Agent Code', 'Agent Name', 'Station',
      'Total Sales', 'USD Revenue', 'SSP Revenue',
      'Avg Sale', 'First Sale', 'Last Sale'
    ];

    // Get all agents, not just top 10
    const allAgentRows = (analytics.topAgents || []).map((agent, i) => {
      const agentSales = sales.filter(s => s.agent_code === agent.agent_code);
      const dates = agentSales.map(s => new Date(s.transaction_date)).filter(d => !isNaN(d));
      const firstSale = dates.length > 0 ? formatDate(new Date(Math.min(...dates))) : '-';
      const lastSale = dates.length > 0 ? formatDate(new Date(Math.max(...dates))) : '-';

      return [
        i + 1,
        agent.agent_code || '',
        agent.agent_name || '',
        agent.station_code || '',
        agent.sales_count || 0,
        formatCurrency(agent.total_amount || 0),
        formatCurrency(agent.total_amount_ssp || 0),
        agent.sales_count > 0 ? formatCurrency((agent.total_amount || 0) / agent.sales_count) : '0.00',
        firstSale,
        lastSale
      ];
    });

    const agentData = [
      ['AGENT PERFORMANCE RANKING'],
      ['Period:', periodLabel],
      [`Total Active Agents: ${allAgentRows.length}`],
      [''],
      agentHeaders,
      ...allAgentRows,
      [''],
      ['TOTALS'],
      [
        '',
        '',
        '',
        '',
        allAgentRows.reduce((sum, r) => sum + (r[4] || 0), 0),
        formatCurrency(allAgentRows.reduce((sum, r) => sum + parseFloat(r[5] || 0), 0)),
        formatCurrency(allAgentRows.reduce((sum, r) => sum + parseFloat(r[6] || 0), 0)),
        '',
        '',
        ''
      ]
    ];

    const agentSheet = XLSX.utils.aoa_to_sheet(agentData);
    agentSheet['!cols'] = [
      { wch: 6 }, { wch: 12 }, { wch: 25 }, { wch: 10 },
      { wch: 12 }, { wch: 15 }, { wch: 15 },
      { wch: 12 }, { wch: 14 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(workbook, agentSheet, 'Agent Performance');

    // ========== SHEET 4: ALL SALES TRANSACTIONS ==========
    const salesHeaders = [
      'Sale Reference',
      'Transaction Date',
      'Time',
      'Station Code',
      'Station Name',
      'Agent Code',
      'Agent Name',
      'Point of Sale',
      'Currency',
      'Amount',
      'Payment Method',
      'Customer Name',
      'Flight Ref',
      'Description',
      'Settlement #'
    ];

    const salesRows = sales.map(sale => {
      // Find settlement number for this sale
      const settlement = settlements.find(s => s.id === sale.settlement_id);
      return [
        sale.sale_reference || '',
        formatDate(sale.transaction_date),
        sale.transaction_time || '',
        sale.station_code || '',
        sale.station_name || '',
        sale.agent_code || '',
        sale.agent_name || '',
        sale.point_of_sale || '',
        sale.currency || 'USD',
        formatCurrency(sale.amount || 0),
        sale.payment_method || 'CASH',
        sale.customer_name || '',
        sale.flight_reference || '',
        sale.description || '',
        settlement?.settlement_number || sale.settlement_id || ''
      ];
    });

    const salesData = [
      ['ALL SALES TRANSACTIONS - DETAILED'],
      ['Period:', periodLabel],
      [`Total Records: ${sales.length}`],
      [''],
      salesHeaders,
      ...salesRows
    ];

    const salesSheet = XLSX.utils.aoa_to_sheet(salesData);
    salesSheet['!cols'] = [
      { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 12 },
      { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 15 },
      { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 20 },
      { wch: 12 }, { wch: 25 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(workbook, salesSheet, 'All Sales');

    // ========== SHEET 5: SETTLEMENTS DETAIL ==========
    const settlementHeaders = [
      'Settlement #',
      'Station Code',
      'Station Name',
      'Period From',
      'Period To',
      'Status',
      'USD Expected',
      'USD Expenses',
      'USD Net Expected',
      'USD Cash Sent',
      'USD Variance',
      'SSP Expected',
      'SSP Expenses',
      'SSP Net Expected',
      'SSP Cash Sent',
      'SSP Variance',
      'Variance Status',
      'Submitted By',
      'Submitted At',
      'Reviewed By',
      'Reviewed At',
      'Approval Notes',
      'Created Date'
    ];

    const settlementRows = settlements.map(s => {
      const usdSummary = s.summaries?.find(sum => sum.currency === 'USD') || {};
      const sspSummary = s.summaries?.find(sum => sum.currency === 'SSP') || {};

      return [
        s.settlement_number || '',
        s.station_code || '',
        s.station_name || '',
        formatDate(s.period_from),
        formatDate(s.period_to),
        s.status || '',
        formatCurrency(usdSummary.expected_cash || s.total_sales_usd || 0),
        formatCurrency(usdSummary.total_expenses || 0),
        formatCurrency(usdSummary.expected_net_cash || 0),
        formatCurrency(usdSummary.actual_cash_received || 0),
        formatCurrency(usdSummary.final_variance || 0),
        formatCurrency(sspSummary.expected_cash || s.total_sales_ssp || 0),
        formatCurrency(sspSummary.total_expenses || 0),
        formatCurrency(sspSummary.expected_net_cash || 0),
        formatCurrency(sspSummary.actual_cash_received || 0),
        formatCurrency(sspSummary.final_variance || 0),
        usdSummary.variance_status || sspSummary.variance_status || '',
        s.submitted_by_name || '',
        formatDateTime(s.submitted_at),
        s.reviewed_by_name || '',
        formatDateTime(s.reviewed_at),
        s.approval_notes || '',
        formatDateTime(s.created_at)
      ];
    });

    const settlementData = [
      ['SETTLEMENTS DETAIL - COMPREHENSIVE'],
      ['Period:', periodLabel],
      [`Total Settlements: ${settlements.length}`],
      [''],
      settlementHeaders,
      ...settlementRows
    ];

    const settlementSheet = XLSX.utils.aoa_to_sheet(settlementData);
    settlementSheet['!cols'] = [
      { wch: 22 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 18 }, { wch: 30 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(workbook, settlementSheet, 'Settlements Detail');

    // ========== SHEET 6: SETTLEMENT FINANCIAL SUMMARY ==========
    const financialHeaders = [
      'Settlement #', 'Station', 'Status', 'Currency',
      'Opening Balance', 'Expected Cash', 'Total Expenses',
      'Expected Net', 'Cash Received', 'Final Variance', 'Variance Status'
    ];

    const financialRows = [];
    settlements.forEach(s => {
      (s.summaries || []).forEach(sum => {
        financialRows.push([
          s.settlement_number || '',
          s.station_code || '',
          s.status || '',
          sum.currency || '',
          formatCurrency(sum.opening_balance || 0),
          formatCurrency(sum.expected_cash || 0),
          formatCurrency(sum.total_expenses || 0),
          formatCurrency(sum.expected_net_cash || 0),
          formatCurrency(sum.actual_cash_received || 0),
          formatCurrency(sum.final_variance || 0),
          sum.variance_status || ''
        ]);
      });
    });

    const financialData = [
      ['SETTLEMENT FINANCIAL SUMMARY BY CURRENCY'],
      ['Period:', periodLabel],
      [''],
      financialHeaders,
      ...financialRows
    ];

    const financialSheet = XLSX.utils.aoa_to_sheet(financialData);
    financialSheet['!cols'] = [
      { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
      { wch: 16 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(workbook, financialSheet, 'Financial Summary');

    // ========== SHEET 7: SETTLEMENT EXPENSES ==========
    if (analytics.allExpenses && analytics.allExpenses.length > 0) {
      const expenseHeaders = [
        'Settlement #', 'Station', 'Expense Code', 'Expense Name',
        'Currency', 'Amount', 'Description', 'Created By', 'Created At'
      ];

      const expenseRows = analytics.allExpenses.map(exp => [
        exp.settlement_number || '',
        exp.station_code || '',
        exp.expense_code || '',
        exp.expense_name || '',
        exp.currency || '',
        formatCurrency(exp.amount || 0),
        exp.description || '',
        exp.created_by_name || '',
        formatDateTime(exp.created_at)
      ]);

      const expenseData = [
        ['SETTLEMENT EXPENSES DETAIL'],
        ['Period:', periodLabel],
        [`Total Expenses: ${expenseRows.length}`],
        [''],
        expenseHeaders,
        ...expenseRows
      ];

      const expenseSheet = XLSX.utils.aoa_to_sheet(expenseData);
      expenseSheet['!cols'] = [
        { wch: 22 }, { wch: 10 }, { wch: 15 }, { wch: 25 },
        { wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 18 }, { wch: 18 }
      ];
      XLSX.utils.book_append_sheet(workbook, expenseSheet, 'Expenses Detail');
    }

    // ========== SHEET 8: AGENT ENTRIES DETAIL ==========
    if (analytics.allAgentEntries && analytics.allAgentEntries.length > 0) {
      const entryHeaders = [
        'Settlement #', 'Station', 'Agent Code', 'Agent Name',
        'Currency', 'Expected Cash', 'Declared Cash', 'Variance',
        'Variance Status', 'Notes'
      ];

      const entryRows = analytics.allAgentEntries.map(entry => [
        entry.settlement_number || '',
        entry.station_code || '',
        entry.agent_code || '',
        entry.agent_name || '',
        entry.currency || '',
        formatCurrency(entry.expected_cash || 0),
        formatCurrency(entry.declared_cash || 0),
        formatCurrency(entry.variance || 0),
        entry.variance_status || '',
        entry.notes || ''
      ]);

      const entryData = [
        ['SETTLEMENT AGENT ENTRIES DETAIL'],
        ['Period:', periodLabel],
        [`Total Entries: ${entryRows.length}`],
        [''],
        entryHeaders,
        ...entryRows
      ];

      const entrySheet = XLSX.utils.aoa_to_sheet(entryData);
      entrySheet['!cols'] = [
        { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 25 },
        { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
        { wch: 14 }, { wch: 30 }
      ];
      XLSX.utils.book_append_sheet(workbook, entrySheet, 'Agent Entries');
    }

    // ========== SHEET 9: CURRENCY BREAKDOWN ==========
    const currencyHeaders = ['Currency', 'Total Sales', 'Total Revenue', 'Percentage of Total', 'Avg Transaction'];
    const totalRevenue = (analytics.byCurrency || []).reduce((sum, c) => sum + (c.total || 0), 0);
    const currencyRows = (analytics.byCurrency || []).map(curr => {
      const currSales = sales.filter(s => s.currency === curr.currency);
      return [
        curr.currency,
        currSales.length,
        formatCurrency(curr.total || 0),
        totalRevenue > 0 ? `${Math.round((curr.total || 0) / totalRevenue * 100)}%` : '0%',
        currSales.length > 0 ? formatCurrency((curr.total || 0) / currSales.length) : '0.00'
      ];
    });

    const currencyData = [
      ['CURRENCY BREAKDOWN ANALYSIS'],
      ['Period:', periodLabel],
      [''],
      currencyHeaders,
      ...currencyRows,
      [''],
      ['TOTALS', sales.length, formatCurrency(totalRevenue), '100%', '']
    ];

    const currencySheet = XLSX.utils.aoa_to_sheet(currencyData);
    currencySheet['!cols'] = [
      { wch: 12 },
      { wch: 15 },
      { wch: 18 },
      { wch: 20 },
      { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(workbook, currencySheet, 'Currency Breakdown');

    // ========== SHEET 10: JUBA POINT OF SALE ==========
    if (analytics.jubaPointOfSale && analytics.jubaPointOfSale.length > 0) {
      const posHeaders = ['Point of Sale', 'Sales Count', 'Total Revenue (USD)', 'Percentage', 'Avg Transaction'];
      const posTotal = analytics.jubaPointOfSale.reduce((sum, p) => sum + (p.total_amount || 0), 0);
      const posRows = analytics.jubaPointOfSale.map(pos => [
        pos.point_of_sale || '',
        pos.sales_count || 0,
        formatCurrency(pos.total_amount || 0),
        posTotal > 0 ? `${Math.round((pos.total_amount || 0) / posTotal * 100)}%` : '0%',
        pos.sales_count > 0 ? formatCurrency((pos.total_amount || 0) / pos.sales_count) : '0.00'
      ]);

      const posData = [
        ['JUBA STATION - POINT OF SALE ANALYSIS'],
        ['Period:', periodLabel],
        [''],
        posHeaders,
        ...posRows,
        [''],
        ['TOTAL', posRows.reduce((sum, r) => sum + r[1], 0), formatCurrency(posTotal), '100%', '']
      ];

      const posSheet = XLSX.utils.aoa_to_sheet(posData);
      posSheet['!cols'] = [
        { wch: 22 },
        { wch: 15 },
        { wch: 20 },
        { wch: 15 },
        { wch: 18 }
      ];
      XLSX.utils.book_append_sheet(workbook, posSheet, 'Juba POS Analysis');
    }

    // ========== SHEET 11: DAILY BREAKDOWN ==========
    const salesByDate = {};
    sales.forEach(sale => {
      const date = formatDate(sale.transaction_date);
      if (!salesByDate[date]) {
        salesByDate[date] = { count: 0, usd: 0, ssp: 0, agents: new Set(), stations: new Set() };
      }
      salesByDate[date].count++;
      if (sale.currency === 'USD') {
        salesByDate[date].usd += parseFloat(sale.amount || 0);
      } else if (sale.currency === 'SSP') {
        salesByDate[date].ssp += parseFloat(sale.amount || 0);
      }
      if (sale.agent_code) salesByDate[date].agents.add(sale.agent_code);
      if (sale.station_code) salesByDate[date].stations.add(sale.station_code);
    });

    const dailyHeaders = ['Date', 'Transactions', 'USD Revenue', 'SSP Revenue', 'Active Agents', 'Active Stations', 'Avg Sale (USD)'];
    const dailyRows = Object.entries(salesByDate)
      .sort((a, b) => new Date(b[0]) - new Date(a[0]))
      .map(([date, data]) => [
        date,
        data.count,
        formatCurrency(data.usd),
        formatCurrency(data.ssp),
        data.agents.size,
        data.stations.size,
        data.count > 0 ? formatCurrency(data.usd / data.count) : '0.00'
      ]);

    const dailyData = [
      ['DAILY SALES BREAKDOWN'],
      ['Period:', periodLabel],
      [`Total Days: ${dailyRows.length}`],
      [''],
      dailyHeaders,
      ...dailyRows,
      [''],
      ['TOTALS',
        dailyRows.reduce((sum, r) => sum + r[1], 0),
        formatCurrency(dailyRows.reduce((sum, r) => sum + parseFloat(r[2] || 0), 0)),
        formatCurrency(dailyRows.reduce((sum, r) => sum + parseFloat(r[3] || 0), 0)),
        '-',
        '-',
        ''
      ]
    ];

    const dailySheet = XLSX.utils.aoa_to_sheet(dailyData);
    dailySheet['!cols'] = [
      { wch: 18 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 15 },
      { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(workbook, dailySheet, 'Daily Breakdown');

    // ========== SHEET 12: VARIANCE ANALYSIS ==========
    const varianceHeaders = [
      'Settlement #', 'Station', 'Currency', 'Status',
      'Expected Net', 'Cash Received', 'Variance', 'Variance %', 'Variance Status'
    ];

    const varianceRows = [];
    settlements.forEach(s => {
      (s.summaries || []).forEach(sum => {
        if (sum.expected_net_cash > 0 || sum.actual_cash_received > 0) {
          const variancePct = sum.expected_net_cash > 0
            ? ((sum.final_variance || 0) / sum.expected_net_cash * 100).toFixed(2) + '%'
            : 'N/A';
          varianceRows.push([
            s.settlement_number || '',
            s.station_code || '',
            sum.currency || '',
            s.status || '',
            formatCurrency(sum.expected_net_cash || 0),
            formatCurrency(sum.actual_cash_received || 0),
            formatCurrency(sum.final_variance || 0),
            variancePct,
            sum.variance_status || ''
          ]);
        }
      });
    });

    // Sort by variance (most negative first)
    varianceRows.sort((a, b) => parseFloat(a[6]) - parseFloat(b[6]));

    const varianceData = [
      ['VARIANCE ANALYSIS'],
      ['Period:', periodLabel],
      ['Note: Sorted by variance amount (largest shortages first)'],
      [''],
      varianceHeaders,
      ...varianceRows
    ];

    const varianceSheet = XLSX.utils.aoa_to_sheet(varianceData);
    varianceSheet['!cols'] = [
      { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
      { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(workbook, varianceSheet, 'Variance Analysis');

    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    logger.info(`Comprehensive Excel report generated with ${sales.length} sales, ${settlements.length} settlements, ${Object.keys(workbook.Sheets).length} sheets`);

    return excelBuffer;

  } catch (error) {
    logger.error('Sales & Settlements Excel generation error:', error);
    throw error;
  }
}

module.exports = {
  generateSalesSettlementsExcel
};
