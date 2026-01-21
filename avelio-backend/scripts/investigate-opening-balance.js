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
    // Get the most recent Juba settlement
    const jubaSettlement = await pool.query(`
      SELECT s.*, st.station_name
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE st.station_name ILIKE '%juba%'
      ORDER BY s.period_to DESC
      LIMIT 5
    `);

    console.log('=== Recent Juba Settlements ===');
    jubaSettlement.rows.forEach(s => {
      console.log(`ID: ${s.id}, Period: ${s.period_from} to ${s.period_to}, Status: ${s.status}`);
    });

    if (jubaSettlement.rows.length > 0) {
      const settlementId = jubaSettlement.rows[0].id;
      const stationId = jubaSettlement.rows[0].station_id;
      const periodFrom = jubaSettlement.rows[0].period_from;

      console.log('\n=== Current Settlement Summaries ===');
      const summaries = await pool.query(`
        SELECT * FROM settlement_summaries WHERE settlement_id = $1
      `, [settlementId]);
      summaries.rows.forEach(s => {
        console.log(`Currency: ${s.currency}`);
        console.log(`  Opening Balance: ${s.opening_balance}`);
        console.log(`  Expected Cash: ${s.expected_cash}`);
        console.log(`  Total Expenses: ${s.total_expenses}`);
        console.log(`  Expected Net Cash: ${s.expected_net_cash}`);
        console.log(`  Actual Cash Received: ${s.actual_cash_received}`);
        console.log(`  Final Variance: ${s.final_variance}`);
        console.log(`  Station Declared Cash: ${s.station_declared_cash}`);
        console.log(`  From Settlement ID: ${s.opening_balance_settlement_id}`);
      });

      // Find the previous APPROVED/CLOSED settlement used for opening balance
      console.log('\n=== Previous APPROVED/CLOSED Settlements for Opening Balance ===');
      const previous = await pool.query(`
        SELECT s.id, s.period_from, s.period_to, s.status, ss.currency, ss.final_variance
        FROM settlements s
        JOIN settlement_summaries ss ON s.id = ss.settlement_id
        WHERE s.station_id = $1
          AND s.status IN ('APPROVED', 'CLOSED')
          AND s.period_to < $2
        ORDER BY s.period_to DESC
        LIMIT 10
      `, [stationId, periodFrom]);

      previous.rows.forEach(p => {
        console.log(`Settlement: ${p.id}, Period: ${p.period_from} to ${p.period_to}, Status: ${p.status}, Currency: ${p.currency}, Final Variance: ${p.final_variance}`);
      });

      // Check if there's a settlement with final_variance = 41630
      console.log('\n=== Settlement with final_variance around 41630 ===');
      const target = await pool.query(`
        SELECT s.id, s.period_from, s.period_to, s.status, ss.currency, ss.final_variance, ss.opening_balance, ss.expected_cash, ss.actual_cash_received
        FROM settlements s
        JOIN settlement_summaries ss ON s.id = ss.settlement_id
        WHERE s.station_id = $1
          AND (ss.final_variance BETWEEN 41600 AND 41700 OR ss.opening_balance BETWEEN 41600 AND 41700)
        ORDER BY s.period_to DESC
      `, [stationId]);

      target.rows.forEach(t => {
        console.log(`Settlement: ${t.id}, Period: ${t.period_from} to ${t.period_to}, Status: ${t.status}`);
        console.log(`  Currency: ${t.currency}, Opening: ${t.opening_balance}, Expected: ${t.expected_cash}, Actual: ${t.actual_cash_received}, Final Variance: ${t.final_variance}`);
      });
    }

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
