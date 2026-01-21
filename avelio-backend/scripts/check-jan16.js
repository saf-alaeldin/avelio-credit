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
    // Get Juba station ID
    const station = await pool.query(`SELECT id FROM stations WHERE station_name ILIKE '%juba%'`);
    const stationId = station.rows[0].id;

    // Check for Jan 16 settlement
    console.log('=== Jan 16 Juba Settlement ===');
    const jan16 = await pool.query(`
      SELECT s.*, st.station_name
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE s.station_id = $1
        AND s.period_from::date = '2026-01-16'
      ORDER BY s.created_at DESC
    `, [stationId]);

    if (jan16.rows.length > 0) {
      const settlementId = jan16.rows[0].id;
      console.log(`Settlement ID: ${settlementId}, Status: ${jan16.rows[0].status}`);

      // Get summaries
      const summaries = await pool.query(`SELECT * FROM settlement_summaries WHERE settlement_id = $1`, [settlementId]);
      console.log('\n=== Summaries ===');
      summaries.rows.forEach(s => {
        console.log(`${s.currency}:`);
        console.log(`  Opening Balance: ${s.opening_balance}`);
        console.log(`  Expected Cash: ${s.expected_cash}`);
        console.log(`  Total Expenses: ${s.total_expenses}`);
        console.log(`  Expected Net Cash: ${s.expected_net_cash}`);
        console.log(`  Actual Cash Received: ${s.actual_cash_received}`);
        console.log(`  Final Variance: ${s.final_variance}`);
        console.log(`  Station Declared Cash: ${s.station_declared_cash}`);
        console.log(`  Opening Balance From: ${s.opening_balance_settlement_id}`);
      });

      // Get agent entries
      console.log('\n=== Agent Entries ===');
      const entries = await pool.query(`
        SELECT sae.*, sa.agent_name
        FROM settlement_agent_entries sae
        LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
        WHERE sae.settlement_id = $1
        ORDER BY sae.currency, sa.agent_name
      `, [settlementId]);
      entries.rows.forEach(e => {
        console.log(`${e.currency} - ${e.agent_name || 'N/A'}: Expected=${e.expected_cash}, Declared=${e.declared_cash}`);
      });

      // Get sales
      console.log('\n=== Sales ===');
      const sales = await pool.query(`
        SELECT ss.*, sa.agent_name
        FROM station_sales ss
        LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
        WHERE ss.settlement_id = $1
        ORDER BY ss.currency, sa.agent_name
      `, [settlementId]);
      sales.rows.forEach(s => {
        console.log(`${s.currency} - ${s.agent_name || 'N/A'}: Sales=${s.sales_amount || s.amount}, Cashout=${s.cashout_amount || 0}`);
      });
    } else {
      console.log('No Jan 16 settlement found for Juba');
    }

    // Check what the opening balance SHOULD be (from previous APPROVED/CLOSED settlements)
    console.log('\n\n=== Previous APPROVED/CLOSED Settlements (for opening balance calculation) ===');
    const previous = await pool.query(`
      SELECT s.id, s.period_from, s.period_to, s.status, ss.currency, ss.final_variance
      FROM settlements s
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE s.station_id = $1
        AND s.status IN ('APPROVED', 'CLOSED')
      ORDER BY s.period_to DESC
      LIMIT 10
    `, [stationId]);

    if (previous.rows.length === 0) {
      console.log('No APPROVED/CLOSED settlements found - opening balance should be 0');
    } else {
      previous.rows.forEach(p => {
        console.log(`${p.period_to} - Status: ${p.status}, ${p.currency}: Final Variance = ${p.final_variance}`);
      });
    }

    // Check ALL settlements status
    console.log('\n\n=== ALL Juba Settlements Status ===');
    const all = await pool.query(`
      SELECT s.id, s.period_from, s.period_to, s.status
      FROM settlements s
      WHERE s.station_id = $1
      ORDER BY s.period_to DESC
    `, [stationId]);
    all.rows.forEach(s => {
      console.log(`${s.period_from} to ${s.period_to}: ${s.status}`);
    });

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
