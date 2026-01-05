const db = require('../config/db');
const logger = require('../utils/logger');

// GET all expense codes
const getExpenseCodes = async (req, res) => {
  try {
    const { active_only, category, currency } = req.query;

    let query = 'SELECT * FROM expense_codes WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (active_only === 'true') {
      query += ' AND is_active = true';
    }

    if (category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(category);
    }

    if (currency) {
      query += ` AND $${paramIndex++} = ANY(currencies_allowed)`;
      params.push(currency);
    }

    query += ' ORDER BY category ASC, code ASC';

    const result = await db.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: {
        expense_codes: result.rows.map(ec => ({
          id: ec.id,
          code: ec.code,
          name: ec.name,
          category: ec.category,
          currencies_allowed: ec.currencies_allowed,
          requires_receipt: ec.requires_receipt,
          is_active: ec.is_active,
          created_at: ec.created_at
        }))
      }
    });
  } catch (error) {
    logger.error('Get expense codes error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expense codes'
    });
  }
};

// GET unique categories
const getExpenseCategories = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT category FROM expense_codes
       WHERE category IS NOT NULL AND is_active = true
       ORDER BY category ASC`
    );

    res.json({
      success: true,
      data: {
        categories: result.rows.map(r => r.category)
      }
    });
  } catch (error) {
    logger.error('Get expense categories error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expense categories'
    });
  }
};

// GET single expense code
const getExpenseCodeById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM expense_codes WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense code not found'
      });
    }

    res.json({
      success: true,
      data: { expense_code: result.rows[0] }
    });
  } catch (error) {
    logger.error('Get expense code error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expense code'
    });
  }
};

// CREATE expense code (admin only)
const createExpenseCode = async (req, res) => {
  try {
    const { code, name, category, currencies_allowed, requires_receipt } = req.body;

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: 'Code and name are required'
      });
    }

    // Check for duplicate code
    const existing = await db.query(
      'SELECT id FROM expense_codes WHERE code = $1',
      [code.toUpperCase()]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Expense code already exists'
      });
    }

    const result = await db.query(
      `INSERT INTO expense_codes (code, name, category, currencies_allowed, requires_receipt)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        code.toUpperCase(),
        name,
        category || null,
        currencies_allowed || ['USD', 'SSP'],
        requires_receipt || false
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Expense code created successfully',
      data: { expense_code: result.rows[0] }
    });
  } catch (error) {
    logger.error('Create expense code error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create expense code'
    });
  }
};

// UPDATE expense code (admin only)
const updateExpenseCode = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, currencies_allowed, requires_receipt, is_active } = req.body;

    const existing = await db.query(
      'SELECT id FROM expense_codes WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense code not found'
      });
    }

    const result = await db.query(
      `UPDATE expense_codes
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           currencies_allowed = COALESCE($3, currencies_allowed),
           requires_receipt = COALESCE($4, requires_receipt),
           is_active = COALESCE($5, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name, category, currencies_allowed, requires_receipt, is_active, id]
    );

    res.json({
      success: true,
      message: 'Expense code updated successfully',
      data: { expense_code: result.rows[0] }
    });
  } catch (error) {
    logger.error('Update expense code error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update expense code'
    });
  }
};

// Toggle expense code active status (admin only)
const toggleExpenseCode = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.query(
      'SELECT id, is_active FROM expense_codes WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense code not found'
      });
    }

    const newStatus = !existing.rows[0].is_active;

    const result = await db.query(
      `UPDATE expense_codes
       SET is_active = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [newStatus, id]
    );

    res.json({
      success: true,
      message: `Expense code ${newStatus ? 'activated' : 'deactivated'} successfully`,
      data: { expense_code: result.rows[0] }
    });
  } catch (error) {
    logger.error('Toggle expense code error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to toggle expense code'
    });
  }
};

module.exports = {
  getExpenseCodes,
  getExpenseCategories,
  getExpenseCodeById,
  createExpenseCode,
  updateExpenseCode,
  toggleExpenseCode
};
