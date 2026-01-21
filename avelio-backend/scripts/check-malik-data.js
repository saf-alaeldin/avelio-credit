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

async function checkMalikData() {
  const client = await pool.connect();
  try {
    // Find Malik agent
    const malik = await client.query(`
      SELECT * FROM sales_agents WHERE agent_name ILIKE '%malik%'
    `);
    console.log('=== MALIK AGENT ===');
    console.log(malik.rows[0]);
    const malikId = malik.rows[0]?.id;

    if (malikId) {
      // Check all Malik's sales
      const sales = await client.query(`
        SELECT ss.*, s.settlement_number
        FROM station_sales ss
        LEFT JOIN settlements s ON ss.settlement_id = s.id
        WHERE ss.agent_id = $1
        ORDER BY ss.transaction_date DESC
      `, [malikId]);
      console.log('\n=== MALIK SALES ===');
      sales.rows.forEach(r => {
        console.log(`${r.transaction_date}: ${r.currency} ${r.sales_amount} (Settlement: ${r.settlement_number || 'None'})`);
      });

      // Check settlement entries for Malik
      const entries = await client.query(`
        SELECT sae.*, s.period_to, s.status
        FROM settlement_agent_entries sae
        JOIN settlements s ON sae.settlement_id = s.id
        WHERE sae.agent_id = $1
        ORDER BY s.period_to DESC
      `, [malikId]);
      console.log('\n=== MALIK SETTLEMENT ENTRIES ===');
      entries.rows.forEach(r => {
        console.log(`${r.period_to} (${r.status}): ${r.currency} Expected=${r.expected_cash} Declared=${r.declared_cash} Variance=${r.variance}`);
      });
    }

    // Check HQ summary for Jan 17 SSP - look for unusual amounts
    const jubaId = '2a05e6c5-30b7-49dc-a4e4-cf947d5233c5';

    // Check settlement_summaries for any value near 68460000
    const largeValues = await client.query(`
      SELECT ss.*, s.period_to, st.station_name
      FROM settlement_summaries ss
      JOIN settlements s ON ss.settlement_id = s.id
      JOIN stations st ON s.station_id = st.id
      WHERE ss.currency = 'SSP'
      AND (ss.expected_cash > 50000000 OR ss.actual_cash_received > 50000000 OR ss.final_variance > 50000000)
    `);
    console.log('\n=== LARGE SSP VALUES IN SETTLEMENT SUMMARIES ===');
    if (largeValues.rows.length === 0) {
      console.log('No values over 50,000,000 SSP found');
    } else {
      largeValues.rows.forEach(r => {
        console.log(`${r.station_name} ${r.period_to}:`);
        console.log(`  expected_cash: ${r.expected_cash}`);
        console.log(`  actual_cash_received: ${r.actual_cash_received}`);
        console.log(`  final_variance: ${r.final_variance}`);
      });
    }

    // Also check station sales totals
    const salesTotals = await client.query(`
      SELECT ss.transaction_date, SUM(ss.sales_amount) as total
      FROM station_sales ss
      WHERE ss.station_id = $1 AND ss.currency = 'SSP'
      GROUP BY ss.transaction_date
      ORDER BY ss.transaction_date DESC
      LIMIT 10
    `, [jubaId]);
    console.log('\n=== JUBA SSP SALES TOTALS BY DATE ===');
    salesTotals.rows.forEach(r => {
      console.log(`${r.transaction_date}: ${r.total}`);
    });

  } finally {
    client.release();
    pool.end();
  }
}

checkMalikData().catch(console.error);
