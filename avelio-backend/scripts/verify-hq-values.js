require('dotenv').config();
const { pool } = require('../src/config/db');

async function verify() {
  const result = await pool.query(`
    SELECT hs.summary_date, hs.status, hss.currency,
           hss.opening_balance, hss.cash_from_stations, hss.total_hq_expenses,
           hss.safe_amount, hss.total_available
    FROM hq_settlements hs
    JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
    WHERE hs.summary_date IN ('2026-01-15', '2026-01-16', '2026-01-17')
    ORDER BY hs.summary_date, hss.currency
  `);

  console.log('\n=== HQ Settlement Values ===\n');
  console.log('Date       | Status  | Currency | Opening    | Cash       | Expenses   | To Safe    | Available');
  console.log('-----------|---------|----------|------------|------------|------------|------------|------------');
  for (const row of result.rows) {
    const date = row.summary_date instanceof Date ? row.summary_date.toISOString().split('T')[0] : row.summary_date;
    console.log(`${date} | ${row.status.padEnd(7)} | ${row.currency.padEnd(8)} | ${String(row.opening_balance).padStart(10)} | ${String(row.cash_from_stations).padStart(10)} | ${String(row.total_hq_expenses).padStart(10)} | ${String(row.safe_amount).padStart(10)} | ${String(row.total_available).padStart(10)}`);
  }

  console.log('\n=== Expected Values ===\n');
  console.log('Jan 15 USD: Opening=0, Cash=25,410, Expenses=1,720, ToSafe=23,690, Available=23,690');
  console.log('Jan 15 SSP: Opening=0, Cash=18,192,000, Expenses=10,126,000, ToSafe=8,066,000, Available=8,066,000');
  console.log('Jan 16 USD: Opening=23,690, Cash=22,795, Expenses=4,680, ToSafe=18,115, Available=41,805');
  console.log('Jan 16 SSP: Opening=8,066,000, Cash=2,630,000, Expenses=320,000, ToSafe=2,310,000, Available=10,376,000');

  await pool.end();
}

verify().catch(console.error);
