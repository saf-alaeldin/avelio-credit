/**
 * Migration: Convert Excess Baggage (X-BAG) entries to normal Station Sales
 *
 * This script:
 * 1. Fixes "Kush traffic" POS typo → "Kushair Traffic"
 * 2. Assigns null-agent entries to TAMBUA
 * 3. Aggregates xbag entries into 1 station_sales per (settlement, agent, currency, day)
 * 4. Links new sales to their settlements
 * 5. Soft-deletes all xbag entries
 * 6. Recalculates all affected settlements
 * 7. Prints verification totals
 */

const pool = require('../src/config/db');

const TAMBUA_ID = 'c23db179-3375-4c22-8879-f3cbcfd19ae7';
const MALIK_ID = '82e5310e-fc19-4c37-8620-bad40e03bba6';
const JUBA_STATION_ID = '2a05e6c5-30b7-49dc-a4e4-cf947d5233c5';
const SYSTEM_USER_ID = '02a25259-aec1-4f90-ac51-d302eb267d3a'; // admin user for created_by

function roundMoney(val) {
  return Math.round(val * 100) / 100;
}

async function migrate() {
  const client = await pool.pool.connect();

  try {
    await client.query('BEGIN');

    // ========== STEP 0: Pre-migration totals ==========
    console.log('=== PRE-MIGRATION TOTALS ===');
    const preTotals = await client.query(`
      SELECT currency, COUNT(*) as entry_count, SUM(amount) as total_amount
      FROM settlement_excess_baggage
      WHERE (is_deleted = false OR is_deleted IS NULL)
      GROUP BY currency
    `);
    preTotals.rows.forEach(r => console.log(`  ${r.currency}: ${r.entry_count} entries, total: ${r.total_amount}`));

    const preSettlements = await client.query(`
      SELECT COUNT(DISTINCT settlement_id) as count
      FROM settlement_excess_baggage
      WHERE (is_deleted = false OR is_deleted IS NULL)
    `);
    console.log(`  Settlements affected: ${preSettlements.rows[0].count}`);

    // Check idempotency
    const existing = await client.query(`
      SELECT COUNT(*) as count FROM station_sales
      WHERE description = 'Migrated from excess baggage (X-BAG) entries'
    `);
    if (parseInt(existing.rows[0].count) > 0) {
      console.log('\n*** MIGRATION ALREADY RUN - found', existing.rows[0].count, 'migrated records. Aborting. ***');
      await client.query('ROLLBACK');
      process.exit(1);
    }

    // ========== STEP 1: Aggregate xbag entries ==========
    console.log('\n=== AGGREGATING X-BAG ENTRIES ===');
    const aggregated = await client.query(`
      SELECT
        xb.settlement_id,
        COALESCE(xb.agent_id, $1) as agent_id,
        xb.currency,
        SUM(xb.amount) as total_amount,
        COUNT(*) as entry_count,
        s.period_from as transaction_date,
        s.settlement_number,
        s.station_id
      FROM settlement_excess_baggage xb
      JOIN settlements s ON xb.settlement_id = s.id
      WHERE (xb.is_deleted = false OR xb.is_deleted IS NULL)
      GROUP BY xb.settlement_id, COALESCE(xb.agent_id, $1), xb.currency, s.period_from, s.settlement_number, s.station_id
      ORDER BY s.period_from, xb.currency
    `, [TAMBUA_ID]);

    console.log(`  Found ${aggregated.rows.length} groups to migrate`);

    // ========== STEP 2: Insert station_sales records ==========
    console.log('\n=== INSERTING STATION SALES ===');
    let insertCount = 0;
    let totalInsertedSSP = 0;
    let totalInsertedUSD = 0;

    for (const row of aggregated.rows) {
      const txDate = new Date(row.transaction_date);
      const dateStr = txDate.toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(10000 + Math.random() * 90000);
      const saleRef = `XBAG${dateStr}-${randomSuffix}`;

      await client.query(`
        INSERT INTO station_sales
          (sale_reference, station_id, agent_id, point_of_sale, transaction_date,
           sales_amount, cashout_amount, currency, payment_method,
           description, created_by, settlement_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        saleRef,
        row.station_id,
        row.agent_id,
        'Kushair Traffic',
        row.transaction_date,
        parseFloat(row.total_amount),
        0,
        row.currency,
        'CASH',
        'Migrated from excess baggage (X-BAG) entries',
        SYSTEM_USER_ID,
        row.settlement_id
      ]);

      insertCount++;
      if (row.currency === 'SSP') totalInsertedSSP += parseFloat(row.total_amount);
      if (row.currency === 'USD') totalInsertedUSD += parseFloat(row.total_amount);

      const agentName = row.agent_id === TAMBUA_ID ? 'TAMBUA' : (row.agent_id === MALIK_ID ? 'MALIK' : row.agent_id);
      console.log(`  ${row.settlement_number} | ${agentName} | ${row.currency} | ${row.total_amount} (${row.entry_count} entries)`);
    }

    console.log(`\n  Inserted ${insertCount} station_sales records`);
    console.log(`  SSP total: ${totalInsertedSSP}`);
    console.log(`  USD total: ${totalInsertedUSD}`);

    // ========== STEP 3: Soft-delete all xbag entries ==========
    console.log('\n=== SOFT-DELETING X-BAG ENTRIES ===');
    const deleteResult = await client.query(`
      UPDATE settlement_excess_baggage
      SET is_deleted = true,
          deleted_at = CURRENT_TIMESTAMP,
          notes = COALESCE(notes, '') || ' [Migrated to station_sales]'
      WHERE (is_deleted = false OR is_deleted IS NULL)
    `);
    console.log(`  Soft-deleted ${deleteResult.rowCount} entries`);

    // ========== STEP 4: Recalculate all affected settlements ==========
    console.log('\n=== RECALCULATING SETTLEMENTS ===');
    const affectedSettlements = await client.query(`
      SELECT DISTINCT s.id, s.settlement_number, s.station_id, s.period_from, s.period_to
      FROM settlements s
      WHERE s.id IN (
        SELECT DISTINCT settlement_id FROM settlement_excess_baggage
      )
      ORDER BY s.period_from
    `);

    for (const settlement of affectedSettlements.rows) {
      const sid = settlement.id;

      // Recalculate expected cash from station_sales only
      const salesSummary = await client.query(`
        SELECT ss.agent_id, ss.currency, ss.point_of_sale,
               SUM(COALESCE(ss.sales_amount, ss.amount, 0) - COALESCE(ss.cashout_amount, 0)) as total_amount,
               COUNT(*) as sale_count
        FROM station_sales ss
        WHERE ss.station_id = $1
          AND ss.transaction_date >= $2
          AND ss.transaction_date <= $3
          AND (ss.settlement_id IS NULL OR ss.settlement_id = $4)
        GROUP BY ss.agent_id, ss.currency, ss.point_of_sale
      `, [settlement.station_id, settlement.period_from, settlement.period_to, sid]);

      // Track which agent/currency combos have sales
      const agentsWithSales = new Set();

      for (const sale of salesSummary.rows) {
        if (!sale.agent_id) continue;
        const key = `${sale.agent_id}_${sale.currency}`;
        agentsWithSales.add(key);
        const totalAmount = parseFloat(sale.total_amount) || 0;

        // Check if entry exists
        const existing = await client.query(
          `SELECT id FROM settlement_agent_entries
           WHERE settlement_id = $1 AND agent_id = $2 AND currency = $3
           AND (is_deleted = false OR is_deleted IS NULL)`,
          [sid, sale.agent_id, sale.currency]
        );

        if (existing.rows.length > 0) {
          await client.query(
            `UPDATE settlement_agent_entries
             SET expected_cash = $1, point_of_sale = COALESCE(point_of_sale, $2), updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [totalAmount, sale.point_of_sale, existing.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO settlement_agent_entries (settlement_id, agent_id, currency, expected_cash, declared_cash, variance, variance_status, point_of_sale)
             VALUES ($1, $2, $3, $4, NULL, NULL, 'PENDING', $5)`,
            [sid, sale.agent_id, sale.currency, totalAmount, sale.point_of_sale]
          );
        }
      }

      // Set expected_cash = 0 for entries with no sales
      const existingEntries = await client.query(
        `SELECT id, agent_id, currency FROM settlement_agent_entries
         WHERE settlement_id = $1 AND (is_deleted = false OR is_deleted IS NULL)`,
        [sid]
      );
      for (const entry of existingEntries.rows) {
        const key = `${entry.agent_id}_${entry.currency}`;
        if (!agentsWithSales.has(key)) {
          await client.query(
            `UPDATE settlement_agent_entries SET expected_cash = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [entry.id]
          );
        }
      }

      // Recalculate settlement summaries
      const currencies = await client.query(
        `SELECT DISTINCT currency FROM settlement_agent_entries WHERE settlement_id = $1 AND (is_deleted = false OR is_deleted IS NULL)`,
        [sid]
      );

      for (const curr of currencies.rows) {
        const c = curr.currency;

        const expectedResult = await client.query(
          `SELECT COALESCE(SUM(expected_cash), 0) as total
           FROM settlement_agent_entries
           WHERE settlement_id = $1 AND currency = $2 AND (is_deleted = false OR is_deleted IS NULL)`,
          [sid, c]
        );
        const expectedCash = parseFloat(expectedResult.rows[0].total);

        const expenseResult = await client.query(
          `SELECT COALESCE(SUM(amount), 0) as total
           FROM settlement_expenses
           WHERE settlement_id = $1 AND currency = $2 AND (is_deleted = false OR is_deleted IS NULL)`,
          [sid, c]
        );
        const totalExpenses = parseFloat(expenseResult.rows[0].total);

        const declaredResult = await client.query(
          `SELECT COALESCE(SUM(declared_cash), 0) as total,
                  bool_and(declared_cash IS NOT NULL) as all_declared
           FROM settlement_agent_entries
           WHERE settlement_id = $1 AND currency = $2 AND (is_deleted = false OR is_deleted IS NULL)`,
          [sid, c]
        );
        const actualCash = parseFloat(declaredResult.rows[0].total);
        const allDeclared = declaredResult.rows[0].all_declared;

        const summaryExists = await client.query(
          `SELECT id, opening_balance FROM settlement_summaries WHERE settlement_id = $1 AND currency = $2 AND (is_deleted = false OR is_deleted IS NULL)`,
          [sid, c]
        );
        const openingBalance = summaryExists.rows.length > 0 ? parseFloat(summaryExists.rows[0].opening_balance || 0) : 0;

        const expectedNetCash = roundMoney(expectedCash - totalExpenses + openingBalance);
        const finalVariance = roundMoney(actualCash - expectedNetCash);
        let varianceStatus;
        if (!allDeclared) varianceStatus = 'PENDING';
        else if (Math.abs(finalVariance) < 0.01) varianceStatus = 'BALANCED';
        else if (finalVariance < 0) varianceStatus = 'SHORT';
        else varianceStatus = 'EXTRA';

        if (summaryExists.rows.length > 0) {
          await client.query(
            `UPDATE settlement_summaries
             SET expected_cash = $1, total_expenses = $2, expected_net_cash = $3,
                 actual_cash_received = $4, agent_cash_total = $4, final_variance = $5,
                 variance_status = $6, updated_at = CURRENT_TIMESTAMP
             WHERE id = $7`,
            [expectedCash, totalExpenses, expectedNetCash, actualCash, finalVariance, varianceStatus, summaryExists.rows[0].id]
          );
        }
      }

      // Recalculate variance for each agent entry
      await client.query(`
        UPDATE settlement_agent_entries
        SET variance = COALESCE(declared_cash, 0) - expected_cash,
            variance_status = CASE
              WHEN declared_cash IS NULL THEN 'PENDING'
              WHEN ABS(COALESCE(declared_cash, 0) - expected_cash) < 0.01 THEN 'BALANCED'
              WHEN COALESCE(declared_cash, 0) < expected_cash THEN 'SHORT'
              ELSE 'EXTRA'
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE settlement_id = $1 AND (is_deleted = false OR is_deleted IS NULL)
      `, [sid]);

      console.log(`  Recalculated: ${settlement.settlement_number}`);
    }

    // ========== STEP 5: Verification ==========
    console.log('\n=== POST-MIGRATION VERIFICATION ===');
    const postSales = await client.query(`
      SELECT currency, COUNT(*) as count, SUM(sales_amount) as total
      FROM station_sales
      WHERE description = 'Migrated from excess baggage (X-BAG) entries'
      GROUP BY currency
    `);
    console.log('  Migrated station_sales:');
    postSales.rows.forEach(r => console.log(`    ${r.currency}: ${r.count} records, total: ${r.total}`));

    const postXbag = await client.query(`
      SELECT COUNT(*) as active FROM settlement_excess_baggage WHERE (is_deleted = false OR is_deleted IS NULL)
    `);
    console.log(`  Remaining active xbag entries: ${postXbag.rows[0].active}`);

    // Compare pre vs post
    console.log('\n=== AMOUNT COMPARISON ===');
    for (const pre of preTotals.rows) {
      const post = postSales.rows.find(p => p.currency === pre.currency);
      const postTotal = post ? parseFloat(post.total) : 0;
      const preTotal = parseFloat(pre.total_amount);
      const diff = roundMoney(postTotal - preTotal);
      console.log(`  ${pre.currency}: pre=${preTotal}, post=${postTotal}, diff=${diff} ${diff === 0 ? '✓' : '*** MISMATCH ***'}`);
    }

    await client.query('COMMIT');
    console.log('\n=== MIGRATION COMPLETE ===');
    process.exit(0);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n*** MIGRATION FAILED - ROLLED BACK ***');
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
  }
}

migrate();
