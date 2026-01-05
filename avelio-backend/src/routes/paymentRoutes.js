const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { requireAuth } = require('../middleware/authMiddleware');

// All payment routes require authentication
router.use(requireAuth);

// POST /api/v1/payments - Create partial payment
router.post('/', paymentController.createPartialPayment);

// GET /api/v1/payments/receipt/:receipt_id - Get all payments for a receipt
router.get('/receipt/:receipt_id', paymentController.getPaymentsByReceipt);

// GET /api/v1/payments/:id - Get single payment
router.get('/:id', paymentController.getPaymentById);

// DELETE /api/v1/payments/:id - Void a payment
router.delete('/:id', paymentController.voidPayment);

module.exports = router;
