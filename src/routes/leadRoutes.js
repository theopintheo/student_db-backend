const express = require('express');
const router = express.Router();
const { protect, authorize, hasPermission } = require('../middleware/authMiddleware');
const {
    getLeads,
    getLeadById,
    createLead,
    updateLead,
    deleteLead,
    addCommunication,
    convertToStudent,
    getLeadStats
} = require('../controllers/leadController');

// All routes are protected
router.use(protect);

// Routes with specific permissions
router.route('/')
    .get(hasPermission('leads', 'canView'), getLeads)
    .post(hasPermission('leads', 'canCreate'), createLead);

router.route('/stats')
    .get(hasPermission('leads', 'canView'), getLeadStats);

router.route('/:id')
    .get(hasPermission('leads', 'canView'), getLeadById)
    .put(hasPermission('leads', 'canEdit'), updateLead)
    .delete(hasPermission('leads', 'canDelete'), deleteLead);

router.route('/:id/communications')
    .post(hasPermission('leads', 'canEdit'), addCommunication);

router.route('/:id/convert')
    .post(hasPermission('leads', 'canEdit'), convertToStudent);

module.exports = router;