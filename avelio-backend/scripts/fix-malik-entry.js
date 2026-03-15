require('dotenv').config();
const { pool } = require('../src/config/db');

async function fixMalikEntry() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const settlementId = '0eb9f68c-4093-459f-94b7-8c82721b4150';

    // Find the MALIK USD entry (the incorrect one)
    const entry = await client.query(`
      SELECT sae.*, sa.agent_name
      FROM settlement_agent_entries sae
      JOIN sales_agents sa ON sae.agent_id = sa.id
      WHERE sae.settlement_id = $1
        AND sa.agent_code = 'MAL00'
        AND sae.currency = 'USD'
    `, [settlementId]);

    if (entry.rows.length === 0) {
      console.log('No MALIK USD entry found');
      await client.query('ROLLBACK');
      return;
    }

    console.log('Found entry to delete:', entry.rows[0]);

    // Delete the incorrect entry
    await client.query(`
      DELETE FROM settlement_agent_entries
      WHERE id = $1
    `, [entry.rows[0].id]);

    console.log('Deleted MALIK USD entry');

    // Recalculate the settlement summary for USD
    // First, get sum of expected_cash from remaining USD agents
    const expectedSum = await client.query(`
      SELECT COALESCE(SUM(expected_cash), 0) as total
      FROM settlement_agent_entries
      WHERE settlement_id = $1 AND currency = 'USD'
    `, [settlementId]);

    // Get sum of declared_cash from remaining USD agents
    const declaredSum = await client.query(`
      SELECT COALESCE(SUM(declared_cash), 0) as total
      FROM settlement_agent_entries
      WHERE settlement_id = $1 AND currency = 'USD'
    `, [settlementId]);

    // Get USD expenses
    const expenseSum = await client.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM settlement_expenses
      WHERE settlement_id = $1 AND currency = 'USD'
    `, [settlementId]);

    const expectedCash = parseFloat(expectedSum.rows[0].total);
    const declaredCash = parseFloat(declaredSum.rows[0].total);
    const expenses = parseFloat(expenseSum.rows[0].total);
    const expectedNetCash = expectedCash - expenses;
    const finalVariance = declaredCash - expectedNetCash;

    console.log('\nNew USD calculations:');
    console.log('Expected cash:', expectedCash);
    console.log('Declared cash (agent_cash_total):', declaredCash);
    console.log('Expenses:', expenses);
    console.log('Expected net cash:', expectedNetCash);
    console.log('Final variance:', finalVariance);

    // Determine variance status
    let varianceStatus = 'BALANCED';
    if (finalVariance > 0) varianceStatus = 'OVER';
    else if (finalVariance < 0) varianceStatus = 'SHORT';

    // Update the settlement summary
    await client.query(`
      UPDATE settlement_summaries
      SET expected_cash = $1,
          expected_net_cash = $2,
          actual_cash_received = $3,
          agent_cash_total = $3,
          final_variance = $4,
          variance_status = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE settlement_id = $6 AND currency = 'USD'
    `, [expectedCash, expectedNetCash, declaredCash, finalVariance, varianceStatus, settlementId]);

    console.log('\nUpdated settlement summary for USD');

    await client.query('COMMIT');
    console.log('\n✅ Fix completed successfully!');

    // Show new state
    const newSummary = await pool.query(`
      SELECT * FROM settlement_summaries
      WHERE settlement_id = $1 AND currency = 'USD'
    `, [settlementId]);
    console.log('\nNew USD summary:', JSON.stringify(newSummary.rows[0], null, 2));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

fixMalikEntry();
