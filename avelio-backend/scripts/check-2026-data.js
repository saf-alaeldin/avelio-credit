require('dotenv').config();
const { pool } = require('../src/config/db');

async function check() {
  // Check HQ settlements for 2026 dates
  console.log('\n=== HQ Settlements for 2026 ===\n');
  const hqResult = await pool.query(`
    SELECT hs.id, hs.settlement_number, hs.summary_date, hs.status,
           hss.currency, hss.opening_balance, hss.cash_from_stations,
           hss.total_hq_expenses, hss.safe_amount, hss.total_available
    FROM hq_settlements hs
    LEFT JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
    WHERE hs.summary_date >= '2026-01-14'
    ORDER BY hs.summary_date, hss.currency
  `);
  console.log('Date | Status | Currency | Opening | Cash | Expenses | ToSafe | Available');
  for (const row of hqResult.rows) {
    const date = row.summary_date instanceof Date ? row.summary_date.toISOString().split('T')[0] : row.summary_date;
    console.log(`${date} | ${row.status} | ${(row.currency || '-').padEnd(3)} | ${String(row.opening_balance || 0).padStart(12)} | ${String(row.cash_from_stations || 0).padStart(12)} | ${String(row.total_hq_expenses || 0).padStart(10)} | ${String(row.safe_amount || 0).padStart(12)} | ${String(row.total_available || 0).padStart(12)}`);
  }

  // Check station settlements by registration date for 2026
  console.log('\n=== Cash from Settlements by Registration Date (2026) ===\n');
  const cashResult = await pool.query(`
    SELECT s.created_at::date as registration_date, ss.currency,
           SUM(CASE
             WHEN ss.station_declared_cash IS NOT NULL THEN ss.station_declared_cash
             WHEN ss.actual_cash_received IS NOT NULL AND ss.actual_cash_received > 0 THEN ss.actual_cash_received
             ELSE 0
           END) as total_cash,
           COUNT(DISTINCT s.id) as count
    FROM settlements s
    JOIN settlement_summaries ss ON s.id = ss.settlement_id
    WHERE s.created_at::date >= '2026-01-14'
      AND s.status IN ('SUBMITTED', 'REVIEW', 'APPROVED', 'APPROVED_WITH_VARIANCE')
    GROUP BY s.created_at::date, ss.currency
    ORDER BY s.created_at::date, ss.currency
  `);
  console.log('Registration | Currency | Total Cash | Count');
  for (const row of cashResult.rows) {
    console.log(`${row.registration_date} | ${row.currency} | ${row.total_cash} | ${row.count}`);
  }

  // Check HQ expenses
  console.log('\n=== HQ Expenses by Date ===\n');
  const expResult = await pool.query(`
    SELECT hs.summary_date, he.currency, SUM(he.amount) as total_expenses
    FROM hq_settlements hs
    JOIN hq_settlement_expenses he ON hs.id = he.hq_settlement_id
    WHERE hs.summary_date >= '2026-01-14'
    GROUP BY hs.summary_date, he.currency
    ORDER BY hs.summary_date, he.currency
  `);
  console.log('Date | Currency | Expenses');
  for (const row of expResult.rows) {
    const date = row.summary_date instanceof Date ? row.summary_date.toISOString().split('T')[0] : row.summary_date;
    console.log(`${date} | ${row.currency} | ${row.total_expenses}`);
  }

  await pool.end();
}

check().catch(console.error);
