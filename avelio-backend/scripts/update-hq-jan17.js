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

async function updateHQJan17() {
  const client = await pool.connect();
  try {
    const hqSettlementId = '121483ea-9025-4642-b2ae-82f06957d14e';

    // Get current HQ settlement summary
    const summary = await client.query(`
      SELECT * FROM hq_settlement_summaries WHERE hq_settlement_id = $1
    `, [hqSettlementId]);

    console.log('=== CURRENT HQ SUMMARY ===');
    summary.rows.forEach(r => {
      console.log(`${r.currency}:`);
      console.log(`  total_stations_count: ${r.total_stations_count}`);
      console.log(`  total_station_expected_cash: ${r.total_station_expected_cash}`);
      console.log(`  total_station_actual_cash: ${r.total_station_actual_cash}`);
      console.log(`  cash_from_stations: ${r.cash_from_stations}`);
      console.log(`  opening_balance: ${r.opening_balance}`);
      console.log(`  safe_amount: ${r.safe_amount}`);
      console.log(`  total_available: ${r.total_available}`);
    });

    // Get linked station settlements
    const stationLinks = await client.query(`
      SELECT hs.*, s.settlement_number, st.station_name
      FROM hq_settlement_stations hs
      JOIN settlements s ON hs.station_settlement_id = s.id
      JOIN stations st ON s.station_id = st.id
      WHERE hs.hq_settlement_id = $1
    `, [hqSettlementId]);

    console.log('\n=== LINKED STATION SETTLEMENTS ===');
    console.log('Count:', stationLinks.rows.length);
    stationLinks.rows.forEach(r => console.log(r.station_name, r.settlement_number));

    // Get settlement summaries for linked stations
    if (stationLinks.rows.length > 0) {
      for (const link of stationLinks.rows) {
        const stationSummary = await client.query(`
          SELECT * FROM settlement_summaries WHERE settlement_id = $1
        `, [link.station_settlement_id]);

        console.log(`\n=== ${link.station_name} SETTLEMENT SUMMARIES ===`);
        stationSummary.rows.forEach(r => {
          console.log(`${r.currency}: Expected=${r.expected_cash}, Actual=${r.actual_cash_received}, Variance=${r.final_variance}`);
        });
      }
    }

  } finally {
    client.release();
    pool.end();
  }
}

updateHQJan17().catch(console.error);
