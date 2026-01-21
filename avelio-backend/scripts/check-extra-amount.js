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

async function checkExtraAmount() {
  const client = await pool.connect();
  try {
    // Search for any value close to 68,460,000
    console.log('=== SEARCHING FOR 68,460,000 SSP ===\n');

    // Check HQ settlement summaries
    const hqSummaries = await client.query(`
      SELECT hs.summary_date, hss.*
      FROM hq_settlement_summaries hss
      JOIN hq_settlements hs ON hss.hq_settlement_id = hs.id
      WHERE hss.currency = 'SSP'
      ORDER BY hs.summary_date DESC
      LIMIT 5
    `);

    console.log('=== RECENT HQ SUMMARIES (SSP) ===');
    hqSummaries.rows.forEach(r => {
      console.log(`Date: ${r.summary_date}`);
      console.log(`  cash_from_stations: ${r.cash_from_stations}`);
      console.log(`  total_available: ${r.total_available}`);
      console.log(`  safe_amount: ${r.safe_amount}`);
      console.log(`  opening_balance: ${r.opening_balance}`);
      console.log('');
    });

    // Check station settlement summaries for Jan 17
    const stationSummaries = await client.query(`
      SELECT s.period_to, st.station_name, ss.*
      FROM settlement_summaries ss
      JOIN settlements s ON ss.settlement_id = s.id
      JOIN stations st ON s.station_id = st.id
      WHERE s.period_to = '2026-01-17'
    `);

    console.log('=== STATION SUMMARIES FOR JAN 17 ===');
    stationSummaries.rows.forEach(r => {
      console.log(`${r.station_name} ${r.currency}:`);
      console.log(`  opening_balance: ${r.opening_balance}`);
      console.log(`  expected_cash: ${r.expected_cash}`);
      console.log(`  actual_cash_received: ${r.actual_cash_received}`);
      console.log(`  final_variance: ${r.final_variance}`);
    });

    // Check if 68460000 exists anywhere in settlement data
    const searchResult = await client.query(`
      SELECT 'settlement_summaries.expected_cash' as location, settlement_id, currency, expected_cash as value
      FROM settlement_summaries WHERE expected_cash = 68460000
      UNION ALL
      SELECT 'settlement_summaries.actual_cash_received', settlement_id, currency, actual_cash_received
      FROM settlement_summaries WHERE actual_cash_received = 68460000
      UNION ALL
      SELECT 'settlement_agent_entries.expected_cash', settlement_id, currency, expected_cash
      FROM settlement_agent_entries WHERE expected_cash = 68460000
      UNION ALL
      SELECT 'settlement_agent_entries.declared_cash', settlement_id, currency, declared_cash
      FROM settlement_agent_entries WHERE declared_cash = 68460000
      UNION ALL
      SELECT 'hq_settlement_summaries.cash_from_stations', hq_settlement_id::text, currency, cash_from_stations
      FROM hq_settlement_summaries WHERE cash_from_stations = 68460000
    `);

    console.log('\n=== SEARCH FOR 68,460,000 VALUE ===');
    if (searchResult.rows.length === 0) {
      console.log('No exact match found for 68,460,000');
    } else {
      console.log(searchResult.rows);
    }

    // Check Malik's sale
    const malik = await client.query(`
      SELECT ss.*, sa.agent_name
      FROM station_sales ss
      JOIN sales_agents sa ON ss.agent_id = sa.id
      WHERE sa.agent_name ILIKE '%malik%'
      ORDER BY ss.transaction_date DESC
    `);

    console.log('\n=== MALIK SALES ===');
    malik.rows.forEach(r => {
      console.log(`${r.transaction_date}: ${r.currency} ${r.sales_amount} (Amount: ${r.amount})`);
    });

  } finally {
    client.release();
    pool.end();
  }
}

checkExtraAmount().catch(console.error);
