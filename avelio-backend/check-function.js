require('dotenv').config({ path: 'D:/avelio-credit/avelio-backend/.env' });
const db = require('./src/config/db');

async function testSettlementCreation() {
  const client = await db.pool.connect();

  try {
    const station_id = '915711bf-743d-4219-aefa-ad96ce474569'; // Aweil
    const period_from = '2026-01-02';  // Different date to avoid overlap
    const period_to = '2026-01-02';

    await client.query('BEGIN');

    // Get station code
    const stationCheck = await client.query(
      'SELECT station_code FROM stations WHERE id = $1',
      [station_id]
    );
    console.log('Station:', stationCheck.rows[0]);

    // Generate settlement number
    const settlementNumber = await client.query(
      'SELECT generate_settlement_number($1, $2) as number',
      [stationCheck.rows[0].station_code, period_from]
    );
    console.log('Settlement number:', settlementNumber.rows[0].number);

    // Try to create settlement
    console.log('Attempting to create settlement...');
    const result = await client.query(
      `INSERT INTO settlements
       (settlement_number, station_id, period_from, period_to, status, created_by)
       VALUES ($1, $2, $3, $4, 'DRAFT', $5)
       RETURNING *`,
      [
        settlementNumber.rows[0].number,
        station_id,
        period_from,
        period_to,
null // Allow NULL for test
      ]
    );
    console.log('Settlement created:', result.rows[0]);

    // Try to get agent entries with LEFT JOIN instead of INNER JOIN
    const agentEntries = await client.query(
      `SELECT sae.*, sa.agent_code, sa.agent_name
       FROM settlement_agent_entries sae
       LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
       WHERE sae.settlement_id = $1`,
      [result.rows[0].id]
    );
    console.log('Agent entries:', agentEntries.rows);

    // Rollback - don't actually create anything
    await client.query('ROLLBACK');
    console.log('Test complete - rolled back');

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error:', e.message);
    console.error('Full error:', e);
  } finally {
    client.release();
    process.exit(0);
  }
}

testSettlementCreation();
