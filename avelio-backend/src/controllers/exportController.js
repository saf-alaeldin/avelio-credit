const db = require('../config/db');
const { generateSummaryPDF } = require('../utils/summaryPdfGenerator');
const { generateSalesSettlementsReport } = require('../utils/salesSettlementsReportGenerator');
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
    const filename = `receipts-export-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    console.error('CSV export error:', error);
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

    const filename = `receipts-summary-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    console.error('Summary export error:', error);
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
    console.error('getReceipts error', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
// Export daily summary as PDF
const exportDailySummaryPDF = async (req, res) => {
  try {
    const { date } = req.query;

    // Default to today if no date provided
    const targetDate = date || new Date().toISOString().split('T')[0];

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
    console.error('Daily summary PDF export error:', error);
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
    console.error('Monthly summary PDF export error:', error);
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
      const targetDate = date || new Date().toISOString().split('T')[0];
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
    console.error('Cash closing data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate cash closing data'
    });
  }
};

// Export comprehensive sales and settlements report
const exportSalesSettlementsReport = async (req, res) => {
  try {
    const { year, month, period = 'monthly' } = req.query;

    // Default to current month
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || (now.getMonth() + 1);

    // Calculate date range
    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

    logger.info(`Generating sales & settlements report for ${startDate} to ${endDate}`);

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
        sa.point_of_sale as agent_pos,
        ss.settlement_id
      FROM station_sales ss
      JOIN stations st ON ss.station_id = st.id
      LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
      WHERE ss.transaction_date >= $1 AND ss.transaction_date <= $2
      ORDER BY ss.transaction_date DESC
    `;

    const salesResult = await db.query(salesQuery, [startDate, endDate]);
    const sales = salesResult.rows;

    // Fetch settlements data
    const settlementsQuery = `
      SELECT
        s.id,
        s.settlement_number,
        s.period_from,
        s.period_to,
        s.status,
        st.station_code,
        st.station_name,
        s.created_at,
        COALESCE(SUM(CASE WHEN sum.currency = 'USD' THEN sum.expected_cash ELSE 0 END), 0) as total_sales_usd,
        COALESCE(SUM(CASE WHEN sum.currency = 'SSP' THEN sum.expected_cash ELSE 0 END), 0) as total_sales_ssp
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      LEFT JOIN settlement_summaries sum ON s.id = sum.settlement_id
      WHERE s.period_from <= $2 AND s.period_to >= $1
      GROUP BY s.id, s.settlement_number, s.period_from, s.period_to, s.status, st.station_code, st.station_name, s.created_at
      ORDER BY s.period_to DESC
    `;

    const settlementsResult = await db.query(settlementsQuery, [startDate, endDate]);
    const settlements = settlementsResult.rows;

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

    // Format period label
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const periodLabel = `${months[targetMonth - 1]} ${targetYear}`;

    // Generate PDF
    const pdfBuffer = await generateSalesSettlementsReport({
      sales,
      settlements,
      analytics,
      period,
      periodLabel
    });

    // Send PDF
    const filename = `sales-settlements-report-${targetYear}-${String(targetMonth).padStart(2, '0')}.pdf`;
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

module.exports = {
  exportToCSV,
  exportSummaryCSV,
  exportDailySummaryPDF,
  exportMonthlySummaryPDF,
  getCashClosingData,
  exportSalesSettlementsReport
};