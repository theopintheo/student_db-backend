const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validationMiddleware');
const { protect } = require('../middleware/authMiddleware');
const {
    register,
    login,
    getMe,
    updateProfile,
    changePassword,
    logout,
    forgotPassword,
    resetPassword
} = require('../controllers/authController');

// Public routes
router.post('/register',
    validate([
        body('username').notEmpty().withMessage('Username is required'),
        body('email').isEmail().withMessage('Please provide a valid email'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    ]),
    register
);

router.post('/login',
    validate([
        body('email').isEmail().withMessage('Please provide a valid email'),
        body('password').notEmpty().withMessage('Password is required')
    ]),
    login
);

router.post('/forgot-password',
    validate([
        body('email').isEmail().withMessage('Please provide a valid email')
    ]),
    forgotPassword
);

router.put('/reset-password/:token',
    validate([
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    ]),
    resetPassword
);

// Protected routes
router.use(protect);

router.get('/me', getMe);
router.put('/profile', updateProfile);
router.put('/change-password', changePassword);
router.post('/logout', logout);

module.exports = router;