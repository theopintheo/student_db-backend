const User = require('../models/User');
const Student = require('../models/Student');
const { getPermissionsByRole } = require('../utils/permissions');
const { hashPassword } = require('../utils/helpers');

// @desc    Get all users
// @route   GET /api/users
// @access  Private (Admin/Employee)
const getUsers = async (req, res) => {
    try {
        const {
            role,
            status,
            department,
            search,
            page = 1,
            limit = 10,
            sortBy = 'meta.createdAt',
            sortOrder = 'desc'
        } = req.query;
        
        // Build query
        const query = {};
        
        if (role) query.role = role;
        if (status) query.status = status;
        if (department) query['profile.department'] = department;
        
        // Search filter
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { username: searchRegex },
                { email: searchRegex },
                { 'profile.firstName': searchRegex },
                { 'profile.lastName': searchRegex },
                { 'employeeDetails.employeeId': searchRegex },
                { 'profile.designation': searchRegex }
            ];
        }
        
        // Exclude current user if not admin
        if (req.user.role !== 'admin') {
            query._id = { $ne: req.user.id };
        }
        
        // Sort
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        
        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [users, total] = await Promise.all([
            User.find(query)
                .select('-password -passwordResetToken -passwordResetExpires')
                .populate('employeeDetails.reportingManager', 'username profile.firstName profile.lastName')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            User.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            count: users.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: users
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private (Admin/Employee)
const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password -passwordResetToken -passwordResetExpires')
            .populate('employeeDetails.reportingManager', 'username profile.firstName profile.lastName profile.designation')
            .populate('meta.createdBy', 'username profile.firstName profile.lastName')
            .populate('meta.updatedBy', 'username profile.firstName profile.lastName');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Check permissions - employees can only view their own profile or subordinates
        if (req.user.role === 'employee' && 
            req.user.id !== user.id && 
            user.employeeDetails.reportingManager?.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view this user'
            });
        }
        
        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Create new user
