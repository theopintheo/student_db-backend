const express = require('express');
const router = express.Router();
const { protect, authorize, hasPermission } = require('../middleware/authMiddleware');
const {
    getStudents,
    getStudentById,
    createStudent,
    updateStudent,
    deleteStudent,
    getStudentStats,
    enrollStudent,
    updatePayment,
    getFeeSummary,
    markAttendance,
    uploadDocument
} = require('../controllers/studentController');

// All routes are protected
router.use(protect);

// Routes
router.route('/')
    .get(hasPermission('students', 'canView'), getStudents)
    .post(hasPermission('students', 'canCreate'), createStudent);

router.route('/stats')
    .get(hasPermission('students', 'canView'), getStudentStats);

router.route('/:id')
    .get(hasPermission('students', 'canView'), getStudentById)
    .put(hasPermission('students', 'canEdit'), updateStudent)
    .delete(hasPermission('students', 'canDelete'), deleteStudent);

router.route('/:id/enroll')
    .post(hasPermission('students', 'canEdit'), enrollStudent);

router.route('/:id/payment')
    .post(hasPermission('payments', 'canCreate'), updatePayment);

router.route('/:id/fee-summary')
    .get(hasPermission('students', 'canView'), getFeeSummary);

router.route('/:id/attendance')
    .post(hasPermission('attendance', 'canCreate'), markAttendance);

router.route('/:id/documents')
    .post(hasPermission('students', 'canEdit'), uploadDocument);

module.exports = router;