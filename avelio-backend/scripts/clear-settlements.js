// Script to clear all settlement data for fresh start
// WARNING: This script permanently deletes data!
// Use soft_delete_settlement() function instead for safe deletion

require('dotenv').config();
const { pool } = require('../src/config/db');
const readline = require('readline');

// SAFETY: Prevent accidental execution in production
const isProduction = process.env.NODE_ENV === 'production';
const DATABASE_URL = process.env.DATABASE_URL;

async function promptConfirmation(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function createBackup(client) {
  console.log('\n📦 Creating backup before deletion...\n');

  // Backup to archive tables
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Backup agent entries with declared cash
  const agentBackup = await client.query(`
    INSERT INTO settlement_agent_entries_archive
    (id, settlement_id, agent_id, currency, expected_cash, declared_cash, variance, variance_status, notes, created_at, updated_at, archived_at, archive_reason, original_settlement_number)
    SELECT sae.id, sae.settlement_id, sae.agent_id, sae.currency, sae.expected_cash, sae.declared_cash, sae.variance, sae.variance_status, sae.notes, sae.created_at, sae.updated_at, CURRENT_TIMESTAMP, 'BULK_DELETE_SCRIPT', s.settlement_number
    FROM settlement_agent_entries sae
    JOIN settlements s ON sae.settlement_id = s.id
    WHERE sae.declared_cash IS NOT NULL
  `);
  console.log(`  Backed up ${agentBackup.rowCount} agent entries with declared cash`);

  // Backup summaries
  const summaryBackup = await client.query(`
    INSERT INTO settlement_summaries_archive
    (id, settlement_id, currency, opening_balance, expected_cash, total_expenses, expected_net_cash, actual_cash_received, final_variance, variance_status, created_at, updated_at, archived_at, archive_reason, original_settlement_number)
    SELECT ss.id, ss.settlement_id, ss.currency, ss.opening_balance, ss.expected_cash, ss.total_expenses, ss.expected_net_cash, ss.actual_cash_received, ss.final_variance, ss.variance_status, ss.created_at, ss.updated_at, CURRENT_TIMESTAMP, 'BULK_DELETE_SCRIPT', s.settlement_number
    FROM settlement_summaries ss
    JOIN settlements s ON ss.settlement_id = s.id
  `);
  console.log(`  Backed up ${summaryBackup.rowCount} settlement summaries`);

  console.log('✅ Backup completed\n');
}

async function clearSettlementData() {
  // SAFETY CHECK 1: Block production execution
  if (isProduction || DATABASE_URL) {
    console.error('\n❌ ERROR: This script cannot be run in production!');
    console.error('   NODE_ENV:', process.env.NODE_ENV);
    console.error('   DATABASE_URL is set:', !!DATABASE_URL);
    console.error('\n   If you really need to clear data in production, use the');
    console.error('   soft_delete_settlement() database function instead.\n');
    process.exit(1);
  }

  // SAFETY CHECK 2: Show warning
  console.log('\n' + '='.repeat(60));
  console.log('⚠️  WARNING: DESTRUCTIVE OPERATION');
  console.log('='.repeat(60));
  console.log('\nThis script will PERMANENTLY DELETE all settlement data:');
  console.log('  - All settlement records');
  console.log('  - All agent entries (including declared cash)');
  console.log('  - All expenses');
  console.log('  - All summaries');
  console.log('  - All audit logs');
  console.log('  - All station sales');
  console.log('\nDatabase:', process.env.DB_NAME || 'avelio_db');
  console.log('Host:', process.env.DB_HOST || 'localhost');
  console.log('');

  // SAFETY CHECK 3: Require explicit confirmation
  const confirmed = await promptConfirmation('Type "yes" to confirm deletion: ');

  if (!confirmed) {
    console.log('\n❌ Operation cancelled. No data was deleted.\n');
    process.exit(0);
  }

  const client = await pool.connect();

  try {
    console.log('\nStarting to clear settlement data...\n');

    await client.query('BEGIN');

    // Create backup first
    try {
      await createBackup(client);
    } catch (backupError) {
      console.log('⚠️  Could not create backup (archive tables may not exist)');
      console.log('   Error:', backupError.message);

      const continueWithoutBackup = await promptConfirmation('\nContinue without backup? Type "yes": ');
      if (!continueWithoutBackup) {
        await client.query('ROLLBACK');
        console.log('\n❌ Operation cancelled.\n');
        process.exit(0);
      }
    }

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

    // 5. Unlink station sales (don't delete - just remove settlement reference)
    const salesResult = await client.query('UPDATE station_sales SET settlement_id = NULL WHERE settlement_id IS NOT NULL');
    console.log(`Unlinked ${salesResult.rowCount} sales from settlements`);

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
    console.log('\n📝 Note: Data was backed up to *_archive tables if they exist.\n');

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
