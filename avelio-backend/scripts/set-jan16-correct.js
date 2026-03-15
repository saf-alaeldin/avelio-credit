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

    // Set Jan 16 USD as user specified
    console.log('=== Setting Jan 16 USD ===\n');
    const usdOpening = 23690;
    const usdCash = 22795;
    const usdExpenses = 4680;
    const usdToSafe = usdCash - usdExpenses; // 18,115
    const usdAvailable = usdOpening + usdCash;

    console.log(`Opening Balance: ${usdOpening}`);
    console.log(`Cash from Stations: ${usdCash}`);
    console.log(`Total Available: ${usdAvailable}`);
    console.log(`HQ Expenses: ${usdExpenses}`);
    console.log(`To Safe: ${usdToSafe}`);
    console.log(`Tomorrow Opening will be: ${usdOpening + usdToSafe}`);

    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = $1,
          cash_from_stations = $2,
          total_available = $3,
          total_hq_expenses = $4,
          safe_amount = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-16')
        AND currency = 'USD'
    `, [usdOpening, usdCash, usdAvailable, usdExpenses, usdToSafe]);

    console.log('✓ USD updated!\n');

    // Get SSP values from today's created settlements
    console.log('=== Setting Jan 16 SSP ===\n');

    // Get SSP cash from stations created today
    const sspCashResult = await client.query(`
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
        AND ss.currency = 'SSP'
    `);
    const sspCash = parseFloat(sspCashResult.rows[0].total_cash);

    // Get SSP expenses
    const sspExpensesResult = await client.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM hq_settlement_expenses hse
      JOIN hq_settlements hs ON hse.hq_settlement_id = hs.id
      WHERE hs.summary_date::date = '2026-01-16'
        AND hse.currency = 'SSP'
    `);
    const sspExpenses = parseFloat(sspExpensesResult.rows[0].total);

    // Get SSP opening from Jan 15 (need to know what it should be)
    const sspOpeningResult = await client.query(`
      SELECT opening_balance, safe_amount
      FROM hq_settlement_summaries
      WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-15')
        AND currency = 'SSP'
    `);

    let sspOpening = 0;
    if (sspOpeningResult.rows.length > 0) {
      // Opening = previous opening + previous to safe
      sspOpening = parseFloat(sspOpeningResult.rows[0].opening_balance || 0) +
                   parseFloat(sspOpeningResult.rows[0].safe_amount || 0);
    }

    const sspToSafe = sspCash - sspExpenses;
    const sspAvailable = sspOpening + sspCash;

    console.log(`Opening Balance: ${sspOpening}`);
    console.log(`Cash from Stations: ${sspCash}`);
    console.log(`Total Available: ${sspAvailable}`);
    console.log(`HQ Expenses: ${sspExpenses}`);
    console.log(`To Safe: ${sspToSafe}`);

    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = $1,
          cash_from_stations = $2,
          total_available = $3,
          total_hq_expenses = $4,
          safe_amount = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-16')
        AND currency = 'SSP'
    `, [sspOpening, sspCash, sspAvailable, sspExpenses, sspToSafe]);

    console.log('✓ SSP updated!');

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
