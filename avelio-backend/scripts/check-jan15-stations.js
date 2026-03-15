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
    // Check Jan 15 station settlements
    console.log('=== Jan 15 Station Settlements (USD) ===\n');
    const jan15Stations = await pool.query(`
      SELECT s.id, st.station_name, s.period_from, s.period_to, s.status,
             ss.currency, ss.actual_cash_received, ss.station_declared_cash,
             ss.expected_cash, ss.total_expenses, ss.final_variance
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE s.period_to::date = '2026-01-15'
        AND ss.currency = 'USD'
      ORDER BY st.station_name
    `);

    let total = 0;
    jan15Stations.rows.forEach(r => {
      const cash = parseFloat(r.station_declared_cash || r.actual_cash_received || 0);
      total += cash;
      console.log(`${r.station_name} (${r.status}):`);
      console.log(`  Period: ${r.period_from} to ${r.period_to}`);
      console.log(`  Expected Cash: ${r.expected_cash}`);
      console.log(`  Actual Cash Received: ${r.actual_cash_received}`);
      console.log(`  Station Declared Cash: ${r.station_declared_cash}`);
      console.log(`  Total Expenses: ${r.total_expenses}`);
      console.log(`  Final Variance: ${r.final_variance}`);
      console.log(`  → Cash to HQ: ${cash}`);
      console.log('');
    });
    console.log(`TOTAL from stations: ${total} USD\n`);

    // Check Jan 15 HQ settlement
    console.log('=== Jan 15 HQ Settlement Summary (USD) ===\n');
    const jan15HQ = await pool.query(`
      SELECT hs.summary_date, hs.status,
             hss.opening_balance, hss.cash_from_stations, hss.total_available,
             hss.total_hq_expenses, hss.safe_amount
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hs.summary_date::date = '2026-01-15'
        AND hss.currency = 'USD'
    `);

    if (jan15HQ.rows.length > 0) {
      const r = jan15HQ.rows[0];
      console.log(`Status: ${r.status}`);
      console.log(`Opening Balance: ${r.opening_balance}`);
      console.log(`Cash from Stations: ${r.cash_from_stations}`);
      console.log(`Total Available: ${r.total_available}`);
      console.log(`HQ Expenses: ${r.total_hq_expenses}`);
      console.log(`Safe Amount: ${r.safe_amount}`);

      // What should the correct calculation be?
      console.log('\n--- Correct Calculation ---');
      const correctFromStations = total;
      const correctAvailable = parseFloat(r.opening_balance) + correctFromStations;
      const correctSafe = correctAvailable - parseFloat(r.total_hq_expenses);
      console.log(`Opening: ${r.opening_balance} + FromStations: ${correctFromStations} = Available: ${correctAvailable}`);
      console.log(`Available: ${correctAvailable} - Expenses: ${r.total_hq_expenses} = Safe: ${correctSafe}`);
    } else {
      console.log('No Jan 15 HQ settlement found');
    }

    // Also check what's in the system for Jan 14 (should have been the previous day)
    console.log('\n\n=== Jan 14 HQ Settlement (provides Jan 15 opening) ===\n');
    const jan14HQ = await pool.query(`
      SELECT hs.summary_date, hs.status,
             hss.opening_balance, hss.cash_from_stations, hss.total_available,
             hss.total_hq_expenses, hss.safe_amount
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hs.summary_date::date = '2026-01-14'
        AND hss.currency = 'USD'
    `);

    if (jan14HQ.rows.length > 0) {
      const r = jan14HQ.rows[0];
      console.log(`Status: ${r.status}`);
      console.log(`Safe Amount: ${r.safe_amount} (this becomes Jan 15's opening)`);
    }

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
