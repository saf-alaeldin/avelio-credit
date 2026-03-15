const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('=== Setting Correct Jan 16 Values ===\n');

    // USD values
    const usdOpening = 23690;
    const usdCash = 22795;
    const usdExpenses = 4680;
    const usdToSafe = usdCash - usdExpenses; // 18,115
    const usdAvailable = usdOpening + usdCash; // 46,485

    console.log('USD:');
    console.log('  Opening Balance:', usdOpening);
    console.log('  Cash from Stations:', usdCash);
    console.log('  Total Available:', usdAvailable);
    console.log('  HQ Expenses:', usdExpenses);
    console.log('  To Safe:', usdToSafe);

    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = $1,
          cash_from_stations = $2,
          total_available = $3,
          total_hq_expenses = $4,
          safe_amount = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-16')
        AND currency = 'USD'
    `, [usdOpening, usdCash, usdAvailable, usdExpenses, usdToSafe]);

    // SSP values
    const sspOpening = 8066000;
    const sspCash = 2630000;
    const sspExpenses = 320000;
    const sspToSafe = sspCash - sspExpenses; // 2,310,000
    const sspAvailable = sspOpening + sspCash; // 10,696,000

    console.log('\nSSP:');
    console.log('  Opening Balance:', sspOpening.toLocaleString());
    console.log('  Cash from Stations:', sspCash.toLocaleString());
    console.log('  Total Available:', sspAvailable.toLocaleString());
    console.log('  HQ Expenses:', sspExpenses.toLocaleString());
    console.log('  To Safe:', sspToSafe.toLocaleString());

    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = $1,
          cash_from_stations = $2,
          total_available = $3,
          total_hq_expenses = $4,
          safe_amount = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-16')
        AND currency = 'SSP'
    `, [sspOpening, sspCash, sspAvailable, sspExpenses, sspToSafe]);

    await client.query('COMMIT');
    console.log('\n✓ Jan 16 values set correctly!');

    // Show future opening calculations
    console.log('\n=== Jan 17 Opening Balance (Cumulative) ===');
    console.log('USD: ', usdOpening, '+', usdToSafe, '=', usdOpening + usdToSafe);
    console.log('SSP: ', sspOpening.toLocaleString(), '+', sspToSafe.toLocaleString(), '=', (sspOpening + sspToSafe).toLocaleString());

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
