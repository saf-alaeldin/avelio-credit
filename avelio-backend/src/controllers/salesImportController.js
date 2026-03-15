const db = require('../config/db');
const XLSX = require('xlsx');
const logger = require('../utils/logger');

const roundMoney = (value) => Math.round((parseFloat(value) || 0) * 100) / 100;

// Convert Excel serial date to JS Date
function excelDateToJS(serial) {
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 86400000);
}

// ======= MAPPINGS =======

const POS_TO_STATION = {
  'Airport Office I': 'JUB',
  'Airport Office II': 'JUB',
  'Juba Market Office': 'JUB',
  'KushAir Head Office': 'JUB',
  'KUSHAIR TRAFFIC POS': 'JUB',
  'Wau Office': 'WUU',
  'YAMBIO OFFICE POS': 'YB1',
  'AWEIL OFFICE POS': 'AW1',
  'MALAKAL OFFICE': 'MAK',
  'BENTIU OFFICE': 'BE1',
  'KUAJOK OFFICE': 'KU1',
};

// Excel POS name -> System POS name (for JUB only, so sales match the POS filter)
const EXCEL_POS_TO_SYSTEM_POS = {
  'Airport Office I': 'Airport I',
  'Airport Office II': 'Airport II',
  'Juba Market Office': 'Juba Market Office',
  'KushAir Head Office': 'Kushair Head Office',
  'KUSHAIR TRAFFIC POS': 'Kushair Traffic',
};

// Agent name from Excel -> agent_code in DB (JUB only)
const AGENT_NAME_TO_CODE = {
  'KUOL Robert': 'ROB01',
  'ALPHONSE Sebit': 'SEB00',
  'ABRAHAM Emmanuela': 'EMM00',
  'SIMON Sunday': 'SUN00',
  'WILSON Sarah': 'SAR02',
  'SAEED Mohamed': 'MHD',
  'SAMI Ahmed': 'ASAMI',
  'AMONA Tambua': 'TAM00',
  'KEJI Davidika': 'DAV00',
  'JOSEPH Nancy': 'NAN00',
  'AIRPORT I Sarahw': 'SAR00',
  'ABO Malek': 'MAL00',
  'JAMES Wilson': 'WIL24',
};

// ======= HELPERS =======

function categorizeHeading(heading) {
  if (!heading) return 'unknown';
  const h = heading.toLowerCase();
  if (h.startsWith('cash-in transaction')) return 'cash_in';
  if (h.startsWith('cash-out transaction') || h.startsWith('cash-out the selected')) return 'cash_out';
  if (h.startsWith('cash-in the booking')) return 'modification';
  if (h.includes('excess luggage') || h.includes('excess baggage')) return 'cash_in'; // treated as regular sale
  if (h.startsWith('payment cash') || h.startsWith('payment ')) return 'receipt_payment';
  return 'unknown';
}

function parseExcelForSales(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  if (data.length < 2) return [];

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 7) continue;

    const heading = String(row[6] || '');
    const category = categorizeHeading(heading);

    // Skip receipt payments - handled by receipt import
    if (category === 'receipt_payment') continue;
    if (category === 'unknown') continue;

    // Extract date
    const dateSerial = row[0];
    let txDate = null;
    let dateStr = null;
    if (dateSerial) {
      if (typeof dateSerial === 'number') {
        txDate = excelDateToJS(dateSerial);
      } else {
        txDate = new Date(dateSerial);
      }
      if (txDate && !isNaN(txDate.getTime())) {
        dateStr = txDate.toISOString().split('T')[0];
      }
    }

    const pos = String(row[1] || '').trim();
    const agent = String(row[4] || '').trim();
    const balance = parseFloat(row[9]) || 0;
    const currency = String(row[10] || 'USD').trim();

    rows.push({
      rowIndex: i,
      dateStr,
      pos,
      agent,
      heading,
      category,
      balance,
      currency,
    });
  }

  return rows;
}

