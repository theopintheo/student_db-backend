const Payment = require('../models/Payment');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const { PAYMENT_STATUS, PAYMENT_MODE } = require('../utils/constants');
const { formatCurrency } = require('../utils/helpers');

// @desc    Get all payments
// @route   GET /api/payments
// @access  Private
const getPayments = async (req, res) => {
    try {
        const {
            status,
            paymentMode,
            student,
            startDate,
            endDate,
            minAmount,
            maxAmount,
            search,
            page = 1,
            limit = 20,
            sortBy = 'paymentDate',
            sortOrder = 'desc'
        } = req.query;
        
        // Build query
        const query = {};
        
        if (status) query.status = status;
        if (paymentMode) query.paymentMode = paymentMode;
        if (student) query.student = student;
        
        // Date range filter
        if (startDate || endDate) {
            query.paymentDate = {};
            if (startDate) query.paymentDate.$gte = new Date(startDate);
            if (endDate) query.paymentDate.$lte = new Date(endDate);
        }
        
        // Amount range filter
        if (minAmount || maxAmount) {
            query.amount = {};
            if (minAmount) query.amount.$gte = Number(minAmount);
            if (maxAmount) query.amount.$lte = Number(maxAmount);
        }
        
        // Search filter
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { paymentId: searchRegex },
                { receiptNumber: searchRegex },
                { 'transactionDetails.transactionId': searchRegex },
                { 'transactionDetails.chequeNumber': searchRegex }
            ];
        }
        
        // Sort
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        
        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [payments, total, totalAmount] = await Promise.all([
            Payment.find(query)
                .populate('student', 'studentId personalDetails.fullName personalDetails.phone')
                .populate('enrollment', 'enrollmentId')
                .populate('receivedBy', 'username profile.firstName profile.lastName')
                .populate('verifiedBy', 'username profile.firstName profile.lastName')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Payment.countDocuments(query),
            Payment.aggregate([
                { $match: query },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);
        
        const totalAmountValue = totalAmount.length > 0 ? totalAmount[0].total : 0;
        
        res.json({
            success: true,
            count: payments.length,
            total,
            totalAmount: totalAmountValue,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: payments
        });
    } catch (error) {
        console.error('Get payments error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get single payment
// @route   GET /api/payments/:id
// @access  Private
const getPaymentById = async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id)
            .populate('student', 'studentId personalDetails.fullName personalDetails.email personalDetails.phone')
            .populate('enrollment', 'enrollmentId')
            .populate('receivedBy', 'username profile.firstName profile.lastName profile.designation')
            .populate('verifiedBy', 'username profile.firstName profile.lastName profile.designation')
            .populate('refundDetails.approvedBy', 'username profile.firstName profile.lastName');
        
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }
        
        res.json({
            success: true,
            data: payment
        });
    } catch (error) {
        console.error('Get payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Create new payment
// @route   POST /api/payments
// @access  Private
const createPayment = async (req, res) => {
    try {
        const paymentData = {
            ...req.body,
            receivedBy: req.user.id,
            meta: {
                createdBy: req.user.id,
                updatedBy: req.user.id
            }
        };
        
        // Auto-verify if user is admin/employee
        if (req.user.role === 'admin' || req.user.role === 'employee') {
            paymentData.status = 'completed';
            paymentData.verifiedBy = req.user.id;
            paymentData.verificationDate = new Date();
        }
        
        const payment = await Payment.create(paymentData);
        
        // Populate for response
        const populatedPayment = await Payment.findById(payment._id)
            .populate('student', 'studentId personalDetails.fullName')
            .populate('receivedBy', 'username profile.firstName');
        
        res.status(201).json({
            success: true,
            message: 'Payment recorded successfully',
            data: populatedPayment
        });
    } catch (error) {
        console.error('Create payment error:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Update payment
// @route   PUT /api/payments/:id
// @access  Private
const updatePayment = async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }
        
        // Cannot update verified/completed payments unless admin
        if (payment.status === 'completed' && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Cannot update completed payment'
            });
        }
        
        // Update fields
        Object.keys(req.body).forEach(key => {
            if (key !== 'meta' && key !== '_id' && key !== 'paymentId' && key !== 'receiptNumber') {
                payment[key] = req.body[key];
            }
        });
        
        payment.meta.updatedBy = req.user.id;
        payment.meta.updatedAt = new Date();
        
        await payment.save();
        
        res.json({
            success: true,
            message: 'Payment updated successfully',
            data: payment
        });
    } catch (error) {
        console.error('Update payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Delete payment (admin only)
// @route   DELETE /api/payments/:id
// @access  Private (Admin only)
const deletePayment = async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }
        
        // Cannot delete completed payments
        if (payment.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete completed payment. Use refund instead.'
            });
        }
        
        await payment.deleteOne();
        
        res.json({
            success: true,
            message: 'Payment deleted successfully'
        });
    } catch (error) {
        console.error('Delete payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Verify payment
// @route   PUT /api/payments/:id/verify
// @access  Private (Admin/Employee)
const verifyPayment = async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }
        
        if (payment.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Payment already verified'
            });
        }
        
        payment.status = 'completed';
        payment.verifiedBy = req.user.id;
        payment.verificationDate = new Date();
        payment.meta.updatedBy = req.user.id;
        payment.meta.updatedAt = new Date();
        
        await payment.save();
        
        res.json({
            success: true,
            message: 'Payment verified successfully',
            data: payment
        });
    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Refund payment
