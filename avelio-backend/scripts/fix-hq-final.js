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

    // Recalculate Jan 15 HQ settlement
    console.log('=== Fixing Jan 15 HQ Settlement (USD) ===\n');

    const jan15HQ = await client.query(`
      SELECT hs.id, hss.hq_settlement_id
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hs.summary_date::date = '2026-01-15' AND hss.currency = 'USD'
    `);

    if (jan15HQ.rows.length > 0) {
      // Get cash from Jan 15 station settlements
      // Juba Jan 15: actual_cash_received = 17,940 (agents declared)
      // Other stations for Jan 15: check station_declared_cash
      const jan15Cash = await client.query(`
        SELECT COALESCE(SUM(
          CASE
            WHEN ss.station_declared_cash IS NOT NULL THEN ss.station_declared_cash
            WHEN ss.actual_cash_received IS NOT NULL AND ss.actual_cash_received > 0 THEN ss.actual_cash_received
            ELSE 0
          END
        ), 0) as total
        FROM settlement_summaries ss
        JOIN settlements s ON ss.settlement_id = s.id
        WHERE s.status IN ('SUBMITTED', 'REVIEW')
          AND s.period_to::date = '2026-01-15'
          AND ss.currency = 'USD'
      `);
      const cashFromStations = parseFloat(jan15Cash.rows[0].total);

      // Get Jan 15 HQ expenses
      const jan15Expenses = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM hq_settlement_expenses hse
        JOIN hq_settlements hs ON hse.hq_settlement_id = hs.id
        WHERE hs.summary_date::date = '2026-01-15' AND hse.currency = 'USD'
      `);
      const expenses = parseFloat(jan15Expenses.rows[0].total);

      // Get opening balance from Jan 14
      const jan14Safe = await client.query(`
        SELECT hss.safe_amount
        FROM hq_settlements hs
        JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
        WHERE hs.summary_date::date = '2026-01-14'
          AND hs.status = 'CLOSED'
          AND hss.currency = 'USD'
      `);
      // Jan 14's safe was calculated with OLD formula, need to recalculate
      // For now, let's check what it should be
      const jan14SafeValue = jan14Safe.rows.length > 0 ? parseFloat(jan14Safe.rows[0].safe_amount) : 0;

      // New formula: safeAmount = cashFromStations - expenses
      const safeAmount = cashFromStations - expenses;
      const openingBalance = jan14SafeValue; // This might also need fixing
      const totalAvailable = openingBalance + cashFromStations;

      console.log(`Jan 15 USD:`);
      console.log(`  Opening Balance: ${openingBalance} (from Jan 14 safe)`);
      console.log(`  Cash from Stations: ${cashFromStations}`);
      console.log(`  Total Available: ${totalAvailable}`);
      console.log(`  Expenses: ${expenses}`);
      console.log(`  Safe Amount (To Safe): ${safeAmount} (= ${cashFromStations} - ${expenses})`);

      // Update Jan 15
      await client.query(`
        UPDATE hq_settlement_summaries
        SET cash_from_stations = $1,
            total_available = $2,
            safe_amount = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-15')
          AND currency = 'USD'
      `, [cashFromStations, totalAvailable, safeAmount]);

      console.log('Jan 15 updated!\n');
    }

    // Recalculate Jan 16 HQ settlement
    console.log('=== Fixing Jan 16 HQ Settlement (USD) ===\n');

    // Get cash from Jan 16 station settlements
    const jan16Cash = await client.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN ss.station_declared_cash IS NOT NULL THEN ss.station_declared_cash
          WHEN ss.actual_cash_received IS NOT NULL AND ss.actual_cash_received > 0 THEN ss.actual_cash_received
          ELSE 0
        END
      ), 0) as total
      FROM settlement_summaries ss
      JOIN settlements s ON ss.settlement_id = s.id
      WHERE s.status IN ('SUBMITTED', 'REVIEW')
        AND s.period_to::date = '2026-01-16'
        AND ss.currency = 'USD'
    `);
    const jan16CashFromStations = parseFloat(jan16Cash.rows[0].total);

    // Get Jan 16 HQ expenses
    const jan16Expenses = await client.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM hq_settlement_expenses hse
      JOIN hq_settlements hs ON hse.hq_settlement_id = hs.id
      WHERE hs.summary_date::date = '2026-01-16' AND hse.currency = 'USD'
    `);
    const jan16ExpensesTotal = parseFloat(jan16Expenses.rows[0].total);

    // Opening balance = Jan 15's safe (which we just recalculated)
    const jan15NewSafe = await client.query(`
      SELECT safe_amount FROM hq_settlement_summaries
      WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-15')
        AND currency = 'USD'
    `);
    const jan16Opening = jan15NewSafe.rows.length > 0 ? parseFloat(jan15NewSafe.rows[0].safe_amount) : 0;

    // New formula
    const jan16Safe = jan16CashFromStations - jan16ExpensesTotal;
    const jan16Available = jan16Opening + jan16CashFromStations;

    console.log(`Jan 16 USD:`);
    console.log(`  Opening Balance: ${jan16Opening} (from Jan 15 safe)`);
    console.log(`  Cash from Stations: ${jan16CashFromStations}`);
    console.log(`  Total Available: ${jan16Available}`);
    console.log(`  Expenses: ${jan16ExpensesTotal}`);
    console.log(`  Safe Amount (To Safe): ${jan16Safe} (= ${jan16CashFromStations} - ${jan16ExpensesTotal})`);

    // Update Jan 16
    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = $1,
          cash_from_stations = $2,
          total_available = $3,
          safe_amount = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-16')
        AND currency = 'USD'
    `, [jan16Opening, jan16CashFromStations, jan16Available, jan16Safe]);

    console.log('Jan 16 updated!\n');

    await client.query('COMMIT');
    console.log('✓ All changes committed!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
