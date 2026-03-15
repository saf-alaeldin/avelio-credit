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
    // Check ALL station settlements with declared cash (USD)
    console.log('=== ALL Declared Cash (USD) ===\n');
    const allDeclared = await pool.query(`
      SELECT st.station_name, s.period_to, s.status,
             ss.station_declared_cash, ss.actual_cash_received
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE ss.currency = 'USD'
      ORDER BY s.period_to, st.station_name
    `);

    let totalDeclared = 0;
    let totalActual = 0;
    allDeclared.rows.forEach(r => {
      const declared = parseFloat(r.station_declared_cash || 0);
      const actual = parseFloat(r.actual_cash_received || 0);
      totalDeclared += declared;
      totalActual += actual;
      console.log(`${r.period_to.toISOString().split('T')[0]} - ${r.station_name} (${r.status}): Declared=${r.station_declared_cash || 'NULL'}, Actual=${r.actual_cash_received}`);
    });

    console.log(`\nTotal Declared Cash: ${totalDeclared} USD`);
    console.log(`Total Actual Cash: ${totalActual} USD`);

    // Check what HQ summaries have already accounted for
    console.log('\n\n=== HQ Summaries - Cash Already Accounted ===\n');
    const hqSummaries = await pool.query(`
      SELECT hs.summary_date, hs.status, hss.cash_from_stations
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hss.currency = 'USD'
      ORDER BY hs.summary_date
    `);

    let totalHQCash = 0;
    hqSummaries.rows.forEach(h => {
      const cash = parseFloat(h.cash_from_stations || 0);
      totalHQCash += cash;
      console.log(`${h.summary_date.toISOString().split('T')[0]} (${h.status}): FromStations=${h.cash_from_stations}`);
    });
    console.log(`\nTotal accounted in HQ: ${totalHQCash} USD`);

    // Calculate what's NOT yet accounted for
    console.log(`\nDeclared but not in HQ: ${totalDeclared - totalHQCash} USD`);

    // Expected for today (Jan 16)
    console.log('\n\n=== Expected Jan 16 Values ===');
    console.log('User says:');
    console.log('  Opening: 23,690');
    console.log('  Cash from Stations: 22,795');
    console.log('  HQ Expenses: 4,680');
    console.log('  To Safe: 18,115');
    console.log('\nCalculation: 22,795 - 4,680 = 18,115 ✓');

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
