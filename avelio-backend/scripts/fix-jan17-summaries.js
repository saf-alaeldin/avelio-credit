const { Pool, types } = require('pg');
require('dotenv').config();

types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'avelio_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
});

async function fixJan17Summaries() {
  const client = await pool.connect();
  try {
    const settlementId = 'b772d52d-93c4-4bab-9e38-1c057bfd1dde'; // Jan 17 Juba

    // Get current summaries
    const summaries = await client.query(`
      SELECT * FROM settlement_summaries WHERE settlement_id = $1
    `, [settlementId]);
    console.log('=== CURRENT SUMMARIES ===');
    console.log(summaries.rows);

    // Check Jan 16 closing balance to determine correct opening balance
    const jan16Settlement = await client.query(`
      SELECT id FROM settlements
      WHERE station_id = '2a05e6c5-30b7-49dc-a4e4-cf947d5233c5'
      AND period_to = '2026-01-16'
    `);

    if (jan16Settlement.rows.length > 0) {
      const jan16Summary = await client.query(`
        SELECT currency, expected_cash, actual_cash_received, final_variance
        FROM settlement_summaries
        WHERE settlement_id = $1
      `, [jan16Settlement.rows[0].id]);

      console.log('\n=== JAN 16 CLOSING ===');
      jan16Summary.rows.forEach(r => {
        console.log(`${r.currency}: Expected=${r.expected_cash}, Actual=${r.actual_cash_received}, Variance=${r.final_variance}`);
      });
    }

    // The variance from Jan 16 becomes opening balance for Jan 17
    // However, looking at the settlement structure, the opening balance might be calculated differently
    // Let's check what the expected behavior is

    // Calculate totals from agent entries
    const agentTotals = await client.query(`
      SELECT currency,
             SUM(expected_cash) as total_expected,
             SUM(declared_cash) as total_declared
      FROM settlement_agent_entries
      WHERE settlement_id = $1
      GROUP BY currency
    `, [settlementId]);

    console.log('\n=== AGENT TOTALS ===');
    agentTotals.rows.forEach(r => {
      console.log(`${r.currency}: Expected=${r.total_expected}, Declared=${r.total_declared}`);
    });

    if (process.argv.includes('--execute')) {
      await client.query('BEGIN');

      // Update summaries with correct opening balance
      // From Jan 16: USD variance was -800, SSP variance was -840000
      await client.query(`
        UPDATE settlement_summaries
        SET opening_balance = -800.00,
            expected_cash = expected_cash + (-800.00)
        WHERE settlement_id = $1 AND currency = 'USD'
      `, [settlementId]);

      await client.query(`
        UPDATE settlement_summaries
        SET opening_balance = -840000.00,
            expected_cash = expected_cash + (-840000.00)
        WHERE settlement_id = $1 AND currency = 'SSP'
      `, [settlementId]);

      await client.query('COMMIT');
      console.log('\n=== SUMMARIES UPDATED ===');

      // Verify
      const updated = await client.query(`
        SELECT * FROM settlement_summaries WHERE settlement_id = $1
      `, [settlementId]);
      updated.rows.forEach(r => {
        console.log(`${r.currency}: opening=${r.opening_balance}, expected=${r.expected_cash}`);
      });
    }

  } finally {
    client.release();
    pool.end();
  }
}

fixJan17Summaries().catch(console.error);
