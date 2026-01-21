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
    // Find settlements for January 15th
    const settlements = await pool.query(`
      SELECT s.id, s.station_id, st.station_name, s.period_from, s.period_to, s.status
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE s.period_from <= '2025-01-15' AND s.period_to >= '2025-01-15'
      ORDER BY st.station_name
    `);

    console.log('=== Settlements for Jan 15 ===');
    console.log(JSON.stringify(settlements.rows, null, 2));

    // For Juba station specifically
    const jubaSettlements = await pool.query(`
      SELECT s.id, s.station_id, st.station_name, s.period_from, s.period_to
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE st.station_name ILIKE '%juba%'
      AND s.period_from <= '2025-01-15' AND s.period_to >= '2025-01-15'
    `);

    if (jubaSettlements.rows.length > 0) {
      const settlementId = jubaSettlements.rows[0].id;
      const stationId = jubaSettlements.rows[0].station_id;
      console.log('\n=== Juba Settlement ID:', settlementId, '===');

      // Current agent entries
      const entries = await pool.query(`
        SELECT sae.*, sa.agent_name
        FROM settlement_agent_entries sae
        JOIN sales_agents sa ON sae.agent_id = sa.id
        WHERE sae.settlement_id = $1
      `, [settlementId]);
      console.log('\n=== Current Agent Entries ===');
      console.log(JSON.stringify(entries.rows, null, 2));

      // Sales for Jan 15 at Juba
      const sales = await pool.query(`
        SELECT ss.*, sa.agent_name, sa.point_of_sale as agent_pos
        FROM station_sales ss
        JOIN sales_agents sa ON ss.agent_id = sa.id
        WHERE ss.station_id = $1
        AND ss.transaction_date = '2025-01-15'
      `, [stationId]);
      console.log('\n=== Sales for Jan 15 at Juba ===');
      console.log(JSON.stringify(sales.rows, null, 2));

      // All agents at Juba station
      const agents = await pool.query(`
        SELECT sa.* FROM sales_agents sa
        JOIN stations st ON sa.station_id = st.id
        WHERE st.station_name ILIKE '%juba%'
        ORDER BY sa.agent_name
      `);
      console.log('\n=== All Agents at Juba ===');
      console.log(JSON.stringify(agents.rows, null, 2));
    } else {
      console.log('No Juba settlement found for Jan 15');
    }

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