// Aggregate rows into sales groups per station+agent+currency+date
function aggregateRows(rows, stationMap, agentMap, isJubStation) {
  const groups = {};

  for (const row of rows) {
    const stationCode = POS_TO_STATION[row.pos];
    if (!stationCode) continue; // unmapped POS

    const station = stationMap[stationCode];
    if (!station) continue;

    const isJub = stationCode === 'JUB';

    // For JUB: group by agent+currency+date, for outstations: group by station+currency+date
    let agentId = null;
    let agentCode = null;
    if (isJub) {
      agentCode = AGENT_NAME_TO_CODE[row.agent];
      if (!agentCode) continue; // unmapped agent
      const dbAgent = agentMap[agentCode];
      if (!dbAgent) continue;
      agentId = dbAgent.id;
    }

    const groupKey = isJub
      ? `${stationCode}|${agentCode}|${row.currency}|${row.dateStr}|${row.pos}`
      : `${stationCode}|_station_|${row.currency}|${row.dateStr}`;

    if (!groups[groupKey]) {
      groups[groupKey] = {
        stationCode,
        stationId: station.id,
        agentId: isJub ? agentId : null,
        agentCode: isJub ? agentCode : null,
        agentName: isJub ? (agentMap[agentCode]?.agent_name || row.agent) : null,
        currency: row.currency,
        dateStr: row.dateStr,
        salesAmount: 0,
        cashoutAmount: 0,
        rowCount: 0,
        pos: isJub ? (EXCEL_POS_TO_SYSTEM_POS[row.pos] || row.pos) : row.pos,
      };
    }

    if (row.category === 'cash_out') {
      groups[groupKey].cashoutAmount += Math.abs(row.balance);
    } else {
      groups[groupKey].salesAmount += row.balance;
    }
    groups[groupKey].rowCount++;
  }

  return Object.values(groups);
}

// Generate sale reference
function generateSaleReference() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `SL${year}${month}${day}-${random}`;
}

// ======= PREVIEW =======

