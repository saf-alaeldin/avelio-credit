const db = require('../config/db');
const XLSX = require('xlsx');
const logger = require('../utils/logger');

const roundMoney = (value) => Math.round((parseFloat(value) || 0) * 100) / 100;

// Convert Excel serial date to JS Date
function excelDateToJS(serial) {
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 86400000);
}

// Generate receipt number for a specific date (not necessarily today)
async function generateReceiptNumberForDate(dateStr) {
  // dateStr format: YYYY-MM-DD
  const [yearFull, month, day] = dateStr.split('-');
  const year = yearFull.slice(-2);
  const datePrefix = `KU${year}${month}${day}`;

  const result = await db.query(
    `SELECT COUNT(*) as count FROM receipts WHERE receipt_number LIKE $1`,
    [`${datePrefix}-%`]
  );

  const nextSequence = parseInt(result.rows[0].count, 10) + 1;
  const sequenceStr = String(nextSequence).padStart(4, '0');
  return `${datePrefix}-${sequenceStr}`;
}

// Parse the Excel file and extract receipt payment rows
function parseExcelForReceipts(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  if (data.length < 2) return [];

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[6]) continue;

    const heading = String(row[6] || '');

    // Only process "Payment Cash" or "Payment" entries that look like receipt deposits
    // Skip regular cash-in/cash-out/excess baggage entries
    if (!heading.startsWith('Payment Cash') && !heading.startsWith('Payment ')) continue;
    if (heading.includes('excess luggage') || heading.includes('excess baggage')) continue;
    if (heading.includes('Cash-in transaction') || heading.includes('Cash-out transaction')) continue;

    // Extract receipt number from heading (e.g., "Payment Cash KU260226-0001")
    const receiptMatch = heading.match(/KU\d{6}-\d{4}/);
    const receiptNumber = receiptMatch ? receiptMatch[0] : null;

    // Extract date from Excel serial
    const dateSerial = row[0];
    const txDate = dateSerial ? excelDateToJS(dateSerial) : null;
    const dateStr = txDate ? txDate.toISOString().split('T')[0] : null;

    const customerName = String(row[5] || '').trim();
    const customerId = String(row[16] || '').trim();
    const amount = parseFloat(row[9]) || 0;
    const currency = String(row[10] || 'USD').trim();
    const pos = String(row[1] || '').trim();
    const agent = String(row[4] || '').trim();

    // Determine if this is an EBB (Entebbe) entry
    const isEBB = customerName.toUpperCase().startsWith('EBB');
    const agencyNameForMatch = isEBB
      ? customerName.replace(/^EBB\s*/i, '').trim()
      : customerName;

    rows.push({
      rowIndex: i,
      receiptNumber,
      dateStr,
      customerName,
      customerId,
      agencyNameForMatch,
      amount: roundMoney(amount),
      currency,
      pos,
      agent,
      isEBB,
      heading,
    });
  }

  return rows;
}

