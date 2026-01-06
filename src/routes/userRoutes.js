const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validationMiddleware');
const { protect, authorize, hasPermission } = require('../middleware/authMiddleware');
const {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    updateUserPermissions,
    updateUserStatus,
    getMyProfile,
    updateMyProfile,
    getUserStats,
    changeUserRole,
    resetUserPassword
} = require('../controllers/userController');

// All routes are protected
router.use(protect);

// My profile routes
router.get('/me', getMyProfile);
router.put('/me', updateMyProfile);

// User statistics (admin only)
router.get('/stats', 
    authorize('admin'), 
    getUserStats
);

// Reset user password (admin only)
router.put('/:id/reset-password',
    authorize('admin'),
    validate([
        param('id').isMongoId().withMessage('Invalid user ID'),
        body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    ]),
    resetUserPassword
);

// Change user role (admin only)
router.put('/:id/role',
    authorize('admin'),
    validate([
        param('id').isMongoId().withMessage('Invalid user ID'),
        body('role').isIn(['admin', 'employee', 'counselor', 'trainer', 'student'])
            .withMessage('Invalid role')
    ]),
    changeUserRole
);

// Update user permissions (admin only)
router.put('/:id/permissions',
    authorize('admin'),
    validate([
        param('id').isMongoId().withMessage('Invalid user ID'),
        body('permissions').isArray().withMessage('Permissions must be an array')
    ]),
    updateUserPermissions
);

// Update user status (admin only)
router.put('/:id/status',
    authorize('admin'),
    validate([
        param('id').isMongoId().withMessage('Invalid user ID'),
        body('status').isIn(['active', 'inactive', 'suspended'])
            .withMessage('Invalid status')
    ]),
    updateUserStatus
);

// CRUD routes
router.route('/')
    .get(
        authorize('admin', 'employee'),
        hasPermission('users', 'canView'),
        getUsers
    )
    .post(
        authorize('admin'),
        hasPermission('users', 'canCreate'),
        validate([
            body('username').notEmpty().withMessage('Username is required'),
            body('email').isEmail().withMessage('Valid email is required'),
            body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
            body('role').isIn(['admin', 'employee', 'counselor', 'trainer', 'student'])
                .withMessage('Invalid role')
        ]),
        createUser
    );

router.route('/:id')
    .get(
        authorize('admin', 'employee'),
        hasPermission('users', 'canView'),
        validate([
            param('id').isMongoId().withMessage('Invalid user ID')
        ]),
        getUserById
    )
    .put(
        authorize('admin'),
        hasPermission('users', 'canEdit'),
        validate([
            param('id').isMongoId().withMessage('Invalid user ID')
        ]),
        updateUser
    )
    .delete(
        authorize('admin'),
        hasPermission('users', 'canDelete'),
        validate([
            param('id').isMongoId().withMessage('Invalid user ID')
        ]),
        deleteUser
    );

module.exports = router;