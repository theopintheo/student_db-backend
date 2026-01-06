const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Batch = require('../models/Batch');
const User = require('../models/User');
const { COURSE_CATEGORY } = require('../utils/constants');

// @desc    Get all courses
// @route   GET /api/courses
// @access  Private
const getCourses = async (req, res) => {
    try {
        const {
            category,
            status,
            minFee,
            maxFee,
            search,
            page = 1,
            limit = 10,
            sortBy = 'meta.createdAt',
            sortOrder = 'desc'
        } = req.query;
        
        // Build query
        const query = {};
        
        if (category) query.category = category;
        if (status) query.status = status;
        
        // Fee range filter
        if (minFee || maxFee) {
            query['fees.regular'] = {};
            if (minFee) query['fees.regular'].$gte = Number(minFee);
            if (maxFee) query['fees.regular'].$lte = Number(maxFee);
        }
        
        // Search filter
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { name: searchRegex },
                { courseCode: searchRegex },
                { description: searchRegex },
                { shortDescription: searchRegex },
                { 'prerequisites': searchRegex },
                { 'learningOutcomes': searchRegex }
            ];
        }
        
        // Sort
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        
        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [courses, total] = await Promise.all([
            Course.find(query)
                .populate('instructors', 'username profile.firstName profile.lastName profile.designation')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Course.countDocuments(query)
        ]);
        
        // Add virtual fields
        courses.forEach(course => {
            course.availableSeats = course.batches?.reduce((total, batch) => {
                if (batch.status === 'upcoming' || batch.status === 'ongoing') {
                    return total + (batch.maxStudents - batch.currentStudents);
                }
                return total;
            }, 0) || 0;
            
            course.nextBatchStartDate = course.batches
                ?.filter(batch => batch.status === 'upcoming' && batch.startDate)
                .sort((a, b) => a.startDate - b.startDate)[0]?.startDate || null;
        });
        
        res.json({
            success: true,
            count: courses.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: courses
        });
    } catch (error) {
        console.error('Get courses error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get single course
// @route   GET /api/courses/:id
// @access  Private
const getCourseById = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id)
            .populate('instructors', 'username profile.firstName profile.lastName profile.designation profile.bio profile.email profile.phone')
            .populate('batches.instructor', 'username profile.firstName profile.lastName')
            .populate('rating.reviews.student', 'studentId personalDetails.fullName');
        
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        // Add virtual fields
        course.availableSeats = course.batches.reduce((total, batch) => {
            if (batch.status === 'upcoming' || batch.status === 'ongoing') {
                return total + (batch.maxStudents - batch.currentStudents);
            }
            return total;
        }, 0);
        
        course.nextBatchStartDate = course.batches
            .filter(batch => batch.status === 'upcoming' && batch.startDate)
            .sort((a, b) => a.startDate - b.startDate)[0]?.startDate || null;
        
        // Get enrolled students count
        const enrolledStudents = await Enrollment.countDocuments({
            course: course._id,
            status: 'active'
        });
        
        // Get recent enrollments
        const recentEnrollments = await Enrollment.find({ course: course._id })
            .populate('student', 'studentId personalDetails.fullName')
            .sort({ enrollmentDate: -1 })
            .limit(5)
            .lean();
        
        res.json({
            success: true,
            data: {
                ...course.toObject(),
                stats: {
                    enrolledStudents,
                    activeBatches: course.batches.filter(b => b.status === 'ongoing').length,
                    upcomingBatches: course.batches.filter(b => b.status === 'upcoming').length
                },
                recentEnrollments
            }
        });
    } catch (error) {
        console.error('Get course error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Create new course
// @route   POST /api/courses
// @access  Private (Admin/Trainer)
const createCourse = async (req, res) => {
    try {
        const courseData = {
            ...req.body,
            meta: {
                createdBy: req.user.id,
                updatedBy: req.user.id
            }
        };
        
        const course = await Course.create(courseData);
        
        res.status(201).json({
            success: true,
            message: 'Course created successfully',
            data: course
        });
    } catch (error) {
        console.error('Create course error:', error);
        
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
                message: 'Course code already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Update course
// @route   PUT /api/courses/:id
// @access  Private (Admin/Trainer)
const updateCourse = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        // Update fields
        Object.keys(req.body).forEach(key => {
            if (key !== 'meta' && key !== '_id' && key !== 'courseCode') {
                course[key] = req.body[key];
            }
        });
        
        course.meta.updatedBy = req.user.id;
        course.meta.updatedAt = new Date();
        
        await course.save();
        
        res.json({
            success: true,
            message: 'Course updated successfully',
            data: course
        });
    } catch (error) {
        console.error('Update course error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Delete course
// @route   DELETE /api/courses/:id
// @access  Private (Admin only)
const deleteCourse = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        // Check if course has active enrollments
        const activeEnrollments = await Enrollment.countDocuments({
            course: course._id,
            status: 'active'
        });
        
        if (activeEnrollments > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete course with active enrollments'
            });
        }
        
        await course.deleteOne();
        
        res.json({
            success: true,
            message: 'Course deleted successfully'
        });
    } catch (error) {
        console.error('Delete course error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Add batch to course
// @route   POST /api/courses/:id/batches
// @access  Private (Admin/Trainer)
const addBatch = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        const batchData = req.body;
        
        // Generate batch ID if not provided
        if (!batchData.batchId) {
            const batchNumber = course.batches.length + 1;
            batchData.batchId = `${course.courseCode}-B${String(batchNumber).padStart(2, '0')}`;
        }
        
        // Add batch to course
        await course.addBatch(batchData);
        
        // Create separate Batch document if needed
        const batch = await Batch.create({
            ...batchData,
            course: course._id,
            meta: {
                createdBy: req.user.id,
                updatedBy: req.user.id
            }
        });
        
        res.status(201).json({
            success: true,
            message: 'Batch added successfully',
            data: {
                course: course.courseCode,
                batch: batchData
            }
        });
    } catch (error) {
        console.error('Add batch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Update batch in course
// @route   PUT /api/courses/:id/batches/:batchIndex
// @access  Private (Admin/Trainer)
const updateBatch = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        const batchIndex = parseInt(req.params.batchIndex);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        if (batchIndex < 0 || batchIndex >= course.batches.length) {
            return res.status(400).json({
                success: false,
                message: 'Invalid batch index'
            });
        }
        
        // Update batch
        Object.keys(req.body).forEach(key => {
            if (key !== 'batchId' && key !== '_id') {
                course.batches[batchIndex][key] = req.body[key];
            }
        });
        
        course.meta.updatedBy = req.user.id;
        course.meta.updatedAt = new Date();
        
        await course.save();
        
        // Update separate Batch document if exists
        const batchId = course.batches[batchIndex].batchId;
        await Batch.findOneAndUpdate(
            { batchId },
            req.body,
            { new: true }
        );
        
        res.json({
            success: true,
            message: 'Batch updated successfully',
            data: course.batches[batchIndex]
        });
    } catch (error) {
        console.error('Update batch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get course statistics
// @route   GET /api/courses/:id/stats
// @access  Private
const getCourseStats = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        // Enrollment statistics
        const enrollmentStats = await Enrollment.aggregate([
            { $match: { course: course._id } },
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }}
        ]);
        
        // Payment statistics
        const paymentStats = await Enrollment.aggregate([
            { $match: { course: course._id } },
            { $group: {
                _id: null,
                totalFees: { $sum: '$fees.total' },
                totalPaid: { $sum: '$fees.paid' },
                totalPending: { $sum: '$fees.pending' },
                studentCount: { $sum: 1 }
            }}
        ]);
        
        // Attendance statistics
        const attendanceStats = await Enrollment.aggregate([
            { $match: { course: course._id, status: 'active' } },
            { $unwind: '$attendance' },
            { $group: {
                _id: '$attendance.status',
                count: { $sum: 1 }
            }}
        ]);
        
        // Performance statistics
        const performanceStats = await Enrollment.aggregate([
            { $match: { 
                course: course._id,
                'grades.total': { $exists: true, $gt: 0 }
            }},
            { $group: {
                _id: null,
                averageScore: { $avg: '$grades.total' },
                maxScore: { $max: '$grades.total' },
                minScore: { $min: '$grades.total' },
                studentCount: { $sum: 1 }
            }}
        ]);
        
        // Format statistics
        const stats = {
            enrollments: enrollmentStats.reduce((acc, curr) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {}),
            payments: paymentStats.length > 0 ? {
                totalFees: paymentStats[0].totalFees,
                totalPaid: paymentStats[0].totalPaid,
                totalPending: paymentStats[0].totalPending,
                collectionRate: paymentStats[0].totalFees > 0 
                    ? Math.round((paymentStats[0].totalPaid / paymentStats[0].totalFees) * 100) 
                    : 0,
                averageFeePerStudent: paymentStats[0].studentCount > 0 
                    ? paymentStats[0].totalFees / paymentStats[0].studentCount 
                    : 0
            } : null,
            attendance: attendanceStats.reduce((acc, curr) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {}),
            performance: performanceStats.length > 0 ? {
                averageScore: performanceStats[0].averageScore,
                maxScore: performanceStats[0].maxScore,
                minScore: performanceStats[0].minScore,
                studentCount: performanceStats[0].studentCount
            } : null,
            batches: {
                total: course.batches.length,
                upcoming: course.batches.filter(b => b.status === 'upcoming').length,
                ongoing: course.batches.filter(b => b.status === 'ongoing').length,
                completed: course.batches.filter(b => b.status === 'completed').length,
                cancelled: course.batches.filter(b => b.status === 'cancelled').length
            }
        };
        
        res.json({
            success: true,
            data: {
                course: {
                    id: course.courseCode,
                    name: course.name
                },
                stats,
                generatedAt: new Date()
            }
        });
    } catch (error) {
        console.error('Get course stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get course enrollments
// @route   GET /api/courses/:id/enrollments
// @access  Private
const getCourseEnrollments = async (req, res) => {
    try {
        const courseId = req.params.id;
        const { status, batch, startDate, endDate } = req.query;
        
        // Verify course exists
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        // Build query
        const query = { course: courseId };
        
        if (status) query.status = status;
        if (batch) query.batch = batch;
        
        // Date range filter
        if (startDate || endDate) {
            query.enrollmentDate = {};
            if (startDate) query.enrollmentDate.$gte = new Date(startDate);
            if (endDate) query.enrollmentDate.$lte = new Date(endDate);
        }
        
        const enrollments = await Enrollment.find(query)
            .populate('student', 'studentId personalDetails.fullName personalDetails.email personalDetails.phone')
            .populate('batch', 'batchId name')
            .sort({ enrollmentDate: -1 })
            .lean();
        
        // Calculate attendance percentages
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
        
        // Group by batch
        const enrollmentsByBatch = {};
        enrollments.forEach(enrollment => {
            const batchId = enrollment.batch?._id?.toString() || 'no_batch';
            if (!enrollmentsByBatch[batchId]) {
                enrollmentsByBatch[batchId] = {
                    batch: enrollment.batch || { batchId: 'No Batch', name: 'No Batch Assigned' },
                    enrollments: [],
                    summary: {
                        total: 0,
                        active: 0,
                        completed: 0,
                        dropped: 0
                    }
                };
            }
            
            enrollmentsByBatch[batchId].enrollments.push(enrollment);
            enrollmentsByBatch[batchId].summary.total++;
            
            switch(enrollment.status) {
                case 'active':
                    enrollmentsByBatch[batchId].summary.active++;
                    break;
                case 'completed':
                    enrollmentsByBatch[batchId].summary.completed++;
                    break;
                case 'dropped':
                    enrollmentsByBatch[batchId].summary.dropped++;
                    break;
            }
        });
        
        res.json({
            success: true,
            data: {
                course: {
                    id: course.courseCode,
                    name: course.name,
                    duration: course.duration
                },
                enrollments,
                enrollmentsByBatch: Object.values(enrollmentsByBatch),
                summary: {
                    total: enrollments.length,
                    byStatus: enrollments.reduce((acc, enrollment) => {
                        acc[enrollment.status] = (acc[enrollment.status] || 0) + 1;
                        return acc;
                    }, {})
                },
                filters: {
                    status,
                    batch,
                    startDate,
                    endDate
                }
            }
        });
    } catch (error) {
        console.error('Get course enrollments error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get active courses
// @route   GET /api/courses/active
// @access  Private
const getActiveCourses = async (req, res) => {
    try {
        const activeCourses = await Course.find({ status: 'active' })
            .populate('instructors', 'username profile.firstName profile.lastName')
            .select('name courseCode description shortDescription duration fees category enrollmentStats rating')
            .sort({ 'enrollmentStats.totalEnrolled': -1 })
            .lean();
        
        // Add batch information
        const coursesWithBatches = await Promise.all(
            activeCourses.map(async (course) => {
                const batches = await Batch.find({
                    course: course._id,
                    status: { $in: ['upcoming', 'ongoing'] }
                })
                .select('batchId name startDate endDate schedule maxStudents currentStudents status')
                .sort({ startDate: 1 })
                .lean();
                
                return {
                    ...course,
                    batches,
                    availableSeats: batches.reduce((total, batch) => 
                        total + (batch.maxStudents - batch.currentStudents), 0),
                    nextBatchStartDate: batches.length > 0 ? batches[0].startDate : null
                };
            })
        );
        
        res.json({
            success: true,
            count: coursesWithBatches.length,
            data: coursesWithBatches
        });
    } catch (error) {
        console.error('Get active courses error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get course categories
// @route   GET /api/courses/categories
// @access  Private
const getCourseCategories = async (req, res) => {
    try {
        const categories = await Course.aggregate([
            { $group: {
                _id: '$category',
                count: { $sum: 1 },
                totalEnrolled: { $sum: { $add: [
                    '$enrollmentStats.active',
                    '$enrollmentStats.completed',
                    '$enrollmentStats.dropout'
                ]}},
                averageRating: { $avg: '$rating.average' },
                averageFee: { $avg: '$fees.regular' }
            }},
            { $sort: { count: -1 } }
        ]);
        
        res.json({
            success: true,
            data: categories.map(cat => ({
                category: cat._id,
                count: cat.count,
                totalEnrolled: cat.totalEnrolled,
                averageRating: cat.averageRating ? cat.averageRating.toFixed(1) : 0,
                averageFee: cat.averageFee ? Math.round(cat.averageFee) : 0
            }))
        });
    } catch (error) {
        console.error('Get course categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Add review to course
// @route   POST /api/courses/:id/reviews
// @access  Private
const addReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const studentId = req.user.id; // Assuming student is logged in
        
        const course = await Course.findById(req.params.id);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        // Check if student is enrolled in the course
        const enrollment = await Enrollment.findOne({
            student: studentId,
            course: course._id,
            status: { $in: ['active', 'completed'] }
        });
        
        if (!enrollment) {
            return res.status(403).json({
                success: false,
                message: 'You must be enrolled in this course to add a review'
            });
        }
        
        // Check if student already reviewed
        const existingReview = course.rating.reviews.find(
            review => review.student.toString() === studentId
        );
        
        if (existingReview) {
            return res.status(400).json({
                success: false,
                message: 'You have already reviewed this course'
            });
        }
        
        // Add review
        course.rating.reviews.push({
            student: studentId,
            rating,
            comment,
            date: new Date()
        });
        
        // Update average rating
        const totalRating = course.rating.reviews.reduce((sum, review) => sum + review.rating, 0);
        course.rating.average = totalRating / course.rating.reviews.length;
        course.rating.count = course.rating.reviews.length;
        
        course.meta.updatedBy = req.user.id;
        course.meta.updatedAt = new Date();
        
        await course.save();
        
        res.status(201).json({
            success: true,
            message: 'Review added successfully',
            data: {
                review: {
                    rating,
                    comment,
                    date: new Date()
                },
                newAverage: course.rating.average
            }
        });
    } catch (error) {
        console.error('Add review error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

module.exports = {
    getCourses,
    getCourseById,
    createCourse,
    updateCourse,
    deleteCourse,
    addBatch,
    updateBatch,
    getCourseStats,
    getCourseEnrollments,
    getActiveCourses,
    getCourseCategories,
    addReview
};