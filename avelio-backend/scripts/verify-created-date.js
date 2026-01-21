const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

(async () => {
  try {
    // Check settlements by created_at date
    console.log('=== Settlements by CREATED_AT date (USD) ===\n');
    const byCreatedAt = await pool.query(`
      SELECT s.created_at::date as created_date, st.station_name, s.period_to, s.status,
             ss.actual_cash_received, ss.station_declared_cash,
             CASE
               WHEN ss.station_declared_cash IS NOT NULL THEN ss.station_declared_cash
               WHEN ss.actual_cash_received IS NOT NULL AND ss.actual_cash_received > 0 THEN ss.actual_cash_received
               ELSE 0
             END as cash_to_count
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE ss.currency = 'USD'
        AND s.status IN ('SUBMITTED', 'REVIEW')
      ORDER BY s.created_at::date DESC, st.station_name
    `);

    let currentDate = null;
    let dayTotal = 0;
    byCreatedAt.rows.forEach(r => {
      const date = r.created_date.toISOString().split('T')[0];
      if (date !== currentDate) {
        if (currentDate) {
          console.log(`  TOTAL for ${currentDate}: ${dayTotal} USD\n`);
        }
        currentDate = date;
        dayTotal = 0;
        console.log(`=== Created on ${date} ===`);
      }
      const cash = parseFloat(r.cash_to_count);
      dayTotal += cash;
      console.log(`  ${r.station_name} (period: ${r.period_to.toISOString().split('T')[0]}): ${cash} USD`);
    });
    if (currentDate) {
      console.log(`  TOTAL for ${currentDate}: ${dayTotal} USD`);
    }

    // Specifically check Jan 16
    console.log('\n\n=== Cash from Stations for Jan 16 (by created_at) ===');
    const jan16Cash = await pool.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN ss.station_declared_cash IS NOT NULL THEN ss.station_declared_cash
          WHEN ss.actual_cash_received IS NOT NULL AND ss.actual_cash_received > 0 THEN ss.actual_cash_received
          ELSE 0
        END
      ), 0) as total_cash
      FROM settlement_summaries ss
      JOIN settlements s ON ss.settlement_id = s.id
      WHERE s.status IN ('SUBMITTED', 'REVIEW')
        AND s.created_at::date = '2026-01-16'
        AND ss.currency = 'USD'
    `);
    console.log(`Total: ${jan16Cash.rows[0].total_cash} USD`);
    console.log(`Expected: 22,795 USD`);

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
