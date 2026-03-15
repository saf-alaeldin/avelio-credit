const db = require('../src/config/db');

async function investigate() {
  try {
    // Check all unique POS values
    const allPOS = await db.query(`
      SELECT DISTINCT point_of_sale FROM station_sales
      WHERE point_of_sale IS NOT NULL
      ORDER BY point_of_sale
    `);
    console.log('=== All Point of Sale Values ===');
    allPOS.rows.forEach(r => console.log(`  - ${r.point_of_sale}`));

    // Check sales for Jan 15 with POS details
    const jan15Sales = await db.query(`
      SELECT ss.id, ss.point_of_sale, ss.currency, ss.sales_amount, ss.settlement_id, sa.agent_name
      FROM station_sales ss
      LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
      WHERE ss.transaction_date = '2026-01-15'
      ORDER BY ss.point_of_sale, sa.agent_name
    `);
    console.log('\n=== Jan 15 Sales with POS ===');
    jan15Sales.rows.forEach(s => {
      console.log(`  POS: ${s.point_of_sale || 'NULL'}, Agent: ${s.agent_name}, ${s.currency}: ${s.sales_amount}, settled: ${s.settlement_id ? 'Yes' : 'No'}`);
    });

    // Check if there's a Kushair Traffic POS
    const kushairPOS = await db.query(`
      SELECT ss.*, sa.agent_name
      FROM station_sales ss
      LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
      WHERE ss.point_of_sale ILIKE '%kushair%'
      ORDER BY ss.transaction_date DESC
      LIMIT 20
    `);
    console.log('\n=== Sales with Kushair POS ===');
    console.log(`Found: ${kushairPOS.rows.length} sales`);
    kushairPOS.rows.forEach(s => {
      console.log(`  Date: ${s.transaction_date}, Agent: ${s.agent_name}, POS: ${s.point_of_sale}, ${s.currency}: ${s.sales_amount}`);
    });

    // Check recent Juba settlements and their structure
    const jubaSettlement = await db.query(`
      SELECT s.*, st.station_code
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE st.station_code = 'JUB'
      ORDER BY s.period_to DESC
      LIMIT 5
    `);
    console.log('\n=== Recent Juba Settlements ===');
    jubaSettlement.rows.forEach(s => {
      console.log(`  Period: ${s.period_from} to ${s.period_to}, Status: ${s.status}, ID: ${s.id}`);
    });

    // If there's a Jan 14 settlement, check its agent settlements
    if (jubaSettlement.rows.length > 0) {
      const settlement = jubaSettlement.rows[0];
      console.log('\n=== Agent Settlements for most recent (Jan 14) ===');
      const agentSettlements = await db.query(`
        SELECT a.*, sa.agent_name, sa.agent_code
        FROM agent_settlements a
        JOIN sales_agents sa ON a.agent_id = sa.id
        WHERE a.settlement_id = $1
        ORDER BY sa.agent_name, a.currency
      `, [settlement.id]);
      agentSettlements.rows.forEach(a => {
        console.log(`  ${a.agent_name}: ${a.currency} - sales=${a.total_sales}, cash_sent=${a.cash_sent}`);
      });
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message, e.stack);
    process.exit(1);
  }
}

investigate();