// Preview import - returns what would happen without making changes
const previewImport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const rows = parseExcelForReceipts(req.file.buffer);

    if (rows.length === 0) {
      return res.json({
        success: true,
        message: 'No receipt payment entries found in the file.',
        data: { matched: [], newReceipts: [], ebbDeposits: [], warnings: [], errors: [] },
      });
    }

    const matched = [];
    const newReceipts = [];
    const ebbDeposits = [];
    const warnings = [];
    const errors = [];

    // Load all agencies for matching
    const agenciesResult = await db.query(
      'SELECT id, agency_id, agency_name FROM agencies WHERE is_active = true'
    );
    const agencies = agenciesResult.rows;

    for (const row of rows) {
      // Case 0: Negative amount = credit reversal
      if (row.amount < 0) {
        if (row.receiptNumber) {
          const receiptResult = await db.query(
            `SELECT r.id, r.receipt_number, r.amount, r.currency, r.status, r.is_deposited,
                    a.agency_name
             FROM receipts r
             LEFT JOIN agencies a ON r.agency_id = a.id
             WHERE r.receipt_number = $1 AND r.is_void = false`,
            [row.receiptNumber]
          );
          if (receiptResult.rows.length > 0) {
            const receipt = receiptResult.rows[0];
            matched.push({
              type: 'credit_reversal',
              rowIndex: row.rowIndex,
              receiptNumber: row.receiptNumber,
              excelCustomer: row.customerName,
              excelAmount: row.amount,
              excelCurrency: row.currency,
              dbAmount: parseFloat(receipt.amount),
              dbAgencyName: receipt.agency_name,
              dbStatus: receipt.status,
              alreadyDeposited: receipt.is_deposited,
            });
          } else {
            warnings.push({
              rowIndex: row.rowIndex,
              receiptNumber: row.receiptNumber,
              message: `Credit reversal ${row.amount} ${row.currency} - receipt not found in DB`,
            });
          }
        } else {
          // Negative without receipt number - create a new VOID receipt (dedup check)
          const agency = findAgency(agencies, row.customerId, row.agencyNameForMatch);
          if (agency) {
            const existing = await findExistingReceipt(agency.id, row.dateStr, row.amount, row.currency);
            if (existing) {
              warnings.push({
                rowIndex: row.rowIndex,
                message: `Credit reversal ${row.amount} ${row.currency} for "${row.customerName}" - already exists as ${existing.receipt_number}`,
              });
            } else {
              newReceipts.push({
                type: 'credit_reversal_new',
                rowIndex: row.rowIndex,
                receiptNumber: null,
                excelCustomer: row.customerName,
                excelCustomerId: row.customerId,
                amount: row.amount,
                currency: row.currency,
                dateStr: row.dateStr,
                matchedAgencyId: agency.agency_id,
                matchedAgencyName: agency.agency_name,
                matchedAgencyUuid: agency.id,
                status: 'VOID',
                isEBB: false,
              });
            }
          } else {
            warnings.push({
              rowIndex: row.rowIndex,
              message: `Credit reversal ${row.amount} ${row.currency} for "${row.customerName}" - no receipt number and no matching agency`,
            });
          }
        }
        continue;
      }

      // Case 1: Has receipt number - try to find existing receipt
      if (row.receiptNumber) {
        const receiptResult = await db.query(
          `SELECT r.id, r.receipt_number, r.amount, r.currency, r.status, r.is_deposited,
                  a.id as agency_uuid, a.agency_id, a.agency_name
           FROM receipts r
           JOIN agencies a ON r.agency_id = a.id
           WHERE r.receipt_number = $1 AND r.is_void = false`,
          [row.receiptNumber]
        );

        if (receiptResult.rows.length > 0) {
          const receipt = receiptResult.rows[0];

          // Check if Excel customer matches DB agency (by code or name)
          const agencyMatchesByCode = row.customerId && row.customerId === receipt.agency_id;
          const agencyMatchesByName = row.customerName &&
            (row.customerName.toLowerCase().trim() === receipt.agency_name.toLowerCase().trim() ||
             row.agencyNameForMatch.toLowerCase().trim() === receipt.agency_name.toLowerCase().trim());
          const agencyMatches = agencyMatchesByCode || agencyMatchesByName;

          const entry = {
            type: 'match',
            rowIndex: row.rowIndex,
            receiptNumber: row.receiptNumber,
            excelCustomer: row.customerName,
            excelCustomerId: row.customerId,
            excelAmount: row.amount,
            excelCurrency: row.currency,
            dbAmount: parseFloat(receipt.amount),
            dbCurrency: receipt.currency,
            dbStatus: receipt.status,
            dbAgencyId: receipt.agency_id,
            dbAgencyName: receipt.agency_name,
            alreadyDeposited: receipt.is_deposited,
            agencyIdMismatch: row.customerId && row.customerId !== receipt.agency_id,
            newAgencyId: row.customerId && row.customerId !== receipt.agency_id ? row.customerId : null,
          };

          // Check amount mismatch - only rectify if agency matches
          if (roundMoney(row.amount) !== roundMoney(parseFloat(receipt.amount))) {
            if (agencyMatches) {
              entry.amountMismatch = true;
              entry.amountWarning = `Amount will be updated: DB ${parseFloat(receipt.amount)} → Excel ${row.amount} ${row.currency}`;
            } else {
              entry.amountMismatch = false;
              entry.agencyMismatchSkip = true;
              entry.amountWarning = `Amount differs (DB $${parseFloat(receipt.amount)} vs Excel $${row.amount}) but agency mismatch (DB: ${receipt.agency_name} vs Excel: ${row.customerName}) - will NOT rectify`;
            }
            warnings.push({
              rowIndex: row.rowIndex,
              receiptNumber: row.receiptNumber,
              message: entry.amountWarning,
            });
          }

          matched.push(entry);
        } else {
          // Receipt number not found in DB - create new receipt
          const agency = findAgency(agencies, row.customerId, row.agencyNameForMatch);
          if (agency) {
            newReceipts.push({
              type: 'new',
              rowIndex: row.rowIndex,
              receiptNumber: row.receiptNumber,
              excelCustomer: row.customerName,
              excelCustomerId: row.customerId,
              amount: row.amount,
              currency: row.currency,
              dateStr: row.dateStr,
              matchedAgencyId: agency.agency_id,
              matchedAgencyName: agency.agency_name,
              matchedAgencyUuid: agency.id,
              status: 'PENDING',
              isEBB: false,
            });
          } else {
            errors.push({
              rowIndex: row.rowIndex,
              heading: row.heading,
              customer: row.customerName,
              customerId: row.customerId,
              amount: row.amount,
              currency: row.currency,
              message: `No matching agency found for "${row.customerName}" (ID: ${row.customerId})`,
            });
          }
        }
      }
      // Case 2: No receipt number + EBB entry
      else if (row.isEBB) {
        const agency = findAgency(agencies, row.customerId, row.agencyNameForMatch);
        if (agency) {
          // Dedup: check if this EBB receipt already exists
          const existing = await findExistingReceipt(agency.id, row.dateStr, row.amount, row.currency);
          if (existing) {
            matched.push({
              type: 'match',
              rowIndex: row.rowIndex,
              receiptNumber: existing.receipt_number,
              excelCustomer: row.customerName,
              excelAmount: row.amount,
              excelCurrency: row.currency,
              dbAmount: row.amount,
              dbCurrency: row.currency,
              dbStatus: existing.status,
              dbAgencyName: agency.agency_name,
              alreadyDeposited: existing.is_deposited,
            });
          } else {
            ebbDeposits.push({
              type: 'ebb',
              rowIndex: row.rowIndex,
              excelCustomer: row.customerName,
              excelCustomerId: row.customerId,
              agencyNameStripped: row.agencyNameForMatch,
              amount: row.amount,
              currency: row.currency,
              dateStr: row.dateStr,
              matchedAgencyId: agency.agency_id,
              matchedAgencyName: agency.agency_name,
              matchedAgencyUuid: agency.id,
            });
          }
        } else {
          errors.push({
            rowIndex: row.rowIndex,
            heading: row.heading,
            customer: row.customerName,
            customerId: row.customerId,
            amount: row.amount,
            currency: row.currency,
            message: `EBB entry - no matching agency found for "${row.agencyNameForMatch}" (ID: ${row.customerId})`,
          });
        }
      }
      // Case 3: No receipt number + NOT EBB - create new PENDING receipt
      else {
        const agency = findAgency(agencies, row.customerId, row.agencyNameForMatch);
        if (agency) {
          // Dedup: check if this receipt already exists
          const existing = await findExistingReceipt(agency.id, row.dateStr, row.amount, row.currency);
          if (existing) {
            matched.push({
              type: 'match',
              rowIndex: row.rowIndex,
              receiptNumber: existing.receipt_number,
              excelCustomer: row.customerName,
              excelAmount: row.amount,
              excelCurrency: row.currency,
              dbAmount: row.amount,
              dbCurrency: row.currency,
              dbStatus: existing.status,
              dbAgencyName: agency.agency_name,
              alreadyDeposited: existing.is_deposited,
            });
          } else {
            newReceipts.push({
              type: 'new',
              rowIndex: row.rowIndex,
              receiptNumber: null,
              excelCustomer: row.customerName,
              excelCustomerId: row.customerId,
              amount: row.amount,
              currency: row.currency,
              dateStr: row.dateStr,
              matchedAgencyId: agency.agency_id,
              matchedAgencyName: agency.agency_name,
              matchedAgencyUuid: agency.id,
              status: 'PENDING',
              isEBB: false,
            });
          }
        } else {
          errors.push({
            rowIndex: row.rowIndex,
            heading: row.heading,
            customer: row.customerName,
            customerId: row.customerId,
            amount: row.amount,
            currency: row.currency,
            message: `No matching agency found for "${row.customerName}" (ID: ${row.customerId})`,
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        summary: {
          totalPaymentRows: rows.length,
          matched: matched.length,
          newReceipts: newReceipts.length,
          ebbDeposits: ebbDeposits.length,
          warnings: warnings.length,
          errors: errors.length,
        },
        matched,
        newReceipts,
        ebbDeposits,
        warnings,
        errors,
      },
    });
  } catch (error) {
    logger.error('Import preview error:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to preview import.' });
  }
};

