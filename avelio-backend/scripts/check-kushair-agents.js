const db = require('../src/config/db');

async function check() {
  try {
    // Get Juba station ID
    const juba = await db.query(`SELECT id FROM stations WHERE station_code = 'JUB'`);
    const jubaId = juba.rows[0]?.id;
    console.log('Juba Station ID:', jubaId);

    // Get Kushair Traffic agents with station_id
    const kushairAgents = await db.query(`
      SELECT sa.*, s.station_code
      FROM sales_agents sa
      LEFT JOIN stations s ON sa.station_id = s.id
      WHERE sa.point_of_sale = 'Kushair Traffic'
    `);

    console.log('\n=== Kushair Traffic Agents ===');
    kushairAgents.rows.forEach(a => {
      console.log(`  ${a.agent_code}: ${a.agent_name}`);
      console.log(`    station_id: ${a.station_id}`);
      console.log(`    station_code: ${a.station_code || 'NULL'}`);
      console.log(`    is_active: ${a.is_active}`);
      console.log(`    point_of_sale: ${a.point_of_sale}`);
      console.log('');
    });

    // Check if station_id is correctly set
    const missingStation = kushairAgents.rows.filter(a => a.station_id !== jubaId);
    if (missingStation.length > 0) {
      console.log('⚠️  WARNING: These agents are NOT assigned to Juba station!');
      missingStation.forEach(a => console.log(`  - ${a.agent_name}: station_id=${a.station_id}`));
    }

    // Simulate the query from the frontend
    console.log('\n=== Simulating Frontend Query ===');
    const frontendQuery = await db.query(`
      SELECT sa.*, s.station_code, s.station_name
      FROM sales_agents sa
      LEFT JOIN stations s ON sa.station_id = s.id
      WHERE sa.station_id = $1 AND sa.point_of_sale = $2 AND sa.is_active = true
      ORDER BY s.station_code ASC, sa.point_of_sale ASC, sa.agent_name ASC
    `, [jubaId, 'Kushair Traffic']);

    console.log(`Query: station_id=${jubaId}, point_of_sale='Kushair Traffic'`);
    console.log(`Results: ${frontendQuery.rows.length} agents`);
    frontendQuery.rows.forEach(a => {
      console.log(`  - ${a.agent_code}: ${a.agent_name}`);
    });

    if (frontendQuery.rows.length === 0) {
      console.log('\n❌ NO AGENTS RETURNED! This is why the dropdown is empty!');
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

check();
