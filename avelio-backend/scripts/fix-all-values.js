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

    // Get IDs for each date
    const jan14Id = '0e0828d7-2bd2-46d4-890b-7d0b6dc97231';
    const jan15Id = '9081d7b3-30fb-41c4-a1e0-bb2f19e122e5';
    const jan16Id = '121483ea-9025-4642-b2ae-82f06957d14e';

    // Jan 14: Set to Opening=0, ToSafe=0 so Jan 15 gets Opening=0
    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = 0, safe_amount = 0, total_available = 0
      WHERE hq_settlement_id = $1
    `, [jan14Id]);
    console.log('Jan 14: Set Opening=0, ToSafe=0');

    // Jan 15: Opening=0 (first day), ToSafe=23,690/8,066,000
    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = 0, safe_amount = 23690, total_available = 23690
      WHERE hq_settlement_id = $1 AND currency = 'USD'
    `, [jan15Id]);

    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = 0, safe_amount = 8066000, total_available = 8066000
      WHERE hq_settlement_id = $1 AND currency = 'SSP'
    `, [jan15Id]);
    console.log('Jan 15: USD Opening=0 ToSafe=23,690 | SSP Opening=0 ToSafe=8,066,000');

    // Jan 16: Opening=23,690/8,066,000 (from Jan 15 ToSafe)
    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = 23690, cash_from_stations = 22795, total_hq_expenses = 4680,
          safe_amount = 18115, total_available = 41805
      WHERE hq_settlement_id = $1 AND currency = 'USD'
    `, [jan16Id]);

    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = 8066000, cash_from_stations = 2630000, total_hq_expenses = 320000,
          safe_amount = 2310000, total_available = 10376000
      WHERE hq_settlement_id = $1 AND currency = 'SSP'
    `, [jan16Id]);
    console.log('Jan 16: USD Opening=23,690 ToSafe=18,115 Available=41,805');
    console.log('Jan 16: SSP Opening=8,066,000 ToSafe=2,310,000 Available=10,376,000');

    await client.query('COMMIT');

    // Verify
    const result = await pool.query(`
      SELECT hs.summary_date, hss.currency, hss.opening_balance, hss.safe_amount, hss.total_available
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      ORDER BY hs.summary_date, hss.currency
    `);

    console.log('\nFinal values:');
    result.rows.forEach(r => {
      const date = r.summary_date.toISOString().split('T')[0];
      console.log(date + ' ' + r.currency + ': Opening=' + parseFloat(r.opening_balance).toLocaleString() +
                  ', ToSafe=' + parseFloat(r.safe_amount).toLocaleString() +
                  ', Available=' + parseFloat(r.total_available).toLocaleString());
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
