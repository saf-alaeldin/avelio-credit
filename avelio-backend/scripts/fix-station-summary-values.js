/**
 * Fix Station Summary Values
 *
 * This script:
 * 1. Resets empty HQ settlements (DRAFT with no cash) to 0 values
 * 2. Sets correct values for Jan 15 and Jan 16 based on user's data
 *
 * Expected Values:
 *
 * USD:
 * | Date   | Opening | Cash from Stations | HQ Expenses | To Safe | Total Available |
 * |--------|---------|-------------------|-------------|---------|-----------------|
 * | Jan 15 | 0       | 25,410            | 1,720       | 23,690  | 23,690          |
 * | Jan 16 | 23,690  | 22,795            | 4,680       | 18,115  | 41,805          |
 *
 * SSP:
 * | Date   | Opening     | Cash from Stations | HQ Expenses  | To Safe    | Total Available |
 * |--------|-------------|-------------------|--------------|------------|-----------------|
 * | Jan 15 | 0           | 18,192,000        | 10,126,000   | 8,066,000  | 8,066,000       |
 * | Jan 16 | 8,066,000   | 2,630,000         | 320,000      | 2,310,000  | 10,376,000      |
 */

require('dotenv').config();
const { pool } = require('../src/config/db');

async function fixStationSummaryValues() {
  const client = await pool.connect();

  try {
    console.log('=== Fixing Station Summary Values ===\n');

    await client.query('BEGIN');

    // Get an admin user ID for creating records
    const adminUser = await client.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    const adminUserId = adminUser.rows.length > 0 ? adminUser.rows[0].id : null;
    console.log(`Using admin user ID: ${adminUserId}\n`);

    // Step 1: Reset empty DRAFT HQ settlements to 0 values
    console.log('Step 1: Resetting empty DRAFT HQ settlements...');
    const resetResult = await client.query(`
      UPDATE hq_settlement_summaries hss
      SET opening_balance = 0,
          cash_from_stations = 0,
          safe_amount = 0,
          total_available = 0,
          total_hq_expenses = 0
      FROM hq_settlements hs
      WHERE hss.hq_settlement_id = hs.id
        AND hs.status = 'DRAFT'
        AND (hss.cash_from_stations IS NULL OR hss.cash_from_stations = 0)
      RETURNING hs.summary_date, hss.currency
    `);
    console.log(`Reset ${resetResult.rowCount} empty summaries\n`);

    // Step 2: Get the HQ settlement IDs for Jan 15 and Jan 16
    console.log('Step 2: Finding HQ settlements for Jan 15 and Jan 16...');

    const jan15Result = await client.query(
      `SELECT id, summary_date, status FROM hq_settlements WHERE summary_date = '2025-01-15'`
    );
    const jan16Result = await client.query(
      `SELECT id, summary_date, status FROM hq_settlements WHERE summary_date = '2025-01-16'`
    );

    if (jan15Result.rows.length === 0) {
      console.log('No HQ settlement found for Jan 15. Creating one...');
      const createResult = await client.query(`
        INSERT INTO hq_settlements (settlement_number, summary_date, period_from, period_to, status, created_by)
        VALUES ('HQ-2025-0115', '2025-01-15', '2025-01-15', '2025-01-15', 'CLOSED', $1)
        RETURNING id
      `, [adminUserId]);
      jan15Result.rows = [{ id: createResult.rows[0].id, summary_date: '2025-01-15', status: 'CLOSED' }];
    }

    if (jan16Result.rows.length === 0) {
      console.log('No HQ settlement found for Jan 16. Creating one...');
      const createResult = await client.query(`
        INSERT INTO hq_settlements (settlement_number, summary_date, period_from, period_to, status, created_by)
        VALUES ('HQ-2025-0116', '2025-01-16', '2025-01-16', '2025-01-16', 'DRAFT', $1)
        RETURNING id
      `, [adminUserId]);
      jan16Result.rows = [{ id: createResult.rows[0].id, summary_date: '2025-01-16', status: 'DRAFT' }];
    }

    const jan15Id = jan15Result.rows[0].id;
    const jan16Id = jan16Result.rows[0].id;

    console.log(`Jan 15 HQ Settlement ID: ${jan15Id} (status: ${jan15Result.rows[0].status})`);
    console.log(`Jan 16 HQ Settlement ID: ${jan16Id} (status: ${jan16Result.rows[0].status})\n`);

    // Step 3: Ensure Jan 15 is CLOSED (for opening balance calculation to work)
    if (jan15Result.rows[0].status !== 'CLOSED') {
      console.log('Closing Jan 15 settlement...');
      await client.query(
        `UPDATE hq_settlements SET status = 'CLOSED' WHERE id = $1`,
        [jan15Id]
      );
    }

    // Step 4: Set correct values for Jan 15 (USD)
    console.log('Step 3: Setting correct values for Jan 15...');

    // Jan 15 USD values
    await client.query(`
      INSERT INTO hq_settlement_summaries
        (hq_settlement_id, currency, opening_balance, cash_from_stations, total_hq_expenses, safe_amount, total_available, total_stations_count)
      VALUES ($1, 'USD', 0, 25410, 1720, 23690, 23690, 0)
      ON CONFLICT (hq_settlement_id, currency)
      DO UPDATE SET
        opening_balance = 0,
        cash_from_stations = 25410,
        total_hq_expenses = 1720,
        safe_amount = 23690,
        total_available = 23690,
        updated_at = CURRENT_TIMESTAMP
    `, [jan15Id]);
    console.log('  USD: Opening=0, Cash=25,410, Expenses=1,720, ToSafe=23,690, Available=23,690');

    // Jan 15 SSP values
    await client.query(`
      INSERT INTO hq_settlement_summaries
        (hq_settlement_id, currency, opening_balance, cash_from_stations, total_hq_expenses, safe_amount, total_available, total_stations_count)
      VALUES ($1, 'SSP', 0, 18192000, 10126000, 8066000, 8066000, 0)
      ON CONFLICT (hq_settlement_id, currency)
      DO UPDATE SET
        opening_balance = 0,
        cash_from_stations = 18192000,
        total_hq_expenses = 10126000,
        safe_amount = 8066000,
        total_available = 8066000,
        updated_at = CURRENT_TIMESTAMP
    `, [jan15Id]);
    console.log('  SSP: Opening=0, Cash=18,192,000, Expenses=10,126,000, ToSafe=8,066,000, Available=8,066,000\n');

    // Step 5: Set correct values for Jan 16
    console.log('Step 4: Setting correct values for Jan 16...');

    // Jan 16 USD values
    await client.query(`
      INSERT INTO hq_settlement_summaries
        (hq_settlement_id, currency, opening_balance, cash_from_stations, total_hq_expenses, safe_amount, total_available, total_stations_count)
      VALUES ($1, 'USD', 23690, 22795, 4680, 18115, 41805, 0)
      ON CONFLICT (hq_settlement_id, currency)
      DO UPDATE SET
        opening_balance = 23690,
        cash_from_stations = 22795,
        total_hq_expenses = 4680,
        safe_amount = 18115,
        total_available = 41805,
        updated_at = CURRENT_TIMESTAMP
    `, [jan16Id]);
    console.log('  USD: Opening=23,690, Cash=22,795, Expenses=4,680, ToSafe=18,115, Available=41,805');

    // Jan 16 SSP values
    await client.query(`
      INSERT INTO hq_settlement_summaries
        (hq_settlement_id, currency, opening_balance, cash_from_stations, total_hq_expenses, safe_amount, total_available, total_stations_count)
      VALUES ($1, 'SSP', 8066000, 2630000, 320000, 2310000, 10376000, 0)
      ON CONFLICT (hq_settlement_id, currency)
      DO UPDATE SET
        opening_balance = 8066000,
        cash_from_stations = 2630000,
        total_hq_expenses = 320000,
        safe_amount = 2310000,
        total_available = 10376000,
        updated_at = CURRENT_TIMESTAMP
    `, [jan16Id]);
    console.log('  SSP: Opening=8,066,000, Cash=2,630,000, Expenses=320,000, ToSafe=2,310,000, Available=10,376,000\n');

    // Step 6: Delete any HQ settlements for dates before Jan 15 (if they exist and are empty)
    console.log('Step 5: Cleaning up empty settlements before Jan 15...');
    const deleteResult = await client.query(`
      DELETE FROM hq_settlements
      WHERE summary_date < '2025-01-15'
        AND status = 'DRAFT'
        AND id NOT IN (
          SELECT DISTINCT hq_settlement_id
          FROM hq_settlement_summaries
          WHERE cash_from_stations > 0
        )
      RETURNING id, summary_date
    `);
    console.log(`Deleted ${deleteResult.rowCount} empty settlements\n`);

    await client.query('COMMIT');

    // Verify the results
    console.log('=== Verification ===\n');

    const verifyResult = await client.query(`
      SELECT hs.summary_date, hs.status, hss.currency,
             hss.opening_balance, hss.cash_from_stations, hss.total_hq_expenses,
             hss.safe_amount, hss.total_available
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hs.summary_date IN ('2025-01-15', '2025-01-16')
      ORDER BY hs.summary_date, hss.currency
    `);

    console.log('Date       | Currency | Opening      | Cash         | Expenses     | To Safe      | Available');
    console.log('-----------+----------+--------------+--------------+--------------+--------------+-------------');
    for (const row of verifyResult.rows) {
      const date = row.summary_date.toISOString().split('T')[0];
      console.log(`${date} | ${row.currency.padEnd(8)} | ${String(row.opening_balance).padStart(12)} | ${String(row.cash_from_stations).padStart(12)} | ${String(row.total_hq_expenses).padStart(12)} | ${String(row.safe_amount).padStart(12)} | ${String(row.total_available).padStart(12)}`);
    }

    console.log('\n=== Done! ===');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixStationSummaryValues().catch(console.error);
