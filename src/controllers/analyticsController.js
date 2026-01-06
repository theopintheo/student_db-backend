const Student = require('../models/Student');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Lead = require('../models/Lead');
const Payment = require('../models/Payment');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Batch = require('../models/Batch');
const { formatCurrency, calculatePercentage } = require('../utils/helpers');

// @desc    Get dashboard statistics
// @route   GET /api/analytics/dashboard
// @access  Private
const getDashboardStats = async (req, res) => {
    try {
        const { range = 'month' } = req.query;
        
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        
        switch(range) {
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'quarter':
                startDate.setMonth(startDate.getMonth() - 3);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            default:
                startDate.setMonth(startDate.getMonth() - 1);
        }

        // Get total counts
        const [
            totalStudents,
            activeStudents,
            totalCourses,
            activeCourses,
            totalBatches,
            ongoingBatches,
            totalLeads,
            convertedLeads,
            totalEmployees,
            activeEmployees
        ] = await Promise.all([
            Student.countDocuments(),
            Student.countDocuments({ status: 'active' }),
            Course.countDocuments(),
            Course.countDocuments({ status: 'active' }),
            Batch.countDocuments(),
            Batch.countDocuments({ status: 'ongoing' }),
            Lead.countDocuments(),
            Lead.countDocuments({ convertedToStudent: true }),
            User.countDocuments({ role: { $in: ['admin', 'employee', 'counselor', 'trainer'] } }),
            User.countDocuments({ 
                role: { $in: ['admin', 'employee', 'counselor', 'trainer'] },
                status: 'active'
            })
        ]);

        // Get revenue data
        const revenueData = await Payment.aggregate([
            {
                $match: {
                    status: 'completed',
                    paymentDate: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: { 
                        year: { $year: '$paymentDate' },
                        month: { $month: '$paymentDate' }
                    },
                    totalRevenue: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Get enrollment data
        const enrollmentData = await Enrollment.aggregate([
            {
                $match: {
                    enrollmentDate: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: { 
                        year: { $year: '$enrollmentDate' },
                        month: { $month: '$enrollmentDate' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Get course enrollment distribution
        const courseEnrollment = await Course.aggregate([
            {
                $project: {
                    name: 1,
                    courseCode: 1,
                    enrollmentStats: 1,
                    totalEnrolled: { $add: [
                        '$enrollmentStats.active',
                        '$enrollmentStats.completed',
                        '$enrollmentStats.dropout'
                    ]}
                }
            },
            { $sort: { totalEnrolled: -1 } },
            { $limit: 5 }
        ]);

        // Get recent activities
        const recentPayments = await Payment.find({ status: 'completed' })
            .populate('student', 'studentId personalDetails.fullName')
            .sort({ paymentDate: -1 })
            .limit(5)
            .lean();

        const recentEnrollments = await Enrollment.find()
            .populate('student', 'studentId personalDetails.fullName')
            .populate('course', 'name courseCode')
            .sort({ enrollmentDate: -1 })
            .limit(5)
            .lean();

        // Format revenue chart data
        const revenueChart = revenueData.map(item => ({
            month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
            revenue: item.totalRevenue,
            transactions: item.count
        }));

        // Format enrollment chart data
        const enrollmentChart = enrollmentData.map(item => ({
            month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
            enrollments: item.count
        }));

        // Format course enrollment chart
        const courseChart = courseEnrollment.map(course => ({
            course: course.name,
            students: course.totalEnrolled || 0,
            active: course.enrollmentStats?.active || 0,
            completed: course.enrollmentStats?.completed || 0
        }));

        // Calculate KPIs
        const totalRevenueResult = await Payment.aggregate([
            { $match: { status: 'completed', paymentDate: { $gte: startDate } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const totalRevenue = totalRevenueResult.length > 0 ? totalRevenueResult[0].total : 0;
        const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

        res.json({
            success: true,
            data: {
                stats: {
                    totalStudents,
                    activeStudents,
                    totalCourses,
                    activeCourses,
                    totalBatches,
                    ongoingBatches,
                    totalLeads,
                    convertedLeads,
                    conversionRate: conversionRate.toFixed(2),
                    totalEmployees,
                    activeEmployees,
                    totalRevenue: formatCurrency(totalRevenue)
                },
                charts: {
                    revenueChart,
                    enrollmentChart,
                    courseChart
                },
                recentActivities: {
                    payments: recentPayments.map(p => ({
                        id: p.paymentId,
                        student: p.student.personalDetails.fullName,
                        amount: formatCurrency(p.amount),
                        date: p.paymentDate,
                        status: p.status
                    })),
                    enrollments: recentEnrollments.map(e => ({
                        id: e.enrollmentId,
                        student: e.student.personalDetails.fullName,
                        course: e.course.name,
                        date: e.enrollmentDate,
                        status: e.status
                    }))
                },
                timeRange: {
                    start: startDate,
                    end: endDate,
                    label: range
                }
            }
        });
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get revenue analytics
// @route   GET /api/analytics/revenue
// @access  Private (Admin/Employee)
const getRevenueAnalytics = async (req, res) => {
    try {
        const { startDate, endDate, groupBy = 'month' } = req.query;
        
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.paymentDate = {};
            if (startDate) dateFilter.paymentDate.$gte = new Date(startDate);
            if (endDate) dateFilter.paymentDate.$lte = new Date(endDate);
        }

        // Group by time period
        let groupStage;
        switch(groupBy) {
            case 'day':
                groupStage = {
                    _id: {
                        year: { $year: '$paymentDate' },
                        month: { $month: '$paymentDate' },
                        day: { $dayOfMonth: '$paymentDate' }
                    }
                };
                break;
            case 'week':
                groupStage = {
                    _id: {
                        year: { $year: '$paymentDate' },
                        week: { $week: '$paymentDate' }
                    }
                };
                break;
            case 'year':
                groupStage = {
                    _id: {
                        year: { $year: '$paymentDate' }
                    }
                };
                break;
            default: // month
                groupStage = {
                    _id: {
                        year: { $year: '$paymentDate' },
                        month: { $month: '$paymentDate' }
                    }
                };
        }

        const revenueByPeriod = await Payment.aggregate([
            {
                $match: {
                    status: 'completed',
                    ...dateFilter
                }
            },
            {
                $group: {
                    ...groupStage,
                    totalRevenue: { $sum: '$amount' },
                    transactionCount: { $sum: 1 },
                    averageTransaction: { $avg: '$amount' }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } }
        ]);

        // Revenue by payment mode
        const revenueByMode = await Payment.aggregate([
            {
                $match: {
                    status: 'completed',
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: '$paymentMode',
                    totalRevenue: { $sum: '$amount' },
                    transactionCount: { $sum: 1 }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        // Revenue by course
        const revenueByCourse = await Enrollment.aggregate([
            {
                $match: {
                    'fees.paid': { $gt: 0 }
                }
            },
            {
                $lookup: {
                    from: 'courses',
                    localField: 'course',
                    foreignField: '_id',
                    as: 'course'
                }
            },
            { $unwind: '$course' },
            {
                $group: {
                    _id: '$course.name',
                    totalRevenue: { $sum: '$fees.paid' },
                    studentCount: { $sum: 1 }
                }
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 }
        ]);

        // Format response
        const formattedRevenueByPeriod = revenueByPeriod.map(item => {
            let label;
            if (groupBy === 'day') {
                label = `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`;
            } else if (groupBy === 'week') {
                label = `Week ${item._id.week}, ${item._id.year}`;
            } else if (groupBy === 'year') {
                label = item._id.year;
            } else {
                label = `${item._id.year}-${String(item._id.month).padStart(2, '0')}`;
            }

            return {
                period: label,
                revenue: item.totalRevenue,
                transactions: item.transactionCount,
                average: item.averageTransaction
            };
        });

        res.json({
            success: true,
            data: {
                summary: {
                    totalPeriods: formattedRevenueByPeriod.length,
                    totalRevenue: formattedRevenueByPeriod.reduce((sum, item) => sum + item.revenue, 0),
                    totalTransactions: formattedRevenueByPeriod.reduce((sum, item) => sum + item.transactions, 0)
                },
                byPeriod: formattedRevenueByPeriod,
                byMode: revenueByMode,
                byCourse: revenueByCourse,
                filters: {
                    startDate,
                    endDate,
                    groupBy
                }
            }
        });
    } catch (error) {
        console.error('Get revenue analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get student analytics
// @route   GET /api/analytics/students
// @access  Private
const getStudentAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter['admissionDetails.admissionDate'] = {};
            if (startDate) dateFilter['admissionDetails.admissionDate'].$gte = new Date(startDate);
            if (endDate) dateFilter['admissionDetails.admissionDate'].$lte = new Date(endDate);
        }

        // Students by status
        const studentsByStatus = await Student.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }}
        ]);

        // Students by admission type
        const studentsByAdmissionType = await Student.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: '$admissionDetails.admissionType',
                count: { $sum: 1 }
            }}
        ]);

        // Students by month
        const studentsByMonth = await Student.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: {
                    year: { $year: '$admissionDetails.admissionDate' },
                    month: { $month: '$admissionDetails.admissionDate' }
                },
                count: { $sum: 1 }
            }},
            { $sort: { '_id.year': 1, '_id.month': 1 } },
            { $limit: 12 }
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

        // Gender distribution
        const genderDistribution = await Student.aggregate([
            { $match: { 'personalDetails.gender': { $exists: true, $ne: null } } },
            { $group: {
                _id: '$personalDetails.gender',
                count: { $sum: 1 }
            }}
        ]);

        // Format monthly data
        const monthlyData = studentsByMonth.map(item => ({
            month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
            count: item.count
        }));

        // Get total statistics
        const totalStudents = await Student.countDocuments(dateFilter);
        const activeStudents = await Student.countDocuments({ 
            ...dateFilter,
            status: 'active' 
        });

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
                    ageDistribution,
                    genderDistribution
                },
                filters: {
                    startDate,
                    endDate
                }
            }
        });
    } catch (error) {
        console.error('Get student analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get course analytics
// @route   GET /api/analytics/courses
// @access  Private
const getCourseAnalytics = async (req, res) => {
    try {
        // Course popularity by enrollment
        const coursePopularity = await Course.aggregate([
            {
                $project: {
                    name: 1,
                    courseCode: 1,
                    category: 1,
                    'fees.regular': 1,
                    totalEnrolled: { $add: [
                        '$enrollmentStats.active',
                        '$enrollmentStats.completed',
                        '$enrollmentStats.dropout'
                    ]},
                    activeStudents: '$enrollmentStats.active',
                    completionRate: {
                        $cond: [
                            { $gt: ['$enrollmentStats.totalEnrolled', 0] },
                            {
                                $multiply: [
                                    { $divide: ['$enrollmentStats.completed', '$enrollmentStats.totalEnrolled'] },
                                    100
                                ]
                            },
                            0
                        ]
                    },
                    rating: '$rating.average'
                }
            },
            { $sort: { totalEnrolled: -1 } }
        ]);

        // Courses by category
        const coursesByCategory = await Course.aggregate([
            { $group: {
                _id: '$category',
                count: { $sum: 1 },
                totalEnrolled: { $sum: { $add: [
                    '$enrollmentStats.active',
                    '$enrollmentStats.completed',
                    '$enrollmentStats.dropout'
                ]}},
                averageRating: { $avg: '$rating.average' }
            }},
            { $sort: { totalEnrolled: -1 } }
        ]);

        // Course completion statistics
        const completionStats = await Enrollment.aggregate([
            {
                $match: { status: { $in: ['completed', 'dropped', 'active'] } }
            },
            {
                $lookup: {
                    from: 'courses',
                    localField: 'course',
                    foreignField: '_id',
                    as: 'course'
                }
            },
            { $unwind: '$course' },
            {
                $group: {
                    _id: '$course.name',
                    total: { $sum: 1 },
                    completed: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    dropped: {
                        $sum: { $cond: [{ $eq: ['$status', 'dropped'] }, 1, 0] }
                    },
                    active: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    }
                }
            },
            {
                $project: {
                    name: '$_id',
                    total: 1,
                    completed: 1,
                    dropped: 1,
                    active: 1,
                    completionRate: {
                        $multiply: [
                            { $divide: ['$completed', '$total'] },
                            100
                        ]
                    },
                    dropoutRate: {
                        $multiply: [
                            { $divide: ['$dropped', '$total'] },
                            100
                        ]
                    }
                }
            },
            { $sort: { total: -1 } },
            { $limit: 10 }
        ]);

        // Revenue by course
        const revenueByCourse = await Enrollment.aggregate([
            {
                $match: { 'fees.paid': { $gt: 0 } }
            },
            {
                $lookup: {
                    from: 'courses',
                    localField: 'course',
                    foreignField: '_id',
                    as: 'course'
                }
            },
            { $unwind: '$course' },
            {
                $group: {
                    _id: '$course.name',
                    totalRevenue: { $sum: '$fees.paid' },
                    totalFees: { $sum: '$fees.total' },
                    studentCount: { $sum: 1 }
                }
            },
            {
                $project: {
                    name: '$_id',
                    totalRevenue: 1,
                    totalFees: 1,
                    studentCount: 1,
                    collectionRate: {
                        $multiply: [
                            { $divide: ['$totalRevenue', '$totalFees'] },
                            100
                        ]
                    }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        // Batch statistics
        const batchStats = await Batch.aggregate([
            { $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalStudents: { $sum: '$currentStudents' },
                totalCapacity: { $sum: '$maxStudents' }
            }}
        ]);

        res.json({
            success: true,
            data: {
                coursePopularity: coursePopularity.slice(0, 10),
                byCategory: coursesByCategory,
                completionStats,
                revenueByCourse: revenueByCourse.slice(0, 10),
                batchStats: batchStats.reduce((acc, curr) => {
                    acc[curr._id] = {
                        count: curr.count,
                        students: curr.totalStudents,
                        capacity: curr.totalCapacity,
                        utilization: calculatePercentage(curr.totalStudents, curr.totalCapacity)
                    };
                    return acc;
                }, {}),
                summary: {
                    totalCourses: await Course.countDocuments(),
                    activeCourses: await Course.countDocuments({ status: 'active' }),
                    totalBatches: await Batch.countDocuments(),
                    ongoingBatches: await Batch.countDocuments({ status: 'ongoing' })
                }
            }
        });
    } catch (error) {
        console.error('Get course analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get enrollment analytics
// @route   GET /api/analytics/enrollments
// @access  Private
const getEnrollmentAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.enrollmentDate = {};
            if (startDate) dateFilter.enrollmentDate.$gte = new Date(startDate);
            if (endDate) dateFilter.enrollmentDate.$lte = new Date(endDate);
        }

        // Enrollments by month
        const enrollmentsByMonth = await Enrollment.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: {
                    year: { $year: '$enrollmentDate' },
                    month: { $month: '$enrollmentDate' }
                },
                count: { $sum: 1 }
            }},
            { $sort: { '_id.year': 1, '_id.month': 1 } },
            { $limit: 12 }
        ]);

        // Enrollments by status
        const enrollmentsByStatus = await Enrollment.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }}
        ]);

        // Enrollments by course
        const enrollmentsByCourse = await Enrollment.aggregate([
            { $match: dateFilter },
            {
                $lookup: {
                    from: 'courses',
                    localField: 'course',
                    foreignField: '_id',
                    as: 'course'
                }
            },
            { $unwind: '$course' },
            { $group: {
                _id: '$course.name',
                count: { $sum: 1 }
            }},
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Enrollment type distribution
        const enrollmentTypeDistribution = await Enrollment.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: '$enrollmentType',
                count: { $sum: 1 }
            }}
        ]);

        // Conversion funnel (Lead → Inquiry → Enrollment)
        const conversionFunnel = {
            totalLeads: await Lead.countDocuments(dateFilter),
            contactedLeads: await Lead.countDocuments({ 
                ...dateFilter,
                status: { $in: ['contacted', 'follow_up', 'qualified'] }
            }),
            convertedLeads: await Lead.countDocuments({ 
                ...dateFilter,
                convertedToStudent: true 
            }),
            totalEnrollments: await Enrollment.countDocuments(dateFilter)
        };

        // Format monthly data
        const monthlyData = enrollmentsByMonth.map(item => ({
            month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
            count: item.count
        }));

        // Calculate conversion rates
        const leadToContactRate = conversionFunnel.totalLeads > 0 
            ? calculatePercentage(conversionFunnel.contactedLeads, conversionFunnel.totalLeads) 
            : 0;
        
        const contactToConversionRate = conversionFunnel.contactedLeads > 0 
            ? calculatePercentage(conversionFunnel.convertedLeads, conversionFunnel.contactedLeads) 
            : 0;
        
        const leadToEnrollmentRate = conversionFunnel.totalLeads > 0 
            ? calculatePercentage(conversionFunnel.totalEnrollments, conversionFunnel.totalLeads) 
            : 0;

        res.json({
            success: true,
            data: {
                summary: {
                    totalEnrollments: conversionFunnel.totalEnrollments,
                    activeEnrollments: await Enrollment.countDocuments({ 
                        ...dateFilter,
                        status: 'active' 
                    }),
                    completedEnrollments: await Enrollment.countDocuments({ 
                        ...dateFilter,
                        status: 'completed' 
                    })
                },
                monthlyTrend: monthlyData,
                byStatus: enrollmentsByStatus.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                byCourse: enrollmentsByCourse,
                byType: enrollmentTypeDistribution.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                conversionFunnel: {
                    ...conversionFunnel,
                    rates: {
                        leadToContact: leadToContactRate,
                        contactToConversion: contactToConversionRate,
                        leadToEnrollment: leadToEnrollmentRate
                    }
                },
                filters: {
                    startDate,
                    endDate
                }
            }
        });
    } catch (error) {
        console.error('Get enrollment analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get lead analytics
// @route   GET /api/analytics/leads
// @access  Private (Admin/Counselor)
const getLeadAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter['meta.createdAt'] = {};
            if (startDate) dateFilter['meta.createdAt'].$gte = new Date(startDate);
            if (endDate) dateFilter['meta.createdAt'].$lte = new Date(endDate);
        }

        // Leads by status
        const leadsByStatus = await Lead.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }}
        ]);

        // Leads by source
        const leadsBySource = await Lead.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: '$source',
                count: { $sum: 1 }
            }}
        ]);

        // Leads by month
        const leadsByMonth = await Lead.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: {
                    year: { $year: '$meta.createdAt' },
                    month: { $month: '$meta.createdAt' }
                },
                count: { $sum: 1 },
                converted: {
                    $sum: { $cond: [{ $eq: ['$convertedToStudent', true] }, 1, 0] }
                }
            }},
            { $sort: { '_id.year': 1, '_id.month': 1 } },
            { $limit: 12 }
        ]);

        // Leads by assigned counselor
        const leadsByCounselor = await Lead.aggregate([
            { $match: { ...dateFilter, assignedTo: { $exists: true, $ne: null } } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'assignedTo',
                    foreignField: '_id',
                    as: 'counselor'
                }
            },
            { $unwind: '$counselor' },
            { $group: {
                _id: '$counselor.username',
                count: { $sum: 1 },
                converted: {
                    $sum: { $cond: [{ $eq: ['$convertedToStudent', true] }, 1, 0] }
                }
            }},
            {
                $project: {
                    counselor: '$_id',
                    count: 1,
                    converted: 1,
                    conversionRate: {
                        $multiply: [
                            { $divide: ['$converted', '$count'] },
                            100
                        ]
                    }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Conversion time analysis
        const conversionTimeStats = await Lead.aggregate([
            { $match: { 
                convertedToStudent: true,
                convertedDate: { $exists: true },
                'meta.createdAt': { $exists: true }
            }},
            {
                $project: {
                    conversionTimeDays: {
                        $divide: [
                            { $subtract: ['$convertedDate', '$meta.createdAt'] },
                            1000 * 60 * 60 * 24
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    averageDays: { $avg: '$conversionTimeDays' },
                    minDays: { $min: '$conversionTimeDays' },
                    maxDays: { $max: '$conversionTimeDays' },
                    medianDays: { $median: { input: '$conversionTimeDays', method: 'approximate' } }
                }
            }
        ]);

        // Format monthly data
        const monthlyData = leadsByMonth.map(item => ({
            month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
            count: item.count,
            converted: item.converted,
            conversionRate: calculatePercentage(item.converted, item.count)
        }));

        // Calculate overall statistics
        const totalLeads = await Lead.countDocuments(dateFilter);
        const convertedLeads = await Lead.countDocuments({ 
            ...dateFilter,
            convertedToStudent: true 
        });
        const activeLeads = await Lead.countDocuments({ 
            ...dateFilter,
            status: { $in: ['new', 'contacted', 'follow_up', 'qualified'] }
        });

        res.json({
            success: true,
            data: {
                summary: {
                    totalLeads,
                    convertedLeads,
                    activeLeads,
                    conversionRate: calculatePercentage(convertedLeads, totalLeads)
                },
                byStatus: leadsByStatus.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                bySource: leadsBySource.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                monthlyTrend: monthlyData,
                byCounselor: leadsByCounselor,
                conversionTime: conversionTimeStats.length > 0 ? conversionTimeStats[0] : null,
                filters: {
                    startDate,
                    endDate
                }
            }
        });
    } catch (error) {
        console.error('Get lead analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get payment analytics
// @route   GET /api/analytics/payments
// @access  Private (Admin/Employee)
const getPaymentAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.paymentDate = {};
            if (startDate) dateFilter.paymentDate.$gte = new Date(startDate);
            if (endDate) dateFilter.paymentDate.$lte = new Date(endDate);
        }

        // Payments by status
        const paymentsByStatus = await Payment.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: '$status',
                count: { $sum: 1 },
                amount: { $sum: '$amount' }
            }}
        ]);

        // Payments by mode
        const paymentsByMode = await Payment.aggregate([
            { $match: { ...dateFilter, status: 'completed' } },
            { $group: {
                _id: '$paymentMode',
                count: { $sum: 1 },
                amount: { $sum: '$amount' }
            }},
            { $sort: { amount: -1 } }
        ]);

        // Monthly revenue
        const monthlyRevenue = await Payment.aggregate([
            { $match: { ...dateFilter, status: 'completed' } },
            { $group: {
                _id: {
                    year: { $year: '$paymentDate' },
                    month: { $month: '$paymentDate' }
                },
                count: { $sum: 1 },
                amount: { $sum: '$amount' }
            }},
            { $sort: { '_id.year': 1, '_id.month': 1 } },
            { $limit: 12 }
        ]);

        // Pending payments analysis
        const pendingPayments = await Payment.aggregate([
            { $match: { status: 'pending', ...dateFilter } },
            {
                $lookup: {
                    from: 'students',
                    localField: 'student',
                    foreignField: '_id',
                    as: 'student'
                }
            },
            { $unwind: '$student' },
            { $group: {
                _id: '$student.personalDetails.fullName',
                count: { $sum: 1 },
                amount: { $sum: '$amount' }
            }},
            { $sort: { amount: -1 } },
            { $limit: 10 }
        ]);

        // Collection efficiency
        const collectionStats = await Enrollment.aggregate([
            {
                $group: {
                    _id: null,
                    totalFees: { $sum: '$fees.total' },
                    totalPaid: { $sum: '$fees.paid' },
                    totalPending: { $sum: '$fees.pending' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Format monthly data
        const monthlyData = monthlyRevenue.map(item => ({
            month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
            count: item.count,
            amount: item.amount,
            average: item.count > 0 ? item.amount / item.count : 0
        }));

        // Calculate overall statistics
        const totalPayments = await Payment.countDocuments(dateFilter);
        const completedPayments = await Payment.countDocuments({ 
            ...dateFilter,
            status: 'completed' 
        });
        
        const totalRevenueResult = await Payment.aggregate([
            { $match: { status: 'completed', ...dateFilter } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const totalRevenue = totalRevenueResult.length > 0 ? totalRevenueResult[0].total : 0;

        res.json({
            success: true,
            data: {
                summary: {
                    totalPayments,
                    completedPayments,
                    pendingPayments: totalPayments - completedPayments,
                    totalRevenue: formatCurrency(totalRevenue),
                    completionRate: calculatePercentage(completedPayments, totalPayments)
                },
                byStatus: paymentsByStatus.reduce((acc, curr) => {
                    acc[curr._id] = {
                        count: curr.count,
                        amount: curr.amount
                    };
                    return acc;
                }, {}),
                byMode: paymentsByMode.reduce((acc, curr) => {
                    acc[curr._id] = {
                        count: curr.count,
                        amount: curr.amount,
                        percentage: calculatePercentage(curr.amount, totalRevenue)
                    };
                    return acc;
                }, {}),
                monthlyRevenue: monthlyData,
                pendingAnalysis: pendingPayments,
                collectionEfficiency: collectionStats.length > 0 ? {
                    totalFees: collectionStats[0].totalFees,
                    totalPaid: collectionStats[0].totalPaid,
                    totalPending: collectionStats[0].totalPending,
                    collectionRate: calculatePercentage(collectionStats[0].totalPaid, collectionStats[0].totalFees),
                    averageFeePerStudent: collectionStats[0].count > 0 
                        ? collectionStats[0].totalFees / collectionStats[0].count 
                        : 0
                } : null,
                filters: {
                    startDate,
                    endDate
                }
            }
        });
    } catch (error) {
        console.error('Get payment analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get attendance analytics
// @route   GET /api/analytics/attendance
// @access  Private (Admin/Trainer)
const getAttendanceAnalytics = async (req, res) => {
    try {
        const { startDate, endDate, batch } = req.query;
        
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.date = {};
            if (startDate) dateFilter.date.$gte = new Date(startDate);
            if (endDate) dateFilter.date.$lte = new Date(endDate);
        }

        if (batch) {
            dateFilter.batch = batch;
        }

        // Overall attendance statistics
        const attendanceStats = await Attendance.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }}
        ]);

        // Attendance by batch
        const attendanceByBatch = await Attendance.aggregate([
            { $match: dateFilter },
            {
                $lookup: {
                    from: 'batches',
                    localField: 'batch',
                    foreignField: '_id',
                    as: 'batch'
                }
            },
            { $unwind: '$batch' },
            { $group: {
                _id: '$batch.name',
                total: { $sum: 1 },
                present: {
                    $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] }
                },
                absent: {
                    $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] }
                }
            }},
            {
                $project: {
                    batch: '$_id',
                    total: 1,
                    present: 1,
                    absent: 1,
                    attendanceRate: {
                        $multiply: [
                            { $divide: ['$present', '$total'] },
                            100
                        ]
                    }
                }
            },
            { $sort: { attendanceRate: -1 } }
        ]);

        // Daily attendance trend
        const dailyTrend = await Attendance.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: {
                    year: { $year: '$date' },
                    month: { $month: '$date' },
                    day: { $dayOfMonth: '$date' }
                },
                total: { $sum: 1 },
                present: {
                    $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] }
                }
            }},
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
            { $limit: 30 }
        ]);

        // Student attendance performance
        const studentPerformance = await Attendance.aggregate([
            { $match: dateFilter },
            {
                $lookup: {
                    from: 'students',
                    localField: 'student',
                    foreignField: '_id',
                    as: 'student'
                }
            },
            { $unwind: '$student' },
            { $group: {
                _id: '$student.personalDetails.fullName',
                total: { $sum: 1 },
                present: {
                    $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] }
                },
                late: {
                    $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] }
                }
            }},
            {
                $project: {
                    student: '$_id',
                    total: 1,
                    present: 1,
                    late: 1,
                    attendanceRate: {
                        $multiply: [
                            { $divide: ['$present', '$total'] },
                            100
                        ]
                    }
                }
            },
            { $sort: { attendanceRate: -1 } },
            { $limit: 20 }
        ]);

        // Format daily trend
        const formattedDailyTrend = dailyTrend.map(item => ({
            date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
            total: item.total,
            present: item.present,
            attendanceRate: calculatePercentage(item.present, item.total)
        }));

        // Calculate overall statistics
        const totalAttendance = attendanceStats.reduce((sum, item) => sum + item.count, 0);
        const presentCount = attendanceStats
            .filter(item => item._id === 'present' || item._id === 'late')
            .reduce((sum, item) => sum + item.count, 0);

        const overallAttendanceRate = calculatePercentage(presentCount, totalAttendance);

        res.json({
            success: true,
            data: {
                summary: {
                    totalRecords: totalAttendance,
                    presentCount,
                    overallAttendanceRate,
                    lateCount: attendanceStats.find(item => item._id === 'late')?.count || 0,
                    absentCount: attendanceStats.find(item => item._id === 'absent')?.count || 0
                },
                byStatus: attendanceStats.reduce((acc, curr) => {
                    acc[curr._id] = {
                        count: curr.count,
                        percentage: calculatePercentage(curr.count, totalAttendance)
                    };
                    return acc;
                }, {}),
                byBatch: attendanceByBatch,
                dailyTrend: formattedDailyTrend,
                studentPerformance,
                filters: {
                    startDate,
                    endDate,
                    batch
                }
            }
        });
    } catch (error) {
        console.error('Get attendance analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get performance analytics
// @route   GET /api/analytics/performance
// @access  Private (Admin/Trainer)
const getPerformanceAnalytics = async (req, res) => {
    try {
        const { course, batch } = req.query;
        
        const filter = {};
        if (course) filter.course = course;
        if (batch) filter.batch = batch;

        // Student performance by course
        const performanceByCourse = await Enrollment.aggregate([
            { $match: filter },
            {
                $lookup: {
                    from: 'courses',
                    localField: 'course',
                    foreignField: '_id',
                    as: 'course'
                }
            },
            { $unwind: '$course' },
            {
                $lookup: {
                    from: 'students',
                    localField: 'student',
                    foreignField: '_id',
                    as: 'student'
                }
            },
            { $unwind: '$student' },
            { $match: { 'grades.total': { $exists: true, $gt: 0 } } },
            { $group: {
                _id: '$course.name',
                studentCount: { $sum: 1 },
                averageScore: { $avg: '$grades.total' },
                maxScore: { $max: '$grades.total' },
                minScore: { $min: '$grades.total' },
                topPerformers: {
                    $push: {
                        name: '$student.personalDetails.fullName',
                        score: '$grades.total',
                        grade: '$grades.grade'
                    }
                }
            }},
            {
                $project: {
                    course: '$_id',
                    studentCount: 1,
                    averageScore: 1,
                    maxScore: 1,
                    minScore: 1,
                    scoreRange: { $subtract: ['$maxScore', '$minScore'] },
                    topPerformers: { $slice: ['$topPerformers', 5] }
                }
            },
            { $sort: { averageScore: -1 } }
        ]);

        // Grade distribution
        const gradeDistribution = await Enrollment.aggregate([
            { $match: { ...filter, 'grades.grade': { $exists: true, $ne: null } } },
            { $group: {
                _id: '$grades.grade',
                count: { $sum: 1 }
            }},
            { $sort: { _id: 1 } }
        ]);

        // Assignment completion rate
        const assignmentStats = await Enrollment.aggregate([
            { $match: filter },
            {
                $project: {
                    assignmentCount: { $size: '$progress.assignments' },
                    completedAssignments: {
                        $size: {
                            $filter: {
                                input: '$progress.assignments',
                                as: 'assignment',
                                cond: { $eq: ['$$assignment.status', 'graded'] }
                            }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAssignments: { $sum: '$assignmentCount' },
                    completedAssignments: { $sum: '$completedAssignments' },
                    studentCount: { $sum: 1 }
                }
            }
        ]);

        // Attendance vs Performance correlation
        const attendancePerformance = await Enrollment.aggregate([
            { $match: { 
                ...filter, 
                'grades.total': { $exists: true, $gt: 0 },
                attendance: { $exists: true, $ne: [] }
            }},
            {
                $project: {
                    score: '$grades.total',
                    attendanceCount: { $size: '$attendance' },
                    presentCount: {
                        $size: {
                            $filter: {
                                input: '$attendance',
                                as: 'session',
                                cond: { $in: ['$$session.status', ['present', 'late']] }
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    score: 1,
                    attendanceRate: {
                        $multiply: [
                            { $divide: ['$presentCount', '$attendanceCount'] },
                            100
                        ]
                    }
                }
            },
            {
                $bucket: {
                    groupBy: '$attendanceRate',
                    boundaries: [0, 50, 60, 70, 80, 90, 100],
                    default: 'Other',
                    output: {
                        count: { $sum: 1 },
                        averageScore: { $avg: '$score' },
                        minScore: { $min: '$score' },
                        maxScore: { $max: '$score' }
                    }
                }
            }
        ]);

        // Calculate assignment completion rate
        let assignmentCompletionRate = 0;
        if (assignmentStats.length > 0) {
            const stats = assignmentStats[0];
            assignmentCompletionRate = stats.totalAssignments > 0 
                ? calculatePercentage(stats.completedAssignments, stats.totalAssignments) 
                : 0;
        }

        res.json({
            success: true,
            data: {
                performanceByCourse,
                gradeDistribution: gradeDistribution.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                assignmentStats: assignmentStats.length > 0 ? {
                    totalAssignments: assignmentStats[0].totalAssignments,
                    completedAssignments: assignmentStats[0].completedAssignments,
                    completionRate: assignmentCompletionRate,
                    averageAssignmentsPerStudent: assignmentStats[0].studentCount > 0 
                        ? assignmentStats[0].totalAssignments / assignmentStats[0].studentCount 
                        : 0
                } : null,
                attendancePerformanceCorrelation: attendancePerformance,
                summary: {
                    totalStudentsWithGrades: await Enrollment.countDocuments({ 
                        ...filter,
                        'grades.total': { $exists: true, $gt: 0 }
                    }),
                    averageOverallScore: await Enrollment.aggregate([
                        { $match: { ...filter, 'grades.total': { $exists: true, $gt: 0 } } },
                        { $group: { _id: null, average: { $avg: '$grades.total' } } }
                    ]).then(result => result.length > 0 ? result[0].average : 0)
                },
                filters: {
                    course,
                    batch
                }
            }
        });
    } catch (error) {
        console.error('Get performance analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

module.exports = {
    getDashboardStats,
    getRevenueAnalytics,
    getStudentAnalytics,
    getCourseAnalytics,
    getEnrollmentAnalytics,
    getLeadAnalytics,
    getPaymentAnalytics,
    getAttendanceAnalytics,
    getPerformanceAnalytics
};