// Execute import - actually applies changes
const executeImport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const user = req.user;
    const rows = parseExcelForReceipts(req.file.buffer);

    if (rows.length === 0) {
      return res.json({ success: true, message: 'No receipt payment entries found.', data: { results: [] } });
    }

    // Load agencies
    const agenciesResult = await db.query(
      'SELECT id, agency_id, agency_name FROM agencies WHERE is_active = true'
    );
    const agencies = agenciesResult.rows;

    const results = [];
    let depositedCount = 0;
    let createdCount = 0;
    let ebbCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    let creditReversalCount = 0;
    let rectifiedCount = 0;

    for (const row of rows) {
      try {
        // Case 0: Negative amount = credit reversal
        if (row.amount < 0) {
          if (row.receiptNumber) {
            const receiptResult = await db.query(
              `SELECT r.id, r.receipt_number, r.is_deposited, r.status
               FROM receipts r
               WHERE r.receipt_number = $1 AND r.is_void = false`,
              [row.receiptNumber]
            );
            if (receiptResult.rows.length > 0) {
              const receipt = receiptResult.rows[0];
              // Un-deposit the receipt (mark as not deposited)
              await db.query(
                `UPDATE receipts SET is_deposited = false, deposited_at = NULL, status = 'VOID', is_void = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [receipt.id]
              );
              results.push({
                action: 'credit_reversal',
                receiptNumber: row.receiptNumber,
                amount: row.amount,
                reason: `Voided - credit reversal from Excel`,
              });
              creditReversalCount++;
            } else {
              results.push({ action: 'skipped', receiptNumber: row.receiptNumber, reason: `Credit reversal - receipt not found` });
              skippedCount++;
            }
          } else {
            // Negative without receipt number - create a new VOID receipt (dedup check)
            const agency = findAgency(agencies, row.customerId, row.agencyNameForMatch);
            if (!agency) {
              results.push({ action: 'error', rowIndex: row.rowIndex, reason: `Credit reversal - no agency match for "${row.customerName}"` });
              errorCount++;
              continue;
            }

            // Dedup: check if VOID receipt already exists for this
            const existing = await findExistingReceipt(agency.id, row.dateStr, row.amount, row.currency);
            if (existing) {
              results.push({ action: 'skipped', receiptNumber: existing.receipt_number, reason: `Credit reversal already exists` });
              skippedCount++;
              continue;
            }

            const receiptNumber = await generateReceiptNumberForDate(row.dateStr);
            await createImportedReceipt(receiptNumber, agency, row, user, false);
            // Mark as VOID immediately
            await db.query(
              `UPDATE receipts SET status = 'VOID', is_void = true, is_deposited = false, deposited_at = NULL,
               remarks = $2, updated_at = CURRENT_TIMESTAMP
               WHERE receipt_number = $1`,
              [receiptNumber, `Credit reversal from Excel - ${row.customerName} ${row.amount} ${row.currency}`]
            );
            results.push({
              action: 'credit_reversal',
              receiptNumber,
              amount: row.amount,
              reason: `Created VOID receipt for credit reversal - ${row.customerName}`,
            });
            creditReversalCount++;
          }
          continue;
        }

        // Case 1: Has receipt number
        if (row.receiptNumber) {
          const receiptResult = await db.query(
            `SELECT r.id, r.receipt_number, r.amount, r.currency, r.status, r.is_deposited,
                    r.agency_id as agency_uuid,
                    a.agency_id, a.agency_name
             FROM receipts r
             JOIN agencies a ON r.agency_id = a.id
             WHERE r.receipt_number = $1 AND r.is_void = false`,
            [row.receiptNumber]
          );

          if (receiptResult.rows.length > 0) {
            const receipt = receiptResult.rows[0];

            // Check if Excel customer matches DB agency (by code or name)
            const agencyMatchesByCode = row.customerId && row.customerId === receipt.agency_id;
            const agencyMatchesByName = row.customerName &&
              (row.customerName.toLowerCase().trim() === receipt.agency_name.toLowerCase().trim() ||
               row.agencyNameForMatch.toLowerCase().trim() === receipt.agency_name.toLowerCase().trim());
            const agencyMatches = agencyMatchesByCode || agencyMatchesByName;

            // Rectify amount only if mismatched AND agency matches
            const hasAmountMismatch = roundMoney(row.amount) !== roundMoney(parseFloat(receipt.amount));
            const shouldRectify = hasAmountMismatch && agencyMatches;
            if (shouldRectify) {
              const oldAmount = parseFloat(receipt.amount);
              await db.query(
                `UPDATE receipts SET amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                [row.amount, receipt.id]
              );
              logger.info('Receipt amount rectified from import', {
                receiptNumber: row.receiptNumber,
                oldAmount,
                newAmount: row.amount,
                currency: row.currency,
                agency: receipt.agency_name,
              });
            } else if (hasAmountMismatch && !agencyMatches) {
              logger.info('Amount mismatch skipped - agency mismatch', {
                receiptNumber: row.receiptNumber,
                dbAmount: parseFloat(receipt.amount),
                excelAmount: row.amount,
                dbAgency: receipt.agency_name,
                excelCustomer: row.customerName,
              });
            }

            // Skip deposit marking if already deposited
            if (receipt.is_deposited) {
              results.push({
                action: shouldRectify ? 'amount_rectified' : 'skipped',
                receiptNumber: row.receiptNumber,
                agency: receipt.agency_name,
                amount: shouldRectify ? row.amount : parseFloat(receipt.amount),
                oldAmount: shouldRectify ? parseFloat(receipt.amount) : undefined,
                reason: shouldRectify
                  ? `Amount updated: ${parseFloat(receipt.amount)} → ${row.amount}`
                  : hasAmountMismatch
                    ? `Already deposited (amount differs but agency mismatch: DB ${receipt.agency_name} vs Excel ${row.customerName})`
                    : 'Already deposited',
              });
              if (shouldRectify) rectifiedCount++;
              else skippedCount++;
              continue;
            }

            // Mark as deposited
            await db.query(
              `UPDATE receipts SET is_deposited = true, deposited_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
              [receipt.id]
            );

            // Update agency_id if mismatched and agency matches by name
            if (row.customerId && row.customerId !== receipt.agency_id && agencyMatchesByName) {
              await db.query(
                `UPDATE agencies SET agency_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                [row.customerId, receipt.agency_uuid]
              );
              logger.info('Agency ID updated from import', {
                oldAgencyId: receipt.agency_id,
                newAgencyId: row.customerId,
                agencyName: receipt.agency_name,
              });
            }

            results.push({
              action: shouldRectify ? 'deposited_rectified' : 'deposited',
              receiptNumber: row.receiptNumber,
              agency: receipt.agency_name,
              amount: shouldRectify ? row.amount : parseFloat(receipt.amount),
              oldAmount: shouldRectify ? parseFloat(receipt.amount) : undefined,
            });
            depositedCount++;
          } else {
            // Receipt not found by number - check by agency+date+amount before creating
            const agency = findAgency(agencies, row.customerId, row.agencyNameForMatch);
            if (!agency) {
              results.push({ action: 'error', rowIndex: row.rowIndex, reason: `No agency match for "${row.customerName}"` });
              errorCount++;
              continue;
            }

            // Dedup: check if receipt already exists for same agency+date+amount
            const existing = await findExistingReceipt(agency.id, row.dateStr, row.amount, row.currency);
            if (existing && !existing.is_void) {
              // Already exists - just mark as deposited if not already
              if (!existing.is_deposited) {
                await db.query(
                  `UPDATE receipts SET is_deposited = true, deposited_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                  [existing.id]
                );
                results.push({ action: 'deposited', receiptNumber: existing.receipt_number, agency: agency.agency_name, amount: row.amount });
                depositedCount++;
              } else {
                results.push({ action: 'skipped', receiptNumber: existing.receipt_number, reason: 'Already exists and deposited' });
                skippedCount++;
              }
              continue;
            }

            const receiptNumber = await generateReceiptNumberForDate(row.dateStr);
            await createImportedReceipt(receiptNumber, agency, row, user, false);
            results.push({
              action: 'created',
              receiptNumber,
              agency: agency.agency_name,
              amount: row.amount,
              status: 'PENDING',
            });
            createdCount++;
          }
        }
        // Case 2: No receipt number + EBB
        else if (row.isEBB) {
          const agency = findAgency(agencies, row.customerId, row.agencyNameForMatch);
          if (!agency) {
            results.push({ action: 'error', rowIndex: row.rowIndex, reason: `EBB - No agency match for "${row.agencyNameForMatch}"` });
            errorCount++;
            continue;
          }

          // Dedup: check if this EBB receipt already exists
          const existing = await findExistingReceipt(agency.id, row.dateStr, row.amount, row.currency);
          if (existing) {
            results.push({ action: 'skipped', receiptNumber: existing.receipt_number, reason: 'EBB already exists' });
            skippedCount++;
            continue;
          }

          const receiptNumber = await generateReceiptNumberForDate(row.dateStr);
          await createImportedReceipt(receiptNumber, agency, row, user, true);

          // EBB is PAID, so reduce outstanding_balance
          await db.query(
            `UPDATE agencies SET outstanding_balance = GREATEST(outstanding_balance - $1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [row.amount, agency.id]
          );

          results.push({
            action: 'ebb_created',
            receiptNumber,
            agency: agency.agency_name,
            amount: row.amount,
            status: 'PAID',
          });
          ebbCount++;
        }
        // Case 3: No receipt number + NOT EBB
        else {
          const agency = findAgency(agencies, row.customerId, row.agencyNameForMatch);
          if (!agency) {
            results.push({ action: 'error', rowIndex: row.rowIndex, reason: `No agency match for "${row.customerName}"` });
            errorCount++;
            continue;
          }

          // Dedup: check if this receipt already exists
          const existing = await findExistingReceipt(agency.id, row.dateStr, row.amount, row.currency);
          if (existing) {
            results.push({ action: 'skipped', receiptNumber: existing.receipt_number, reason: 'Already exists' });
            skippedCount++;
            continue;
          }

          const receiptNumber = await generateReceiptNumberForDate(row.dateStr);
          await createImportedReceipt(receiptNumber, agency, row, user, false);
          results.push({
            action: 'created',
            receiptNumber,
            agency: agency.agency_name,
            amount: row.amount,
            status: 'PENDING',
          });
          createdCount++;
        }
      } catch (rowError) {
        logger.error('Import row error:', { rowIndex: row.rowIndex, error: rowError.message });
        results.push({ action: 'error', rowIndex: row.rowIndex, reason: rowError.message });
        errorCount++;
      }
    }

    res.json({
      success: true,
      message: `Import complete: ${depositedCount} deposited, ${rectifiedCount} rectified, ${createdCount} created, ${ebbCount} EBB, ${creditReversalCount} reversed, ${skippedCount} skipped, ${errorCount} errors`,
      data: {
        summary: { deposited: depositedCount, rectified: rectifiedCount, created: createdCount, ebb: ebbCount, creditReversals: creditReversalCount, skipped: skippedCount, errors: errorCount },
        results,
      },
    });
  } catch (error) {
    logger.error('Import execute error:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to execute import.' });
  }
};

