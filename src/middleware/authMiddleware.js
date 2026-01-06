const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    try {
        let token;
        
        // Get token from header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }
        
        // Get token from cookie
        else if (req.cookies?.token) {
            token = req.cookies.token;
        }
        
        // Check if token exists
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }
        
        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Get user from database
            req.user = await User.findById(decoded.id).select('-password');
            
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not found'
                });
            }
            
            // Check if user is active
            if (req.user.status !== 'active') {
                return res.status(401).json({
                    success: false,
                    message: 'Account is deactivated. Please contact administrator.'
                });
            }
            
            // Check if password was changed after token was issued
            if (req.user.changedPasswordAfter(decoded.iat)) {
                return res.status(401).json({
                    success: false,
                    message: 'Password recently changed. Please login again.'
                });
            }
            
            // Update last login
            req.user.lastLogin = new Date();
            await req.user.save();
            
            next();
        } catch (error) {
            console.error('Token verification error:', error);
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }
        
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `User role ${req.user.role} is not authorized to access this route`
            });
        }
        
        next();
    };
};

// Check specific permission
const hasPermission = (module, action) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }
        
        // Admin has all permissions
        if (req.user.role === 'admin') {
            return next();
        }
        
        const permission = req.user.permissions?.find(p => p.module === module);
        
        if (!permission || !permission[action]) {
            return res.status(403).json({
                success: false,
                message: `You don't have permission to ${action} ${module}`
            });
        }
        
        next();
    };
};

module.exports = { protect, authorize, hasPermission };