// @route   POST /api/users
// @access  Private (Admin only)
const createUser = async (req, res) => {
    try {
        const { username, email, password, role, profile, employeeDetails } = req.body;
        
        // Check if user exists
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email or username'
            });
        }
        
        // Get permissions based on role
        const permissions = getPermissionsByRole(role);
        
        // Create user
        const user = await User.create({
            username,
            email,
            password,
            role,
            profile,
            permissions,
            employeeDetails: role === 'student' ? undefined : employeeDetails,
            meta: {
                createdBy: req.user.id,
                updatedBy: req.user.id
            }
        });
        
        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: user.getDashboardData()
        });
    } catch (error) {
        console.error('Create user error:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Username or email already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Admin only)
const updateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Check if email/username is being updated and if it already exists
        if (req.body.email && req.body.email !== user.email) {
            const existingUser = await User.findOne({ email: req.body.email });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already exists'
                });
            }
        }
        
        if (req.body.username && req.body.username !== user.username) {
            const existingUser = await User.findOne({ username: req.body.username });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Username already exists'
                });
            }
        }
        
        // Update fields
        Object.keys(req.body).forEach(key => {
            if (key !== 'meta' && key !== '_id' && key !== 'password') {
                user[key] = req.body[key];
            }
        });
        
        user.meta.updatedBy = req.user.id;
        user.meta.updatedAt = new Date();
        
        await user.save();
        
        res.json({
            success: true,
            message: 'User updated successfully',
            data: user.getDashboardData()
        });
    } catch (error) {
        console.error('Update user error:', error);
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Username or email already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Admin only)
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Cannot delete self
        if (user._id.toString() === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete your own account'
            });
        }
        
        await user.deleteOne();
        
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Update user permissions
// @route   PUT /api/users/:id/permissions
// @access  Private (Admin only)
const updateUserPermissions = async (req, res) => {
    try {
        const { permissions } = req.body;
        
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        user.permissions = permissions;
        user.meta.updatedBy = req.user.id;
        user.meta.updatedAt = new Date();
        
        await user.save();
        
        res.json({
            success: true,
            message: 'User permissions updated successfully',
            data: user.permissions
        });
    } catch (error) {
        console.error('Update user permissions error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Update user status
// @route   PUT /api/users/:id/status
// @access  Private (Admin only)
const updateUserStatus = async (req, res) => {
    try {
        const { status } = req.body;
        
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Cannot deactivate self
        if (user._id.toString() === req.user.id && status !== 'active') {
            return res.status(400).json({
                success: false,
                message: 'Cannot deactivate your own account'
            });
        }
        
        user.status = status;
        user.meta.updatedBy = req.user.id;
        user.meta.updatedAt = new Date();
        
        await user.save();
        
        res.json({
            success: true,
            message: `User status updated to ${status}`,
            data: { status: user.status }
        });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get my profile
// @route   GET /api/users/me
// @access  Private
const getMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('-password -passwordResetToken -passwordResetExpires')
            .populate('employeeDetails.reportingManager', 'username profile.firstName profile.lastName profile.designation');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('Get my profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Update my profile
// @route   PUT /api/users/me
// @access  Private
const updateMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Allow only certain fields to be updated
        const allowedFields = ['profile', 'employeeDetails'];
        Object.keys(req.body).forEach(key => {
            if (allowedFields.includes(key)) {
                user[key] = { ...user[key], ...req.body[key] };
            }
        });
        
        user.meta.updatedBy = req.user.id;
        user.meta.updatedAt = new Date();
        
        await user.save();
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: user.getDashboardData()
        });
    } catch (error) {
        console.error('Update my profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private (Admin only)
const getUserStats = async (req, res) => {
    try {
        // Get users by role
        const usersByRole = await User.aggregate([
            {
                $group: {
                    _id: '$role',
                    count: { $sum: 1 },
                    active: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    }
                }
            }
        ]);
        
        // Get users by department
        const usersByDepartment = await User.aggregate([
            { $match: { 'profile.department': { $exists: true, $ne: '' } } },
            {
                $group: {
                    _id: '$profile.department',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Get users by status
        const usersByStatus = await User.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Get total users
        const totalUsers = await User.countDocuments();
        
        // Get recent users (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentUsers = await User.countDocuments({
            'meta.createdAt': { $gte: thirtyDaysAgo }
        });
        
        res.json({
            success: true,
            data: {
                totalUsers,
                recentUsers,
                byRole: usersByRole.reduce((acc, curr) => {
                    acc[curr._id] = {
                        total: curr.count,
                        active: curr.active,
                        inactive: curr.count - curr.active
                    };
                    return acc;
                }, {}),
                byDepartment: usersByDepartment.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                byStatus: usersByStatus.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {})
            }
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Change user role
// @route   PUT /api/users/:id/role
// @access  Private (Admin only)
const changeUserRole = async (req, res) => {
    try {
        const { role } = req.body;
        
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Cannot change own role from admin
        if (user._id.toString() === req.user.id && user.role === 'admin' && role !== 'admin') {
            return res.status(400).json({
                success: false,
                message: 'Cannot change your own role from admin'
            });
        }
        
        user.role = role;
        user.permissions = getPermissionsByRole(role);
        user.meta.updatedBy = req.user.id;
        user.meta.updatedAt = new Date();
        
        await user.save();
        
        res.json({
            success: true,
            message: `User role changed to ${role}`,
            data: {
                role: user.role,
                permissions: user.permissions
            }
        });
    } catch (error) {
        console.error('Change user role error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Reset user password
// @route   PUT /api/users/:id/reset-password
// @access  Private (Admin only)
const resetUserPassword = async (req, res) => {
    try {
        const { newPassword } = req.body;
        
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        user.password = newPassword;
        user.passwordChangedAt = Date.now();
        user.meta.updatedBy = req.user.id;
        user.meta.updatedAt = new Date();
        
        await user.save();
        
        res.json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (error) {
        console.error('Reset user password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

module.exports = {
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
};