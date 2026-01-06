const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validationMiddleware');
const { protect, authorize, hasPermission } = require('../middleware/authMiddleware');
const {
    getPayments,
    getPaymentById,
    createPayment,
    updatePayment,
    deletePayment,
    verifyPayment,
    generateReceipt,
    getPaymentStats,
    getStudentPayments,
    refundPayment
} = require('../controllers/paymentController');

// All routes are protected
router.use(protect);

// Get payment statistics (admin only)
router.get('/stats', 
    authorize('admin', 'employee'), 
    getPaymentStats
);

// Get payments for specific student
router.get('/student/:studentId',
    hasPermission('payments', 'canView'),
    validate([
        param('studentId').isMongoId().withMessage('Invalid student ID')
    ]),
    getStudentPayments
);

// Generate receipt for payment
router.get('/:id/receipt',
    hasPermission('payments', 'canView'),
    validate([
        param('id').isMongoId().withMessage('Invalid payment ID')
    ]),
    generateReceipt
);

// Verify payment (admin/employee only)
router.put('/:id/verify',
    authorize('admin', 'employee'),
    hasPermission('payments', 'canEdit'),
    validate([
        param('id').isMongoId().withMessage('Invalid payment ID')
    ]),
    verifyPayment
);

// Refund payment (admin only)
router.put('/:id/refund',
    authorize('admin'),
    validate([
        param('id').isMongoId().withMessage('Invalid payment ID'),
        body('amount').isNumeric().withMessage('Amount must be a number'),
        body('reason').notEmpty().withMessage('Refund reason is required')
    ]),
    refundPayment
);

// CRUD routes
router.route('/')
    .get(hasPermission('payments', 'canView'), getPayments)
    .post(
        hasPermission('payments', 'canCreate'),
        validate([
            body('student').isMongoId().withMessage('Valid student ID is required'),
            body('amount').isNumeric().withMessage('Amount must be a number'),
            body('paymentMode').isIn(['cash', 'cheque', 'online', 'card', 'bank_transfer', 'upi', 'other'])
                .withMessage('Invalid payment mode')
        ]),
        createPayment
    );

router.route('/:id')
    .get(
        hasPermission('payments', 'canView'),
        validate([
            param('id').isMongoId().withMessage('Invalid payment ID')
        ]),
        getPaymentById
    )
    .put(
        hasPermission('payments', 'canEdit'),
        validate([
            param('id').isMongoId().withMessage('Invalid payment ID')
        ]),
        updatePayment
    )
    .delete(
        authorize('admin'),
        hasPermission('payments', 'canDelete'),
        validate([
            param('id').isMongoId().withMessage('Invalid payment ID')
        ]),
        deletePayment
    );

module.exports = router;