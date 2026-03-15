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
    // Find all settlements
    const settlements = await pool.query(`
      SELECT s.id, s.station_id, st.station_name, s.period_from, s.period_to, s.status, s.created_at
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      ORDER BY s.created_at DESC
      LIMIT 20
    `);

    console.log('=== Recent Settlements ===');
    settlements.rows.forEach(s => {
      console.log(`ID: ${s.id}, Station: ${s.station_name}, Period: ${s.period_from} to ${s.period_to}, Status: ${s.status}`);
    });

    // Find Juba station
    const jubaStation = await pool.query(`
      SELECT * FROM stations WHERE station_name ILIKE '%juba%'
    `);
    console.log('\n=== Juba Station ===');
    console.log(JSON.stringify(jubaStation.rows, null, 2));

    if (jubaStation.rows.length > 0) {
      const stationId = jubaStation.rows[0].id;

      // Check sales for January 15th at Juba
      const sales = await pool.query(`
        SELECT ss.*, sa.agent_name, sa.point_of_sale as agent_pos
        FROM station_sales ss
        LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
        WHERE ss.station_id = $1
        AND ss.transaction_date = '2025-01-15'
        ORDER BY sa.agent_name
      `, [stationId]);
      console.log('\n=== Sales for Jan 15 at Juba (if any) ===');
      console.log(JSON.stringify(sales.rows, null, 2));

      // Check all agents at Juba
      const agents = await pool.query(`
        SELECT * FROM sales_agents WHERE station_id = $1 ORDER BY agent_name
      `, [stationId]);
      console.log('\n=== All Agents at Juba ===');
      agents.rows.forEach(a => {
        console.log(`ID: ${a.id}, Name: ${a.agent_name}, POS: ${a.point_of_sale}`);
      });
    }

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
