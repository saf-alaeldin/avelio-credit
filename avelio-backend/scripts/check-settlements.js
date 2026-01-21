// Script to check existing settlements
require('dotenv').config();
const { pool } = require('../src/config/db');

async function checkSettlements() {
  try {
    const result = await pool.query(`
      SELECT id, settlement_number, station_id, period_from, period_to, status
      FROM settlements
      ORDER BY created_at DESC
    `);

    console.log('Existing settlements:');
    if (result.rows.length === 0) {
      console.log('No settlements found in database.');
    } else {
      result.rows.forEach(row => {
        console.log(`- ${row.settlement_number} | Station: ${row.station_id} | Period: ${row.period_from} to ${row.period_to} | Status: ${row.status}`);
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSettlements();
