const Content = require('../models/Content');
const Course = require('../models/Course');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

// @desc    Get all content
// @route   GET /api/content
// @access  Private
const getContent = async (req, res) => {
    try {
        const {
            type,
            course,
            status,
            search,
            page = 1,
            limit = 10,
            sortBy = 'meta.createdAt',
            sortOrder = 'desc'
        } = req.query;
        
        // Build query based on user role
        const query = {};
        
        if (type) query.type = type;
        if (course) query.course = course;
        if (status) query.status = status;
        
        // Search filter
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { title: searchRegex },
                { description: searchRegex },
                { 'metadata.tags': searchRegex }
            ];
        }
        
        // For non-admin users, filter accessible content
        if (req.user.role !== 'admin' && req.user.role !== 'trainer') {
            query.$or = [
                { 'access.type': 'public' },
                { 'access.allowedUsers': req.user.id },
                { 'access.allowedStudents': { $in: req.user.studentIds || [] } }
            ];
        }
        
        // Sort
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        
        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [content, total] = await Promise.all([
            Content.find(query)
                .populate('course', 'name courseCode')
                .populate('batch', 'batchId name')
                .populate('meta.createdBy', 'username profile.firstName profile.lastName')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Content.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            count: content.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: content
        });
    } catch (error) {
        console.error('Get content error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get single content
// @route   GET /api/content/:id
// @access  Private
const getContentById = async (req, res) => {
    try {
        const content = await Content.findById(req.params.id)
            .populate('course', 'name courseCode description')
            .populate('batch', 'batchId name')
            .populate('meta.createdBy', 'username profile.firstName profile.lastName')
            .populate('submissions.student', 'studentId personalDetails.fullName')
            .populate('submissions.gradedBy', 'username profile.firstName profile.lastName');
        
        if (!content) {
            return res.status(404).json({
                success: false,
                message: 'Content not found'
            });
        }
        
        // Check access
        if (!content.canAccess(req.user.id)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to access this content'
            });
        }
        
        // Increment view count
        content.stats.views += 1;
        await content.save();
        
        res.json({
            success: true,
            data: content
        });
    } catch (error) {
        console.error('Get content error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Create new content
// @route   POST /api/content
// @access  Private (Admin/Trainer)
const createContent = async (req, res) => {
    try {
        const contentData = {
            ...req.body,
            meta: {
                createdBy: req.user.id,
                updatedBy: req.user.id
            }
        };
        
        const content = await Content.create(contentData);
        
        res.status(201).json({
            success: true,
            message: 'Content created successfully',
            data: content
        });
    } catch (error) {
        console.error('Create content error:', error);
        
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

// @desc    Update content
// @route   PUT /api/content/:id
// @access  Private (Admin/Trainer)
const updateContent = async (req, res) => {
    try {
        const content = await Content.findById(req.params.id);
        
        if (!content) {
            return res.status(404).json({
                success: false,
                message: 'Content not found'
            });
        }
        
        // Update fields
        Object.keys(req.body).forEach(key => {
            if (key !== 'meta' && key !== '_id') {
                content[key] = req.body[key];
            }
        });
        
        content.meta.updatedBy = req.user.id;
        content.meta.updatedAt = new Date();
        
        await content.save();
        
        res.json({
            success: true,
            message: 'Content updated successfully',
            data: content
        });
    } catch (error) {
        console.error('Update content error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Delete content
// @route   DELETE /api/content/:id
// @access  Private (Admin/Trainer)
const deleteContent = async (req, res) => {
    try {
        const content = await Content.findById(req.params.id);
        
        if (!content) {
            return res.status(404).json({
                success: false,
                message: 'Content not found'
            });
        }
        
        // Delete associated file if exists
        if (content.file && content.file.path) {
            const filePath = path.join(__dirname, '../../', content.file.path);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        
        await content.deleteOne();
        
        res.json({
            success: true,
            message: 'Content deleted successfully'
        });
    } catch (error) {
        console.error('Delete content error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Upload file for content
// @route   POST /api/content/upload
// @access  Private (Admin/Trainer)
const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }
        
        const fileData = {
            filename: req.file.filename,
            originalname: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            mimetype: req.file.mimetype,
            url: `/uploads/content/${req.file.filename}`
        };
        
        res.json({
            success: true,
            message: 'File uploaded successfully',
            data: fileData
        });
    } catch (error) {
        console.error('Upload file error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Share content with students
// @route   POST /api/content/:id/share
// @access  Private (Admin/Trainer)
const shareContent = async (req, res) => {
    try {
        const { students, batches } = req.body;
        
        const content = await Content.findById(req.params.id);
        
        if (!content) {
            return res.status(404).json({
                success: false,
                message: 'Content not found'
            });
        }
        
        // Update access
        content.access.type = 'restricted';
        if (students) {
            content.access.allowedStudents = students;
        }
        if (batches) {
            content.access.allowedBatches = batches;
        }
        
        content.meta.updatedBy = req.user.id;
        content.meta.updatedAt = new Date();
        
        await content.save();
        
        res.json({
            success: true,
            message: 'Content shared successfully',
            data: {
                allowedStudents: content.access.allowedStudents.length,
                allowedBatches: content.access.allowedBatches.length
            }
        });
    } catch (error) {
        console.error('Share content error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get content for specific course
// @route   GET /api/content/course/:courseId
// @access  Private
const getCourseContent = async (req, res) => {
    try {
        const courseId = req.params.courseId;
        
        // Verify course exists
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        const query = {
            course: courseId,
            status: 'published'
        };
        
        // For non-admin users, filter accessible content
        if (req.user.role !== 'admin' && req.user.role !== 'trainer') {
            query.$or = [
                { 'access.type': 'public' },
                { 'access.allowedUsers': req.user.id },
                { 'access.allowedStudents': { $in: req.user.studentIds || [] } }
            ];
        }
        
        const content = await Content.find(query)
            .populate('batch', 'batchId name')
            .populate('meta.createdBy', 'username profile.firstName profile.lastName')
            .sort({ 'meta.createdAt': -1 })
            .lean();
        
        // Group content by type
        const groupedContent = {
            documents: content.filter(c => c.type === 'document'),
            videos: content.filter(c => c.type === 'video'),
            assignments: content.filter(c => c.type === 'assignment'),
            quizzes: content.filter(c => c.type === 'quiz'),
            resources: content.filter(c => c.type === 'resource'),
            links: content.filter(c => c.type === 'link')
        };
        
        res.json({
            success: true,
            data: {
                course: {
                    id: course.courseCode,
                    name: course.name
                },
                content: groupedContent,
                stats: {
                    total: content.length,
                    byType: Object.keys(groupedContent).reduce((acc, key) => {
                        acc[key] = groupedContent[key].length;
                        return acc;
                    }, {})
                }
            }
        });
    } catch (error) {
        console.error('Get course content error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get content accessible to specific student
// @route   GET /api/content/student/:studentId
// @access  Private
const getStudentContent = async (req, res) => {
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
        
        // Get student's enrollments
        const enrollments = await Enrollment.find({ 
            student: studentId,
            status: 'active'
        }).populate('course', 'name courseCode');
        
        const courseIds = enrollments.map(e => e.course._id);
        
        // Get content for enrolled courses
        const query = {
            course: { $in: courseIds },
            status: 'published',
            $or: [
                { 'access.type': 'public' },
                { 'access.allowedStudents': studentId }
            ]
        };
        
        const content = await Content.find(query)
            .populate('course', 'name courseCode')
            .populate('batch', 'batchId name')
            .sort({ 'meta.createdAt': -1 })
            .lean();
        
        // Group by course
        const contentByCourse = {};
        content.forEach(item => {
            const courseName = item.course.name;
            if (!contentByCourse[courseName]) {
                contentByCourse[courseName] = [];
            }
            contentByCourse[courseName].push(item);
        });
        
        res.json({
            success: true,
            data: {
                student: {
                    id: student.studentId,
                    name: student.personalDetails.fullName
                },
                enrolledCourses: enrollments.map(e => ({
                    id: e.course.courseCode,
                    name: e.course.name
                })),
                contentByCourse,
                stats: {
                    totalContent: content.length,
                    coursesWithContent: Object.keys(contentByCourse).length
                }
            }
        });
    } catch (error) {
        console.error('Get student content error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Download content file
// @route   GET /api/content/:id/download
// @access  Private
const downloadContent = async (req, res) => {
    try {
        const content = await Content.findById(req.params.id);
        
        if (!content) {
            return res.status(404).json({
                success: false,
                message: 'Content not found'
            });
        }
        
        // Check access
        if (!content.canAccess(req.user.id)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to download this content'
            });
        }
        
        if (!content.file || !content.file.path) {
            return res.status(404).json({
                success: false,
                message: 'File not found for this content'
            });
        }
        
        const filePath = path.join(__dirname, '../../', content.file.path);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on server'
            });
        }
        
        // Increment download count
        content.stats.downloads += 1;
        await content.save();
        
        res.download(filePath, content.file.originalname);
    } catch (error) {
        console.error('Download content error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

module.exports = {
    getContent,
    getContentById,
    createContent,
    updateContent,
    deleteContent,
    uploadFile,
    shareContent,
    getCourseContent,
    getStudentContent,
    downloadContent
};