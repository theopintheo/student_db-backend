const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validationMiddleware');
const { protect, authorize, hasPermission } = require('../middleware/authMiddleware');
const {
    getCourses,
    getCourseById,
    createCourse,
    updateCourse,
    deleteCourse,
    addBatch,
    updateBatch,
    getCourseStats,
    getCourseEnrollments,
    getActiveCourses,
    getCourseCategories,
    addReview
} = require('../controllers/courseController');

// All routes are protected
router.use(protect);

// Get active courses
router.get('/active', 
    hasPermission('courses', 'canView'), 
    getActiveCourses
);

// Get course categories
router.get('/categories', 
    hasPermission('courses', 'canView'), 
    getCourseCategories
);

// Get course statistics
router.get('/:id/stats',
    hasPermission('courses', 'canView'),
    validate([
        param('id').isMongoId().withMessage('Invalid course ID')
    ]),
    getCourseStats
);

// Get course enrollments
router.get('/:id/enrollments',
    hasPermission('courses', 'canView'),
    validate([
        param('id').isMongoId().withMessage('Invalid course ID')
    ]),
    getCourseEnrollments
);

// Add batch to course
router.post('/:id/batches',
    authorize('admin', 'trainer'),
    hasPermission('courses', 'canCreate'),
    validate([
        param('id').isMongoId().withMessage('Invalid course ID'),
        body('name').notEmpty().withMessage('Batch name is required'),
        body('startDate').isISO8601().withMessage('Valid start date is required'),
        body('instructor').isMongoId().withMessage('Valid instructor ID is required'),
        body('maxStudents').isInt({ min: 1 }).withMessage('Maximum students must be at least 1')
    ]),
    addBatch
);

// Update batch in course
router.put('/:id/batches/:batchIndex',
    authorize('admin', 'trainer'),
    hasPermission('courses', 'canEdit'),
    validate([
        param('id').isMongoId().withMessage('Invalid course ID'),
        param('batchIndex').isInt({ min: 0 }).withMessage('Valid batch index is required')
    ]),
    updateBatch
);

// Add review to course
router.post('/:id/reviews',
    hasPermission('courses', 'canEdit'),
    validate([
        param('id').isMongoId().withMessage('Invalid course ID'),
        body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
        body('comment').optional().isString().withMessage('Comment must be a string')
    ]),
    addReview
);

// CRUD routes
router.route('/')
    .get(hasPermission('courses', 'canView'), getCourses)
    .post(
        authorize('admin', 'trainer'),
        hasPermission('courses', 'canCreate'),
        validate([
            body('name').notEmpty().withMessage('Course name is required'),
            body('description').notEmpty().withMessage('Course description is required'),
            body('duration.value').isInt({ min: 1 }).withMessage('Duration value must be at least 1'),
            body('duration.unit').isIn(['hours', 'days', 'weeks', 'months']).withMessage('Invalid duration unit'),
            body('fees.regular').isNumeric().withMessage('Regular fee must be a number')
        ]),
        createCourse
    );

router.route('/:id')
    .get(
        hasPermission('courses', 'canView'),
        validate([
            param('id').isMongoId().withMessage('Invalid course ID')
        ]),
        getCourseById
    )
    .put(
        authorize('admin', 'trainer'),
        hasPermission('courses', 'canEdit'),
        validate([
            param('id').isMongoId().withMessage('Invalid course ID')
        ]),
        updateCourse
    )
    .delete(
        authorize('admin'),
        hasPermission('courses', 'canDelete'),
        validate([
            param('id').isMongoId().withMessage('Invalid course ID')
        ]),
        deleteCourse
    );

module.exports = router;