const db = require('../src/config/db');

async function investigate() {
  try {
    // List ALL sales agents
    const agents = await db.query(`SELECT id, agent_code, agent_name, is_active FROM sales_agents ORDER BY agent_name`);
    console.log('=== ALL Sales Agents ===');
    agents.rows.forEach(a => {
      console.log(`  ${a.agent_code}: ${a.agent_name} (active: ${a.is_active})`);
    });

    // List ALL settlements for Jan 15
    const allSettlements = await db.query(`
      SELECT s.*, st.station_code, st.station_name
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE s.period_to = '2026-01-15'
      ORDER BY st.station_name
    `);
    console.log('\n=== ALL Settlements for Jan 15 ===');
    if (allSettlements.rows.length === 0) {
      console.log('NO SETTLEMENTS FOUND for Jan 15!');
    } else {
      allSettlements.rows.forEach(s => {
        console.log(`  ${s.station_name} (${s.station_code}): Status=${s.status}, ID=${s.id}`);
      });
    }

    // Check what settlements exist at all
    const recentSettlements = await db.query(`
      SELECT s.id, s.period_from, s.period_to, s.status, st.station_code, st.station_name
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      ORDER BY s.period_to DESC, st.station_name
      LIMIT 20
    `);
    console.log('\n=== Recent Settlements (last 20) ===');
    recentSettlements.rows.forEach(s => {
      console.log(`  ${s.period_to} - ${s.station_name} (${s.station_code}): ${s.status}`);
    });

    // Check HQ settlement summaries for Jan 15
    const hqSummary = await db.query(`
      SELECT hs.*, hss.currency, hss.cash_from_stations, hss.opening_balance, hss.safe_amount
      FROM hq_settlements hs
      LEFT JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hs.summary_date = '2026-01-15'
    `);
    console.log('\n=== HQ Settlement for Jan 15 ===');
    hqSummary.rows.forEach(r => {
      console.log(`  Status: ${r.status}, Currency: ${r.currency}`);
      console.log(`    Cash from Stations: ${r.cash_from_stations}`);
      console.log(`    Opening Balance: ${r.opening_balance}`);
      console.log(`    Safe Amount: ${r.safe_amount}`);
    });

    // Check station sales for Jan 15 (regardless of settlement)
    const jan15Sales = await db.query(`
      SELECT ss.*, st.station_code, sa.agent_name
      FROM station_sales ss
      JOIN stations st ON ss.station_id = st.id
      LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
      WHERE ss.transaction_date = '2026-01-15'
      ORDER BY st.station_code, sa.agent_name
    `);
    console.log('\n=== ALL Station Sales for Jan 15 ===');
    console.log(`Total: ${jan15Sales.rows.length} sales`);

    // Group by station and agent
    const grouped = {};
    jan15Sales.rows.forEach(s => {
      const key = `${s.station_code} - ${s.agent_name || 'No Agent'} - ${s.currency}`;
      if (!grouped[key]) grouped[key] = { count: 0, total: 0, settled: 0 };
      grouped[key].count++;
      grouped[key].total += parseFloat(s.sales_amount || 0);
      if (s.settlement_id) grouped[key].settled++;
    });
    Object.entries(grouped).forEach(([k, v]) => {
      console.log(`  ${k}: ${v.count} sales (${v.settled} settled), total: ${v.total}`);
    });

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message, e.stack);
    process.exit(1);
  }
}

investigate();