const previewSalesImport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const rows = parseExcelForSales(req.file.buffer);

    if (rows.length === 0) {
      return res.json({
        success: true,
        message: 'No sales entries found in the file.',
        data: { salesGroups: [], warnings: [], errors: [], skippedReceipts: 0 },
      });
    }

    // Count skipped receipt_payment rows (parse again to count)
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allData = XLSX.utils.sheet_to_json(ws, { header: 1 });
    let skippedReceipts = 0;
    for (let i = 1; i < allData.length; i++) {
      const heading = String(allData[i]?.[6] || '').toLowerCase();
      if (heading.startsWith('payment cash') || heading.startsWith('payment ')) skippedReceipts++;
    }

    // Auto-detect date from first row
    const detectedDate = rows[0]?.dateStr || null;

    // Load stations and agents
    const stationsResult = await db.query(
      'SELECT id, station_code, station_name FROM stations WHERE is_active = true'
    );
    const stationMap = {};
    stationsResult.rows.forEach(s => { stationMap[s.station_code] = s; });

    const agentsResult = await db.query(
      'SELECT id, agent_code, agent_name FROM sales_agents WHERE is_active = true'
    );
    const agentMap = {};
    agentsResult.rows.forEach(a => { agentMap[a.agent_code] = a; });

    // Check for unmapped POS/agents
    const warnings = [];
    const unmappedPOS = new Set();
    const unmappedAgents = new Set();

    for (const row of rows) {
      if (!POS_TO_STATION[row.pos]) {
        unmappedPOS.add(row.pos);
      }
      const stationCode = POS_TO_STATION[row.pos];
      if (stationCode === 'JUB' && !AGENT_NAME_TO_CODE[row.agent]) {
        unmappedAgents.add(row.agent);
      }
    }

    unmappedPOS.forEach(pos => {
      warnings.push({ type: 'unmapped_pos', message: `Unmapped POS: "${pos}" - rows will be skipped` });
    });
    unmappedAgents.forEach(agent => {
      warnings.push({ type: 'unmapped_agent', message: `Unmapped JUB agent: "${agent}" - rows will be skipped` });
    });

    // Aggregate
    const salesGroups = aggregateRows(rows, stationMap, agentMap);

    // For each station+date combo, check settlement status
    const stationDateChecks = {};
    for (const group of salesGroups) {
      const key = `${group.stationId}|${group.dateStr}`;
      if (stationDateChecks[key]) continue;

      // Check for DRAFT settlement covering this date (can be extended/overwritten)
      const draftResult = await db.query(
        `SELECT id, settlement_number, period_from, period_to, status
         FROM settlements
         WHERE station_id = $1
           AND status = 'DRAFT'
           AND (is_deleted = false OR is_deleted IS NULL)
           AND period_from <= $2 AND period_to >= $2`,
        [group.stationId, group.dateStr]
      );

      // Check for non-DRAFT settlement covering this date (blocked)
      const protectedResult = await db.query(
        `SELECT id, settlement_number, period_from, period_to, status
         FROM settlements
         WHERE station_id = $1
           AND status NOT IN ('DRAFT', 'REJECTED')
           AND (is_deleted = false OR is_deleted IS NULL)
           AND period_from <= $2 AND period_to >= $2`,
        [group.stationId, group.dateStr]
      );

      // Check for DRAFT settlement that can be extended (covers adjacent dates)
      const extendableDraft = await db.query(
        `SELECT id, settlement_number, period_from, period_to, status
         FROM settlements
         WHERE station_id = $1
           AND status = 'DRAFT'
           AND (is_deleted = false OR is_deleted IS NULL)
         ORDER BY period_to DESC
         LIMIT 1`,
        [group.stationId]
      );

      stationDateChecks[key] = {
        draft: draftResult.rows[0] || null,
        protected: protectedResult.rows[0] || null,
        extendableDraft: extendableDraft.rows[0] || null,
      };
    }

    // Enrich groups with settlement info
    const enrichedGroups = salesGroups.map(group => {
      const key = `${group.stationId}|${group.dateStr}`;
      const check = stationDateChecks[key] || {};

      let action = 'create_settlement'; // default: will create new DRAFT
      let settlementInfo = null;

      if (check.protected) {
        action = 'blocked';
        settlementInfo = {
          id: check.protected.id,
          number: check.protected.settlement_number,
          status: check.protected.status,
          period: `${check.protected.period_from} to ${check.protected.period_to}`,
        };
      } else if (check.draft) {
        action = 'overwrite_in_draft';
        settlementInfo = {
          id: check.draft.id,
          number: check.draft.settlement_number,
          status: 'DRAFT',
          period: `${check.draft.period_from} to ${check.draft.period_to}`,
        };
      } else if (check.extendableDraft) {
        action = 'extend_draft';
        settlementInfo = {
          id: check.extendableDraft.id,
          number: check.extendableDraft.settlement_number,
          status: 'DRAFT',
          period: `${check.extendableDraft.period_from} to ${check.extendableDraft.period_to}`,
        };
      }

      return {
        ...group,
        salesAmount: roundMoney(group.salesAmount),
        cashoutAmount: roundMoney(group.cashoutAmount),
        netAmount: roundMoney(group.salesAmount - group.cashoutAmount),
        action,
        settlementInfo,
      };
    });

    // Count blocked vs allowed
    const blocked = enrichedGroups.filter(g => g.action === 'blocked');
    const allowed = enrichedGroups.filter(g => g.action !== 'blocked');

    if (blocked.length > 0) {
      blocked.forEach(b => {
        warnings.push({
          type: 'protected_settlement',
          message: `${b.stationCode} ${b.dateStr}: blocked by ${b.settlementInfo.status} settlement ${b.settlementInfo.number}`,
        });
      });
    }

    // Count by action type
    const summary = {
      totalExcelRows: rows.length,
      skippedReceipts,
      salesGroups: enrichedGroups.length,
      stationsAffected: [...new Set(enrichedGroups.filter(g => g.action !== 'blocked').map(g => g.stationCode))],
      dates: [...new Set(enrichedGroups.map(g => g.dateStr))],
      newSettlements: enrichedGroups.filter(g => g.action === 'create_settlement').length,
      extendedDrafts: enrichedGroups.filter(g => g.action === 'extend_draft').length,
      overwritten: enrichedGroups.filter(g => g.action === 'overwrite_in_draft').length,
      blocked: blocked.length,
      warnings: warnings.length,
    };

    res.json({
      success: true,
      data: {
        summary,
        detectedDate,
        salesGroups: enrichedGroups,
        warnings,
      },
    });
  } catch (error) {
    logger.error('Sales import preview error:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to preview sales import.' });
  }
};

