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
    // Current Jan 16 SSP values
    console.log('=== Current Jan 16 SSP ===');
    const jan16 = await pool.query(`
      SELECT * FROM hq_settlement_summaries
      WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-16')
      AND currency = 'SSP'
    `);
    if (jan16.rows.length > 0) {
      const r = jan16.rows[0];
      console.log('Opening Balance:', r.opening_balance);
      console.log('Cash from Stations:', r.cash_from_stations);
      console.log('Total Available:', r.total_available);
      console.log('HQ Expenses:', r.total_hq_expenses);
      console.log('To Safe:', r.safe_amount);
    }

    // Check Jan 15 SSP values (to see what opening should be)
    console.log('\n=== Jan 15 SSP (previous day) ===');
    const jan15 = await pool.query(`
      SELECT * FROM hq_settlement_summaries
      WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-15')
      AND currency = 'SSP'
    `);
    if (jan15.rows.length > 0) {
      const p = jan15.rows[0];
      console.log('Opening Balance:', p.opening_balance);
      console.log('Cash from Stations:', p.cash_from_stations);
      console.log('To Safe:', p.safe_amount);
    }

    // Check SSP cash from stations created today
    console.log('\n=== SSP Cash from Stations (created Jan 16) ===');
    const cash = await pool.query(`
      SELECT st.station_name, ss.actual_cash_received, ss.station_declared_cash
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE s.created_at::date = '2026-01-16'
        AND ss.currency = 'SSP'
    `);
    let total = 0;
    cash.rows.forEach(c => {
      const amt = parseFloat(c.station_declared_cash || c.actual_cash_received || 0);
      total += amt;
      console.log(c.station_name + ': ' + amt);
    });
    console.log('Total:', total);

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
