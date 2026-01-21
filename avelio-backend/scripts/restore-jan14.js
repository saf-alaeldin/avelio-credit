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

    console.log('=== Restoring Jan 14 HQ Settlement ===\n');

    // Recreate Jan 14 HQ settlement
    const jan14Id = '0e0828d7-2bd2-46d4-890b-7d0b6dc97231';

    await client.query(`
      INSERT INTO hq_settlements (id, summary_date, status, created_at, updated_at)
      VALUES ($1, '2026-01-15', 'CLOSED', '2026-01-15', CURRENT_TIMESTAMP)
    `, [jan14Id]);
    console.log('Restored Jan 14 HQ settlement record');

    // Recreate USD summary
    await client.query(`
      INSERT INTO hq_settlement_summaries
      (hq_settlement_id, currency, opening_balance, cash_from_stations, total_available, total_hq_expenses, safe_amount)
      VALUES ($1, 'USD', 0, 25410, 23690, 1720, 23690)
    `, [jan14Id]);

    // Recreate SSP summary
    await client.query(`
      INSERT INTO hq_settlement_summaries
      (hq_settlement_id, currency, opening_balance, cash_from_stations, total_available, total_hq_expenses, safe_amount)
      VALUES ($1, 'SSP', 0, 18192000, 8066000, 10126000, 8066000)
    `, [jan14Id]);

    console.log('Restored Jan 14 summaries');

    await client.query('COMMIT');

    // Verify
    const result = await pool.query(`
      SELECT hs.summary_date, hs.status, hss.currency, hss.opening_balance,
             hss.cash_from_stations, hss.total_available, hss.safe_amount
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      ORDER BY hs.summary_date, hss.currency
    `);

    console.log('\n=== All HQ Settlements ===');
    result.rows.forEach(r => {
      const date = r.summary_date.toISOString().split('T')[0];
      console.log(`${date} (${r.status}) ${r.currency}: Opening=${parseFloat(r.opening_balance).toLocaleString()}, ToSafe=${parseFloat(r.safe_amount).toLocaleString()}`);
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
