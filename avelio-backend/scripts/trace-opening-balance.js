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
    // Trace the full history for USD
    console.log('=== Full USD History ===\n');

    const history = await pool.query(`
      SELECT hs.summary_date, hs.status,
             hss.opening_balance, hss.cash_from_stations, hss.total_available,
             hss.total_hq_expenses, hss.safe_amount
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hss.currency = 'USD'
      ORDER BY hs.summary_date ASC
    `);

    history.rows.forEach(r => {
      const date = r.summary_date.toISOString().split('T')[0];
      console.log(`${date} (${r.status}):`);
      console.log(`  Opening: ${r.opening_balance} + FromStations: ${r.cash_from_stations} = Available: ${r.total_available}`);
      console.log(`  Available: ${r.total_available} - Expenses: ${r.total_hq_expenses} = Safe: ${r.safe_amount}`);
      console.log('');
    });

    // Check what stations contributed each day
    console.log('\n=== Station Contributions by Day (USD) ===\n');
    const stationData = await pool.query(`
      SELECT s.period_to, st.station_name, s.status,
             ss.actual_cash_received, ss.station_declared_cash
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE ss.currency = 'USD'
      ORDER BY s.period_to, st.station_name
    `);

    let currentDate = null;
    let dayTotal = 0;
    stationData.rows.forEach(r => {
      const date = r.period_to.toISOString().split('T')[0];
      if (date !== currentDate) {
        if (currentDate) {
          console.log(`  TOTAL: ${dayTotal}\n`);
        }
        currentDate = date;
        dayTotal = 0;
        console.log(`${date}:`);
      }
      const cash = parseFloat(r.station_declared_cash || r.actual_cash_received || 0);
      dayTotal += cash;
      console.log(`  ${r.station_name} (${r.status}): Actual=${r.actual_cash_received}, StationDeclared=${r.station_declared_cash}`);
    });
    if (currentDate) {
      console.log(`  TOTAL: ${dayTotal}`);
    }

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
