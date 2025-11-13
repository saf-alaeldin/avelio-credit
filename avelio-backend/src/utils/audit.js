const { pool } = require('../config/db');
const logger = require('./logger');

/**
 * Audit logging utility for tracking critical operations
 */
class AuditLogger {
  /**
   * Log an audit event to both database and Winston logger
   * @param {Object} params - Audit parameters
   * @param {number} params.userId - ID of user performing the action
   * @param {string} params.action - Action being performed (CREATE, UPDATE, DELETE, VOID, etc.)
   * @param {string} params.resourceType - Type of resource (RECEIPT, AGENCY, USER, etc.)
   * @param {string|number} params.resourceId - ID of the resource being acted upon
   * @param {Object} params.oldValue - Previous value (for updates)
   * @param {Object} params.newValue - New value
   * @param {string} params.ipAddress - IP address of the user
   * @param {Object} params.metadata - Additional metadata
   */
  static async log({
    userId,
    action,
    resourceType,
    resourceId,
    oldValue = null,
    newValue = null,
    ipAddress = null,
    metadata = {}
  }) {
    try {
      // Log to Winston
      logger.logAudit(action, userId, resourceType, resourceId, {
        oldValue,
        newValue,
        ipAddress,
        ...metadata
      });

      // Log to database
      await pool.query(
        `INSERT INTO audit_logs
         (user_id, action, resource_type, resource_id, old_value, new_value, ip_address, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          userId,
          action,
          resourceType,
          resourceId?.toString(),
          oldValue ? JSON.stringify(oldValue) : null,
          newValue ? JSON.stringify(newValue) : null,
          ipAddress,
          metadata ? JSON.stringify(metadata) : null
        ]
      );
    } catch (error) {
      // Don't fail the request if audit logging fails, but log the error
      logger.error('Audit logging failed:', {
        error: error.message,
        userId,
        action,
        resourceType,
        resourceId
      });
    }
  }

  /**
   * Log receipt creation
   */
  static async logReceiptCreate(userId, receiptId, receiptData, ipAddress) {
    return this.log({
      userId,
      action: 'CREATE_RECEIPT',
      resourceType: 'RECEIPT',
      resourceId: receiptId,
      newValue: receiptData,
      ipAddress
    });
  }

  /**
   * Log receipt status update
   */
  static async logReceiptStatusUpdate(userId, receiptId, oldStatus, newStatus, ipAddress) {
    return this.log({
      userId,
      action: 'UPDATE_RECEIPT_STATUS',
      resourceType: 'RECEIPT',
      resourceId: receiptId,
      oldValue: { status: oldStatus },
      newValue: { status: newStatus },
      ipAddress
    });
  }

  /**
   * Log receipt void
   */
  static async logReceiptVoid(userId, receiptId, reason, ipAddress) {
    return this.log({
      userId,
      action: 'VOID_RECEIPT',
      resourceType: 'RECEIPT',
      resourceId: receiptId,
      newValue: { is_void: true, reason },
      ipAddress
    });
  }

  /**
   * Log agency creation
   */
  static async logAgencyCreate(userId, agencyId, agencyData, ipAddress) {
    return this.log({
      userId,
      action: 'CREATE_AGENCY',
      resourceType: 'AGENCY',
      resourceId: agencyId,
      newValue: agencyData,
      ipAddress
    });
  }

  /**
   * Log agency update
   */
  static async logAgencyUpdate(userId, agencyId, oldData, newData, ipAddress) {
    return this.log({
      userId,
      action: 'UPDATE_AGENCY',
      resourceType: 'AGENCY',
      resourceId: agencyId,
      oldValue: oldData,
      newValue: newData,
      ipAddress
    });
  }

  /**
   * Log bulk agency import
   */
  static async logBulkAgencyImport(userId, count, ipAddress) {
    return this.log({
      userId,
      action: 'BULK_IMPORT_AGENCIES',
      resourceType: 'AGENCY',
      resourceId: 'BULK',
      metadata: { count },
      ipAddress
    });
  }

  /**
   * Log user login
   */
  static async logLogin(userId, ipAddress, userAgent) {
    return this.log({
      userId,
      action: 'LOGIN',
      resourceType: 'USER',
      resourceId: userId,
      ipAddress,
      metadata: { userAgent }
    });
  }

  /**
   * Log failed login attempt
   */
  static async logFailedLogin(email, ipAddress, reason) {
    return this.log({
      userId: null, // No user ID for failed login
      action: 'FAILED_LOGIN',
      resourceType: 'USER',
      resourceId: email,
      ipAddress,
      metadata: { reason }
    });
  }

  /**
   * Log password change
   */
  static async logPasswordChange(userId, ipAddress) {
    return this.log({
      userId,
      action: 'CHANGE_PASSWORD',
      resourceType: 'USER',
      resourceId: userId,
      ipAddress
    });
  }

  /**
   * Get audit trail for a specific resource
   */
  static async getAuditTrail(resourceType, resourceId, limit = 50) {
    try {
      const result = await pool.query(
        `SELECT al.*, u.name as user_name, u.email as user_email
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.resource_type = $1 AND al.resource_id = $2
         ORDER BY al.created_at DESC
         LIMIT $3`,
        [resourceType, resourceId?.toString(), limit]
      );
      return result.rows;
    } catch (error) {
      logger.error('Failed to retrieve audit trail:', {
        error: error.message,
        resourceType,
        resourceId
      });
      return [];
    }
  }
}

module.exports = AuditLogger;
