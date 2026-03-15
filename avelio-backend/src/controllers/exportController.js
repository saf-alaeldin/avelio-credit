const db = require('../config/db');
const { generateSummaryPDF } = require('../utils/summaryPdfGenerator');
const { generateSalesSettlementsReport } = require('../utils/salesSettlementsReportGenerator');
const { generateSalesSettlementsExcel } = require('../utils/salesSettlementsExcelGenerator');
const logger = require('../utils/logger');

// Export receipts to CSV
const exportToCSV = async (req, res) => {
  try {
    const { status, date_from, date_to, agency_id } = req.query;

    // Build query
    let query = `
      SELECT 
        r.receipt_number,
        r.issue_date,
        r.issue_time,
        a.agency_id,
        a.agency_name,
        r.amount,
        r.currency,
        r.payment_method,
        r.status,
        r.payment_date,
        r.station_code,
        r.issued_by_name,
        r.remarks,
        r.created_at
      FROM receipts r
      JOIN agencies a ON r.agency_id = a.id
      WHERE r.is_void = false
    `;

    const params = [];
    let paramCount = 1;

    // Add filters
    if (status) {
      query += ` AND r.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (agency_id) {
      query += ` AND a.agency_id = $${paramCount}`;
      params.push(agency_id);
      paramCount++;
    }

    if (date_from) {
      query += ` AND r.issue_date >= $${paramCount}`;
      params.push(date_from);
      paramCount++;
    }

    if (date_to) {
      query += ` AND r.issue_date <= $${paramCount}`;
      params.push(date_to);
      paramCount++;
    }

    query += ' ORDER BY r.issue_date DESC, r.created_at DESC';

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No receipts found to export.'
      });
    }

    // Generate CSV content
    const headers = [
      'Receipt Number',
      'Issue Date',
      'Issue Time',
      'Agency ID',
      'Agency Name',
      'Amount',
      'Currency',
      'Payment Method',
      'Status',
      'Payment Date',
      'Station',
      'Issued By',
      'Remarks'
    ];

    let csv = headers.join(',') + '\n';

    result.rows.forEach(row => {
      const values = [
        row.receipt_number,
        row.issue_date,
        row.issue_time,
        row.agency_id,
        `"${row.agency_name}"`, // Quoted to handle commas
        row.amount,
        row.currency,
        row.payment_method,
        row.status,
        row.payment_date || '',
        row.station_code,
        `"${row.issued_by_name}"`,
        row.remarks ? `"${row.remarks.replace(/"/g, '""')}"` : '' // Escape quotes
      ];
      csv += values.join(',') + '\n';
    });

    // Set headers for CSV download
    const filename = `receipts-export-${new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Juba' })}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    logger.error('CSV export error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to export receipts.'
    });
  }
};

// Export summary statistics to CSV
const exportSummaryCSV = async (req, res) => {
  try {
    // Get summary by agency
    const result = await db.query(
      `SELECT 
        a.agency_id,
        a.agency_name,
        COUNT(r.id) as total_receipts,
        COUNT(CASE WHEN r.status = 'PAID' THEN 1 END) as paid_count,
        COALESCE(SUM(CASE WHEN r.status = 'PAID' THEN r.amount ELSE 0 END), 0) as paid_total,
        COUNT(CASE WHEN r.status = 'PENDING' THEN 1 END) as pending_count,
        COALESCE(SUM(CASE WHEN r.status = 'PENDING' THEN r.amount ELSE 0 END), 0) as pending_total,
        COALESCE(SUM(r.amount), 0) as grand_total
       FROM agencies a
       LEFT JOIN receipts r ON a.id = r.agency_id AND r.is_void = false
       WHERE a.is_active = true
       GROUP BY a.id, a.agency_id, a.agency_name
       ORDER BY grand_total DESC`
    );

    // Generate CSV
    const headers = [
      'Agency ID',
      'Agency Name',
      'Total Receipts',
      'Paid Count',
      'Paid Amount',
      'Pending Count',
      'Pending Amount',
      'Grand Total'
    ];

    let csv = headers.join(',') + '\n';

    result.rows.forEach(row => {
      const values = [
        row.agency_id,
        `"${row.agency_name}"`,
        row.total_receipts,
        row.paid_count,
        parseFloat(row.paid_total).toFixed(2),
        row.pending_count,
        parseFloat(row.pending_total).toFixed(2),
        parseFloat(row.grand_total).toFixed(2)
      ];
      csv += values.join(',') + '\n';
    });

    const filename = `receipts-summary-${new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Juba' })}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    logger.error('Summary export error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to export summary.'
    });
  }
};
// list all receipts
exports.getReceipts = async (req, res) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;
    const offset = (page - 1) * pageSize;

    const sql = `
      SELECT r.id, r.receipt_number, r.amount, r.currency, r.status,
             r.issue_date, a.agency_name, a.agency_id
      FROM receipts r
      LEFT JOIN agencies a ON r.agency_id = a.id
      ORDER BY r.created_at DESC
      LIMIT $1 OFFSET $2;
    `;
    const { rows } = await db.query(sql, [pageSize, offset]);

    const countRes = await db.query('SELECT COUNT(*) FROM receipts;');
    const total = Number(countRes.rows[0].count);

    res.json({ success: true, receipts: rows, total });
  } catch (err) {
    logger.error('getReceipts error:', { error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};
// Export daily summary as PDF
const exportDailySummaryPDF = async (req, res) => {
  try {
    const { date } = req.query;

    // Default to today if no date provided
    const targetDate = date || new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Juba' });

    // Fetch receipts for the specified date
    const query = `
      SELECT
        r.id,
        r.receipt_number,
        r.issue_date,
        r.amount,
        r.currency,
        r.status,
        a.agency_name,
        a.agency_id
      FROM receipts r
      LEFT JOIN agencies a ON r.agency_id = a.id
      WHERE r.issue_date = $1 AND r.is_void = false
      ORDER BY r.created_at DESC
    `;

    const result = await db.query(query, [targetDate]);
    const receipts = result.rows;

    if (receipts.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No receipts found for ${targetDate}`
      });
    }

    // Calculate summary statistics
    const summary = {
      totalReceipts: receipts.length,
      totalAmount: receipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0),
      paidCount: receipts.filter(r => r.status === 'PAID').length,
      paidAmount: receipts.filter(r => r.status === 'PAID').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0),
      pendingCount: receipts.filter(r => r.status === 'PENDING').length,
      pendingAmount: receipts.filter(r => r.status === 'PENDING').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)
    };

    // Format period label
    const dateObj = new Date(targetDate);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const periodLabel = `${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

    // Generate PDF
    const pdfBuffer = await generateSummaryPDF({
      receipts,
      summary,
      period: 'daily',
      periodLabel
    });

    // Send PDF
    const filename = `daily-summary-${targetDate}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);

  } catch (error) {
    logger.error('Daily summary PDF export error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to generate daily summary PDF.'
    });
  }
};

// Export monthly summary as PDF
const exportMonthlySummaryPDF = async (req, res) => {
  try {
    const { year, month } = req.query;

    // Default to current month if not provided
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || (now.getMonth() + 1);

    // Calculate date range for the month
    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

    // Fetch receipts for the specified month
    const query = `
      SELECT
        r.id,
        r.receipt_number,
        r.issue_date,
        r.amount,
        r.currency,
        r.status,
        a.agency_name,
        a.agency_id
      FROM receipts r
      LEFT JOIN agencies a ON r.agency_id = a.id
      WHERE r.issue_date >= $1 AND r.issue_date <= $2 AND r.is_void = false
      ORDER BY r.issue_date DESC, r.created_at DESC
    `;

    const result = await db.query(query, [startDate, endDate]);
    const receipts = result.rows;

    if (receipts.length === 0) {
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      return res.status(404).json({
        success: false,
        message: `No receipts found for ${months[targetMonth - 1]} ${targetYear}`
      });
    }

    // Calculate summary statistics
    const summary = {
      totalReceipts: receipts.length,
      totalAmount: receipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0),
      paidCount: receipts.filter(r => r.status === 'PAID').length,
      paidAmount: receipts.filter(r => r.status === 'PAID').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0),
      pendingCount: receipts.filter(r => r.status === 'PENDING').length,
      pendingAmount: receipts.filter(r => r.status === 'PENDING').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)
    };

    // Format period label
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const periodLabel = `${months[targetMonth - 1]} ${targetYear}`;

    // Generate PDF
    const pdfBuffer = await generateSummaryPDF({
      receipts,
      summary,
      period: 'monthly',
      periodLabel
    });

    // Send PDF
    const filename = `monthly-summary-${targetYear}-${String(targetMonth).padStart(2, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);

  } catch (error) {
    logger.error('Monthly summary PDF export error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to generate monthly summary PDF.'
    });
  }
};

// Export cash closing report data
const getCashClosingData = async (req, res) => {
  try {
    const { date, month, year, station, includeAfterHours } = req.query;

    let query;
    let params = [];
    let dateCondition = '';

    // Determine date range
    if (month && year) {
      // Monthly report
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of month
      dateCondition = 'r.issue_date >= $1 AND r.issue_date <= $2';
      params.push(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
    } else {
      // Daily report
      const targetDate = date || new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Juba' });
      dateCondition = 'r.issue_date = $1';
      params.push(targetDate);
    }

    // Build base query
    query = `
      SELECT
        r.id,
        r.receipt_number,
        r.issue_date,
        r.issue_time,
        r.amount,
        r.amount_paid,
        r.currency,
        r.status,
        r.payment_method,
        r.station_code,
        a.agency_name,
        a.agency_id,
        CASE
          WHEN r.issue_time IS NOT NULL AND r.issue_time >= '18:00:00' THEN true
          WHEN r.issue_time IS NOT NULL AND r.issue_time < '08:00:00' THEN true
          ELSE false
        END as after_hours
      FROM receipts r
      LEFT JOIN agencies a ON r.agency_id = a.id
      WHERE ${dateCondition} AND r.is_void = false
    `;

    // Add station filter
    if (station && station !== 'ALL') {
      query += ` AND r.station_code = $${params.length + 1}`;
      params.push(station);
    }

    // Filter after hours if needed
    if (includeAfterHours === 'false') {
      query += ` AND (r.issue_time IS NULL OR (r.issue_time >= '08:00:00' AND r.issue_time < '18:00:00'))`;
    }

    query += ` ORDER BY r.issue_date DESC, r.issue_time DESC`;

    const result = await db.query(query, params);
    const receipts = result.rows;

    // Calculate summaries
    const totalReceipts = receipts.length;
    const totalAmount = receipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    // Separate regular and after hours
    const regularHoursReceipts = receipts.filter(r => !r.after_hours);
    const afterHoursReceipts = receipts.filter(r => r.after_hours);

    const regularHoursAmount = regularHoursReceipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    const afterHoursAmount = afterHoursReceipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    // Payment method breakdown
    const paymentBreakdown = {};
    receipts.forEach(r => {
      const method = r.payment_method || 'CASH';
      if (!paymentBreakdown[method]) {
        paymentBreakdown[method] = { count: 0, amount: 0 };
      }
      paymentBreakdown[method].count++;
      paymentBreakdown[method].amount += parseFloat(r.amount || 0);
    });

    // Status breakdown
    const statusBreakdown = {};
    receipts.forEach(r => {
      const status = r.status || 'PENDING';
      if (!statusBreakdown[status]) {
        statusBreakdown[status] = { count: 0, amount: 0 };
      }
      statusBreakdown[status].count++;
      statusBreakdown[status].amount += parseFloat(r.amount || 0);
    });

    res.json({
      success: true,
      totalReceipts,
      totalAmount,
      regularHoursCount: regularHoursReceipts.length,
      regularHoursAmount,
      afterHoursCount: afterHoursReceipts.length,
      afterHoursAmount,
      paymentBreakdown,
      statusBreakdown,
      receipts: receipts.map(r => ({
        ...r,
        amount: parseFloat(r.amount || 0),
        amount_paid: parseFloat(r.amount_paid || 0)
      }))
    });

  } catch (error) {
    logger.error('Cash closing data error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to generate cash closing data'
    });
  }
};

// Export comprehensive sales and settlements report
const exportSalesSettlementsReport = async (req, res) => {
  try {
    const { year, month, start_date, end_date } = req.query;

    let startDate, endDate, periodLabel;
    const now = new Date();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    // Support both date range and year/month parameters
    if (start_date && end_date) {
      // Use provided date range
      startDate = start_date;
      endDate = end_date;

      // Format period label based on date range
      const start = new Date(start_date);
      const end = new Date(end_date);
      if (start_date === end_date) {
        periodLabel = `${start.getDate()} ${months[start.getMonth()]} ${start.getFullYear()}`;
      } else {
        periodLabel = `${start.getDate()} ${months[start.getMonth()]} - ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`;
      }
    } else {
      // Fall back to year/month (backwards compatibility)
      const targetYear = year || now.getFullYear();
      const targetMonth = month || (now.getMonth() + 1);
      startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(targetYear, targetMonth, 0).getDate();
      endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;
      periodLabel = `${months[targetMonth - 1]} ${targetYear}`;
    }

    logger.info(`Generating sales & settlements report for ${startDate} to ${endDate}`);

    // Fetch HQ Settlement summaries for the date range (same calculation as Station Summary page)
    const hqSummariesQuery = `
      SELECT
        hss.currency,
        SUM(hss.opening_balance) as opening_balance,
        SUM(hss.cash_from_stations) as cash_from_stations,
        SUM(hss.total_available) as total_available,
        SUM(hss.total_hq_expenses) as total_hq_expenses,
        SUM(hss.safe_amount) as safe_amount,
        SUM(hss.total_stations_count) as total_stations_count
      FROM hq_settlement_summaries hss
      JOIN hq_settlements hs ON hss.hq_settlement_id = hs.id
      WHERE hs.summary_date >= $1 AND hs.summary_date <= $2
      GROUP BY hss.currency
    `;
    const hqSummariesResult = await db.query(hqSummariesQuery, [startDate, endDate]);

    // Convert to object by currency for easy access
    const hqSummaries = {};
    hqSummariesResult.rows.forEach(row => {
      hqSummaries[row.currency] = {
        opening_balance: parseFloat(row.opening_balance || 0),
        cash_from_stations: parseFloat(row.cash_from_stations || 0),
        total_available: parseFloat(row.total_available || 0),
        total_hq_expenses: parseFloat(row.total_hq_expenses || 0),
        safe_amount: parseFloat(row.safe_amount || 0),
        total_stations_count: parseInt(row.total_stations_count || 0)
      };
    });

    // Fetch station sales data
    const salesQuery = `
      SELECT
        ss.id,
        ss.sale_reference,
        ss.transaction_date,
        ss.amount,
        ss.currency,
        ss.point_of_sale,
        st.station_code,
        st.station_name,
        sa.agent_code,
        sa.agent_name,
        ss.settlement_id
      FROM station_sales ss
      JOIN stations st ON ss.station_id = st.id
      LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
      WHERE ss.transaction_date >= $1 AND ss.transaction_date <= $2
      ORDER BY ss.transaction_date DESC
    `;

    const salesResult = await db.query(salesQuery, [startDate, endDate]);
    const sales = salesResult.rows;

    // Fetch settlements data with full details
    const settlementsQuery = `
      SELECT
        s.id,
        s.settlement_number,
        s.period_from,
        s.period_to,
        s.status,
        s.approval_type,
        s.approval_notes,
        s.rejection_reason,
        s.submitted_at,
        s.reviewed_at,
        st.station_code,
        st.station_name,
        s.created_at,
        sub_user.name as submitted_by_name,
        rev_user.name as reviewed_by_name
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      LEFT JOIN users sub_user ON s.submitted_by = sub_user.id
      LEFT JOIN users rev_user ON s.reviewed_by = rev_user.id
      WHERE s.period_from <= $2 AND s.period_to >= $1
      ORDER BY s.period_to DESC
    `;

    const settlementsResult = await db.query(settlementsQuery, [startDate, endDate]);
    const settlements = settlementsResult.rows;

    // Fetch settlement summaries for each settlement
    const summariesQuery = `
      SELECT
        sum.settlement_id,
        sum.currency,
        sum.opening_balance,
        sum.expected_cash,
        sum.total_expenses,
        sum.expected_net_cash,
        sum.actual_cash_received,
        sum.final_variance,
        sum.variance_status
      FROM settlement_summaries sum
      JOIN settlements s ON sum.settlement_id = s.id
      WHERE s.period_from <= $2 AND s.period_to >= $1
    `;
    const summariesResult = await db.query(summariesQuery, [startDate, endDate]);

    // Attach summaries to settlements
    settlements.forEach(s => {
      s.summaries = summariesResult.rows.filter(sum => sum.settlement_id === s.id);
    });

    // Calculate analytics
    const analytics = {
      totalSales: sales.length,
      totalSettlements: settlements.length,
      totalRevenue: sales.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0),
      settlementsApproved: settlements.filter(s => s.status === 'APPROVED').length,

      // By currency
      byCurrency: [],

      // By station
      byStation: [],

      // Settlement status
      settlementStatus: {
        draft: settlements.filter(s => s.status === 'DRAFT').length,
        submitted: settlements.filter(s => s.status === 'SUBMITTED').length,
        approved: settlements.filter(s => s.status === 'APPROVED').length,
        rejected: settlements.filter(s => s.status === 'REJECTED').length
      },

      // Top agents
      topAgents: [],

      // Juba Point of Sale
      jubaPointOfSale: [],

      // Active stations and agents
      activeStations: 0,
      activeAgents: 0,
      avgTransaction: 0
    };

    // Calculate by currency
    const currencyMap = {};
    sales.forEach(s => {
      const curr = s.currency || 'USD';
      if (!currencyMap[curr]) {
        currencyMap[curr] = 0;
      }
      currencyMap[curr] += parseFloat(s.amount || 0);
    });
    analytics.byCurrency = Object.keys(currencyMap).map(currency => ({
      currency,
      total: currencyMap[currency]
    }));

    // Calculate by station
    const stationMapQuery = `
      SELECT
        st.station_code,
        st.station_name,
        COUNT(ss.id) as sales_count,
        SUM(ss.amount) as total_amount,
        COUNT(DISTINCT ss.agent_id) as agent_count
      FROM stations st
      LEFT JOIN station_sales ss ON st.id = ss.station_id
        AND ss.transaction_date >= $1 AND ss.transaction_date <= $2
      GROUP BY st.id, st.station_code, st.station_name
      ORDER BY total_amount DESC NULLS LAST
    `;
    const stationResult = await db.query(stationMapQuery, [startDate, endDate]);
    analytics.byStation = stationResult.rows.map(row => ({
      station_code: row.station_code,
      station_name: row.station_name,
      sales_count: parseInt(row.sales_count) || 0,
      total_amount: parseFloat(row.total_amount) || 0,
      agent_count: parseInt(row.agent_count) || 0
    }));

    analytics.activeStations = analytics.byStation.filter(s => s.sales_count > 0).length;

    // Calculate top agents
    const topAgentsQuery = `
      SELECT
        sa.agent_code,
        sa.agent_name,
        st.station_code,
        COUNT(ss.id) as sales_count,
        SUM(ss.amount) as total_amount
      FROM sales_agents sa
      LEFT JOIN station_sales ss ON sa.id = ss.agent_id
        AND ss.transaction_date >= $1 AND ss.transaction_date <= $2
      LEFT JOIN stations st ON sa.station_id = st.id
      WHERE ss.id IS NOT NULL
      GROUP BY sa.id, sa.agent_code, sa.agent_name, st.station_code
      ORDER BY total_amount DESC
      LIMIT 10
    `;
    const topAgentsResult = await db.query(topAgentsQuery, [startDate, endDate]);
    analytics.topAgents = topAgentsResult.rows.map(row => ({
      agent_code: row.agent_code,
      agent_name: row.agent_name,
      station_code: row.station_code,
      sales_count: parseInt(row.sales_count) || 0,
      total_amount: parseFloat(row.total_amount) || 0
    }));

    analytics.activeAgents = analytics.topAgents.length;

    // Calculate Juba Point of Sale breakdown
    const jubaQuery = `
      SELECT
        ss.point_of_sale,
        COUNT(ss.id) as sales_count,
        SUM(ss.amount) as total_amount
      FROM station_sales ss
      JOIN stations st ON ss.station_id = st.id
      WHERE st.station_code = 'JUB'
        AND ss.point_of_sale IS NOT NULL
        AND ss.transaction_date >= $1 AND ss.transaction_date <= $2
      GROUP BY ss.point_of_sale
      ORDER BY total_amount DESC
    `;
    const jubaResult = await db.query(jubaQuery, [startDate, endDate]);
    analytics.jubaPointOfSale = jubaResult.rows.map(row => ({
      point_of_sale: row.point_of_sale,
      sales_count: parseInt(row.sales_count) || 0,
      total_amount: parseFloat(row.total_amount) || 0
    }));

    // Calculate average transaction
    if (sales.length > 0) {
      analytics.avgTransaction = analytics.totalRevenue / sales.length;
    }

    // Add HQ Summaries to analytics (same as Station Summary page)
    analytics.hqSummaries = hqSummaries;

    // Generate PDF
    const pdfBuffer = await generateSalesSettlementsReport({
      sales,
      settlements,
      analytics,
      period: 'custom',
      periodLabel
    });

    // Send PDF
    const filename = `sales-settlements-report-${startDate}-to-${endDate}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);

    logger.info(`Sales & Settlements report generated successfully: ${filename}`);

  } catch (error) {
    logger.error('Sales & Settlements report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate sales & settlements report'
    });
  }
};

// Export comprehensive sales and settlements report as Excel
const exportSalesSettlementsExcel = async (req, res) => {
  try {
    const { year, month, start_date, end_date } = req.query;

    let startDate, endDate, periodLabel;
    const now = new Date();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    // Support both date range and year/month parameters
    if (start_date && end_date) {
      // Use provided date range
      startDate = start_date;
      endDate = end_date;

      // Format period label based on date range
      const start = new Date(start_date);
      const end = new Date(end_date);
      if (start_date === end_date) {
        periodLabel = `${start.getDate()} ${months[start.getMonth()]} ${start.getFullYear()}`;
      } else {
        periodLabel = `${start.getDate()} ${months[start.getMonth()]} - ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`;
      }
    } else {
      // Fall back to year/month (backwards compatibility)
      const targetYear = year || now.getFullYear();
      const targetMonth = month || (now.getMonth() + 1);
      startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(targetYear, targetMonth, 0).getDate();
      endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;
      periodLabel = `${months[targetMonth - 1]} ${targetYear}`;
    }

    logger.info(`Generating sales & settlements Excel for ${startDate} to ${endDate}`);

    // Fetch station sales data
    const salesQuery = `
      SELECT
        ss.id,
        ss.sale_reference,
        ss.transaction_date,
        ss.amount,
        ss.currency,
        ss.point_of_sale,
        st.station_code,
        st.station_name,
        sa.agent_code,
        sa.agent_name,
        ss.settlement_id
      FROM station_sales ss
      JOIN stations st ON ss.station_id = st.id
      LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
      WHERE ss.transaction_date >= $1 AND ss.transaction_date <= $2
      ORDER BY ss.transaction_date DESC
    `;

    const salesResult = await db.query(salesQuery, [startDate, endDate]);
    const sales = salesResult.rows;

    // Fetch settlements data with full details
    const settlementsQuery = `
      SELECT
        s.id,
        s.settlement_number,
        s.period_from,
        s.period_to,
        s.status,
        s.approval_type,
        s.approval_notes,
        s.rejection_reason,
        s.submitted_at,
        s.reviewed_at,
        st.station_code,
        st.station_name,
        s.created_at,
        sub_user.name as submitted_by_name,
        rev_user.name as reviewed_by_name
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      LEFT JOIN users sub_user ON s.submitted_by = sub_user.id
      LEFT JOIN users rev_user ON s.reviewed_by = rev_user.id
      WHERE s.period_from <= $2 AND s.period_to >= $1
      ORDER BY s.period_to DESC
    `;

    const settlementsResult = await db.query(settlementsQuery, [startDate, endDate]);
    const settlements = settlementsResult.rows;

    // Fetch settlement summaries for each settlement
    const summariesQuery = `
      SELECT
        sum.settlement_id,
        sum.currency,
        sum.opening_balance,
        sum.expected_cash,
        sum.total_expenses,
        sum.expected_net_cash,
        sum.actual_cash_received,
        sum.final_variance,
        sum.variance_status
      FROM settlement_summaries sum
      JOIN settlements s ON sum.settlement_id = s.id
      WHERE s.period_from <= $2 AND s.period_to >= $1
    `;
    const summariesResult = await db.query(summariesQuery, [startDate, endDate]);

    // Attach summaries to settlements
    settlements.forEach(s => {
      s.summaries = summariesResult.rows.filter(sum => sum.settlement_id === s.id);
    });

    // Calculate analytics (same as PDF)
    const analytics = {
      totalSales: sales.length,
      totalSettlements: settlements.length,
      totalRevenue: sales.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0),
      settlementsApproved: settlements.filter(s => s.status === 'APPROVED').length,
      byCurrency: [],
      byStation: [],
      settlementStatus: {
        draft: settlements.filter(s => s.status === 'DRAFT').length,
        submitted: settlements.filter(s => s.status === 'SUBMITTED').length,
        approved: settlements.filter(s => s.status === 'APPROVED').length,
        rejected: settlements.filter(s => s.status === 'REJECTED').length
      },
      topAgents: [],
      jubaPointOfSale: [],
      activeStations: 0,
      activeAgents: 0,
      avgTransaction: 0
    };

    // Calculate by currency
    const currencyMap = {};
    sales.forEach(s => {
      const curr = s.currency || 'USD';
      if (!currencyMap[curr]) {
        currencyMap[curr] = 0;
      }
      currencyMap[curr] += parseFloat(s.amount || 0);
    });
    analytics.byCurrency = Object.keys(currencyMap).map(currency => ({
      currency,
      total: currencyMap[currency]
    }));

    // Calculate by station
    const stationMapQuery = `
      SELECT
        st.station_code,
        st.station_name,
        COUNT(ss.id) as sales_count,
        SUM(ss.amount) as total_amount,
        COUNT(DISTINCT ss.agent_id) as agent_count
      FROM stations st
      LEFT JOIN station_sales ss ON st.id = ss.station_id
        AND ss.transaction_date >= $1 AND ss.transaction_date <= $2
      GROUP BY st.id, st.station_code, st.station_name
      ORDER BY total_amount DESC NULLS LAST
    `;
    const stationResult = await db.query(stationMapQuery, [startDate, endDate]);
    analytics.byStation = stationResult.rows.map(row => ({
      station_code: row.station_code,
      station_name: row.station_name,
      sales_count: parseInt(row.sales_count) || 0,
      total_amount: parseFloat(row.total_amount) || 0,
      agent_count: parseInt(row.agent_count) || 0
    }));

    analytics.activeStations = analytics.byStation.filter(s => s.sales_count > 0).length;

    // Calculate top agents (consistent with PDF report)
    const topAgentsQuery = `
      SELECT
        sa.agent_code,
        sa.agent_name,
        st.station_code,
        COUNT(ss.id) as sales_count,
        SUM(ss.amount) as total_amount
      FROM sales_agents sa
      LEFT JOIN station_sales ss ON sa.id = ss.agent_id
        AND ss.transaction_date >= $1 AND ss.transaction_date <= $2
      LEFT JOIN stations st ON sa.station_id = st.id
      WHERE ss.id IS NOT NULL
      GROUP BY sa.id, sa.agent_code, sa.agent_name, st.station_code
      ORDER BY total_amount DESC
      LIMIT 10
    `;
    const topAgentsResult = await db.query(topAgentsQuery, [startDate, endDate]);
    analytics.topAgents = topAgentsResult.rows.map(row => ({
      agent_code: row.agent_code,
      agent_name: row.agent_name,
      station_code: row.station_code,
      sales_count: parseInt(row.sales_count) || 0,
      total_amount: parseFloat(row.total_amount) || 0
    }));

    analytics.activeAgents = analytics.topAgents.length;

    // Calculate Juba Point of Sale breakdown
    const jubaQuery = `
      SELECT
        ss.point_of_sale,
        COUNT(ss.id) as sales_count,
        SUM(ss.amount) as total_amount
      FROM station_sales ss
      JOIN stations st ON ss.station_id = st.id
      WHERE st.station_code = 'JUB'
        AND ss.point_of_sale IS NOT NULL
        AND ss.transaction_date >= $1 AND ss.transaction_date <= $2
      GROUP BY ss.point_of_sale
      ORDER BY total_amount DESC
    `;
    const jubaResult = await db.query(jubaQuery, [startDate, endDate]);
    analytics.jubaPointOfSale = jubaResult.rows.map(row => ({
      point_of_sale: row.point_of_sale,
      sales_count: parseInt(row.sales_count) || 0,
      total_amount: parseFloat(row.total_amount) || 0
    }));

    // Calculate average transaction
    if (sales.length > 0) {
      analytics.avgTransaction = analytics.totalRevenue / sales.length;
    }

    // Fetch all settlement expenses for Excel detail
    const expensesQuery = `
      SELECT
        se.id,
        se.settlement_id,
        se.currency,
        se.amount,
        se.description,
        se.created_at,
        s.settlement_number,
        st.station_code,
        ec.code as expense_code,
        ec.name as expense_name,
        u.name as created_by_name
      FROM settlement_expenses se
      JOIN settlements s ON se.settlement_id = s.id
      JOIN stations st ON s.station_id = st.id
      JOIN expense_codes ec ON se.expense_code_id = ec.id
      LEFT JOIN users u ON se.created_by = u.id
      WHERE s.period_from <= $2 AND s.period_to >= $1
      ORDER BY s.settlement_number, se.created_at
    `;
    const expensesResult = await db.query(expensesQuery, [startDate, endDate]);
    analytics.allExpenses = expensesResult.rows;

    // Fetch all agent entries for Excel detail
    const agentEntriesQuery = `
      SELECT
        sae.id,
        sae.settlement_id,
        sae.currency,
        sae.expected_cash,
        sae.declared_cash,
        sae.variance,
        sae.variance_status,
        sae.notes,
        s.settlement_number,
        st.station_code,
        sa.agent_code,
        sa.agent_name
      FROM settlement_agent_entries sae
      JOIN settlements s ON sae.settlement_id = s.id
      JOIN stations st ON s.station_id = st.id
      JOIN sales_agents sa ON sae.agent_id = sa.id
      WHERE s.period_from <= $2 AND s.period_to >= $1
      ORDER BY s.settlement_number, sa.agent_name
    `;
    const agentEntriesResult = await db.query(agentEntriesQuery, [startDate, endDate]);
    analytics.allAgentEntries = agentEntriesResult.rows;

    // Calculate total financial metrics
    let totalExpectedUSD = 0, totalExpectedSSP = 0;
    let totalExpensesUSD = 0, totalExpensesSSP = 0;
    let totalCashReceivedUSD = 0, totalCashReceivedSSP = 0;
    let totalVarianceUSD = 0, totalVarianceSSP = 0;

    settlements.forEach(s => {
      (s.summaries || []).forEach(sum => {
        if (sum.currency === 'USD') {
          totalExpectedUSD += parseFloat(sum.expected_cash || 0);
          totalExpensesUSD += parseFloat(sum.total_expenses || 0);
          totalCashReceivedUSD += parseFloat(sum.actual_cash_received || 0);
          totalVarianceUSD += parseFloat(sum.final_variance || 0);
        } else if (sum.currency === 'SSP') {
          totalExpectedSSP += parseFloat(sum.expected_cash || 0);
          totalExpensesSSP += parseFloat(sum.total_expenses || 0);
          totalCashReceivedSSP += parseFloat(sum.actual_cash_received || 0);
          totalVarianceSSP += parseFloat(sum.final_variance || 0);
        }
      });
    });

    analytics.totalExpectedUSD = totalExpectedUSD;
    analytics.totalExpectedSSP = totalExpectedSSP;
    analytics.totalExpensesUSD = totalExpensesUSD;
    analytics.totalExpensesSSP = totalExpensesSSP;
    analytics.totalCashReceivedUSD = totalCashReceivedUSD;
    analytics.totalCashReceivedSSP = totalCashReceivedSSP;
    analytics.totalVarianceUSD = totalVarianceUSD;
    analytics.totalVarianceSSP = totalVarianceSSP;

    // Generate Excel
    const excelBuffer = await generateSalesSettlementsExcel({
      sales,
      settlements,
      analytics,
      period: 'custom',
      periodLabel
    });

    // Send Excel
    const filename = `sales-settlements-report-${startDate}-to-${endDate}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(excelBuffer);

    logger.info(`Sales & Settlements Excel generated successfully: ${filename}`);

  } catch (error) {
    logger.error('Sales & Settlements Excel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate sales & settlements Excel report'
    });
  }
};

/**
 * Export station-specific settlement report as PDF
 */
const exportStationSettlementReport = async (req, res) => {
  try {
    const { station_id, start_date, end_date } = req.query;

    if (!station_id || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'station_id, start_date, and end_date are required'
      });
    }

    // Get station info
    const stationResult = await db.query(
      'SELECT * FROM stations WHERE id = $1',
      [station_id]
    );

    if (stationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }

    const station = stationResult.rows[0];
    const isJuba = station.station_code === 'JUB';

    // Get sales for this station in date range
    const salesResult = await db.query(
      `SELECT ss.*, sa.agent_name, sa.agent_code, sa.point_of_sale
       FROM station_sales ss
       LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
       WHERE ss.station_id = $1
         AND ss.transaction_date >= $2
         AND ss.transaction_date <= $3
       ORDER BY ss.transaction_date DESC, ss.transaction_time DESC`,
      [station_id, start_date, end_date]
    );

    // Get settlements for this station in date range
    const settlementsResult = await db.query(
      `SELECT s.*,
              (SELECT json_agg(row_to_json(sum)) FROM settlement_summaries sum WHERE sum.settlement_id = s.id) as summaries,
              (SELECT json_agg(row_to_json(exp)) FROM settlement_expenses exp WHERE exp.settlement_id = s.id) as expenses,
              (SELECT json_agg(row_to_json(ae.*) ORDER BY ae.currency)
               FROM (SELECT sae.*, sa.agent_name, sa.agent_code, sa.point_of_sale
                     FROM settlement_agent_entries sae
                     LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
                     WHERE sae.settlement_id = s.id) ae) as agent_entries
       FROM settlements s
       WHERE s.station_id = $1
         AND s.period_from >= $2
         AND s.period_to <= $3
       ORDER BY s.period_from DESC`,
      [station_id, start_date, end_date]
    );

    // Get agents for this station
    const agentsResult = await db.query(
      `SELECT * FROM sales_agents WHERE station_id = $1 AND is_active = true ORDER BY agent_name`,
      [station_id]
    );

    // Calculate totals
    const sales = salesResult.rows;
    const settlements = settlementsResult.rows;
    const agents = agentsResult.rows;

    // Generate period label
    const formatDate = (d) => {
      const date = new Date(d);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    };
    const periodLabel = start_date === end_date
      ? formatDate(start_date)
      : `${formatDate(start_date)} - ${formatDate(end_date)}`;

    // Generate PDF
    const { generateStationSettlementReport } = require('../utils/stationSettlementReportGenerator');
    const pdfBuffer = await generateStationSettlementReport({
      station,
      sales,
      settlements,
      agents,
      periodLabel,
      isJuba
    });

    const filename = `station-settlement-${station.station_code}-${start_date}-to-${end_date}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);

    logger.info(`Station settlement report generated: ${filename}`);

  } catch (error) {
    logger.error('Station settlement report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate station settlement report'
    });
  }
};

module.exports = {
  exportToCSV,
  exportSummaryCSV,
  exportDailySummaryPDF,
  exportMonthlySummaryPDF,
  getCashClosingData,
  exportSalesSettlementsReport,
  exportSalesSettlementsExcel,
  exportStationSettlementReport
};