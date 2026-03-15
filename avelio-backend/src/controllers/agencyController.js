// --- GET ALL AGENCIES ---
const { pool } = require('../config/db');

exports.getAllAgencies = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
         id,
         agency_id,
         agency_name,
         contact_email,
         COALESCE(is_active, TRUE) AS is_active
       FROM agencies
       ORDER BY agency_name ASC`
    );

    res.json({ status: 'success', data: { agencies: result.rows } });
  } catch (err) {
    console.error('Get agencies error:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch agencies',
      detail: err.message
    });
  } finally {
    client.release();
  }
};

// --- CREATE SINGLE AGENCY ---
exports.createAgency = async (req, res) => {
  const { agency_name, agency_id, contact_email, is_active = true } = req.body || {};
  if (!agency_name || !agency_id) {
    return res.status(400).json({ status: 'error', message: 'agency_name and agency_id are required.' });
  }

  const client = await pool.connect();
  try {
    const insertSQL = `
      INSERT INTO agencies (agency_name, agency_id, contact_email, is_active)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (agency_id)
      DO UPDATE SET
        agency_name = EXCLUDED.agency_name,
        contact_email = EXCLUDED.contact_email,
        is_active = EXCLUDED.is_active
      RETURNING id, agency_id, agency_name, contact_email, is_active
    `;
    const result = await client.query(insertSQL, [agency_name, agency_id, contact_email, is_active]);
    res.status(201).json({ status: 'success', data: { agency: result.rows[0] } });
  } catch (err) {
    console.error('Create agency error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to add agency' });
  } finally {
    client.release();
  }
};

// --- GET AGENCY STATS (server-side aggregation) ---
exports.getAgencyStats = async (req, res) => {
  const { agency_id } = req.params;
  if (!agency_id) {
    return res.status(400).json({ status: 'error', message: 'agency_id is required' });
  }

  const client = await pool.connect();
  try {
    const statsSQL = `
      SELECT
        COUNT(*)                                                                    AS total_receipts,
        COUNT(*) FILTER (WHERE UPPER(COALESCE(status,'')) = 'PENDING')              AS pending_count,
        COALESCE(SUM(
          CASE WHEN UPPER(COALESCE(status,'')) = 'PENDING'
               THEN COALESCE(amount_remaining, amount, 0)
               ELSE 0
          END
        ), 0)::numeric                                                              AS pending_amount,
        COALESCE(SUM(
          CASE WHEN UPPER(COALESCE(status,'')) = 'PAID'
               THEN COALESCE(amount, 0)
               WHEN UPPER(COALESCE(status,'')) = 'PENDING'
               THEN COALESCE(amount_paid, 0)
               ELSE 0
          END
        ), 0)::numeric                                                              AS total_revenue
      FROM receipts
      WHERE agency_id = (SELECT id FROM agencies WHERE agency_id = $1 LIMIT 1)
    `;
    const stats = (await client.query(statsSQL, [agency_id])).rows[0];

    res.json({
      status: 'success',
      data: {
        total_receipts: Number(stats.total_receipts),
        pending_count: Number(stats.pending_count),
        pending_amount: Number(stats.pending_amount),
        total_revenue: Number(stats.total_revenue),
      }
    });
  } catch (err) {
    console.error('Agency stats error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch agency stats' });
  } finally {
    client.release();
  }
};

// --- BULK IMPORT ---
exports.createAgenciesBulk = async (req, res) => {
  const agencies = req.body?.agencies || [];
  if (!Array.isArray(agencies) || agencies.length === 0) {
    return res.status(400).json({ status: 'error', message: 'No agencies provided' });
  }

  const client = await pool.connect();
  try {
    let inserted = 0;
    for (const a of agencies) {
      if (!a.agency_name || !a.agency_id) continue;
      await client.query(
        `INSERT INTO agencies (agency_name, agency_id, contact_email, is_active)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (agency_id)
         DO UPDATE SET
           agency_name = EXCLUDED.agency_name,
           contact_email = EXCLUDED.contact_email,
           is_active = EXCLUDED.is_active`,
        [a.agency_name, a.agency_id, a.contact_email || null, a.is_active ?? true]
      );
      inserted++;
    }
    res.json({ status: 'success', data: { inserted } });
  } catch (err) {
    console.error('Bulk import error:', err);
    res.status(500).json({ status: 'error', message: 'Bulk import failed' });
  } finally {
    client.release();
  }
};