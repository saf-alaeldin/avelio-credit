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
    // Get the Juba station ID
    const station = await pool.query(`
      SELECT id FROM stations WHERE station_name ILIKE '%juba%'
    `);
    const stationId = station.rows[0].id;

    // Get ALL settlements for Juba
    console.log('=== ALL Juba Settlements ===');
    const allSettlements = await pool.query(`
      SELECT s.id, s.period_from, s.period_to, s.status, s.created_at
      FROM settlements s
      WHERE s.station_id = $1
      ORDER BY s.period_to DESC
    `, [stationId]);

    for (const s of allSettlements.rows) {
      console.log(`\n--- Settlement: ${s.id} ---`);
      console.log(`Period: ${s.period_from} to ${s.period_to}, Status: ${s.status}`);

      const summaries = await pool.query(`
        SELECT * FROM settlement_summaries WHERE settlement_id = $1
      `, [s.id]);

      summaries.rows.forEach(sum => {
        console.log(`  ${sum.currency}: Opening=${sum.opening_balance}, Expected=${sum.expected_cash}, Expenses=${sum.total_expenses}, NetExpected=${sum.expected_net_cash}, Actual=${sum.actual_cash_received}, Variance=${sum.final_variance}`);
      });
    }

    // Also search for 41630 anywhere in settlement_summaries
    console.log('\n\n=== Search for 41630 value ===');
    const search = await pool.query(`
      SELECT ss.*, s.station_id, st.station_name, s.period_from, s.period_to, s.status
      FROM settlement_summaries ss
      JOIN settlements s ON ss.settlement_id = s.id
      JOIN stations st ON s.station_id = st.id
      WHERE ss.opening_balance::numeric BETWEEN 41600 AND 41700
         OR ss.expected_cash::numeric BETWEEN 41600 AND 41700
         OR ss.actual_cash_received::numeric BETWEEN 41600 AND 41700
         OR ss.final_variance::numeric BETWEEN 41600 AND 41700
         OR ss.expected_net_cash::numeric BETWEEN 41600 AND 41700
    `);

    search.rows.forEach(r => {
      console.log(`Station: ${r.station_name}, Period: ${r.period_from} to ${r.period_to}`);
      console.log(`  Currency: ${r.currency}, Opening=${r.opening_balance}, Expected=${r.expected_cash}, Actual=${r.actual_cash_received}, Variance=${r.final_variance}`);
    });

    // Check agent entries for the Jan 15 settlement
    console.log('\n\n=== Agent Entries for Jan 15 Juba Settlement ===');
    const jan15 = allSettlements.rows.find(s => s.period_from && s.period_from.toISOString().includes('2026-01-15'));
    if (jan15) {
      const entries = await pool.query(`
        SELECT sae.*, sa.agent_name, sa.point_of_sale
        FROM settlement_agent_entries sae
        LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
        WHERE sae.settlement_id = $1
        ORDER BY sa.agent_name
      `, [jan15.id]);

      entries.rows.forEach(e => {
        console.log(`Agent: ${e.agent_name || 'N/A'}, POS: ${e.point_of_sale || 'N/A'}, Currency: ${e.currency}, Expected: ${e.expected_cash}, Declared: ${e.declared_cash}`);
      });
    }

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
