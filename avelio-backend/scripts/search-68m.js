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

async function search68M() {
  const client = await pool.connect();
  try {
    // Search for values containing 6846 or 68460
    const searches = [
      `SELECT 'station_sales.sales_amount' as location, id, sales_amount as value FROM station_sales WHERE CAST(sales_amount AS TEXT) LIKE '%6846%'`,
      `SELECT 'station_sales.amount' as location, id, amount as value FROM station_sales WHERE CAST(amount AS TEXT) LIKE '%6846%'`,
      `SELECT 'settlement_agent_entries.expected_cash' as location, id, expected_cash as value FROM settlement_agent_entries WHERE CAST(expected_cash AS TEXT) LIKE '%6846%'`,
      `SELECT 'settlement_agent_entries.declared_cash' as location, id, declared_cash as value FROM settlement_agent_entries WHERE CAST(declared_cash AS TEXT) LIKE '%6846%'`,
      `SELECT 'settlement_summaries.expected_cash' as location, id, expected_cash as value FROM settlement_summaries WHERE CAST(expected_cash AS TEXT) LIKE '%6846%'`,
      `SELECT 'hq_settlement_summaries.cash_from_stations' as location, id, cash_from_stations as value FROM hq_settlement_summaries WHERE CAST(cash_from_stations AS TEXT) LIKE '%6846%'`,
    ];

    console.log('=== SEARCHING FOR VALUES WITH 6846 ===\n');

    for (const sql of searches) {
      try {
        const result = await client.query(sql);
        if (result.rows.length > 0) {
          console.log(`Found in ${result.rows[0].location}:`);
          result.rows.forEach(r => console.log(`  ID: ${r.id}, Value: ${r.value}`));
          console.log('');
        }
      } catch (err) {
        // ignore errors
      }
    }

    // Also check all numeric columns for exact value 68460000
    const exactSearch = await client.query(`
      SELECT 'station_sales' as tbl, id, 'sales_amount' as col, sales_amount as val FROM station_sales WHERE sales_amount = 68460000
      UNION ALL
      SELECT 'station_sales', id, 'amount', amount FROM station_sales WHERE amount = 68460000
      UNION ALL
      SELECT 'settlement_agent_entries', id, 'expected_cash', expected_cash FROM settlement_agent_entries WHERE expected_cash = 68460000
      UNION ALL
      SELECT 'settlement_agent_entries', id, 'declared_cash', declared_cash FROM settlement_agent_entries WHERE declared_cash = 68460000
      UNION ALL
      SELECT 'settlement_summaries', id, 'expected_cash', expected_cash FROM settlement_summaries WHERE expected_cash = 68460000
    `);

    console.log('=== EXACT MATCH FOR 68,460,000 ===');
    if (exactSearch.rows.length === 0) {
      console.log('No exact match found');
    } else {
      console.log(exactSearch.rows);
    }

    // Check if there might be display issues - look for any SSP values around that range
    const largeSSP = await client.query(`
      SELECT 'station_sales' as tbl, id, transaction_date, sales_amount
      FROM station_sales
      WHERE currency = 'SSP' AND sales_amount >= 50000000
      ORDER BY sales_amount DESC
      LIMIT 10
    `);

    console.log('\n=== LARGE SSP VALUES IN STATION_SALES (>50M) ===');
    if (largeSSP.rows.length === 0) {
      console.log('No values over 50M found');
    } else {
      largeSSP.rows.forEach(r => console.log(`${r.transaction_date}: ${r.sales_amount}`));
    }

  } finally {
    client.release();
    pool.end();
  }
}

search68M().catch(console.error);
