const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validationMiddleware');
const { protect, authorize, hasPermission } = require('../middleware/authMiddleware');
const {
    getBatches,
    getBatchById,
    createBatch,
    updateBatch,
    deleteBatch,
    addStudentToBatch,
    removeStudentFromBatch,
    addSession,
    markAttendance,
    getBatchStats,
    getBatchStudents,
    getUpcomingBatches
} = require('../controllers/batchController');

// All routes are protected
router.use(protect);

// Get upcoming batches
router.get('/upcoming', 
    hasPermission('courses', 'canView'), 
    getUpcomingBatches
);

// Get batch statistics
router.get('/stats', 
    authorize('admin', 'trainer'), 
    getBatchStats
);

// Get students in batch
router.get('/:id/students',
    hasPermission('students', 'canView'),
    validate([
        param('id').isMongoId().withMessage('Invalid batch ID')
    ]),
    getBatchStudents
);

// Add student to batch
router.post('/:id/students',
    authorize('admin', 'trainer', 'employee'),
    hasPermission('students', 'canEdit'),
    validate([
        param('id').isMongoId().withMessage('Invalid batch ID'),
        body('studentId').isMongoId().withMessage('Valid student ID is required')
    ]),
    addStudentToBatch
);

// Remove student from batch
router.delete('/:id/students/:studentId',
    authorize('admin', 'trainer'),
    validate([
        param('id').isMongoId().withMessage('Invalid batch ID'),
        param('studentId').isMongoId().withMessage('Invalid student ID')
    ]),
    removeStudentFromBatch
);

// Add session to batch
router.post('/:id/sessions',
    authorize('admin', 'trainer'),
    validate([
        param('id').isMongoId().withMessage('Invalid batch ID'),
        body('topic').notEmpty().withMessage('Session topic is required'),
        body('date').isISO8601().withMessage('Valid date is required')
    ]),
    addSession
);

// Mark attendance for session
router.post('/:id/sessions/:sessionIndex/attendance',
    authorize('admin', 'trainer'),
    validate([
        param('id').isMongoId().withMessage('Invalid batch ID'),
        param('sessionIndex').isInt({ min: 0 }).withMessage('Valid session index required'),
        body('attendance').isArray().withMessage('Attendance records required')
    ]),
    markAttendance
);

// CRUD routes
router.route('/')
    .get(hasPermission('courses', 'canView'), getBatches)
    .post(
        authorize('admin', 'trainer'),
        hasPermission('courses', 'canCreate'),
        validate([
            body('course').isMongoId().withMessage('Valid course ID is required'),
            body('name').notEmpty().withMessage('Batch name is required'),
            body('startDate').isISO8601().withMessage('Valid start date is required'),
            body('instructor').isMongoId().withMessage('Valid instructor ID is required'),
            body('maxStudents').isInt({ min: 1 }).withMessage('Maximum students must be at least 1')
        ]),
        createBatch
    );

router.route('/:id')
    .get(
        hasPermission('courses', 'canView'),
        validate([
            param('id').isMongoId().withMessage('Invalid batch ID')
        ]),
        getBatchById
    )
    .put(
        authorize('admin', 'trainer'),
        hasPermission('courses', 'canEdit'),
        validate([
            param('id').isMongoId().withMessage('Invalid batch ID')
        ]),
        updateBatch
    )
    .delete(
        authorize('admin'),
        hasPermission('courses', 'canDelete'),
        validate([
            param('id').isMongoId().withMessage('Invalid batch ID')
        ]),
        deleteBatch
    );

module.exports = router;