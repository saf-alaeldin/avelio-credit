// Test creating a summary
require('dotenv').config();
const { pool } = require('../src/config/db');

async function test() {
  const client = await pool.connect();

  try {
    const date = '2026-01-12';
    const userId = null; // We'll get a real user ID

    // Get a user ID
    const userResult = await client.query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.log('No users found');
      return;
    }
    const realUserId = userResult.rows[0].id;
    console.log('Using user ID:', realUserId);

    await client.query('BEGIN');

    // Check if summary exists
    console.log('1. Checking for existing summary...');
    const existing = await client.query(
      'SELECT * FROM hq_settlements WHERE summary_date = $1',
      [date]
    );
    console.log('   Existing summaries:', existing.rows.length);

    if (existing.rows.length > 0) {
      console.log('   Deleting existing summary for clean test...');
      await client.query('DELETE FROM hq_settlements WHERE summary_date = $1', [date]);
    }

    // Generate settlement number
    console.log('2. Generating settlement number...');
    const numResult = await client.query(
      'SELECT generate_hq_settlement_number($1) as number',
      [date]
    );
    const settlementNumber = numResult.rows[0].number;
    console.log('   Generated:', settlementNumber);

    // Create the summary
    console.log('3. Creating summary...');
    const createResult = await client.query(
      `INSERT INTO hq_settlements (settlement_number, summary_date, period_from, period_to, status, created_by)
       VALUES ($1, $2, $2, $2, 'DRAFT', $3)
       RETURNING *`,
      [settlementNumber, date, realUserId]
    );
    const summaryId = createResult.rows[0].id;
    console.log('   Created with ID:', summaryId);

    // Calculate summary
    console.log('4. Calculating summary for USD...');

    // Get opening balance
    const obResult = await client.query(
      `SELECT hss.safe_amount
       FROM hq_settlement_summaries hss
       JOIN hq_settlements hs ON hss.hq_settlement_id = hs.id
       WHERE hs.status = 'CLOSED'
         AND hs.summary_date < $1
         AND hss.currency = $2
       ORDER BY hs.summary_date DESC
       LIMIT 1`,
      [date, 'USD']
    );
    const openingBalance = obResult.rows.length > 0 ? parseFloat(obResult.rows[0].safe_amount) : 0;
    console.log('   Opening balance:', openingBalance);

    // Get cash from stations
    const cashResult = await client.query(
      `SELECT COALESCE(SUM(ss.actual_cash_received), 0) as total_cash
       FROM settlement_summaries ss
       JOIN settlements s ON ss.settlement_id = s.id
       WHERE s.status = 'SUBMITTED'
         AND s.period_to = $1
         AND ss.currency = $2`,
      [date, 'USD']
    );
    const cashFromStations = parseFloat(cashResult.rows[0].total_cash);
    console.log('   Cash from stations:', cashFromStations);

    // Get HQ expenses
    const expResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total_hq_expenses
       FROM hq_settlement_expenses
       WHERE hq_settlement_id = $1 AND currency = $2`,
      [summaryId, 'USD']
    );
    const totalHQExpenses = parseFloat(expResult.rows[0].total_hq_expenses);
    console.log('   HQ expenses:', totalHQExpenses);

    const totalAvailable = openingBalance + cashFromStations;
    const safeAmount = totalAvailable - totalHQExpenses;

    // Get station count
    const countResult = await client.query(
      `SELECT COUNT(DISTINCT s.id) as count
       FROM settlements s
       JOIN settlement_summaries ss ON s.id = ss.settlement_id
       WHERE s.status = 'SUBMITTED'
         AND s.period_to = $1
         AND ss.currency = $2`,
      [date, 'USD']
    );
    const stationCount = parseInt(countResult.rows[0].count);
    console.log('   Station count:', stationCount);

    // Insert summary
    console.log('5. Inserting hq_settlement_summaries...');
    await client.query(
      `INSERT INTO hq_settlement_summaries
       (hq_settlement_id, currency, opening_balance, cash_from_stations, total_available,
        total_hq_expenses, safe_amount, total_stations_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (hq_settlement_id, currency)
       DO UPDATE SET
         opening_balance = EXCLUDED.opening_balance,
         cash_from_stations = EXCLUDED.cash_from_stations,
         total_available = EXCLUDED.total_available,
         total_hq_expenses = EXCLUDED.total_hq_expenses,
         safe_amount = EXCLUDED.safe_amount,
         total_stations_count = EXCLUDED.total_stations_count,
         updated_at = CURRENT_TIMESTAMP`,
      [summaryId, 'USD', openingBalance, cashFromStations, totalAvailable, totalHQExpenses, safeAmount, stationCount]
    );
    console.log('   USD summary inserted!');

    // Commit
    await client.query('COMMIT');
    console.log('\n✅ SUCCESS! Summary created and calculated.');

    // Clean up
    console.log('\n6. Cleaning up test data...');
    await client.query('DELETE FROM hq_settlements WHERE id = $1', [summaryId]);
    console.log('   Deleted test summary');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

test();
