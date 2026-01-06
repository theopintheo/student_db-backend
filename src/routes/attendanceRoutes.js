const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validationMiddleware');
const { protect, authorize, hasPermission } = require('../middleware/authMiddleware');
const {
    getAttendance,
    getAttendanceById,
    markAttendance,
    updateAttendance,
    deleteAttendance,
    getStudentAttendance,
    getBatchAttendance,
    getAttendanceStats,
    generateAttendanceReport
} = require('../controllers/attendanceController');

// All routes are protected
router.use(protect);

// Get attendance statistics
router.get('/stats', 
    authorize('admin', 'trainer'), 
    getAttendanceStats
);

// Generate attendance report
router.post('/report',
    authorize('admin', 'trainer'),
    validate([
        body('startDate').isISO8601().withMessage('Valid start date is required'),
        body('endDate').isISO8601().withMessage('Valid end date is required'),
        body('batch').optional().isMongoId().withMessage('Invalid batch ID'),
        body('student').optional().isMongoId().withMessage('Invalid student ID')
    ]),
    generateAttendanceReport
);

// Get attendance for specific student
router.get('/student/:studentId',
    hasPermission('attendance', 'canView'),
    validate([
        param('studentId').isMongoId().withMessage('Invalid student ID')
    ]),
    getStudentAttendance
);

// Get attendance for specific batch
router.get('/batch/:batchId',
    hasPermission('attendance', 'canView'),
    validate([
        param('batchId').isMongoId().withMessage('Invalid batch ID')
    ]),
    getBatchAttendance
);

// CRUD routes
router.route('/')
    .get(hasPermission('attendance', 'canView'), getAttendance)
    .post(
        authorize('admin', 'trainer'),
        hasPermission('attendance', 'canCreate'),
        validate([
            body('student').isMongoId().withMessage('Valid student ID is required'),
            body('date').isISO8601().withMessage('Valid date is required'),
            body('status').isIn(['present', 'absent', 'late', 'leave']).withMessage('Invalid attendance status'),
            body('session').optional().isMongoId().withMessage('Invalid session ID')
        ]),
        markAttendance
    );

router.route('/:id')
    .get(
        hasPermission('attendance', 'canView'),
        validate([
            param('id').isMongoId().withMessage('Invalid attendance ID')
        ]),
        getAttendanceById
    )
    .put(
        authorize('admin', 'trainer'),
        hasPermission('attendance', 'canEdit'),
        validate([
            param('id').isMongoId().withMessage('Invalid attendance ID')
        ]),
        updateAttendance
    )
    .delete(
        authorize('admin', 'trainer'),
        hasPermission('attendance', 'canDelete'),
        validate([
            param('id').isMongoId().withMessage('Invalid attendance ID')
        ]),
        deleteAttendance
    );

module.exports = router;