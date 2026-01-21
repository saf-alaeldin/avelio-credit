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

    console.log('=== Fixing Jan 15 (First Day) Base Values ===\n');

    // Jan 15 is the FIRST day, so opening = 0
    // The To Safe values should be set so that Jan 16 opens correctly

    // USD: Jan 16 should open with 23,690
    // So Jan 15 should have: opening=0, to_safe=23,690
    const usdOpening = 0;
    const usdToSafe = 23690;

    console.log('USD Jan 15:');
    console.log('  Opening Balance:', usdOpening);
    console.log('  To Safe:', usdToSafe);
    console.log('  (Jan 16 will open with:', usdOpening + usdToSafe, ')');

    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = $1,
          safe_amount = $2,
          total_available = $1 + cash_from_stations,
          updated_at = CURRENT_TIMESTAMP
      WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-15')
        AND currency = 'USD'
    `, [usdOpening, usdToSafe]);

    // SSP: Jan 16 should open with 8,066,000
    // So Jan 15 should have: opening=0, to_safe=8,066,000
    const sspOpening = 0;
    const sspToSafe = 8066000;

    console.log('\nSSP Jan 15:');
    console.log('  Opening Balance:', sspOpening);
    console.log('  To Safe:', sspToSafe.toLocaleString());
    console.log('  (Jan 16 will open with:', (sspOpening + sspToSafe).toLocaleString(), ')');

    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = $1,
          safe_amount = $2,
          total_available = $1 + cash_from_stations,
          updated_at = CURRENT_TIMESTAMP
      WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-15')
        AND currency = 'SSP'
    `, [sspOpening, sspToSafe]);

    await client.query('COMMIT');
    console.log('\n✓ Jan 15 base values fixed!');

    // Now verify Jan 16 will get the right opening
    console.log('\n=== Verification ===');
    const jan15 = await pool.query(`
      SELECT currency, opening_balance, cash_from_stations, total_available, safe_amount
      FROM hq_settlement_summaries
      WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-15')
    `);
    console.log('\nJan 15 values:');
    jan15.rows.forEach(r => {
      console.log(`  ${r.currency}: Opening=${r.opening_balance}, ToSafe=${r.safe_amount}`);
      console.log(`    → Jan 16 Opening will be: ${parseFloat(r.opening_balance) + parseFloat(r.safe_amount)}`);
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