// @route   PUT /api/payments/:id/refund
// @access  Private (Admin only)
const refundPayment = async (req, res) => {
    try {
        const { amount, reason } = req.body;
        
        const payment = await Payment.findById(req.params.id);
        
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }
        
        if (payment.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Only completed payments can be refunded'
            });
        }
        
        if (amount > payment.amount) {
            return res.status(400).json({
                success: false,
                message: 'Refund amount cannot exceed payment amount'
            });
        }
        
        payment.status = 'refunded';
        payment.refundDetails = {
            amount,
            reason,
            approvedBy: req.user.id,
            refundDate: new Date(),
            refundMode: payment.paymentMode
        };
        payment.meta.updatedBy = req.user.id;
        payment.meta.updatedAt = new Date();
        
        await payment.save();
        
        res.json({
            success: true,
            message: 'Payment refunded successfully',
            data: payment
        });
    } catch (error) {
        console.error('Refund payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Generate receipt for payment
// @route   GET /api/payments/:id/receipt
// @access  Private
const generateReceipt = async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id)
            .populate('student', 'studentId personalDetails.fullName personalDetails.email personalDetails.phone')
            .populate('receivedBy', 'username profile.firstName profile.lastName')
            .populate('verifiedBy', 'username profile.firstName profile.lastName');
        
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }
        
        const receiptData = await payment.getReceiptData();
        
        // Generate PDF receipt (simplified version - in production use PDF library)
        const receipt = {
            ...receiptData,
            company: {
                name: process.env.APP_NAME || 'Edu Management System',
                address: '123 Education Street, Knowledge City',
                phone: '+91 9876543210',
                email: 'info@edumanage.com',
                website: 'www.edumanage.com'
            },
            generatedAt: new Date().toISOString()
        };
        
        res.json({
            success: true,
            message: 'Receipt generated successfully',
            data: receipt
        });
    } catch (error) {
        console.error('Generate receipt error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get payment statistics
// @route   GET /api/payments/stats
// @access  Private
const getPaymentStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        // Build date filter
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.paymentDate = {};
            if (startDate) dateFilter.paymentDate.$gte = new Date(startDate);
            if (endDate) dateFilter.paymentDate.$lte = new Date(endDate);
        }
        
        // Get total payments
        const totalPayments = await Payment.countDocuments(dateFilter);
        
        // Get total amount
        const totalAmountResult = await Payment.aggregate([
            { $match: dateFilter },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalAmount = totalAmountResult.length > 0 ? totalAmountResult[0].total : 0;
        
        // Get payments by status
        const paymentsByStatus = await Payment.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }
        ]);
        
        // Get payments by mode
        const paymentsByMode = await Payment.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$paymentMode', count: { $sum: 1 }, amount: { $sum: '$amount' } } }
        ]);
        
        // Get monthly trend (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const monthlyTrend = await Payment.aggregate([
            {
                $match: {
                    ...dateFilter,
                    paymentDate: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$paymentDate' },
                        month: { $month: '$paymentDate' }
                    },
                    count: { $sum: 1 },
                    amount: { $sum: '$amount' }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            },
            {
                $limit: 6
            }
        ]);
        
        // Format monthly data
        const formattedMonthlyTrend = monthlyTrend.map(item => ({
            month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
            count: item.count,
            amount: item.amount
        }));
        
        // Get today's payments
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todaysPayments = await Payment.countDocuments({
            paymentDate: { $gte: today, $lt: tomorrow }
        });
        
        const todaysAmountResult = await Payment.aggregate([
            {
                $match: {
                    paymentDate: { $gte: today, $lt: tomorrow }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const todaysAmount = todaysAmountResult.length > 0 ? todaysAmountResult[0].total : 0;
        
        res.json({
            success: true,
            data: {
                totalPayments,
                totalAmount: formatCurrency(totalAmount),
                todaysPayments,
                todaysAmount: formatCurrency(todaysAmount),
                byStatus: paymentsByStatus.reduce((acc, curr) => {
                    acc[curr._id] = { count: curr.count, amount: curr.amount };
                    return acc;
                }, {}),
                byMode: paymentsByMode.reduce((acc, curr) => {
                    acc[curr._id] = { count: curr.count, amount: curr.amount };
                    return acc;
                }, {}),
                monthlyTrend: formattedMonthlyTrend
            }
        });
    } catch (error) {
        console.error('Get payment stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get payments for specific student
// @route   GET /api/payments/student/:studentId
// @access  Private
const getStudentPayments = async (req, res) => {
    try {
        const studentId = req.params.studentId;
        
        // Verify student exists
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        const payments = await Payment.find({ student: studentId })
            .populate('enrollment', 'enrollmentId')
            .populate('receivedBy', 'username profile.firstName')
            .populate('verifiedBy', 'username profile.firstName')
            .sort({ paymentDate: -1 })
            .lean();
        
        // Calculate summary
        const totalPaid = payments
            .filter(p => p.status === 'completed')
            .reduce((sum, payment) => sum + payment.amount, 0);
        
        res.json({
            success: true,
            data: {
                student: {
                    id: student.studentId,
                    name: student.personalDetails.fullName,
                    totalFees: student.paymentPlan.totalFees,
                    paidAmount: student.paymentPlan.paidAmount,
                    pendingAmount: student.paymentPlan.pendingAmount
                },
                payments,
                summary: {
                    totalTransactions: payments.length,
                    totalPaid,
                    pendingPayments: payments.filter(p => p.status === 'pending').length
                }
            }
        });
    } catch (error) {
        console.error('Get student payments error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

module.exports = {
    getPayments,
    getPaymentById,
    createPayment,
    updatePayment,
    deletePayment,
    verifyPayment,
    refundPayment,
    generateReceipt,
    getPaymentStats,
    getStudentPayments
};