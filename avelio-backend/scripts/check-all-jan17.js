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

async function checkAllJan17() {
  const client = await pool.connect();
  try {
    // Get ALL settlements for Jan 17 (any station)
    const settlements = await client.query(`
      SELECT s.*, st.station_name
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE s.period_to = '2026-01-17'
    `);
    console.log('=== ALL SETTLEMENTS FOR JAN 17 ===');
    settlements.rows.forEach(s => {
      console.log(`${s.station_name}: ${s.settlement_number} (${s.status}) ID: ${s.id}`);
    });

    // Get ALL station sales for Jan 17 (any station)
    const salesTotal = await client.query(`
      SELECT st.station_name, ss.currency, COUNT(*) as count, SUM(ss.sales_amount) as total
      FROM station_sales ss
      JOIN stations st ON ss.station_id = st.id
      WHERE ss.transaction_date = '2026-01-17'
      GROUP BY st.station_name, ss.currency
      ORDER BY st.station_name, ss.currency
    `);
    console.log('\n=== ALL SALES FOR JAN 17 ===');
    salesTotal.rows.forEach(s => {
      console.log(`${s.station_name} ${s.currency}: ${s.count} sales, total ${s.total}`);
    });

    // Check for any orphaned settlement entries not linked to a settlement
    const orphaned = await client.query(`
      SELECT sae.*, s.settlement_number
      FROM settlement_agent_entries sae
      LEFT JOIN settlements s ON sae.settlement_id = s.id
      WHERE s.id IS NULL
    `);
    console.log('\n=== ORPHANED ENTRIES ===');
    console.log(`Count: ${orphaned.rows.length}`);

    // Check the Juba settlement summaries calculation
    const jubaSummary = await client.query(`
      SELECT ss.*, s.period_to, s.settlement_number
      FROM settlement_summaries ss
      JOIN settlements s ON ss.settlement_id = s.id
      WHERE s.station_id = '2a05e6c5-30b7-49dc-a4e4-cf947d5233c5'
      AND s.period_to = '2026-01-17'
    `);
    console.log('\n=== JUBA JAN 17 SUMMARIES ===');
    jubaSummary.rows.forEach(r => {
      console.log(`${r.currency}:`);
      console.log(`  opening_balance: ${r.opening_balance}`);
      console.log(`  expected_cash: ${r.expected_cash}`);
      console.log(`  actual_cash_received: ${r.actual_cash_received}`);
      console.log(`  agent_cash_total: ${r.agent_cash_total}`);
      console.log(`  final_variance: ${r.final_variance}`);
    });

    // Calculate what the total SSP value should be for Juba Jan 17
    const jubaSales = await client.query(`
      SELECT SUM(sales_amount) as total
      FROM station_sales
      WHERE station_id = '2a05e6c5-30b7-49dc-a4e4-cf947d5233c5'
      AND transaction_date = '2026-01-17'
      AND currency = 'SSP'
    `);
    console.log('\n=== CALCULATED JUBA SSP TOTAL FOR JAN 17 ===');
    console.log(`Total: ${jubaSales.rows[0].total}`);

  } finally {
    client.release();
    pool.end();
  }
}

checkAllJan17().catch(console.error);
