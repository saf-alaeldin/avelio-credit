const db = require('../src/config/db');

async function investigate() {
  try {
    // Get Juba station info
    const juba = await db.query(`SELECT * FROM stations WHERE station_code = 'JUB'`);
    console.log('=== Juba Station ===');
    console.log(juba.rows[0]);

    // Get Kushair Traffic agent
    const kushair = await db.query(`SELECT * FROM sales_agents WHERE agent_name ILIKE '%kushair%'`);
    console.log('\n=== Kushair Traffic Agent ===');
    console.log(kushair.rows);

    // Get settlement for Jan 15 Juba
    const settlement = await db.query(`
      SELECT s.*, st.station_code, st.station_name
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE st.station_code = 'JUB' AND s.period_to = '2026-01-15'
    `);
    console.log('\n=== Jan 15 Juba Settlement ===');
    if (settlement.rows.length > 0) {
      const s = settlement.rows[0];
      console.log(`ID: ${s.id}, Status: ${s.status}, Period: ${s.period_from} to ${s.period_to}`);
    } else {
      console.log('No settlement found');
    }

    if (settlement.rows.length > 0) {
      const settlementId = settlement.rows[0].id;

      // Get settlement summaries
      const summaries = await db.query(`
        SELECT * FROM settlement_summaries WHERE settlement_id = $1
      `, [settlementId]);
      console.log('\n=== Settlement Summaries ===');
      summaries.rows.forEach(r => {
        console.log(`Currency: ${r.currency}`);
        console.log(`  station_declared_cash: ${r.station_declared_cash}`);
        console.log(`  actual_cash_received: ${r.actual_cash_received}`);
        console.log(`  total_sales: ${r.total_sales}`);
        console.log(`  total_expenses: ${r.total_expenses}`);
      });

      // Get agent settlements for this settlement
      const agentSettlements = await db.query(`
        SELECT as2.*, sa.agent_name, sa.agent_code
        FROM agent_settlements as2
        JOIN sales_agents sa ON as2.agent_id = sa.id
        WHERE as2.settlement_id = $1
        ORDER BY sa.agent_name, as2.currency
      `, [settlementId]);
      console.log('\n=== Agent Settlements ===');
      agentSettlements.rows.forEach(r => {
        console.log(`${r.agent_name} (${r.agent_code}) - ${r.currency}:`);
        console.log(`  total_sales: ${r.total_sales}, cash_sent: ${r.cash_sent}`);
      });

      // Check for sales linked to this settlement
      const sales = await db.query(`
        SELECT ss.*, sa.agent_name
        FROM station_sales ss
        LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
        WHERE ss.settlement_id = $1
        ORDER BY sa.agent_name, ss.currency
      `, [settlementId]);
      console.log('\n=== Sales in this Settlement ===');
      console.log(`Total sales records: ${sales.rows.length}`);

      // Group by agent
      const byAgent = {};
      sales.rows.forEach(s => {
        const key = `${s.agent_name || 'No Agent'} - ${s.currency}`;
        if (!byAgent[key]) byAgent[key] = { count: 0, total: 0 };
        byAgent[key].count++;
        byAgent[key].total += parseFloat(s.sales_amount || s.amount || 0);
      });
      Object.entries(byAgent).forEach(([k, v]) => {
        console.log(`  ${k}: ${v.count} sales, total: ${v.total}`);
      });
    }

    // Check if Kushair has any sales for Jan 15
    const kushairSales = await db.query(`
      SELECT ss.*, sa.agent_name
      FROM station_sales ss
      JOIN sales_agents sa ON ss.agent_id = sa.id
      WHERE sa.agent_name ILIKE '%kushair%'
        AND ss.transaction_date = '2026-01-15'
    `);
    console.log('\n=== Kushair Sales for Jan 15 ===');
    console.log(`Found: ${kushairSales.rows.length} sales`);
    kushairSales.rows.forEach(s => {
      console.log(`  ${s.sale_reference} - ${s.currency} - ${s.sales_amount} - settlement_id: ${s.settlement_id}`);
    });

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message, e.stack);
    process.exit(1);
  }
}

investigate();
