const db = require('../config/db');

// GET DASHBOARD SUMMARY
const getDashboardSummary = async (req, res) => {
  try {
    const user = req.user; // From auth middleware

    // Get today's date in Africa/Juba timezone
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Juba' });

    // Effective date expression: PAID receipts use payment_date, PENDING use issue_date
    const effectiveDateExpr = `(CASE WHEN status = 'PAID' AND payment_date IS NOT NULL THEN payment_date::date ELSE issue_date END)`;

    // Today's receipts (using effective date)
    const todayResult = await db.query(
      `SELECT
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total,
        COUNT(CASE WHEN status = 'PAID' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_count
       FROM receipts
       WHERE ${effectiveDateExpr} = $1 AND is_void = false`,
      [today]
    );

    // Today's PAID receipts (using effective date)
    const paidResult = await db.query(
      `SELECT
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total
       FROM receipts
       WHERE status = 'PAID' AND is_void = false AND ${effectiveDateExpr} = $1`,
      [today]
    );

    // Today's PENDING receipts (using effective date)
    const pendingResult = await db.query(
      `SELECT
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total,
        COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END) as overdue_count
       FROM receipts
       WHERE status = 'PENDING' AND is_void = false AND ${effectiveDateExpr} = $1`,
      [today]
    );

    // This month's totals (use Africa/Juba timezone)
    const jubaToday = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Juba' });
    const monthStartStr = jubaToday.substring(0, 8) + '01';

    const monthResult = await db.query(
      `SELECT 
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total
       FROM receipts 
       WHERE issue_date >= $1 AND is_void = false`,
      [monthStartStr]
    );

    // Top agencies (by total amount)
    const topAgenciesResult = await db.query(
      `SELECT 
        a.agency_name,
        a.agency_id,
        COUNT(r.id) as receipt_count,
        COALESCE(SUM(r.amount), 0) as total_amount
       FROM receipts r
       JOIN agencies a ON r.agency_id = a.id
       WHERE r.is_void = false
       GROUP BY a.id, a.agency_name, a.agency_id
       ORDER BY total_amount DESC
       LIMIT 5`
    );

    res.json({
      success: true,
      data: {
        today: {
          total_amount: parseFloat(todayResult.rows[0].total),
          receipt_count: parseInt(todayResult.rows[0].count),
          paid_count: parseInt(todayResult.rows[0].paid_count),
          pending_count: parseInt(todayResult.rows[0].pending_count)
        },
        paid: {
          total: parseFloat(paidResult.rows[0].total),
          count: parseInt(paidResult.rows[0].count)
        },
        pending: {
          total: parseFloat(pendingResult.rows[0].total),
          count: parseInt(pendingResult.rows[0].count),
          overdue_count: parseInt(pendingResult.rows[0].overdue_count)
        },
        month_to_date: {
          total: parseFloat(monthResult.rows[0].total),
          count: parseInt(monthResult.rows[0].count)
        },
        top_agencies: topAgenciesResult.rows.map(row => ({
          agency_name: row.agency_name,
          agency_id: row.agency_id,
          receipt_count: parseInt(row.receipt_count),
          total_amount: parseFloat(row.total_amount)
        }))
      }
    });

  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard summary.'
    });
  }
};

// GET TODAY'S STATS
const getTodayStats = async (req, res) => {
  try {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Juba' });

    const result = await db.query(
      `SELECT 
        COUNT(*) as total_receipts,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(CASE WHEN status = 'PAID' THEN 1 END) as paid_count,
        COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END), 0) as paid_amount,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_count,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0) as pending_amount
       FROM receipts 
       WHERE issue_date = $1 AND is_void = false`,
      [today]
    );

    const stats = result.rows[0];

    res.json({
      success: true,
      data: {
        date: today,
        total_receipts: parseInt(stats.total_receipts),
        total_amount: parseFloat(stats.total_amount),
        paid: {
          count: parseInt(stats.paid_count),
          amount: parseFloat(stats.paid_amount)
        },
        pending: {
          count: parseInt(stats.pending_count),
          amount: parseFloat(stats.pending_amount)
        }
      }
    });

  } catch (error) {
    console.error('Today stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch today statistics.'
    });
  }
};

// GET PENDING SUMMARY
const getPendingSummary = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        COUNT(*) as total_pending,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END) as overdue_count,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN amount ELSE 0 END), 0) as overdue_amount,
        COUNT(CASE WHEN due_date >= CURRENT_DATE THEN 1 END) as upcoming_count,
        COALESCE(SUM(CASE WHEN due_date >= CURRENT_DATE THEN amount ELSE 0 END), 0) as upcoming_amount
       FROM receipts 
       WHERE status = 'PENDING' AND is_void = false`
    );

    const stats = result.rows[0];

    res.json({
      success: true,
      data: {
        total_pending: parseInt(stats.total_pending),
        total_amount: parseFloat(stats.total_amount),
        overdue: {
          count: parseInt(stats.overdue_count),
          amount: parseFloat(stats.overdue_amount)
        },
        upcoming: {
          count: parseInt(stats.upcoming_count),
          amount: parseFloat(stats.upcoming_amount)
        }
      }
    });

  } catch (error) {
    console.error('Pending summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending summary.'
    });
  }
};

module.exports = {
  getDashboardSummary,
  getTodayStats,
  getPendingSummary
};