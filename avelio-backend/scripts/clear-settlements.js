// Script to clear all settlement data for fresh start
require('dotenv').config();
const { pool } = require('../src/config/db');

async function clearSettlementData() {
  const client = await pool.connect();

  try {
    console.log('Starting to clear settlement data...\n');

    await client.query('BEGIN');

    // Delete in order of dependencies (child tables first)

    // 1. Delete settlement audit logs
    const auditResult = await client.query('DELETE FROM settlement_audit_logs');
    console.log(`Deleted ${auditResult.rowCount} audit logs`);

    // 2. Delete settlement expenses
    const expensesResult = await client.query('DELETE FROM settlement_expenses');
    console.log(`Deleted ${expensesResult.rowCount} expenses`);

    // 3. Delete settlement agent entries
    const entriesResult = await client.query('DELETE FROM settlement_agent_entries');
    console.log(`Deleted ${entriesResult.rowCount} agent entries`);

    // 4. Delete settlement summaries
    const summariesResult = await client.query('DELETE FROM settlement_summaries');
    console.log(`Deleted ${summariesResult.rowCount} summaries`);

    // 5. Delete station sales
    const salesResult = await client.query('DELETE FROM station_sales');
    console.log(`Deleted ${salesResult.rowCount} sales`);

    // 6. Delete settlements
    const settlementsResult = await client.query('DELETE FROM settlements');
    console.log(`Deleted ${settlementsResult.rowCount} settlements`);

    // Also clear HQ settlement data if exists
    try {
      const hqAuditResult = await client.query('DELETE FROM hq_settlement_audit_logs');
      console.log(`Deleted ${hqAuditResult.rowCount} HQ audit logs`);

      const hqExpensesResult = await client.query('DELETE FROM hq_settlement_expenses');
      console.log(`Deleted ${hqExpensesResult.rowCount} HQ expenses`);

      const hqSummariesResult = await client.query('DELETE FROM hq_settlement_summaries');
      console.log(`Deleted ${hqSummariesResult.rowCount} HQ summaries`);

      const hqSettlementsResult = await client.query('DELETE FROM hq_settlements');
      console.log(`Deleted ${hqSettlementsResult.rowCount} HQ settlements`);
    } catch (e) {
      console.log('(HQ settlement tables may not exist, skipping...)');
    }

    await client.query('COMMIT');

    console.log('\n✅ All settlement data cleared successfully!');
    console.log('Database is ready for fresh testing.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error clearing data:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

clearSettlementData()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