// Helper: Check if a receipt already exists for this agency+date+amount+currency
async function findExistingReceipt(agencyId, dateStr, amount, currency) {
  const result = await db.query(
    `SELECT id, receipt_number, is_deposited, is_void, status
     FROM receipts
     WHERE agency_id = $1 AND issue_date = $2 AND amount = $3 AND currency = $4
     LIMIT 1`,
    [agencyId, dateStr, amount, currency]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

// Helper: Create a receipt from import data
async function createImportedReceipt(receiptNumber, agency, row, user, isEBB) {
  const status = isEBB ? 'PAID' : 'PENDING';
  const stationCode = isEBB ? 'EBB' : 'JUB';
  const paymentDate = isEBB ? row.dateStr : null;

  // Extract time from dateStr if available (for issue_time)
  const issueTime = new Date().toLocaleTimeString('sv-SE', {
    timeZone: 'Africa/Juba',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  await db.query(
    `INSERT INTO receipts
     (receipt_number, agency_id, user_id, amount, currency, payment_method, status,
      issue_date, issue_time, payment_date, station_code, issued_by_name,
      remarks, is_synced, is_deposited, deposited_at, is_external)
     VALUES ($1, $2, $3, $4, $5, 'CASH', $6, $7, $8, $9, $10, $11, $12, true, true, NOW(), $13)`,
    [
      receiptNumber,
      agency.id,
      user.id || user.user_id,
      row.amount,
      row.currency,
      status,
      row.dateStr,
      issueTime,
      paymentDate,
      stationCode,
      user.name || user.username || 'Import',
      `Imported from Excel - ${row.heading}`,
      isEBB,
    ]
  );
}

// Helper: Find agency by customer ID or name
function findAgency(agencies, customerId, customerName) {
  // First try exact match on agency_id (customer code)
  if (customerId) {
    const byId = agencies.find((a) => a.agency_id === customerId);
    if (byId) return byId;
  }

  // Then try case-insensitive name match
  if (customerName) {
    const nameLower = customerName.toLowerCase().trim();
    const byName = agencies.find((a) => a.agency_name.toLowerCase().trim() === nameLower);
    if (byName) return byName;
  }

  return null;
}

module.exports = {
  previewImport,
  executeImport,
};
