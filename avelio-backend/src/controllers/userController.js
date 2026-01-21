const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const AuditLogger = require('../utils/audit');
const logger = require('../utils/logger');

// GET all users
exports.getAllUsers = async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id, username, email, name, employee_id, station_code, role, phone, is_active, created_at, updated_at
         FROM users
         ORDER BY created_at DESC`
      );

      res.json({
        status: 'success',
        data: {
          users: result.rows
        }
      });
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Get all users error:', { error: err.message });
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

// GET single user by ID
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const client = await pool.connect();

    try {
      const result = await client.query(
        `SELECT id, username, email, name, employee_id, station_code, role, phone, is_active, created_at, updated_at
         FROM users
         WHERE id = $1`,
        [id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({
        status: 'success',
        data: {
          user: result.rows[0]
        }
      });
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Get user by ID error:', { error: err.message });
    res.status(500).json({ message: 'Failed to fetch user' });
  }
};

// CREATE new user
exports.createUser = async (req, res) => {
  try {
    const { username, email, name, password, employee_id, station_code, role, phone } = req.body;

    // Validation
    if (!username || !email || !name || !password || !role) {
      return res.status(400).json({
        message: 'Username, email, name, password, and role are required'
      });
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'auditor', 'staff'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        message: 'Invalid role. Must be admin, manager, auditor, or staff'
      });
    }

    const client = await pool.connect();
    try {
      // Check if username or email already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );

      if (existingUser.rowCount > 0) {
        return res.status(400).json({
          message: 'Username or email already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert new user
      const result = await client.query(
        `INSERT INTO users (username, email, name, password_hash, employee_id, station_code, role, phone, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, username, email, name, employee_id, station_code, role, phone, is_active, created_at`,
        [username, email, name, hashedPassword, employee_id, station_code, role, phone, true]
      );

      const newUser = result.rows[0];

      // Audit log
      try {
        await AuditLogger.log({
          user_id: req.user.id,
          action: 'CREATE_USER',
          entity_type: 'user',
          entity_id: newUser.id,
          details: { username: newUser.username, role: newUser.role },
          ip_address: req.ip
        });
      } catch (auditError) {
        logger.error('Audit logging failed:', { error: auditError.message });
      }

      res.status(201).json({
        status: 'success',
        message: 'User created successfully',
        data: {
          user: newUser
        }
      });
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Create user error:', { error: err.message });

    if (err.code === '23505') { // PostgreSQL unique violation
      return res.status(400).json({ message: 'Username or email already exists' });
    }

    res.status(500).json({ message: 'Failed to create user' });
  }
};

// UPDATE user
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, name, employee_id, station_code, role, phone, is_active, password } = req.body;

    // Validate role if provided
    if (role) {
      const validRoles = ['admin', 'manager', 'auditor', 'staff'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          message: 'Invalid role. Must be admin, manager, auditor, or staff'
        });
      }
    }

    const client = await pool.connect();
    try {
      // Check if user exists
      const existingUser = await client.query('SELECT * FROM users WHERE id = $1', [id]);
      if (existingUser.rowCount === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Build update query dynamically
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (username !== undefined) {
        updates.push(`username = $${paramCount}`);
        values.push(username);
        paramCount++;
      }
      if (email !== undefined) {
        updates.push(`email = $${paramCount}`);
        values.push(email);
        paramCount++;
      }
      if (name !== undefined) {
        updates.push(`name = $${paramCount}`);
        values.push(name);
        paramCount++;
      }
      if (employee_id !== undefined) {
        updates.push(`employee_id = $${paramCount}`);
        values.push(employee_id);
        paramCount++;
      }
      if (station_code !== undefined) {
        updates.push(`station_code = $${paramCount}`);
        values.push(station_code);
        paramCount++;
      }
      if (role !== undefined) {
        updates.push(`role = $${paramCount}`);
        values.push(role);
        paramCount++;
      }
      if (phone !== undefined) {
        updates.push(`phone = $${paramCount}`);
        values.push(phone);
        paramCount++;
      }
      if (is_active !== undefined) {
        updates.push(`is_active = $${paramCount}`);
        values.push(is_active);
        paramCount++;
      }
      if (password !== undefined && password !== '') {
        const hashedPassword = await bcrypt.hash(password, 10);
        updates.push(`password_hash = $${paramCount}`);
        values.push(hashedPassword);
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const query = `
        UPDATE users
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING id, username, email, name, employee_id, station_code, role, phone, is_active, created_at, updated_at
      `;

      const result = await client.query(query, values);
      const updatedUser = result.rows[0];

      // Audit log
      try {
        await AuditLogger.log({
          user_id: req.user.id,
          action: 'UPDATE_USER',
          entity_type: 'user',
          entity_id: id,
          details: { username: updatedUser.username, changes: updates },
          ip_address: req.ip
        });
      } catch (auditError) {
        logger.error('Audit logging failed:', { error: auditError.message });
      }

      res.json({
        status: 'success',
        message: 'User updated successfully',
        data: {
          user: updatedUser
        }
      });
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Update user error:', { error: err.message });

    if (err.code === '23505') { // PostgreSQL unique violation
      return res.status(400).json({ message: 'Username or email already exists' });
    }

    res.status(500).json({ message: 'Failed to update user' });
  }
};

// DELETE user (soft delete - set is_active to false)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE users
         SET is_active = false, updated_at = NOW()
         WHERE id = $1
         RETURNING id, username, email, name`,
        [id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const deletedUser = result.rows[0];

      // Audit log
      try {
        await AuditLogger.log({
          user_id: req.user.id,
          action: 'DELETE_USER',
          entity_type: 'user',
          entity_id: id,
          details: { username: deletedUser.username },
          ip_address: req.ip
        });
      } catch (auditError) {
        logger.error('Audit logging failed:', { error: auditError.message });
      }

      res.json({
        status: 'success',
        message: 'User deactivated successfully'
      });
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Delete user error:', { error: err.message });
    res.status(500).json({ message: 'Failed to delete user' });
  }
};
