const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    getDashboardStats,
    getRevenueAnalytics,
    getStudentAnalytics,
    getCourseAnalytics,
    getEnrollmentAnalytics,
    getLeadAnalytics,
    getPaymentAnalytics,
    getAttendanceAnalytics,
    getPerformanceAnalytics
} = require('../controllers/analyticsController');

// All routes are protected
router.use(protect);

// Dashboard statistics
router.get('/dashboard', getDashboardStats);

// Analytics by category
router.get('/revenue', authorize('admin', 'employee'), getRevenueAnalytics);
router.get('/students', getStudentAnalytics);
router.get('/courses', getCourseAnalytics);
router.get('/enrollments', getEnrollmentAnalytics);
router.get('/leads', authorize('admin', 'counselor'), getLeadAnalytics);
router.get('/payments', authorize('admin', 'employee'), getPaymentAnalytics);
router.get('/attendance', authorize('admin', 'trainer'), getAttendanceAnalytics);
router.get('/performance', authorize('admin', 'trainer'), getPerformanceAnalytics);

module.exports = router;