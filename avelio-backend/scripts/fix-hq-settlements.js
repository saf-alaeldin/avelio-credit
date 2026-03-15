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

    // Check current Jan 16 expenses
    console.log('=== Current Jan 16 HQ Expenses ===');
    const jan16Expenses = await client.query(`
      SELECT hse.*, ec.name as expense_name
      FROM hq_settlement_expenses hse
      JOIN expense_codes ec ON hse.expense_code_id = ec.id
      JOIN hq_settlements hs ON hse.hq_settlement_id = hs.id
      WHERE hs.summary_date::date = '2026-01-16'
      ORDER BY hse.currency
    `);
    let totalUSD = 0;
    jan16Expenses.rows.forEach(e => {
      console.log(`${e.currency}: ${e.expense_name} = ${e.amount}`);
      if (e.currency === 'USD') totalUSD += parseFloat(e.amount);
    });
    console.log(`Total USD Expenses: ${totalUSD}`);

    // Expected calculation:
    // Opening: 23,690
    // FromStations: 0
    // Expenses: totalUSD
    // Safe: 23,690 - totalUSD
    console.log(`\nExpected Safe (if opening = 23,690): ${23690 - totalUSD}`);
    console.log(`User says To Safe should be: 18,115`);
    console.log(`Implied Expenses: ${23690 - 18115}`);

    // Fix Jan 15 HQ settlement (the one that provides Jan 16's opening)
    console.log('\n\n=== Fixing Jan 15 HQ Settlement ===');

    // Get Jan 15 HQ settlement ID
    const jan15HQ = await client.query(`
      SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-15'
    `);

    if (jan15HQ.rows.length > 0) {
      const jan15Id = jan15HQ.rows[0].id;

      // Jan 15 should have:
      // - Opening: from Jan 14 CLOSED safe (25,410)
      // - FromStations: 0 (Juba didn't declare cash, station_declared_cash = NULL)
      // - Expenses: 1,720
      // - Safe: 25,410 + 0 - 1,720 = 23,690

      // Get Jan 14's safe amount for opening
      const jan14Safe = await client.query(`
        SELECT hss.safe_amount
        FROM hq_settlements hs
        JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
        WHERE hs.summary_date::date = '2026-01-14'
          AND hs.status = 'CLOSED'
          AND hss.currency = 'USD'
      `);
      const openingBalance = jan14Safe.rows.length > 0 ? parseFloat(jan14Safe.rows[0].safe_amount) : 0;
      console.log(`Jan 14 Safe (Jan 15 Opening): ${openingBalance}`);

      // Get Jan 15 expenses
      const jan15Expenses = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM hq_settlement_expenses
        WHERE hq_settlement_id = $1 AND currency = 'USD'
      `, [jan15Id]);
      const expenses = parseFloat(jan15Expenses.rows[0].total);
      console.log(`Jan 15 HQ Expenses: ${expenses}`);

      // Cash from stations should be 0 (Juba's station_declared_cash is NULL)
      const fromStations = 0;
      const totalAvailable = openingBalance + fromStations;
      const safeAmount = totalAvailable - expenses;

      console.log(`\nCorrected Jan 15 values:`);
      console.log(`  Opening: ${openingBalance}`);
      console.log(`  FromStations: ${fromStations}`);
      console.log(`  Available: ${totalAvailable}`);
      console.log(`  Expenses: ${expenses}`);
      console.log(`  Safe: ${safeAmount}`);

      // Update Jan 15 USD summary
      await client.query(`
        UPDATE hq_settlement_summaries
        SET opening_balance = $1,
            cash_from_stations = $2,
            total_available = $3,
            safe_amount = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE hq_settlement_id = $5 AND currency = 'USD'
      `, [openingBalance, fromStations, totalAvailable, safeAmount, jan15Id]);

      console.log('Jan 15 USD summary updated!');
    }

    // Fix Jan 16 HQ settlement
    console.log('\n\n=== Fixing Jan 16 HQ Settlement ===');

    const jan16HQ = await client.query(`
      SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-16'
    `);

    if (jan16HQ.rows.length > 0) {
      const jan16Id = jan16HQ.rows[0].id;

      // Jan 16 should have:
      // - Opening: from corrected Jan 15 safe (23,690)
      // - FromStations: 0 (no stations submitted for Jan 16 yet)
      // - Expenses: current expenses

      const openingBalance = 23690; // From corrected Jan 15 safe
      const fromStations = 0;
      const totalAvailable = openingBalance + fromStations;
      const safeAmount = totalAvailable - totalUSD;

      console.log(`\nCorrected Jan 16 values:`);
      console.log(`  Opening: ${openingBalance}`);
      console.log(`  FromStations: ${fromStations}`);
      console.log(`  Available: ${totalAvailable}`);
      console.log(`  Expenses: ${totalUSD}`);
      console.log(`  Safe: ${safeAmount}`);

      // Update Jan 16 USD summary
      await client.query(`
        UPDATE hq_settlement_summaries
        SET opening_balance = $1,
            cash_from_stations = $2,
            total_available = $3,
            safe_amount = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE hq_settlement_id = $5 AND currency = 'USD'
      `, [openingBalance, fromStations, totalAvailable, safeAmount, jan16Id]);

      console.log('Jan 16 USD summary updated!');
    }

    await client.query('COMMIT');
    console.log('\n✓ All changes committed!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
