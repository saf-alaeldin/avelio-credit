/**
 * Explain Jan 17 (2026) Station Summary Calculation
 */

require('dotenv').config();
const { pool } = require('../src/config/db');

async function explainJan17Calculation() {
  const client = await pool.connect();

  try {
    console.log('=== Jan 17 (2026) Station Summary Calculation Explained ===\n');

    // 1. Check current Jan 17 values
    console.log('1. CURRENT JAN 17 VALUES:\n');
    const jan17Summary = await client.query(`
      SELECT hss.currency, hss.opening_balance, hss.cash_from_stations,
             hss.total_hq_expenses, hss.safe_amount, hss.total_available
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hs.summary_date = '2026-01-17'
      ORDER BY hss.currency
    `);

    for (const row of jan17Summary.rows) {
      console.log(`   ${row.currency}:`);
      console.log(`     Opening Balance:    ${row.opening_balance}`);
      console.log(`     Cash from Stations: ${row.cash_from_stations}`);
      console.log(`     HQ Expenses:        ${row.total_hq_expenses}`);
      console.log(`     To Safe:            ${row.safe_amount}`);
      console.log(`     Total Available:    ${row.total_available}`);
      console.log('');
    }

    // 2. How Opening Balance is calculated
    console.log('2. OPENING BALANCE CALCULATION:\n');
    console.log('   Formula: Previous Opening + Previous To Safe\n');

    const jan16Values = await client.query(`
      SELECT hss.currency, hss.opening_balance, hss.safe_amount
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hs.summary_date = '2026-01-16'
        AND hs.status = 'CLOSED'
        AND hss.cash_from_stations > 0
      ORDER BY hss.currency
    `);

    console.log('   Jan 16 values (used to calculate Jan 17 opening):');
    for (const row of jan16Values.rows) {
      const opening = parseFloat(row.opening_balance);
      const toSafe = parseFloat(row.safe_amount);
      console.log(`   ${row.currency}: Opening=${opening} + ToSafe=${toSafe} = ${opening + toSafe}`);
    }
    console.log('');

    // 3. Cash from Stations - what settlements are REGISTERED on Jan 17
    console.log('3. CASH FROM STATIONS (Settlements REGISTERED on Jan 17):\n');

    const jan17Settlements = await client.query(`
      SELECT s.settlement_number, st.station_name, s.created_at, s.status
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE s.created_at::date = '2026-01-17'
        AND s.status IN ('SUBMITTED', 'REVIEW', 'APPROVED', 'APPROVED_WITH_VARIANCE')
      ORDER BY st.station_name
    `);

    if (jan17Settlements.rows.length === 0) {
      console.log('   No settlements registered on Jan 17 yet.\n');
    } else {
      console.log(`   Found ${jan17Settlements.rows.length} settlements:\n`);
      for (const row of jan17Settlements.rows) {
        console.log(`   - ${row.station_name}: ${row.settlement_number} (${row.status})`);
      }
      console.log('');
    }

    // Cash totals by currency
    const cashTotals = await client.query(`
      SELECT ss.currency,
             SUM(CASE
               WHEN ss.station_declared_cash IS NOT NULL THEN ss.station_declared_cash
               WHEN ss.actual_cash_received IS NOT NULL AND ss.actual_cash_received > 0 THEN ss.actual_cash_received
               ELSE 0
             END) as total_cash
      FROM settlements s
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE s.created_at::date = '2026-01-17'
        AND s.status IN ('SUBMITTED', 'REVIEW', 'APPROVED', 'APPROVED_WITH_VARIANCE')
      GROUP BY ss.currency
    `);

    console.log('   Cash totals by currency:');
    if (cashTotals.rows.length === 0) {
      console.log('   USD: 0');
      console.log('   SSP: 0');
    } else {
      for (const row of cashTotals.rows) {
        console.log(`   ${row.currency}: ${row.total_cash}`);
      }
    }
    console.log('');

    // 4. HQ Expenses for Jan 17
    console.log('4. HQ EXPENSES FOR JAN 17:\n');

    const jan17Expenses = await client.query(`
      SELECT he.currency, ec.code, ec.name, he.amount
      FROM hq_settlements hs
      JOIN hq_settlement_expenses he ON hs.id = he.hq_settlement_id
      JOIN expense_codes ec ON he.expense_code_id = ec.id
      WHERE hs.summary_date = '2026-01-17'
      ORDER BY he.currency, ec.code
    `);

    if (jan17Expenses.rows.length === 0) {
      console.log('   No expenses entered for Jan 17 yet.\n');
    } else {
      for (const row of jan17Expenses.rows) {
        console.log(`   ${row.currency}: ${row.code} - ${row.name}: ${row.amount}`);
      }
      console.log('');
    }

    // 5. Final formulas
    console.log('5. CALCULATION FORMULAS:\n');
    console.log('   To Safe = Cash from Stations - HQ Expenses');
    console.log('   Total Available = Opening Balance + To Safe\n');

    // 6. Real-time calculation preview
    console.log('6. REAL-TIME CALCULATION (what users will see):\n');

    for (const currency of ['USD', 'SSP']) {
      const jan16 = jan16Values.rows.find(r => r.currency === currency);
      const opening = jan16 ? parseFloat(jan16.opening_balance) + parseFloat(jan16.safe_amount) : 0;

      const cashRow = cashTotals.rows.find(r => r.currency === currency);
      const cash = cashRow ? parseFloat(cashRow.total_cash) : 0;

      const expenseRows = jan17Expenses.rows.filter(r => r.currency === currency);
      const expenses = expenseRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

      const toSafe = cash - expenses;
      const available = opening + toSafe;

      console.log(`   ${currency}:`);
      console.log(`     Opening Balance:    ${opening.toLocaleString()}`);
      console.log(`     Cash from Stations: ${cash.toLocaleString()}`);
      console.log(`     HQ Expenses:        ${expenses.toLocaleString()}`);
      console.log(`     To Safe:            ${toSafe.toLocaleString()}`);
      console.log(`     Total Available:    ${available.toLocaleString()}`);
      console.log('');
    }

    console.log('=== STATUS ===\n');
    const jan17Status = await client.query(`
      SELECT status FROM hq_settlements WHERE summary_date = '2026-01-17'
    `);
    console.log(`   Jan 17 Status: ${jan17Status.rows[0]?.status || 'NOT CREATED'}`);
    console.log('');
    console.log('   Since Jan 17 is DRAFT, values will auto-recalculate when:');
    console.log('   - User navigates to Jan 17 in Station Summary page');
    console.log('   - New station settlements are submitted with registration date = Jan 17');
    console.log('   - User adds/removes HQ expenses');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

explainJan17Calculation().catch(console.error);
