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

    const jan14Id = '0e0828d7-2bd2-46d4-890b-7d0b6dc97231';
    const createdBy = '53e3741b-51ee-4d66-9f6b-33ecabd8b463';

    // Recreate Jan 14 HQ settlement with all required fields
    await client.query(`
      INSERT INTO hq_settlements
      (id, settlement_number, period_from, period_to, status, created_by, summary_date, created_at, updated_at)
      VALUES ($1, 'HQ-STL-20260114-001', '2026-01-14', '2026-01-14', 'CLOSED', $2, '2026-01-14', '2026-01-15', CURRENT_TIMESTAMP)
    `, [jan14Id, createdBy]);
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

    console.log('\n=== All HQ Settlements Restored ===');
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
