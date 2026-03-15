const { Pool, types } = require('pg');
require('dotenv').config();

types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'avelio_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
});

async function checkSettlementDetails() {
  const client = await pool.connect();
  try {
    const settlementId = 'b772d52d-93c4-4bab-9e38-1c057bfd1dde'; // Jan 17 Juba

    // Get settlement
    const settlement = await client.query(`
      SELECT * FROM settlements WHERE id = $1
    `, [settlementId]);
    console.log('=== SETTLEMENT ===');
    console.log(settlement.rows[0]);

    // Get agent entries
    const entries = await client.query(`
      SELECT sae.*, sa.agent_name
      FROM settlement_agent_entries sae
      LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
      WHERE sae.settlement_id = $1
      ORDER BY sa.agent_name
    `, [settlementId]);
    console.log('\n=== AGENT ENTRIES ===');
    entries.rows.forEach(e => {
      console.log(`${e.agent_name} (${e.point_of_sale}) ${e.currency}:`);
      console.log(`  expected_cash: ${e.expected_cash}`);
      console.log(`  declared_cash: ${e.declared_cash}`);
      console.log(`  variance: ${e.variance}`);
    });

    // Get summaries
    const summaries = await client.query(`
      SELECT * FROM settlement_summaries WHERE settlement_id = $1
    `, [settlementId]);
    console.log('\n=== SUMMARIES ===');
    summaries.rows.forEach(s => {
      console.log(`${s.currency}:`);
      console.log(`  opening_balance: ${s.opening_balance}`);
      console.log(`  expected_cash: ${s.expected_cash}`);
      console.log(`  actual_cash_received: ${s.actual_cash_received}`);
      console.log(`  station_declared_cash: ${s.station_declared_cash}`);
      console.log(`  agent_cash_total: ${s.agent_cash_total}`);
      console.log(`  final_variance: ${s.final_variance}`);
    });

    // Get station sales linked to this settlement
    const salesCount = await client.query(`
      SELECT currency, COUNT(*) as count, SUM(sales_amount) as total
      FROM station_sales
      WHERE settlement_id = $1
      GROUP BY currency
    `, [settlementId]);
    console.log('\n=== SALES LINKED ===');
    salesCount.rows.forEach(s => {
      console.log(`${s.currency}: ${s.count} sales, total ${s.total}`);
    });

  } finally {
    client.release();
    pool.end();
  }
}

checkSettlementDetails().catch(console.error);