// ======= EXECUTE =======

const executeSalesImport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const userId = req.user?.id || req.user?.user_id;
    const rows = parseExcelForSales(req.file.buffer);

    if (rows.length === 0) {
      return res.json({ success: true, message: 'No sales entries found.', data: { results: [] } });
    }

    // Load stations and agents
    const stationsResult = await db.query(
      'SELECT id, station_code, station_name FROM stations WHERE is_active = true'
    );
    const stationMap = {};
    stationsResult.rows.forEach(s => { stationMap[s.station_code] = s; });

    const agentsResult = await db.query(
      'SELECT id, agent_code, agent_name FROM sales_agents WHERE is_active = true'
    );
    const agentMap = {};
    agentsResult.rows.forEach(a => { agentMap[a.agent_code] = a; });

    // Aggregate rows into groups
    const salesGroups = aggregateRows(rows, stationMap, agentMap);

    const client = await db.pool.connect();
    const results = [];
    let salesCreated = 0;
    let salesOverwritten = 0;
    let settlementsCreated = 0;
    let settlementsExtended = 0;
    let blockedCount = 0;
    let errorCount = 0;

    try {
      await client.query('BEGIN');

      // Group sales by station+date for settlement handling
      const stationDateGroups = {};
      for (const group of salesGroups) {
        const key = `${group.stationId}|${group.dateStr}`;
        if (!stationDateGroups[key]) {
          stationDateGroups[key] = {
            stationId: group.stationId,
            stationCode: group.stationCode,
            dateStr: group.dateStr,
            groups: [],
          };
        }
        stationDateGroups[key].groups.push(group);
      }

      // Process each station+date combo
      for (const sdKey of Object.keys(stationDateGroups)) {
        const sd = stationDateGroups[sdKey];

        try {
          // Check for protected (non-DRAFT) settlement
          const protectedResult = await client.query(
            `SELECT id, settlement_number, status
             FROM settlements
             WHERE station_id = $1
               AND status NOT IN ('DRAFT', 'REJECTED')
               AND (is_deleted = false OR is_deleted IS NULL)
               AND period_from <= $2 AND period_to >= $2`,
            [sd.stationId, sd.dateStr]
          );

          if (protectedResult.rows.length > 0) {
            const pSettlement = protectedResult.rows[0];
            for (const group of sd.groups) {
              results.push({
                action: 'blocked',
                stationCode: group.stationCode,
                date: group.dateStr,
                currency: group.currency,
                reason: `Protected by ${pSettlement.status} settlement ${pSettlement.settlement_number}`,
              });
              blockedCount++;
            }
            continue;
          }

          // Find or create/extend DRAFT settlement
          let settlementId = null;

          // 1. Check for DRAFT covering this date
          const draftCovering = await client.query(
            `SELECT id, settlement_number, period_from, period_to
             FROM settlements
             WHERE station_id = $1
               AND status = 'DRAFT'
               AND (is_deleted = false OR is_deleted IS NULL)
               AND period_from <= $2 AND period_to >= $2`,
            [sd.stationId, sd.dateStr]
          );

          if (draftCovering.rows.length > 0) {
            // Date already within DRAFT period - overwrite sales for this date
            settlementId = draftCovering.rows[0].id;

            // Delete existing sales for this station+date within this settlement
            for (const group of sd.groups) {
              const deleteResult = await client.query(
                `DELETE FROM station_sales
                 WHERE station_id = $1
                   AND transaction_date = $2
                   AND currency = $3
                   AND settlement_id = $4
                   ${group.agentId ? 'AND agent_id = $5 AND point_of_sale = $6' : 'AND agent_id IS NULL'}`,
                group.agentId
                  ? [sd.stationId, sd.dateStr, group.currency, settlementId, group.agentId, group.pos]
                  : [sd.stationId, sd.dateStr, group.currency, settlementId]
              );
              if (deleteResult.rowCount > 0) {
                salesOverwritten += deleteResult.rowCount;
              }
            }

            results.push({
              action: 'overwrite_in_draft',
              stationCode: sd.stationCode,
              date: sd.dateStr,
              settlementNumber: draftCovering.rows[0].settlement_number,
            });
          } else {
            // 2. Check for DRAFT that can be extended
            const extendableDraft = await client.query(
              `SELECT id, settlement_number, period_from, period_to
               FROM settlements
               WHERE station_id = $1
                 AND status = 'DRAFT'
                 AND (is_deleted = false OR is_deleted IS NULL)
               ORDER BY period_to DESC
               LIMIT 1`,
              [sd.stationId]
            );

            if (extendableDraft.rows.length > 0) {
              const draft = extendableDraft.rows[0];
              const newFrom = sd.dateStr < draft.period_from ? sd.dateStr : draft.period_from;
              const newTo = sd.dateStr > draft.period_to ? sd.dateStr : draft.period_to;

              // Only extend if the new date wouldn't overlap with a non-DRAFT settlement
              const overlapCheck = await client.query(
                `SELECT id, settlement_number, status FROM settlements
                 WHERE station_id = $1
                   AND id != $2
                   AND status NOT IN ('DRAFT', 'REJECTED')
                   AND (is_deleted = false OR is_deleted IS NULL)
                   AND $3 <= period_to AND $4 >= period_from`,
                [sd.stationId, draft.id, newFrom, newTo]
              );

              if (overlapCheck.rows.length === 0) {
                // Safe to extend - temporarily disable the overlap trigger for this UPDATE
                // Actually, check if extending would overlap with another DRAFT
                const draftOverlapCheck = await client.query(
                  `SELECT id FROM settlements
                   WHERE station_id = $1
                     AND id != $2
                     AND status NOT IN ('REJECTED')
                     AND (is_deleted = false OR is_deleted IS NULL)
                     AND $3 <= period_to AND $4 >= period_from`,
                  [sd.stationId, draft.id, newFrom, newTo]
                );

                if (draftOverlapCheck.rows.length === 0) {
                  await client.query(
                    `UPDATE settlements SET period_from = $1, period_to = $2 WHERE id = $3`,
                    [newFrom, newTo, draft.id]
                  );
                  settlementId = draft.id;
                  settlementsExtended++;

                  results.push({
                    action: 'extend_draft',
                    stationCode: sd.stationCode,
                    date: sd.dateStr,
                    settlementNumber: draft.settlement_number,
                    newPeriod: `${newFrom} to ${newTo}`,
                  });
                } else {
                  // Can't extend due to overlap - create new settlement
                  settlementId = await createDraftSettlement(client, sd.stationId, sd.stationCode, sd.dateStr, userId);
                  settlementsCreated++;
                  results.push({
                    action: 'create_settlement',
                    stationCode: sd.stationCode,
                    date: sd.dateStr,
                  });
                }
              } else {
                // Extending would overlap with protected settlement - create new
                settlementId = await createDraftSettlement(client, sd.stationId, sd.stationCode, sd.dateStr, userId);
                settlementsCreated++;
                results.push({
                  action: 'create_settlement',
                  stationCode: sd.stationCode,
                  date: sd.dateStr,
                });
              }
            } else {
              // 3. No DRAFT exists at all - create new
              settlementId = await createDraftSettlement(client, sd.stationId, sd.stationCode, sd.dateStr, userId);
              settlementsCreated++;
              results.push({
                action: 'create_settlement',
                stationCode: sd.stationCode,
                date: sd.dateStr,
              });
            }
          }

          // Insert sales for this station+date
          for (const group of sd.groups) {
            const saleRef = generateSaleReference();
            await client.query(
              `INSERT INTO station_sales
               (sale_reference, station_id, agent_id, point_of_sale, transaction_date,
                sales_amount, cashout_amount, currency, payment_method, description, created_by, settlement_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CASH', $9, $10, $11)`,
              [
                saleRef,
                sd.stationId,
                group.agentId || null,
                group.pos || null,
                group.dateStr,
                roundMoney(group.salesAmount),
                roundMoney(group.cashoutAmount),
                group.currency,
                `Imported from Excel (${group.rowCount} entries)`,
                userId,
                settlementId,
              ]
            );
            salesCreated++;

            results.push({
              action: 'sale_created',
              stationCode: group.stationCode,
              agent: group.agentName || 'Station Total',
              date: group.dateStr,
              currency: group.currency,
              salesAmount: roundMoney(group.salesAmount),
              cashoutAmount: roundMoney(group.cashoutAmount),
              netAmount: roundMoney(group.salesAmount - group.cashoutAmount),
            });
          }

          // Recalculate settlement agent entries and summary
          if (settlementId) {
            await recalculateSettlement(client, settlementId);
          }
        } catch (sdError) {
          logger.error('Sales import station/date error:', {
            station: sd.stationCode,
            date: sd.dateStr,
            error: sdError.message,
          });
          results.push({
            action: 'error',
            stationCode: sd.stationCode,
            date: sd.dateStr,
            reason: sdError.message,
          });
          errorCount++;
        }
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Import complete: ${salesCreated} sales created, ${salesOverwritten} overwritten, ${settlementsCreated} settlements created, ${settlementsExtended} extended, ${blockedCount} blocked, ${errorCount} errors`,
        data: {
          summary: {
            salesCreated,
            salesOverwritten,
            settlementsCreated,
            settlementsExtended,
            blocked: blockedCount,
            errors: errorCount,
          },
          results,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Sales import execute error:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to execute sales import.' });
  }
};

// ======= INTERNAL HELPERS =======

async function createDraftSettlement(client, stationId, stationCode, dateStr, userId) {
  // Generate settlement number
  const numberResult = await client.query(
    'SELECT generate_settlement_number($1, $2) as number',
    [stationCode, dateStr]
  );
  const settlementNumber = numberResult.rows[0].number;

  // Create single-day DRAFT settlement
  const result = await client.query(
    `INSERT INTO settlements
     (settlement_number, station_id, period_from, period_to, status, created_by)
     VALUES ($1, $2, $3, $3, 'DRAFT', $4)
     RETURNING id`,
    [settlementNumber, stationId, dateStr, userId]
  );

  return result.rows[0].id;
}

async function recalculateSettlement(client, settlementId) {
  // Get settlement details
  const settlement = await client.query(
    `SELECT id, station_id, period_from, period_to FROM settlements WHERE id = $1`,
    [settlementId]
  );
  if (settlement.rows.length === 0) return;

  const { station_id, period_from, period_to } = settlement.rows[0];

  // Get sales grouped by agent+currency
  const salesSummary = await client.query(
    `SELECT agent_id, currency,
            SUM(COALESCE(sales_amount, amount, 0)) as total_sales,
            SUM(COALESCE(cashout_amount, 0)) as total_cashout,
            COUNT(*) as sale_count
     FROM station_sales
     WHERE station_id = $1
       AND transaction_date >= $2
       AND transaction_date <= $3
       AND (settlement_id IS NULL OR settlement_id = $4)
     GROUP BY agent_id, currency`,
    [station_id, period_from, period_to, settlementId]
  );

  // Link all unlinked sales in the period
  await client.query(
    `UPDATE station_sales SET settlement_id = $1
     WHERE station_id = $2
       AND transaction_date >= $3
       AND transaction_date <= $4
       AND settlement_id IS NULL`,
    [settlementId, station_id, period_from, period_to]
  );

  // Get existing agent entries (preserve declared_cash)
  const existingEntries = await client.query(
    `SELECT id, agent_id, currency, declared_cash FROM settlement_agent_entries WHERE settlement_id = $1`,
    [settlementId]
  );
  const existingMap = {};
  existingEntries.rows.forEach(e => {
    existingMap[`${e.agent_id}_${e.currency}`] = e;
  });

  const agentsProcessed = new Set();

  // Upsert agent entries
  for (const row of salesSummary.rows) {
    const expectedCash = roundMoney(parseFloat(row.total_sales) - parseFloat(row.total_cashout));
    const key = `${row.agent_id}_${row.currency}`;
    agentsProcessed.add(key);

    const existing = existingMap[key];
    if (existing) {
      await client.query(
        `UPDATE settlement_agent_entries SET expected_cash = $1 WHERE id = $2`,
        [expectedCash, existing.id]
      );
    } else {
      await client.query(
        `INSERT INTO settlement_agent_entries
         (settlement_id, agent_id, currency, expected_cash)
         VALUES ($1, $2, $3, $4)`,
        [settlementId, row.agent_id, row.currency, expectedCash]
      );
    }
  }

  // Zero out entries for agents with no sales
  for (const entry of existingEntries.rows) {
    const key = `${entry.agent_id}_${entry.currency}`;
    if (!agentsProcessed.has(key)) {
      await client.query(
        `UPDATE settlement_agent_entries SET expected_cash = 0 WHERE id = $1`,
        [entry.id]
      );
    }
  }

  // Recalculate settlement summaries
  await recalculateSettlementSummary(client, settlementId);
}

async function recalculateSettlementSummary(client, settlementId) {
  // Get unique currencies
  const currencies = await client.query(
    `SELECT DISTINCT currency FROM (
       SELECT currency FROM settlement_agent_entries WHERE settlement_id = $1
       UNION
       SELECT currency FROM settlement_expenses WHERE settlement_id = $1
     ) all_currencies`,
    [settlementId]
  );

  for (const { currency } of currencies.rows) {
    // Expected cash
    const expectedResult = await client.query(
      `SELECT COALESCE(SUM(expected_cash), 0) as expected_cash
       FROM settlement_agent_entries
       WHERE settlement_id = $1 AND currency = $2`,
      [settlementId, currency]
    );

    // Total expenses
    const expensesResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total_expenses
       FROM settlement_expenses
       WHERE settlement_id = $1 AND currency = $2`,
      [settlementId, currency]
    );

    const expectedCash = roundMoney(parseFloat(expectedResult.rows[0].expected_cash));
    const totalExpenses = roundMoney(parseFloat(expensesResult.rows[0].total_expenses));
    const expectedNetCash = roundMoney(expectedCash - totalExpenses);

    // Actual cash (sum of declared_cash)
    const actualResult = await client.query(
      `SELECT COALESCE(SUM(declared_cash), 0) as actual_cash,
              COUNT(*) FILTER (WHERE declared_cash IS NULL) as pending_count
       FROM settlement_agent_entries
       WHERE settlement_id = $1 AND currency = $2`,
      [settlementId, currency]
    );

    const actualCashReceived = roundMoney(parseFloat(actualResult.rows[0].actual_cash));
    const hasPending = parseInt(actualResult.rows[0].pending_count) > 0;
    const finalVariance = roundMoney(actualCashReceived - expectedNetCash);

    let varianceStatus = 'PENDING';
    if (!hasPending) {
      if (Math.abs(finalVariance) < 0.01) varianceStatus = 'BALANCED';
      else if (finalVariance < 0) varianceStatus = 'SHORT';
      else varianceStatus = 'EXTRA';
    }

    // Preserve existing station_declared_cash
    const existingSummary = await client.query(
      `SELECT station_declared_cash FROM settlement_summaries
       WHERE settlement_id = $1 AND currency = $2`,
      [settlementId, currency]
    );
    const existingStationCash = existingSummary.rows.length > 0
      ? existingSummary.rows[0].station_declared_cash
      : null;

    await client.query(
      `INSERT INTO settlement_summaries
       (settlement_id, currency, opening_balance, expected_cash, total_expenses,
        expected_net_cash, actual_cash_received, final_variance, variance_status,
        agent_cash_total, station_declared_cash)
       VALUES ($1, $2, 0, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (settlement_id, currency)
       DO UPDATE SET
         expected_cash = EXCLUDED.expected_cash,
         total_expenses = EXCLUDED.total_expenses,
         expected_net_cash = EXCLUDED.expected_net_cash,
         actual_cash_received = EXCLUDED.actual_cash_received,
         final_variance = EXCLUDED.final_variance,
         variance_status = EXCLUDED.variance_status,
         agent_cash_total = EXCLUDED.agent_cash_total,
         updated_at = CURRENT_TIMESTAMP`,
      [
        settlementId,
        currency,
        expectedCash,
        totalExpenses,
        expectedNetCash,
        actualCashReceived,
        finalVariance,
        varianceStatus,
        actualCashReceived,
        existingStationCash,
      ]
    );
  }
}

module.exports = {
  previewSalesImport,
  executeSalesImport,
};
