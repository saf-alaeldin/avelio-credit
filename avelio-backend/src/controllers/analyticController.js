const { pool } = require('../config/db');
// Utility: clamp to optional date range
function rangeClause(dateFrom, dateTo) {
  const params = [];
  const where = [];
  if (dateFrom) { params.push(dateFrom); where.push(`issue_date >= $${params.length}`); }
  if (dateTo)   { params.push(dateTo);   where.push(`issue_date <  $${params.length}::date + INTERVAL '1 day'`); }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

exports.getAnalytics = async (req, res) => {
  const client = await pool.connect();
  try {
    const { date_from: dateFrom, date_to: dateTo } = req.query;
    const { where, params } = rangeClause(dateFrom, dateTo);

    // 1) Totals & by status (revenue sums + counts)
    const totalsSQL = `
      WITH base AS (
        SELECT
          COALESCE(amount,0)::numeric AS amount,
          UPPER(COALESCE(status,'UNKNOWN')) AS status,
          issue_date::date                         AS d,
          COALESCE(agency_id::text,'?')           AS agency_id
        FROM receipts
        ${where}
      )
      SELECT
        (SELECT COALESCE(SUM(amount),0) FROM base)                             AS total_revenue,
        (SELECT COUNT(*) FROM base)                                            AS total_receipts,
        (SELECT COALESCE(SUM(amount),0) FROM base WHERE status='PAID')         AS paid_revenue,
        (SELECT COUNT(*) FROM base WHERE status='PAID')                         AS paid_receipts,
        (SELECT COALESCE(SUM(amount),0) FROM base WHERE status='PENDING')      AS pending_revenue,
        (SELECT COUNT(*) FROM base WHERE status='PENDING')                      AS pending_receipts,
        (SELECT COALESCE(SUM(amount),0) FROM base WHERE status='VOID')         AS void_revenue,
        (SELECT COUNT(*) FROM base WHERE status='VOID')                         AS void_receipts
    `;
    const totals = (await client.query(totalsSQL, params)).rows[0];

    // 2) By month (revenue + count)
    const byMonthSQL = `
      SELECT
        to_char(date_trunc('month', issue_date), 'YYYY-MM') AS ym,
        SUM(COALESCE(amount,0))::numeric                    AS revenue,
        COUNT(*)                                            AS count
      FROM receipts
      ${where}
      GROUP BY 1
      ORDER BY 1
    `;
    const byMonthRows = (await client.query(byMonthSQL, params)).rows;

    // 3) By month + status (counts)
    const byMonthStatusSQL = `
      SELECT
        to_char(date_trunc('month', issue_date), 'YYYY-MM') AS ym,
        UPPER(COALESCE(status,'UNKNOWN'))                   AS status,
        COUNT(*)                                            AS count
      FROM receipts
      ${where}
      GROUP BY 1,2
      ORDER BY 1,2
    `;
    const byMonthStatusRows = (await client.query(byMonthStatusSQL, params)).rows;

    // 4) Top agencies (revenue + count). If you have an agencies table, join to get name.
    const topAgenciesSQL = `
      SELECT
        COALESCE(a.agency_name, r.agency_id::text, 'Unknown') AS name,
        COUNT(*)                                                              AS count,
        SUM(COALESCE(r.amount,0))::numeric                                    AS revenue
      FROM receipts r
      LEFT JOIN agencies a ON a.id = r.agency_id
      ${where}
      GROUP BY 1
      ORDER BY revenue DESC
      LIMIT 10
    `;
    const topAgenciesRows = (await client.query(topAgenciesSQL, params)).rows;

    // 5) Payment method breakdown (count + revenue)
    const voidFilter = where ? `${where} AND UPPER(COALESCE(status,'')) != 'VOID'` : `WHERE UPPER(COALESCE(status,'')) != 'VOID'`;
    const byPaymentMethodSQL = `
      SELECT
        COALESCE(payment_method, 'Not Specified') AS method,
        COUNT(*)                                   AS count,
        SUM(COALESCE(amount,0))::numeric           AS revenue
      FROM receipts
      ${voidFilter}
      GROUP BY 1
      ORDER BY revenue DESC
    `;
    const byPaymentMethodRows = (await client.query(byPaymentMethodSQL, params)).rows;

    // 6) Pending aging analysis (bucket counts)
    const pendingFilter = where ? `${where} AND UPPER(COALESCE(status,'')) = 'PENDING'` : `WHERE UPPER(COALESCE(status,'')) = 'PENDING'`;
    const pendingAgingSQL = `
      SELECT
        CASE
          WHEN (CURRENT_DATE - issue_date::date) <= 7  THEN '0-7'
          WHEN (CURRENT_DATE - issue_date::date) <= 14 THEN '8-14'
          WHEN (CURRENT_DATE - issue_date::date) <= 30 THEN '15-30'
          WHEN (CURRENT_DATE - issue_date::date) <= 60 THEN '31-60'
          ELSE '60+'
        END AS bucket,
        COUNT(*) AS count
      FROM receipts
      ${pendingFilter}
      GROUP BY 1
    `;
    const pendingAgingRows = (await client.query(pendingAgingSQL, params)).rows;

    // Build objects shaped exactly like your frontend expects
    const byMonth = {};
    let thisMonthRevenue = 0, lastMonthRevenue = 0, thisMonthReceipts = 0, lastMonthReceipts = 0;

    const jubaToday = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Juba' });
    const thisYM = jubaToday.substring(0, 7); // "YYYY-MM"
    const [thisYear, thisMonth] = thisYM.split('-').map(Number);
    const dLM = new Date(thisYear, thisMonth - 2, 1); // month is 0-indexed
    const lastYM = `${dLM.getFullYear()}-${String(dLM.getMonth()+1).padStart(2,'0')}`;

    byMonthRows.forEach(r => {
      byMonth[r.ym] = { revenue: Number(r.revenue), count: Number(r.count) };
      if (r.ym === thisYM) { thisMonthRevenue = Number(r.revenue); thisMonthReceipts = Number(r.count); }
      if (r.ym === lastYM) { lastMonthRevenue = Number(r.revenue); lastMonthReceipts = Number(r.count); }
    });

    const byMonthStatus = {};
    byMonthStatusRows.forEach(r => {
      if (!byMonthStatus[r.ym]) byMonthStatus[r.ym] = { PAID: 0, PENDING: 0, VOID: 0 };
      byMonthStatus[r.ym][r.status] = Number(r.count);
    });

    const byStatus = {
      PAID:    Number(totals.paid_revenue || 0),
      PENDING: Number(totals.pending_revenue || 0),
      VOID:    Number(totals.void_revenue || 0),
    };

    const averageReceiptValue = Number(totals.total_receipts || 0) > 0
      ? Number(totals.total_revenue || 0) / Number(totals.total_receipts || 1)
      : 0;

    let growthRate = 0;
    if (Number(lastMonthRevenue) > 0) {
      growthRate = ((Number(thisMonthRevenue) - Number(lastMonthRevenue)) / Number(lastMonthRevenue)) * 100;
    }

    const topAgenciesList = topAgenciesRows.map(r => ({
      name: r.name,
      count: Number(r.count),
      revenue: Number(r.revenue),
    }));

    // Build payment method map
    const byPaymentMethod = {};
    byPaymentMethodRows.forEach(r => {
      byPaymentMethod[r.method] = { count: Number(r.count), revenue: Number(r.revenue) };
    });

    // Build pending aging map
    const pendingAging = { '0-7': 0, '8-14': 0, '15-30': 0, '31-60': 0, '60+': 0 };
    pendingAgingRows.forEach(r => {
      if (pendingAging.hasOwnProperty(r.bucket)) {
        pendingAging[r.bucket] = Number(r.count);
      }
    });

    const payload = {
      totalRevenue: Number(totals.total_revenue || 0),
      paidRevenue: Number(totals.paid_revenue || 0),
      pendingRevenue: Number(totals.pending_revenue || 0),
      voidRevenue: Number(totals.void_revenue || 0),
      totalReceipts: Number(totals.total_receipts || 0),
      paidReceipts: Number(totals.paid_receipts || 0),
      pendingReceipts: Number(totals.pending_receipts || 0),
      voidReceipts: Number(totals.void_receipts || 0),
      thisMonthRevenue,
      lastMonthRevenue,
      thisMonthReceipts,
      lastMonthReceipts,
      averageReceiptValue,
      growthRate,
      byStatus,
      byMonth,
      byMonthStatus,
      topAgenciesList,
      byPaymentMethod,
      pendingAging,
    };

    res.json({ status: 'success', data: payload });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to compute analytics' });
  } finally {
    client.release();
  }
};