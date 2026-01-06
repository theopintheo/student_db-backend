const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const Attendance = require('../models/Attendance');
const Lead = require('../models/Lead');
const User = require('../models/User');
const { STUDENT_STATUS } = require('../utils/constants');
const { formatCurrency, calculatePercentage } = require('../utils/helpers');

// @desc    Get all students
// @route   GET /api/students
// @access  Private
const getStudents = async (req, res) => {
    try {
        const {
            status,
            admissionType,
            batch,
            course,
            search,
            page = 1,
            limit = 10,
            sortBy = 'meta.createdAt',
            sortOrder = 'desc'
        } = req.query;
        
        // Build query
        const query = {};
        
        if (status) query.status = status;
        if (admissionType) query['admissionDetails.admissionType'] = admissionType;
        
        // Search filter
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { studentId: searchRegex },
                { 'personalDetails.fullName': searchRegex },
                { 'personalDetails.email': searchRegex },
                { 'personalDetails.phone': searchRegex },
                { 'personalDetails.address.city': searchRegex },
                { 'personalDetails.guardianDetails.name': searchRegex }
            ];
        }
        
        // If batch or course filter is provided, need to check enrollments
        let studentIds = null;
        if (batch || course) {
            const enrollmentQuery = {};
            if (batch) enrollmentQuery.batch = batch;
            if (course) enrollmentQuery.course = course;
            
            const enrollments = await Enrollment.find(enrollmentQuery).select('student');
            studentIds = enrollments.map(e => e.student);
            
            if (studentIds.length === 0) {
                // No students match the filter
                return res.json({
                    success: true,
                    count: 0,
                    total: 0,
                    totalPages: 0,
                    currentPage: parseInt(page),
                    data: []
                });
            }
            
            query._id = { $in: studentIds };
        }
        
        // Sort
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        
        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [students, total] = await Promise.all([
            Student.find(query)
                .populate('admissionDetails.admissionCounselor', 'username profile.firstName')
                .populate('admissionDetails.leadSource', 'leadId fullName')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Student.countDocuments(query)
        ]);
        
        // Add virtual fields and calculate fees
        const studentsWithDetails = await Promise.all(
            students.map(async (student) => {
                const enrollments = await Enrollment.find({ 
                    student: student._id,
                    status: 'active'
                }).populate('course', 'name courseCode');
                
                const totalFees = student.paymentPlan.totalFees || 0;
                const paidAmount = student.paymentPlan.paidAmount || 0;
                const pendingAmount = totalFees - paidAmount;
                const paidPercentage = totalFees > 0 ? (paidAmount / totalFees) * 100 : 0;
                
                return {
                    ...student,
                    enrollments,
                    feeSummary: {
                        totalFees,
                        paidAmount,
                        pendingAmount,
                        paidPercentage: paidPercentage.toFixed(2)
                    },
                    age: calculateAge(student.personalDetails.dateOfBirth)
                };
            })
        );
        
        res.json({
            success: true,
            count: studentsWithDetails.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: studentsWithDetails
        });
    } catch (error) {
        console.error('Get students error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Helper function to calculate age
const calculateAge = (dob) => {
    if (!dob) return null;
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};

// @desc    Get single student
// @route   GET /api/students/:id
// @access  Private
const getStudentById = async (req, res) => {
    try {
        const student = await Student.findById(req.params.id)
            .populate('admissionDetails.admissionCounselor', 'username profile.firstName profile.lastName profile.designation')
            .populate('admissionDetails.leadSource', 'leadId fullName phone email')
            .populate('admissionDetails.referralStudent', 'studentId personalDetails.fullName')
            .populate('meta.createdBy', 'username profile.firstName')
            .populate('meta.updatedBy', 'username profile.firstName');
        
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        // Get enrollments
        const enrollments = await Enrollment.find({ student: student._id })
            .populate('course', 'name courseCode duration')
            .populate('batch', 'batchId name schedule instructor')
            .sort({ enrollmentDate: -1 })
            .lean();
        
        // Calculate attendance for each enrollment
        enrollments.forEach(enrollment => {
            if (enrollment.attendance && enrollment.attendance.length > 0) {
                const presentDays = enrollment.attendance.filter(session => 
                    session.status === 'present' || session.status === 'late'
                ).length;
                enrollment.attendancePercentage = Math.round((presentDays / enrollment.attendance.length) * 100);
            } else {
                enrollment.attendancePercentage = 0;
            }
        });
        
        // Get payments
        const payments = await Payment.find({ student: student._id })
            .populate('receivedBy', 'username profile.firstName')
            .populate('verifiedBy', 'username profile.firstName')
            .sort({ paymentDate: -1 })
            .lean();
        
        // Get attendance records
        const attendance = await Attendance.find({ student: student._id })
            .populate('batch', 'batchId name')
            .populate('session', 'topic date')
            .sort({ date: -1 })
            .limit(20)
            .lean();
        
        // Calculate fee summary
        const totalFees = student.paymentPlan.totalFees || 0;
        const paidAmount = student.paymentPlan.paidAmount || 0;
        const pendingAmount = totalFees - paidAmount;
        const paidPercentage = totalFees > 0 ? (paidAmount / totalFees) * 100 : 0;
        
        // Calculate age
        const age = calculateAge(student.personalDetails.dateOfBirth);
        
        res.json({
            success: true,
            data: {
                ...student.toObject(),
                age,
                enrollments,
                payments,
                attendance,
                feeSummary: {
                    totalFees,
                    paidAmount,
                    pendingAmount,
                    paidPercentage: paidPercentage.toFixed(2),
                    installments: student.paymentPlan.paymentSchedule || []
                },
                stats: {
                    totalEnrollments: enrollments.length,
                    activeEnrollments: enrollments.filter(e => e.status === 'active').length,
                    completedEnrollments: enrollments.filter(e => e.status === 'completed').length,
                    totalPayments: payments.length,
                    totalAmountPaid: payments
                        .filter(p => p.status === 'completed')
                        .reduce((sum, payment) => sum + payment.amount, 0)
                }
            }
        });
    } catch (error) {
        console.error('Get student error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Create new student
// @route   POST /api/students
// @access  Private
const createStudent = async (req, res) => {
    try {
        const studentData = {
            ...req.body,
            meta: {
                createdBy: req.user.id,
                updatedBy: req.user.id
            }
        };
        
        // If phone is provided, check for duplicates
        if (studentData.personalDetails?.phone) {
            const existingStudent = await Student.findOne({
                'personalDetails.phone': studentData.personalDetails.phone
            });
            
            if (existingStudent) {
                return res.status(400).json({
                    success: false,
                    message: 'Student with this phone number already exists'
                });
            }
        }
        
        const student = await Student.create(studentData);
        
        res.status(201).json({
            success: true,
            message: 'Student created successfully',
            data: student
        });
    } catch (error) {
        console.error('Create student error:', error);
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Student with this phone or email already exists'
            });
        }
        
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

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private
const updateStudent = async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        // Check if phone is being updated and if it already exists
        if (req.body.personalDetails?.phone && 
            req.body.personalDetails.phone !== student.personalDetails.phone) {
            
            const existingStudent = await Student.findOne({
                'personalDetails.phone': req.body.personalDetails.phone
            });
            
            if (existingStudent && existingStudent._id.toString() !== req.params.id) {
                return res.status(400).json({
                    success: false,
                    message: 'Student with this phone number already exists'
                });
            }
        }
        
        // Update fields
        Object.keys(req.body).forEach(key => {
            if (key === 'personalDetails') {
                student.personalDetails = { 
                    ...student.personalDetails, 
                    ...req.body.personalDetails 
                };
            } else if (key === 'admissionDetails') {
                student.admissionDetails = { 
                    ...student.admissionDetails, 
                    ...req.body.admissionDetails 
                };
            } else if (key === 'paymentPlan') {
                student.paymentPlan = { 
                    ...student.paymentPlan, 
                    ...req.body.paymentPlan 
                };
            } else if (key !== 'meta' && key !== '_id' && key !== 'studentId') {
                student[key] = req.body[key];
            }
        });
        
        student.meta.updatedBy = req.user.id;
        student.meta.updatedAt = new Date();
        
        await student.save();
        
        res.json({
            success: true,
            message: 'Student updated successfully',
            data: student
        });
    } catch (error) {
        console.error('Update student error:', error);
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Phone number or email already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Delete student
// @route   DELETE /api/students/:id
// @access  Private (Admin only)
const deleteStudent = async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        // Check if student has active enrollments
        const activeEnrollments = await Enrollment.countDocuments({
            student: student._id,
            status: 'active'
        });
        
        if (activeEnrollments > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete student with active enrollments'
            });
        }
        
        // Delete related records
        await Enrollment.deleteMany({ student: student._id });
        await Payment.deleteMany({ student: student._id });
        await Attendance.deleteMany({ student: student._id });
        
        await student.deleteOne();
        
        res.json({
            success: true,
            message: 'Student deleted successfully'
        });
    } catch (error) {
        console.error('Delete student error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get student statistics
// @route   GET /api/students/stats
// @access  Private
const getStudentStats = async (req, res) => {
    try {
        // Students by status
        const studentsByStatus = await Student.aggregate([
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }}
        ]);
        
        // Students by admission type
        const studentsByAdmissionType = await Student.aggregate([
            { $group: {
                _id: '$admissionDetails.admissionType',
                count: { $sum: 1 }
            }}
        ]);
        
        // Students by month (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const studentsByMonth = await Student.aggregate([
            {
                $match: {
                    'admissionDetails.admissionDate': { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$admissionDetails.admissionDate' },
                        month: { $month: '$admissionDetails.admissionDate' }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            },
            {
                $limit: 6
            }
        ]);
        
        // Gender distribution
        const genderDistribution = await Student.aggregate([
            { $match: { 'personalDetails.gender': { $exists: true, $ne: null } } },
            { $group: {
                _id: '$personalDetails.gender',
                count: { $sum: 1 }
            }}
        ]);
        
        // Age distribution
        const ageDistribution = await Student.aggregate([
            { $match: { 'personalDetails.dateOfBirth': { $exists: true, $ne: null } } },
            {
                $project: {
                    age: {
                        $floor: {
                            $divide: [
                                { $subtract: [new Date(), '$personalDetails.dateOfBirth'] },
                                365 * 24 * 60 * 60 * 1000
                            ]
                        }
                    }
                }
            },
            {
                $bucket: {
                    groupBy: '$age',
                    boundaries: [18, 25, 30, 35, 40, 50, 60, 100],
                    default: 'Other',
                    output: {
                        count: { $sum: 1 }
                    }
                }
            }
        ]);
        
        // Total students
        const totalStudents = await Student.countDocuments();
        const activeStudents = await Student.countDocuments({ status: 'active' });
        
        // Format monthly data
        const monthlyData = studentsByMonth.map(item => ({
            month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
            count: item.count
        }));
        
        res.json({
            success: true,
            data: {
                summary: {
                    totalStudents,
                    activeStudents,
                    inactiveStudents: totalStudents - activeStudents,
                    activePercentage: calculatePercentage(activeStudents, totalStudents)
                },
                byStatus: studentsByStatus.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                byAdmissionType: studentsByAdmissionType.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                monthlyTrend: monthlyData,
                demographics: {
                    genderDistribution: genderDistribution.reduce((acc, curr) => {
                        acc[curr._id] = curr.count;
                        return acc;
                    }, {}),
                    ageDistribution
                }
            }
        });
    } catch (error) {
        console.error('Get student stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Enroll student in course
// @route   POST /api/students/:id/enroll
// @access  Private
const enrollStudent = async (req, res) => {
    try {
        const { course, batch, enrollmentType, fees } = req.body;
        
        const student = await Student.findById(req.params.id);
        
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        // Check if student is already enrolled in this course
        const existingEnrollment = await Enrollment.findOne({
            student: student._id,
            course,
            status: { $in: ['pending', 'active'] }
        });
        
        if (existingEnrollment) {
            return res.status(400).json({
                success: false,
                message: 'Student is already enrolled or has a pending enrollment for this course'
            });
        }
        
        // Create enrollment
        const enrollmentData = {
            student: student._id,
            course,
            batch,
            enrollmentType,
            fees: {
                total: fees.total,
                paid: 0,
                pending: fees.total
            },
            meta: {
                createdBy: req.user.id,
                updatedBy: req.user.id
            }
        };
        
        const enrollment = await Enrollment.create(enrollmentData);
        
        // Add enrollment to student
        student.enrollments.push(enrollment._id);
        await student.save();
        
        // Update student's payment plan
        const newTotalFees = (student.paymentPlan.totalFees || 0) + fees.total;
        const newPendingAmount = newTotalFees - (student.paymentPlan.paidAmount || 0);
        
        student.paymentPlan = {
            totalFees: newTotalFees,
            paidAmount: student.paymentPlan.paidAmount || 0,
            pendingAmount: newPendingAmount,
            paymentSchedule: student.paymentPlan.paymentSchedule || []
        };
        
        await student.save();
        
        res.status(201).json({
            success: true,
            message: 'Student enrolled successfully',
            data: {
                enrollment,
                student: {
                    id: student.studentId,
                    name: student.personalDetails.fullName
                }
            }
        });
    } catch (error) {
        console.error('Enroll student error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Update student payment
// @route   POST /api/students/:id/payment
// @access  Private
const updatePayment = async (req, res) => {
    try {
        const { amount, paymentMode, installmentNumber, remarks } = req.body;
        
        const student = await Student.findById(req.params.id);
        
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        // Update student payment
        await student.updatePayment(amount, installmentNumber);
        
        // Create payment record
        const paymentData = {
            student: student._id,
            amount,
            paymentMode,
            status: 'completed',
            paymentDate: new Date(),
            receivedBy: req.user.id,
            verifiedBy: req.user.id,
            verificationDate: new Date(),
            transactionDetails: {
                remarks
            },
            meta: {
                createdBy: req.user.id,
                updatedBy: req.user.id
            }
        };
        
        const payment = await Payment.create(paymentData);
        
        res.json({
            success: true,
            message: 'Payment recorded successfully',
            data: {
                payment,
                student: {
                    id: student.studentId,
                    name: student.personalDetails.fullName,
                    feeSummary: student.getFeeSummary()
                }
            }
        });
    } catch (error) {
        console.error('Update payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get student fee summary
// @route   GET /api/students/:id/fee-summary
// @access  Private
const getFeeSummary = async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        const feeSummary = student.getFeeSummary();
        
        // Get payment history
        const payments = await Payment.find({ student: student._id })
            .sort({ paymentDate: -1 })
            .limit(10)
            .lean();
        
        res.json({
            success: true,
            data: {
                student: {
                    id: student.studentId,
                    name: student.personalDetails.fullName
                },
                feeSummary,
                recentPayments: payments,
                paymentSchedule: student.paymentPlan.paymentSchedule || []
            }
        });
    } catch (error) {
        console.error('Get fee summary error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Mark student attendance
// @route   POST /api/students/:id/attendance
// @access  Private (Admin/Trainer)
const markAttendance = async (req, res) => {
    try {
        const { batch, session, date, status, remarks } = req.body;
        
        const student = await Student.findById(req.params.id);
        
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        // Check if student is enrolled in the batch
        const enrollment = await Enrollment.findOne({
            student: student._id,
            batch,
            status: 'active'
        });
        
        if (!enrollment) {
            return res.status(400).json({
                success: false,
                message: 'Student is not enrolled in this batch'
            });
        }
        
        // Create attendance record
        const attendanceData = {
            student: student._id,
            batch,
            session,
            date: new Date(date),
            status,
            remarks,
            markedBy: req.user.id,
            meta: {
                createdBy: req.user.id,
                updatedBy: req.user.id
            }
        };
        
        const attendance = await Attendance.create(attendanceData);
        
        // Update enrollment attendance
        await enrollment.markAttendance(new Date(date), session, status, remarks);
        
        res.status(201).json({
            success: true,
            message: 'Attendance marked successfully',
            data: attendance
        });
    } catch (error) {
        console.error('Mark attendance error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Upload student document
// @route   POST /api/students/:id/documents
// @access  Private
const uploadDocument = async (req, res) => {
    try {
        const { name, type, url, verified } = req.body;
        
        const student = await Student.findById(req.params.id);
        
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        const document = {
            name,
            type,
            url,
            verified: verified || false,
            uploadedAt: new Date()
        };
        
        if (verified && req.user.role === 'admin') {
            document.verifiedBy = req.user.id;
        }
        
        student.documents.push(document);
        student.meta.updatedBy = req.user.id;
        student.meta.updatedAt = new Date();
        
        await student.save();
        
        res.status(201).json({
            success: true,
            message: 'Document uploaded successfully',
            data: document
        });
    } catch (error) {
        console.error('Upload document error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

module.exports = {
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
};