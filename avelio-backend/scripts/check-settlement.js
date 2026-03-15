require('dotenv').config();
const { pool } = require('../src/config/db');

async function checkSettlement() {
  try {
    // Check the settlement
    const settlement = await pool.query(`
      SELECT * FROM settlements
      WHERE settlement_number = 'STL-AW1-20260112-001'
    `);
    console.log('Settlement:', JSON.stringify(settlement.rows, null, 2));

    // Check station summaries for this station
    if (settlement.rows.length > 0) {
      const stationId = settlement.rows[0].station_id;

      // Get station info
      const station = await pool.query(`SELECT * FROM stations WHERE id = $1`, [stationId]);
      console.log('\nStation:', JSON.stringify(station.rows, null, 2));

      const summaries = await pool.query(`
        SELECT * FROM station_summaries
        WHERE station_id = $1
        ORDER BY created_at DESC
        LIMIT 5
      `, [stationId]);
      console.log('\nStation Summaries:', JSON.stringify(summaries.rows, null, 2));
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

checkSettlement();
