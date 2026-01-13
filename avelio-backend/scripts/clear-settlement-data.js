const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'avelio_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123'
});

async function clearData() {
  const client = await pool.connect();
  try {
    console.log('Clearing all settlement data...\n');

    // Clear station settlement related data
    let result = await client.query('DELETE FROM settlement_audit_logs');
    console.log(`Deleted ${result.rowCount} settlement_audit_logs`);

    result = await client.query('DELETE FROM settlement_expenses');
    console.log(`Deleted ${result.rowCount} settlement_expenses`);

    result = await client.query('DELETE FROM settlement_agent_entries');
    console.log(`Deleted ${result.rowCount} settlement_agent_entries`);

    result = await client.query('DELETE FROM settlement_summaries');
    console.log(`Deleted ${result.rowCount} settlement_summaries`);

    result = await client.query('UPDATE station_sales SET settlement_id = NULL');
    console.log(`Unlinked ${result.rowCount} station_sales from settlements`);

    result = await client.query('DELETE FROM station_sales');
    console.log(`Deleted ${result.rowCount} station_sales`);

    result = await client.query('DELETE FROM settlements');
    console.log(`Deleted ${result.rowCount} settlements`);

    // Clear HQ settlement related data
    result = await client.query('DELETE FROM hq_settlement_expenses');
    console.log(`Deleted ${result.rowCount} hq_settlement_expenses`);

    result = await client.query('DELETE FROM hq_settlement_summaries');
    console.log(`Deleted ${result.rowCount} hq_settlement_summaries`);

    result = await client.query('DELETE FROM hq_settlements');
    console.log(`Deleted ${result.rowCount} hq_settlements`);

    console.log('\n✅ All settlement data cleared successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

clearData();
