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

    const currencies = ['USD', 'SSP'];

    for (const currency of currencies) {
      console.log(`\n=== Fixing Jan 16 ${currency} ===\n`);

      // Get cash from stations created TODAY (Jan 16)
      const cashResult = await client.query(`
        SELECT COALESCE(SUM(
          CASE
            WHEN ss.station_declared_cash IS NOT NULL THEN ss.station_declared_cash
            WHEN ss.actual_cash_received > 0 THEN ss.actual_cash_received
            ELSE 0
          END
        ), 0) as total_cash
        FROM settlements s
        JOIN settlement_summaries ss ON s.id = ss.settlement_id
        WHERE s.created_at::date = '2026-01-16'
          AND s.status IN ('SUBMITTED', 'REVIEW')
          AND ss.currency = $1
      `, [currency]);
      const cashFromStations = parseFloat(cashResult.rows[0].total_cash);

      // Get HQ expenses for Jan 16
      const expensesResult = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM hq_settlement_expenses hse
        JOIN hq_settlements hs ON hse.hq_settlement_id = hs.id
        WHERE hs.summary_date::date = '2026-01-16'
          AND hse.currency = $1
      `, [currency]);
      const expenses = parseFloat(expensesResult.rows[0].total);

      // Get opening balance from previous day's safe
      const openingResult = await client.query(`
        SELECT hss.safe_amount
        FROM hq_settlements hs
        JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
        WHERE hs.summary_date::date = '2026-01-15'
          AND hss.currency = $1
      `, [currency]);
      const openingBalance = openingResult.rows.length > 0 ? parseFloat(openingResult.rows[0].safe_amount) : 0;

      // Calculate
      const totalAvailable = openingBalance + cashFromStations;
      const toSafe = cashFromStations - expenses;

      console.log(`Opening Balance: ${openingBalance}`);
      console.log(`Cash from Stations (created today): ${cashFromStations}`);
      console.log(`Total Available: ${totalAvailable}`);
      console.log(`HQ Expenses: ${expenses}`);
      console.log(`To Safe: ${toSafe} (= ${cashFromStations} - ${expenses})`);

      // Update Jan 16 summary
      await client.query(`
        UPDATE hq_settlement_summaries
        SET opening_balance = $1,
            cash_from_stations = $2,
            total_available = $3,
            total_hq_expenses = $4,
            safe_amount = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-16')
          AND currency = $6
      `, [openingBalance, cashFromStations, totalAvailable, expenses, toSafe, currency]);

      console.log(`✓ Jan 16 ${currency} updated!`);
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
