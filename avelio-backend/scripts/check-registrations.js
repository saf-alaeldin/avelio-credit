require('dotenv').config();
const { pool } = require('../src/config/db');

async function check() {
  // Check all HQ settlements
  console.log('\n=== All HQ Settlements ===\n');
  const hqResult = await pool.query(`
    SELECT id, settlement_number, summary_date, status, created_at
    FROM hq_settlements
    ORDER BY summary_date
  `);
  console.log('ID | Number | Date | Status | Created At');
  for (const row of hqResult.rows) {
    const date = row.summary_date instanceof Date ? row.summary_date.toISOString().split('T')[0] : row.summary_date;
    console.log(`${row.id.substring(0,8)}... | ${row.settlement_number} | ${date} | ${row.status} | ${row.created_at}`);
  }

  // Check station settlements and their registration dates
  console.log('\n=== Station Settlements by Registration Date ===\n');
  const stationResult = await pool.query(`
    SELECT s.id, s.settlement_number, st.station_name,
           s.period_to, s.created_at::date as registration_date,
           s.status
    FROM settlements s
    JOIN stations st ON s.station_id = st.id
    WHERE s.created_at::date IN ('2025-01-15', '2025-01-16')
    ORDER BY s.created_at::date, st.station_name
  `);
  console.log('Station | Period | Registration | Status');
  for (const row of stationResult.rows) {
    const period = row.period_to instanceof Date ? row.period_to.toISOString().split('T')[0] : row.period_to;
    console.log(`${row.station_name.substring(0,15).padEnd(15)} | ${period} | ${row.registration_date} | ${row.status}`);
  }

  // Check the cash values for these settlements
  console.log('\n=== Cash from Settlements by Registration Date ===\n');
  const cashResult = await pool.query(`
    SELECT s.created_at::date as registration_date, ss.currency,
           SUM(COALESCE(ss.station_declared_cash, ss.actual_cash_received, 0)) as total_cash,
           COUNT(DISTINCT s.id) as count
    FROM settlements s
    JOIN settlement_summaries ss ON s.id = ss.settlement_id
    WHERE s.created_at::date IN ('2025-01-15', '2025-01-16')
      AND s.status IN ('SUBMITTED', 'REVIEW', 'APPROVED', 'APPROVED_WITH_VARIANCE')
    GROUP BY s.created_at::date, ss.currency
    ORDER BY s.created_at::date, ss.currency
  `);
  console.log('Date | Currency | Total Cash | Count');
  for (const row of cashResult.rows) {
    console.log(`${row.registration_date} | ${row.currency} | ${row.total_cash} | ${row.count}`);
  }

  await pool.end();
}

check().catch(console.error);
