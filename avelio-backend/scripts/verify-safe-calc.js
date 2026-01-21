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
  try {
    // Get today's (Jan 16) HQ settlement summary
    console.log('=== Jan 16 HQ Settlement Summary ===');
    const jan16 = await pool.query(`
      SELECT hs.id, hs.summary_date, hs.status,
             hss.currency, hss.opening_balance, hss.cash_from_stations,
             hss.total_available, hss.total_hq_expenses, hss.safe_amount
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hs.summary_date::date = '2026-01-16'
      ORDER BY hss.currency
    `);

    jan16.rows.forEach(r => {
      console.log(`\n${r.currency}:`);
      console.log(`  Opening Balance:    ${r.opening_balance}`);
      console.log(`  Cash from Stations: ${r.cash_from_stations}`);
      console.log(`  Total Available:    ${r.total_available} (should be ${parseFloat(r.opening_balance) + parseFloat(r.cash_from_stations)})`);
      console.log(`  HQ Expenses:        ${r.total_hq_expenses}`);
      console.log(`  Safe Amount:        ${r.safe_amount} (should be ${parseFloat(r.total_available) - parseFloat(r.total_hq_expenses)})`);

      // Verify calculations
      const expectedAvailable = parseFloat(r.opening_balance) + parseFloat(r.cash_from_stations);
      const expectedSafe = expectedAvailable - parseFloat(r.total_hq_expenses);

      if (Math.abs(parseFloat(r.total_available) - expectedAvailable) > 0.01) {
        console.log(`  ⚠️  MISMATCH: total_available should be ${expectedAvailable}`);
      }
      if (Math.abs(parseFloat(r.safe_amount) - expectedSafe) > 0.01) {
        console.log(`  ⚠️  MISMATCH: safe_amount should be ${expectedSafe}`);
      }
    });

    // Also check what the previous day's safe was (should be today's opening)
    console.log('\n\n=== Jan 15 CLOSED Summary (provides today\'s opening) ===');
    const jan15 = await pool.query(`
      SELECT hss.currency, hss.safe_amount
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hs.status = 'CLOSED'
        AND hs.summary_date < '2026-01-16'
      ORDER BY hs.summary_date DESC, hss.currency
      LIMIT 4
    `);

    jan15.rows.forEach(r => {
      console.log(`${r.currency}: Safe Amount = ${r.safe_amount} (this becomes today's opening balance)`);
    });

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
