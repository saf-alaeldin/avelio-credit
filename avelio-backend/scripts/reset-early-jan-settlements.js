/**
 * Reset Jan 1-14 (2026) HQ Settlements to 0
 *
 * These dates had no actual station settlements registered,
 * so all values should be 0.
 */

require('dotenv').config();
const { pool } = require('../src/config/db');

async function resetEarlyJanSettlements() {
  const client = await pool.connect();

  try {
    console.log('=== Resetting Jan 1-14 (2026) HQ Settlements to 0 ===\n');

    await client.query('BEGIN');

    // Find all HQ settlements for Jan 1-14
    const settlements = await client.query(`
      SELECT hs.id, hs.summary_date, hs.status
      FROM hq_settlements hs
      WHERE hs.summary_date >= '2026-01-01' AND hs.summary_date <= '2026-01-14'
      ORDER BY hs.summary_date
    `);

    console.log(`Found ${settlements.rows.length} HQ settlements in Jan 1-14 range\n`);

    if (settlements.rows.length === 0) {
      console.log('No settlements to reset.\n');
      await client.query('COMMIT');
      await pool.end();
      return;
    }

    // Reset each settlement's summaries to 0
    for (const row of settlements.rows) {
      const date = row.summary_date instanceof Date
        ? row.summary_date.toISOString().split('T')[0]
        : row.summary_date;

      console.log(`Resetting ${date} (${row.status})...`);

      // Delete any expenses for this settlement
      const deleteExpenses = await client.query(`
        DELETE FROM hq_settlement_expenses WHERE hq_settlement_id = $1
        RETURNING id
      `, [row.id]);
      if (deleteExpenses.rowCount > 0) {
        console.log(`  Deleted ${deleteExpenses.rowCount} expenses`);
      }

      // Reset all summary values to 0
      await client.query(`
        UPDATE hq_settlement_summaries
        SET opening_balance = 0,
            cash_from_stations = 0,
            total_hq_expenses = 0,
            safe_amount = 0,
            total_available = 0,
            total_stations_count = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE hq_settlement_id = $1
      `, [row.id]);

      // Close the settlement if it's still DRAFT
      if (row.status === 'DRAFT') {
        await client.query(`
          UPDATE hq_settlements SET status = 'CLOSED' WHERE id = $1
        `, [row.id]);
        console.log(`  Closed settlement`);
      }

      console.log(`  All values set to 0`);
    }

    await client.query('COMMIT');

    // Verify
    console.log('\n=== Verification ===\n');
    const verifyResult = await client.query(`
      SELECT hs.summary_date, hs.status, hss.currency,
             hss.opening_balance, hss.cash_from_stations, hss.total_hq_expenses,
             hss.safe_amount, hss.total_available
      FROM hq_settlements hs
      LEFT JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hs.summary_date >= '2026-01-01' AND hs.summary_date <= '2026-01-14'
      ORDER BY hs.summary_date, hss.currency
    `);

    if (verifyResult.rows.length > 0) {
      console.log('Date       | Status | Currency | Opening | Cash | Expenses | ToSafe | Available');
      console.log('-----------|--------|----------|---------|------|----------|--------|----------');
      for (const row of verifyResult.rows) {
        const date = row.summary_date instanceof Date
          ? row.summary_date.toISOString().split('T')[0]
          : row.summary_date;
        console.log(`${date} | ${row.status.padEnd(6)} | ${(row.currency || '-').padEnd(8)} | ${String(row.opening_balance || 0).padStart(7)} | ${String(row.cash_from_stations || 0).padStart(4)} | ${String(row.total_hq_expenses || 0).padStart(8)} | ${String(row.safe_amount || 0).padStart(6)} | ${String(row.total_available || 0).padStart(9)}`);
      }
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

resetEarlyJanSettlements().catch(console.error);
