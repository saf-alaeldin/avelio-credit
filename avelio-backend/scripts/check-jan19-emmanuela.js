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

async function checkJan19Emmanuela() {
  const client = await pool.connect();
  try {
    // Find the Jan 19 settlement
    const settlement = await client.query(`
      SELECT * FROM settlements
      WHERE settlement_number = 'STL-JUB-20260119-001'
    `);
    console.log('=== SETTLEMENT STL-JUB-20260119-001 ===');
    console.log(settlement.rows[0]);
    const settlementId = settlement.rows[0]?.id;

    if (!settlementId) {
      console.log('Settlement not found!');
      return;
    }

    // Find Emmanuela agent
    const emmanuela = await client.query(`
      SELECT * FROM sales_agents WHERE agent_name ILIKE '%emmanuela%'
    `);
    console.log('\n=== EMMANUELA AGENT ===');
    console.log(emmanuela.rows[0]);
    const emmanuelaId = emmanuela.rows[0]?.id;

    // Check all agent entries for this settlement
    const entries = await client.query(`
      SELECT sae.*, sa.agent_name, sa.point_of_sale
      FROM settlement_agent_entries sae
      LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
      WHERE sae.settlement_id = $1
      ORDER BY sa.agent_name, sae.currency
    `, [settlementId]);
    console.log('\n=== ALL AGENT ENTRIES FOR JAN 19 ===');
    entries.rows.forEach(e => {
      console.log(`${e.agent_name} (${e.point_of_sale}) ${e.currency}:`);
      console.log(`  expected_cash: ${e.expected_cash}`);
      console.log(`  declared_cash: ${e.declared_cash}`);
      console.log(`  variance: ${e.variance}`);
    });

    // Check Emmanuela's specific entries
    const emmanuelaEntries = await client.query(`
      SELECT sae.*, sa.agent_name
      FROM settlement_agent_entries sae
      LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
      WHERE sae.settlement_id = $1 AND sae.agent_id = $2
      ORDER BY sae.currency
    `, [settlementId, emmanuelaId]);
    console.log('\n=== EMMANUELA ENTRIES FOR JAN 19 ===');
    emmanuelaEntries.rows.forEach(e => {
      console.log(`${e.currency}: expected=${e.expected_cash}, declared=${e.declared_cash}, variance=${e.variance}`);
    });

    // Check Emmanuela's sales for Jan 19
    const emmanuelaSales = await client.query(`
      SELECT ss.*, sa.agent_name
      FROM station_sales ss
      LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
      WHERE ss.agent_id = $1 AND ss.transaction_date = '2026-01-19'
      ORDER BY ss.currency
    `, [emmanuelaId]);
    console.log('\n=== EMMANUELA SALES FOR JAN 19 ===');
    emmanuelaSales.rows.forEach(s => {
      console.log(`${s.currency}: amount=${s.amount}, sales_amount=${s.sales_amount}, cashout=${s.cashout_amount}`);
    });

    // Check settlement summaries
    const summaries = await client.query(`
      SELECT * FROM settlement_summaries WHERE settlement_id = $1
    `, [settlementId]);
    console.log('\n=== SETTLEMENT SUMMARIES ===');
    summaries.rows.forEach(s => {
      console.log(`${s.currency}:`);
      console.log(`  expected_cash: ${s.expected_cash}`);
      console.log(`  actual_cash_received: ${s.actual_cash_received}`);
      console.log(`  agent_cash_total: ${s.agent_cash_total}`);
      console.log(`  station_declared_cash: ${s.station_declared_cash}`);
    });

  } finally {
    client.release();
    pool.end();
  }
}

checkJan19Emmanuela().catch(console.error);
