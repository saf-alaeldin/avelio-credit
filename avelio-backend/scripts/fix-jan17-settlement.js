const { Pool, types } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

function uuidv4() {
  return crypto.randomUUID();
}

types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'avelio_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
  max: 10
});

async function fixJan17Settlement() {
  const client = await pool.connect();
  try {
    const jubaId = '2a05e6c5-30b7-49dc-a4e4-cf947d5233c5';
    const settlementDate = '2026-01-17';
    const hqSettlementId = '121483ea-9025-4642-b2ae-82f06957d14e';

    // Check if settlement already exists
    const existing = await client.query(
      `SELECT * FROM settlements WHERE station_id = $1 AND period_to = $2`,
      [jubaId, settlementDate]
    );

    if (existing.rows.length > 0) {
      console.log('Settlement for Jan 17 already exists!');
      console.log(existing.rows[0]);
      return;
    }

    // Get all sales for Juba on Jan 17
    const sales = await client.query(`
      SELECT ss.agent_id, ss.currency, ss.point_of_sale, sa.agent_name,
             SUM(ss.sales_amount) as total_sales,
             SUM(ss.cashout_amount) as total_cashout
      FROM station_sales ss
      LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
      WHERE ss.station_id = $1
      AND ss.transaction_date = $2
      GROUP BY ss.agent_id, ss.currency, ss.point_of_sale, sa.agent_name
      ORDER BY sa.agent_name
    `, [jubaId, settlementDate]);

    console.log('=== SALES FOR JAN 17 ===');
    sales.rows.forEach(r => {
      console.log(`${r.agent_name} (${r.point_of_sale}) ${r.currency}: Sales=${r.total_sales}, Cashout=${r.total_cashout}`);
    });

    // Get opening balance from Jan 16 settlement summaries
    const jan16Settlement = await client.query(
      `SELECT id FROM settlements WHERE station_id = $1 AND period_to = '2026-01-16'`,
      [jubaId]
    );

    let openingUSD = 0;
    let openingSSP = 0;

    if (jan16Settlement.rows.length > 0) {
      const jan16Summary = await client.query(`
        SELECT currency, expected_cash, actual_cash_received, final_variance
        FROM settlement_summaries
        WHERE settlement_id = $1
      `, [jan16Settlement.rows[0].id]);

      console.log('\n=== JAN 16 SETTLEMENT SUMMARIES ===');
      jan16Summary.rows.forEach(r => {
        console.log(`${r.currency}: Expected=${r.expected_cash}, Actual=${r.actual_cash_received}, Variance=${r.final_variance}`);
        // Opening balance = what was left over (variance)
        if (r.currency === 'USD') openingUSD = parseFloat(r.final_variance) || 0;
        if (r.currency === 'SSP') openingSSP = parseFloat(r.final_variance) || 0;
      });
    }

    console.log('\nCalculated Opening balances:');
    console.log('USD:', openingUSD);
    console.log('SSP:', openingSSP);

    // Calculate totals by currency
    let totalUSD = 0;
    let totalSSP = 0;
    sales.rows.forEach(r => {
      if (r.currency === 'USD') totalUSD += parseFloat(r.total_sales) || 0;
      if (r.currency === 'SSP') totalSSP += parseFloat(r.total_sales) || 0;
    });

    console.log('\nTotal sales for Jan 17:');
    console.log('USD:', totalUSD);
    console.log('SSP:', totalSSP);

    console.log('\n=== READY TO CREATE SETTLEMENT ===');
    console.log('Run with --execute flag to create the settlement');

    if (process.argv.includes('--execute')) {
      await client.query('BEGIN');

      // Create settlement
      const settlementId = uuidv4();
      const settlementNumber = `STL-JUB-20260117-001`;

      await client.query(`
        INSERT INTO settlements (id, settlement_number, station_id, period_from, period_to, status, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'DRAFT', '53e3741b-51ee-4d66-9f6b-33ecabd8b463', NOW(), NOW())
      `, [settlementId, settlementNumber, jubaId, settlementDate, settlementDate]);

      console.log('Created settlement:', settlementId);

      // Create agent entries for each agent/currency/pos combination
      for (const sale of sales.rows) {
        const entryId = uuidv4();
        await client.query(`
          INSERT INTO settlement_agent_entries (id, settlement_id, agent_id, currency, point_of_sale, expected_cash, declared_cash, variance, variance_status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, 0, $6, 'PENDING', NOW(), NOW())
        `, [entryId, settlementId, sale.agent_id, sale.currency, sale.point_of_sale, sale.total_sales]);

        console.log(`Created entry for ${sale.agent_name} (${sale.point_of_sale}) ${sale.currency}: ${sale.total_sales}`);
      }

      // Create settlement summaries
      if (totalUSD > 0 || openingUSD !== 0) {
        const summaryIdUSD = uuidv4();
        const expectedUSD = openingUSD + totalUSD;
        await client.query(`
          INSERT INTO settlement_summaries (id, settlement_id, currency, opening_balance, expected_cash, total_expenses, expected_net_cash, actual_cash_received, final_variance, variance_status, created_at, updated_at)
          VALUES ($1, $2, 'USD', $3, $4, 0, $4, 0, $4, 'PENDING', NOW(), NOW())
        `, [summaryIdUSD, settlementId, openingUSD, expectedUSD]);
        console.log(`Created USD summary: Opening=${openingUSD}, Expected=${expectedUSD}`);
      }

      if (totalSSP > 0 || openingSSP !== 0) {
        const summaryIdSSP = uuidv4();
        const expectedSSP = openingSSP + totalSSP;
        await client.query(`
          INSERT INTO settlement_summaries (id, settlement_id, currency, opening_balance, expected_cash, total_expenses, expected_net_cash, actual_cash_received, final_variance, variance_status, created_at, updated_at)
          VALUES ($1, $2, 'SSP', $3, $4, 0, $4, 0, $4, 'PENDING', NOW(), NOW())
        `, [summaryIdSSP, settlementId, openingSSP, expectedSSP]);
        console.log(`Created SSP summary: Opening=${openingSSP}, Expected=${expectedSSP}`);
      }

      // Link station_sales to this settlement
      await client.query(`
        UPDATE station_sales SET settlement_id = $1
        WHERE station_id = $2 AND transaction_date = $3
      `, [settlementId, jubaId, settlementDate]);
      console.log('Linked sales to settlement');

      // Link to HQ settlement
      const hqStationId = uuidv4();
      await client.query(`
        INSERT INTO hq_settlement_stations (id, hq_settlement_id, station_settlement_id, created_at)
        VALUES ($1, $2, $3, NOW())
      `, [hqStationId, hqSettlementId, settlementId]);
      console.log('Linked to HQ settlement');

      await client.query('COMMIT');
      console.log('\n=== SETTLEMENT CREATED SUCCESSFULLY ===');
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
  } finally {
    client.release();
    pool.end();
  }
}

fixJan17Settlement();
