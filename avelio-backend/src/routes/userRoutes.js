const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// All user routes require authentication
router.use(requireAuth);

// GET /api/v1/users - Get all users (admin/manager only)
router.get('/', requireRole(['admin', 'manager']), userController.getAllUsers);

// GET /api/v1/users/:id - Get single user (admin/manager only)
router.get('/:id', requireRole(['admin', 'manager']), userController.getUserById);

// POST /api/v1/users - Create new user (admin only)
router.post('/', requireRole(['admin']), userController.createUser);

// PUT /api/v1/users/:id - Update user (admin only)
router.put('/:id', requireRole(['admin']), userController.updateUser);

// DELETE /api/v1/users/:id - Deactivate user (admin only)
router.delete('/:id', requireRole(['admin']), userController.deleteUser);

module.exports = router;
