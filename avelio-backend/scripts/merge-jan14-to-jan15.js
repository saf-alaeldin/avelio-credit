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

    console.log('=== Merging Jan 14 data into Jan 15 ===\n');

    // Get Jan 14 and Jan 15 HQ settlement IDs
    const jan14Id = '0e0828d7-2bd2-46d4-890b-7d0b6dc97231';
    const jan15Id = '9081d7b3-30fb-41c4-a1e0-bb2f19e122e5';
    const jan16Id = '121483ea-9025-4642-b2ae-82f06957d14e';

    // Delete Jan 14 summaries and settlement
    await client.query(`DELETE FROM hq_settlement_summaries WHERE hq_settlement_id = $1`, [jan14Id]);
    await client.query(`DELETE FROM hq_settlement_expenses WHERE hq_settlement_id = $1`, [jan14Id]);
    await client.query(`DELETE FROM hq_settlements WHERE id = $1`, [jan14Id]);
    console.log('Deleted Jan 14 HQ settlement');

    // Set Jan 15 as the first day with Opening = 0
    // User said: To Safe = 23,690 USD, 8,066,000 SSP
    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = 0,
          safe_amount = 23690,
          total_available = 23690
      WHERE hq_settlement_id = $1 AND currency = 'USD'
    `, [jan15Id]);

    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = 0,
          safe_amount = 8066000,
          total_available = 8066000
      WHERE hq_settlement_id = $1 AND currency = 'SSP'
    `, [jan15Id]);
    console.log('Jan 15: Opening=0, ToSafe=23,690 USD / 8,066,000 SSP');

    // Set Jan 16 values
    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = 23690,
          cash_from_stations = 22795,
          total_hq_expenses = 4680,
          safe_amount = 18115,
          total_available = 41805
      WHERE hq_settlement_id = $1 AND currency = 'USD'
    `, [jan16Id]);

    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = 8066000,
          cash_from_stations = 2630000,
          total_hq_expenses = 320000,
          safe_amount = 2310000,
          total_available = 10376000
      WHERE hq_settlement_id = $1 AND currency = 'SSP'
    `, [jan16Id]);
    console.log('Jan 16: Opening=23,690/8,066,000, Available=41,805/10,376,000');

    await client.query('COMMIT');

    // Verify
    const result = await pool.query(`
      SELECT hs.summary_date, hs.status, hss.currency, hss.opening_balance,
             hss.cash_from_stations, hss.total_available, hss.safe_amount
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      ORDER BY hs.summary_date, hss.currency
    `);

    console.log('\n=== Final Values ===');
    result.rows.forEach(r => {
      const date = r.summary_date.toISOString().split('T')[0];
      console.log(`${date} (${r.status}) ${r.currency}:`);
      console.log(`  Opening: ${parseFloat(r.opening_balance).toLocaleString()}`);
      console.log(`  Cash: ${parseFloat(r.cash_from_stations).toLocaleString()}`);
      console.log(`  Available: ${parseFloat(r.total_available).toLocaleString()}`);
      console.log(`  To Safe: ${parseFloat(r.safe_amount).toLocaleString()}`);
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
