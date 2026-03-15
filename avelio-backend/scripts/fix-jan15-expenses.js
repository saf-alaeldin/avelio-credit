/**
 * Fix Jan 15 (2026) HQ Expenses
 *
 * Missing expenses:
 * - USD: 1,720
 * - SSP: 10,126,000
 *
 * After adding these, Jan 15 To Safe will be:
 * - USD: 25,410 - 1,720 = 23,690
 * - SSP: 18,192,000 - 10,126,000 = 8,066,000
 *
 * And Jan 16 Opening will be:
 * - USD: 0 + 23,690 = 23,690
 * - SSP: 0 + 8,066,000 = 8,066,000
 */

require('dotenv').config();
const { pool } = require('../src/config/db');

async function fixJan15Expenses() {
  const client = await pool.connect();

  try {
    console.log('=== Fixing Jan 15 (2026) HQ Expenses ===\n');

    await client.query('BEGIN');

    // Get admin user ID and expense code ID
    const adminUser = await client.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    const adminUserId = adminUser.rows.length > 0 ? adminUser.rows[0].id : null;
    console.log(`Admin User ID: ${adminUserId}\n`);

    // Get a general expense code (or create one if needed)
    let expenseCodeResult = await client.query(
      `SELECT id, code, name FROM expense_codes WHERE is_active = true LIMIT 1`
    );
    if (expenseCodeResult.rows.length === 0) {
      console.log('No expense codes found. Creating a default one...');
      const createCode = await client.query(`
        INSERT INTO expense_codes (code, name, description, category, currencies_allowed, is_active)
        VALUES ('HQ-MISC', 'HQ Miscellaneous', 'General HQ expenses', 'HQ Operations', ARRAY['USD', 'SSP'], true)
        RETURNING id, code, name
      `);
      expenseCodeResult = { rows: [createCode.rows[0]] };
    }
    const expenseCodeId = expenseCodeResult.rows[0].id;
    console.log(`Using Expense Code: ${expenseCodeResult.rows[0].code} (${expenseCodeResult.rows[0].name})\n`);

    // Get Jan 15 2026 HQ settlement ID
    const jan15Result = await client.query(
      `SELECT id FROM hq_settlements WHERE summary_date = '2026-01-15'`
    );
    if (jan15Result.rows.length === 0) {
      throw new Error('Jan 15 2026 HQ settlement not found!');
    }
    const jan15Id = jan15Result.rows[0].id;
    console.log(`Jan 15 HQ Settlement ID: ${jan15Id}\n`);

    // Check current expenses for Jan 15
    const currentExpenses = await client.query(
      `SELECT currency, SUM(amount) as total FROM hq_settlement_expenses
       WHERE hq_settlement_id = $1 GROUP BY currency`,
      [jan15Id]
    );
    console.log('Current expenses for Jan 15:');
    if (currentExpenses.rows.length === 0) {
      console.log('  None\n');
    } else {
      for (const row of currentExpenses.rows) {
        console.log(`  ${row.currency}: ${row.total}`);
      }
      console.log('');
    }

    // Only add expenses if none exist for this currency
    if (!currentExpenses.rows.find(r => r.currency === 'USD')) {
      console.log('Adding USD expense: 1,720...');
      await client.query(`
        INSERT INTO hq_settlement_expenses (hq_settlement_id, expense_code_id, currency, amount, description, created_by)
        VALUES ($1, $2, 'USD', 1720, 'HQ Operations expense for Jan 15', $3)
      `, [jan15Id, expenseCodeId, adminUserId]);
    } else {
      console.log('USD expense already exists, skipping...');
    }

    if (!currentExpenses.rows.find(r => r.currency === 'SSP')) {
      console.log('Adding SSP expense: 10,126,000...\n');
      await client.query(`
        INSERT INTO hq_settlement_expenses (hq_settlement_id, expense_code_id, currency, amount, description, created_by)
        VALUES ($1, $2, 'SSP', 10126000, 'HQ Operations expense for Jan 15', $3)
      `, [jan15Id, expenseCodeId, adminUserId]);
    } else {
      console.log('SSP expense already exists, skipping...\n');
    }

    // Update Jan 15 summary values - IMPORTANT: Opening must be 0 for first day
    console.log('Updating Jan 15 summary...');
    // USD: Opening=0, Cash=25410, Expenses=1720, ToSafe=23690, Available=23690
    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = 0,
          total_hq_expenses = 1720,
          safe_amount = 25410 - 1720,  -- 23690
          total_available = 0 + (25410 - 1720),  -- 23690
          updated_at = CURRENT_TIMESTAMP
      WHERE hq_settlement_id = $1 AND currency = 'USD'
    `, [jan15Id]);

    // SSP: Opening=0, Cash=18192000, Expenses=10126000, ToSafe=8066000, Available=8066000
    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = 0,
          total_hq_expenses = 10126000,
          safe_amount = 18192000 - 10126000,  -- 8066000
          total_available = 0 + (18192000 - 10126000),  -- 8066000
          updated_at = CURRENT_TIMESTAMP
      WHERE hq_settlement_id = $1 AND currency = 'SSP'
    `, [jan15Id]);

    // Now update Jan 16 opening balance (should inherit from Jan 15 safe_amount)
    console.log('Updating Jan 16 opening balance...');
    const jan16Result = await client.query(
      `SELECT id FROM hq_settlements WHERE summary_date = '2026-01-16'`
    );
    if (jan16Result.rows.length > 0) {
      const jan16Id = jan16Result.rows[0].id;

      // USD: Opening=23690, Cash=22795, Expenses=4680, ToSafe=18115, Available=41805
      await client.query(`
        UPDATE hq_settlement_summaries
        SET opening_balance = 23690,
            safe_amount = 22795 - 4680,  -- 18115
            total_available = 23690 + (22795 - 4680),  -- 41805
            updated_at = CURRENT_TIMESTAMP
        WHERE hq_settlement_id = $1 AND currency = 'USD'
      `, [jan16Id]);

      // SSP: Opening=8066000, Cash=2630000, Expenses=320000, ToSafe=2310000, Available=10376000
      await client.query(`
        UPDATE hq_settlement_summaries
        SET opening_balance = 8066000,
            safe_amount = 2630000 - 320000,  -- 2310000
            total_available = 8066000 + (2630000 - 320000),  -- 10376000
            updated_at = CURRENT_TIMESTAMP
        WHERE hq_settlement_id = $1 AND currency = 'SSP'
      `, [jan16Id]);
    }

    // Update Jan 17 opening balance (should inherit from Jan 16)
    console.log('Updating Jan 17 opening balance...');
    const jan17Result = await client.query(
      `SELECT id FROM hq_settlements WHERE summary_date = '2026-01-17'`
    );
    if (jan17Result.rows.length > 0) {
      const jan17Id = jan17Result.rows[0].id;

      // USD: Opening = Jan16 Opening + Jan16 ToSafe = 23690 + 18115 = 41805
      await client.query(`
        UPDATE hq_settlement_summaries
        SET opening_balance = 41805,
            total_available = 41805 + safe_amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE hq_settlement_id = $1 AND currency = 'USD'
      `, [jan17Id]);

      // SSP: Opening = Jan16 Opening + Jan16 ToSafe = 8066000 + 2310000 = 10376000
      await client.query(`
        UPDATE hq_settlement_summaries
        SET opening_balance = 10376000,
            total_available = 10376000 + safe_amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE hq_settlement_id = $1 AND currency = 'SSP'
      `, [jan17Id]);
    }

    await client.query('COMMIT');

    // Verify
    console.log('\n=== Verification ===\n');
    const verifyResult = await client.query(`
      SELECT hs.summary_date, hs.status, hss.currency,
             hss.opening_balance, hss.cash_from_stations, hss.total_hq_expenses,
             hss.safe_amount, hss.total_available
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hs.summary_date >= '2026-01-15'
      ORDER BY hs.summary_date, hss.currency
    `);

    console.log('Date       | Currency | Opening     | Cash        | Expenses    | To Safe     | Available');
    console.log('-----------|----------|-------------|-------------|-------------|-------------|-------------');
    for (const row of verifyResult.rows) {
      const date = row.summary_date instanceof Date ? row.summary_date.toISOString().split('T')[0] : row.summary_date;
      console.log(`${date} | ${row.currency.padEnd(8)} | ${String(row.opening_balance).padStart(11)} | ${String(row.cash_from_stations).padStart(11)} | ${String(row.total_hq_expenses).padStart(11)} | ${String(row.safe_amount).padStart(11)} | ${String(row.total_available).padStart(11)}`);
    }

    console.log('\n=== Expected Values ===\n');
    console.log('Jan 15 USD: Opening=0, Cash=25,410, Expenses=1,720, ToSafe=23,690, Available=23,690');
    console.log('Jan 15 SSP: Opening=0, Cash=18,192,000, Expenses=10,126,000, ToSafe=8,066,000, Available=8,066,000');
    console.log('Jan 16 USD: Opening=23,690, Cash=22,795, Expenses=4,680, ToSafe=18,115, Available=41,805');
    console.log('Jan 16 SSP: Opening=8,066,000, Cash=2,630,000, Expenses=320,000, ToSafe=2,310,000, Available=10,376,000');

    console.log('\n=== Done! ===');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixJan15Expenses().catch(console.error);
