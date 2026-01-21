const db = require('../src/config/db');

async function check() {
  try {
    // Get all agents with their POS assignments
    const agents = await db.query(`
      SELECT id, agent_code, agent_name, point_of_sale, is_active
      FROM sales_agents
      ORDER BY point_of_sale, agent_name
    `);

    console.log('=== Agents by Point of Sale ===\n');

    let currentPOS = null;
    agents.rows.forEach(a => {
      if (a.point_of_sale !== currentPOS) {
        currentPOS = a.point_of_sale;
        console.log(`\n📍 ${currentPOS || 'NO POS ASSIGNED'}:`);
      }
      console.log(`   - ${a.agent_code}: ${a.agent_name} (active: ${a.is_active})`);
    });

    // Check how many agents are assigned to each POS
    console.log('\n\n=== Agent Count by POS ===');
    const posCounts = await db.query(`
      SELECT point_of_sale, COUNT(*) as count
      FROM sales_agents
      GROUP BY point_of_sale
      ORDER BY point_of_sale
    `);
    posCounts.rows.forEach(p => {
      console.log(`  ${p.point_of_sale || 'NULL'}: ${p.count} agents`);
    });

    // Specifically check Kushair Traffic
    console.log('\n\n=== Agents at Kushair Traffic ===');
    const kushairAgents = await db.query(`
      SELECT * FROM sales_agents WHERE point_of_sale = 'Kushair Traffic'
    `);
    if (kushairAgents.rows.length === 0) {
      console.log('⚠️  NO AGENTS assigned to Kushair Traffic!');
      console.log('   This is why you cannot add sales - no agent to select!');
    } else {
      kushairAgents.rows.forEach(a => {
        console.log(`  - ${a.agent_code}: ${a.agent_name}`);
      });
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

check();
