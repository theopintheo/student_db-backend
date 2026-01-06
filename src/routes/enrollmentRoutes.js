const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validationMiddleware');
const { protect, authorize, hasPermission } = require('../middleware/authMiddleware');
const {
    getEnrollments,
    getEnrollmentById,
    createEnrollment,
    updateEnrollment,
    deleteEnrollment,
    getStudentEnrollments,
    getCourseEnrollments,
    updateProgress,
    markAttendance,
    submitAssignment,
    gradeAssignment,
    generateCertificate,
    getEnrollmentStats
} = require('../controllers/enrollmentController');

// All routes are protected
router.use(protect);

// Get enrollment statistics
router.get('/stats',
    authorize('admin', 'trainer'),
    getEnrollmentStats
);

// Get enrollments for specific student
router.get('/student/:studentId',
    hasPermission('students', 'canView'),
    validate([
        param('studentId').isMongoId().withMessage('Invalid student ID')
    ]),
    getStudentEnrollments
);

// Get enrollments for specific course
router.get('/course/:courseId',
    hasPermission('courses', 'canView'),
    validate([
        param('courseId').isMongoId().withMessage('Invalid course ID')
    ]),
    getCourseEnrollments
);

// Update enrollment progress
router.put('/:id/progress',
    authorize('admin', 'trainer'),
    hasPermission('students', 'canEdit'),
    validate([
        param('id').isMongoId().withMessage('Invalid enrollment ID'),
        body('moduleId').isMongoId().withMessage('Valid module ID is required')
    ]),
    updateProgress
);

// Mark attendance for enrollment
router.post('/:id/attendance',
    authorize('admin', 'trainer'),
    hasPermission('attendance', 'canCreate'),
    validate([
        param('id').isMongoId().withMessage('Invalid enrollment ID'),
        body('date').isISO8601().withMessage('Valid date is required'),
        body('status').isIn(['present', 'absent', 'late', 'leave']).withMessage('Invalid attendance status')
    ]),
    markAttendance
);

// Submit assignment for enrollment
router.post('/:id/assignments/:assignmentId/submit',
    hasPermission('content', 'canEdit'),
    validate([
        param('id').isMongoId().withMessage('Invalid enrollment ID'),
        param('assignmentId').isMongoId().withMessage('Invalid assignment ID'),
        body('submission').notEmpty().withMessage('Submission data is required')
    ]),
    submitAssignment
);

// Grade assignment for enrollment
router.put('/:id/assignments/:assignmentId/grade',
    authorize('admin', 'trainer'),
    validate([
        param('id').isMongoId().withMessage('Invalid enrollment ID'),
        param('assignmentId').isMongoId().withMessage('Invalid assignment ID'),
        body('marks').isNumeric().withMessage('Marks must be a number'),
        body('feedback').optional().isString()
    ]),
    gradeAssignment
);

// Generate certificate for enrollment
router.post('/:id/certificate',
    authorize('admin', 'trainer'),
    validate([
        param('id').isMongoId().withMessage('Invalid enrollment ID')
    ]),
    generateCertificate
);

// CRUD routes
router.route('/')
    .get(hasPermission('students', 'canView'), getEnrollments)
    .post(
        hasPermission('students', 'canCreate'),
        validate([
            body('student').isMongoId().withMessage('Valid student ID is required'),
            body('course').isMongoId().withMessage('Valid course ID is required'),
            body('fees.total').isNumeric().withMessage('Total fees must be a number')
        ]),
        createEnrollment
    );

router.route('/:id')
    .get(
        hasPermission('students', 'canView'),
        validate([
            param('id').isMongoId().withMessage('Invalid enrollment ID')
        ]),
        getEnrollmentById
    )
    .put(
        hasPermission('students', 'canEdit'),
        validate([
            param('id').isMongoId().withMessage('Invalid enrollment ID')
        ]),
        updateEnrollment
    )
    .delete(
        authorize('admin'),
        hasPermission('students', 'canDelete'),
        validate([
            param('id').isMongoId().withMessage('Invalid enrollment ID')
        ]),
        deleteEnrollment
    );

module.exports = router;