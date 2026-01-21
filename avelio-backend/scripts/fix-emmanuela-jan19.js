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

async function fixEmmanuelaJan19() {
  const client = await pool.connect();
  try {
    const settlementId = '0e2aa61a-ffcc-4b7b-85a0-40ab7a9662d4'; // Jan 19 Juba
    const emmanuelaId = '86b7b258-7ed5-4a36-bae0-d1552a2195b6';

    // Get current entry
    const entry = await client.query(`
      SELECT * FROM settlement_agent_entries
      WHERE settlement_id = $1 AND agent_id = $2 AND currency = 'USD'
    `, [settlementId, emmanuelaId]);

    console.log('=== CURRENT EMMANUELA ENTRY ===');
    console.log(`expected_cash: ${entry.rows[0].expected_cash}`);
    console.log(`declared_cash: ${entry.rows[0].declared_cash}`);
    console.log(`variance: ${entry.rows[0].variance}`);

    if (process.argv.includes('--execute')) {
      // Fix the declared_cash to 1210 (what user intended)
      const correctValue = 1210.00;
      const expectedCash = parseFloat(entry.rows[0].expected_cash);
      const newVariance = correctValue - expectedCash;
      const varianceStatus = newVariance === 0 ? 'BALANCED' : (newVariance < 0 ? 'SHORT' : 'EXTRA');

      await client.query(`
        UPDATE settlement_agent_entries
        SET declared_cash = $1,
            variance = $2,
            variance_status = $3,
            updated_at = NOW()
        WHERE settlement_id = $4 AND agent_id = $5 AND currency = 'USD'
      `, [correctValue, newVariance, varianceStatus, settlementId, emmanuelaId]);

      // Also update the settlement summary
      const agentTotals = await client.query(`
        SELECT currency, SUM(declared_cash) as total
        FROM settlement_agent_entries
        WHERE settlement_id = $1
        GROUP BY currency
      `, [settlementId]);

      for (const row of agentTotals.rows) {
        // Get expected cash for this currency
        const summaryRes = await client.query(`
          SELECT expected_cash FROM settlement_summaries
          WHERE settlement_id = $1 AND currency = $2
        `, [settlementId, row.currency]);

        const expectedCashSummary = parseFloat(summaryRes.rows[0]?.expected_cash || 0);
        const totalDeclared = parseFloat(row.total || 0);
        const summaryVariance = totalDeclared - expectedCashSummary;
        const summaryStatus = summaryVariance === 0 ? 'BALANCED' : (summaryVariance < 0 ? 'SHORT' : 'EXTRA');

        await client.query(`
          UPDATE settlement_summaries
          SET agent_cash_total = $1,
              actual_cash_received = $1,
              final_variance = $2,
              variance_status = $3,
              updated_at = NOW()
          WHERE settlement_id = $4 AND currency = $5
        `, [totalDeclared, summaryVariance, summaryStatus, settlementId, row.currency]);
      }

      console.log('\n=== FIXED ===');
      console.log(`Set declared_cash to ${correctValue}`);
      console.log(`New variance: ${newVariance}`);

      // Verify
      const updated = await client.query(`
        SELECT * FROM settlement_agent_entries
        WHERE settlement_id = $1 AND agent_id = $2 AND currency = 'USD'
      `, [settlementId, emmanuelaId]);
      console.log('\n=== UPDATED ENTRY ===');
      console.log(`declared_cash: ${updated.rows[0].declared_cash}`);
      console.log(`variance: ${updated.rows[0].variance}`);
    } else {
      console.log('\nRun with --execute to fix the value to 1210');
    }

  } finally {
    client.release();
    pool.end();
  }
}

fixEmmanuelaJan19().catch(console.error);
