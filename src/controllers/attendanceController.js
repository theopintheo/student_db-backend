const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Batch = require('../models/Batch');
const Enrollment = require('../models/Enrollment');
const Session = require('../models/Session');
const { ATTENDANCE_STATUS } = require('../utils/constants');

// @desc    Get all attendance records
// @route   GET /api/attendance
// @access  Private
const getAttendance = async (req, res) => {
    try {
        const {
            student,
            batch,
            session,
            status,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 20,
            sortBy = 'date',
            sortOrder = 'desc'
        } = req.query;
        
        // Build query
        const query = {};
        
        if (student) query.student = student;
        if (batch) query.batch = batch;
        if (session) query.session = session;
        if (status) query.status = status;
        
        // Date range filter
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        
        // Search filter (by student name)
        if (search) {
            const students = await Student.find({
                $or: [
                    { 'personalDetails.fullName': new RegExp(search, 'i') },
                    { studentId: new RegExp(search, 'i') }
                ]
            }).select('_id');
            
            const studentIds = students.map(s => s._id);
            query.student = { $in: studentIds };
        }
        
        // Sort
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        
        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [attendance, total] = await Promise.all([
            Attendance.find(query)
                .populate('student', 'studentId personalDetails.fullName')
                .populate('batch', 'batchId name')
                .populate('session', 'topic date')
                .populate('markedBy', 'username profile.firstName profile.lastName')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Attendance.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            count: attendance.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: attendance
        });
    } catch (error) {
        console.error('Get attendance error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get single attendance record
// @route   GET /api/attendance/:id
// @access  Private
const getAttendanceById = async (req, res) => {
    try {
        const attendance = await Attendance.findById(req.params.id)
            .populate('student', 'studentId personalDetails.fullName personalDetails.email personalDetails.phone')
            .populate('batch', 'batchId name course schedule')
            .populate('session', 'topic description date startTime endTime')
            .populate('markedBy', 'username profile.firstName profile.lastName profile.designation')
            .populate('approvedBy', 'username profile.firstName profile.lastName');
        
        if (!attendance) {
            return res.status(404).json({
                success: false,
                message: 'Attendance record not found'
            });
        }
        
        res.json({
            success: true,
            data: attendance
        });
    } catch (error) {
        console.error('Get attendance by id error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Mark attendance
// @route   POST /api/attendance
// @access  Private (Admin/Trainer)
const markAttendance = async (req, res) => {
    try {
        const { student, batch, session, date, status, remarks } = req.body;
        
        // Check if student exists
        const studentExists = await Student.findById(student);
        if (!studentExists) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        // Check if student is enrolled in the batch
        if (batch) {
            const enrollment = await Enrollment.findOne({
                student,
                batch,
                status: 'active'
            });
            
            if (!enrollment) {
                return res.status(400).json({
                    success: false,
                    message: 'Student is not enrolled in this batch'
                });
            }
        }
        
        // Check if attendance already marked for this session/date
        const existingAttendance = await Attendance.findOne({
            student,
            batch,
            session,
            date: new Date(date)
        });
        
        if (existingAttendance) {
            return res.status(400).json({
                success: false,
                message: 'Attendance already marked for this session'
            });
        }
        
        const attendanceData = {
            student,
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
        if (batch) {
            await Enrollment.findOneAndUpdate(
                { student, batch },
                {
                    $push: {
                        attendance: {
                            date: new Date(date),
                            session,
                            status,
                            remarks
                        }
                    }
                }
            );
        }
        
        // Populate for response
        const populatedAttendance = await Attendance.findById(attendance._id)
            .populate('student', 'studentId personalDetails.fullName')
            .populate('batch', 'batchId name');
        
        res.status(201).json({
            success: true,
            message: 'Attendance marked successfully',
            data: populatedAttendance
        });
    } catch (error) {
        console.error('Mark attendance error:', error);
        
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

// @desc    Update attendance record
// @route   PUT /api/attendance/:id
// @access  Private (Admin/Trainer)
const updateAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.findById(req.params.id);
        
        if (!attendance) {
            return res.status(404).json({
                success: false,
                message: 'Attendance record not found'
            });
        }
        
        // Cannot update approved attendance unless admin
        if (attendance.isApproved && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Cannot update approved attendance record'
            });
        }
        
        // Update fields
        Object.keys(req.body).forEach(key => {
            if (key !== 'meta' && key !== '_id') {
                attendance[key] = req.body[key];
            }
        });
        
        attendance.meta.updatedBy = req.user.id;
        attendance.meta.updatedAt = new Date();
        
        await attendance.save();
        
        // Update enrollment attendance if batch exists
        if (attendance.batch) {
            await Enrollment.findOneAndUpdate(
                { 
                    student: attendance.student, 
                    batch: attendance.batch,
                    'attendance.date': attendance.date
                },
                {
                    $set: {
                        'attendance.$.status': attendance.status,
                        'attendance.$.remarks': attendance.remarks
                    }
                }
            );
        }
        
        res.json({
            success: true,
            message: 'Attendance updated successfully',
            data: attendance
        });
    } catch (error) {
        console.error('Update attendance error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Delete attendance record
// @route   DELETE /api/attendance/:id
// @access  Private (Admin/Trainer)
const deleteAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.findById(req.params.id);
        
        if (!attendance) {
            return res.status(404).json({
                success: false,
                message: 'Attendance record not found'
            });
        }
        
        // Cannot delete approved attendance unless admin
        if (attendance.isApproved && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete approved attendance record'
            });
        }
        
        // Remove from enrollment attendance if batch exists
        if (attendance.batch) {
            await Enrollment.findOneAndUpdate(
                { student: attendance.student, batch: attendance.batch },
                {
                    $pull: {
                        attendance: {
                            date: attendance.date,
                            session: attendance.session
                        }
                    }
                }
            );
        }
        
        await attendance.deleteOne();
        
        res.json({
            success: true,
            message: 'Attendance record deleted successfully'
        });
    } catch (error) {
        console.error('Delete attendance error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get attendance for specific student
// @route   GET /api/attendance/student/:studentId
// @access  Private
const getStudentAttendance = async (req, res) => {
    try {
        const studentId = req.params.studentId;
        const { startDate, endDate, batch } = req.query;
        
        // Verify student exists
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        // Build query
        const query = { student: studentId };
        
        if (batch) query.batch = batch;
        
        // Date range filter
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        
        const attendance = await Attendance.find(query)
            .populate('batch', 'batchId name course')
            .populate('session', 'topic date')
            .sort({ date: -1 })
            .lean();
        
        // Calculate attendance summary
        const totalSessions = attendance.length;
        const presentSessions = attendance.filter(a => 
            a.status === 'present' || a.status === 'late'
        ).length;
        
        const attendancePercentage = totalSessions > 0 
            ? Math.round((presentSessions / totalSessions) * 100) 
            : 0;
        
        // Group by batch
        const attendanceByBatch = {};
        attendance.forEach(record => {
            if (record.batch) {
                const batchId = record.batch._id.toString();
                if (!attendanceByBatch[batchId]) {
                    attendanceByBatch[batchId] = {
                        batch: record.batch,
                        records: [],
                        summary: {
                            total: 0,
                            present: 0,
                            absent: 0,
                            late: 0,
                            leave: 0
                        }
                    };
                }
                
                attendanceByBatch[batchId].records.push(record);
                attendanceByBatch[batchId].summary.total++;
                
                switch(record.status) {
                    case 'present':
                        attendanceByBatch[batchId].summary.present++;
                        break;
                    case 'absent':
                        attendanceByBatch[batchId].summary.absent++;
                        break;
                    case 'late':
                        attendanceByBatch[batchId].summary.late++;
                        break;
                    case 'leave':
                        attendanceByBatch[batchId].summary.leave++;
                        break;
                }
            }
        });
        
        // Calculate batch-wise percentages
        Object.values(attendanceByBatch).forEach(batchData => {
            const summary = batchData.summary;
            summary.presentPercentage = summary.total > 0 
                ? Math.round(((summary.present + summary.late) / summary.total) * 100) 
                : 0;
        });
        
        res.json({
            success: true,
            data: {
                student: {
                    id: student.studentId,
                    name: student.personalDetails.fullName
                },
                summary: {
                    totalSessions,
                    presentSessions,
                    attendancePercentage,
                    absentSessions: totalSessions - presentSessions
                },
                attendanceByBatch: Object.values(attendanceByBatch),
                allRecords: attendance,
                filters: {
                    startDate,
                    endDate,
                    batch
                }
            }
        });
    } catch (error) {
        console.error('Get student attendance error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get attendance for specific batch
// @route   GET /api/attendance/batch/:batchId
// @access  Private
const getBatchAttendance = async (req, res) => {
    try {
        const batchId = req.params.batchId;
        const { date, session, startDate, endDate } = req.query;
        
        // Verify batch exists
        const batch = await Batch.findById(batchId)
            .populate('course', 'name courseCode')
            .populate('instructor', 'username profile.firstName profile.lastName');
        
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Batch not found'
            });
        }
        
        // Build query
        const query = { batch: batchId };
        
        if (date) query.date = new Date(date);
        if (session) query.session = session;
        
        // Date range filter
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        
        const attendance = await Attendance.find(query)
            .populate('student', 'studentId personalDetails.fullName')
            .populate('session', 'topic date startTime endTime')
            .sort({ date: -1, 'student.personalDetails.fullName': 1 })
            .lean();
        
        // Group by date
        const attendanceByDate = {};
        attendance.forEach(record => {
            const dateStr = record.date.toISOString().split('T')[0];
            
            if (!attendanceByDate[dateStr]) {
                attendanceByDate[dateStr] = {
                    date: record.date,
                    session: record.session,
                    records: [],
                    summary: {
                        total: 0,
                        present: 0,
                        absent: 0,
                        late: 0,
                        leave: 0
                    }
                };
            }
            
            attendanceByDate[dateStr].records.push(record);
            attendanceByDate[dateStr].summary.total++;
            
            switch(record.status) {
                case 'present':
                    attendanceByDate[dateStr].summary.present++;
                    break;
                case 'absent':
                    attendanceByDate[dateStr].summary.absent++;
                    break;
                case 'late':
                    attendanceByDate[dateStr].summary.late++;
                    break;
                case 'leave':
                    attendanceByDate[dateStr].summary.leave++;
                    break;
            }
        });
        
        // Calculate date-wise percentages
        Object.values(attendanceByDate).forEach(dateData => {
            const summary = dateData.summary;
            summary.attendancePercentage = summary.total > 0 
                ? Math.round(((summary.present + summary.late) / summary.total) * 100) 
                : 0;
        });
        
        // Get batch students for comparison
        const batchStudents = await Enrollment.find({ 
            batch: batchId, 
            status: 'active' 
        })
        .populate('student', 'studentId personalDetails.fullName')
        .lean();
        
        // Calculate student-wise attendance
        const studentAttendance = {};
        batchStudents.forEach(enrollment => {
            const studentId = enrollment.student._id.toString();
            studentAttendance[studentId] = {
                student: enrollment.student,
                totalSessions: 0,
                presentSessions: 0,
                attendancePercentage: 0
            };
        });
        
        // Update student attendance from records
        attendance.forEach(record => {
            const studentId = record.student._id.toString();
            if (studentAttendance[studentId]) {
                studentAttendance[studentId].totalSessions++;
                if (record.status === 'present' || record.status === 'late') {
                    studentAttendance[studentId].presentSessions++;
                }
            }
        });
        
        // Calculate percentages
        Object.values(studentAttendance).forEach(studentData => {
            studentData.attendancePercentage = studentData.totalSessions > 0 
                ? Math.round((studentData.presentSessions / studentData.totalSessions) * 100) 
                : 0;
        });
        
        res.json({
            success: true,
            data: {
                batch: {
                    id: batch.batchId,
                    name: batch.name,
                    course: batch.course,
                    instructor: batch.instructor,
                    totalStudents: batch.currentStudents
                },
                attendanceByDate: Object.values(attendanceByDate),
                studentAttendance: Object.values(studentAttendance),
                summary: {
                    totalRecords: attendance.length,
                    uniqueDates: Object.keys(attendanceByDate).length,
                    averageAttendance: Object.values(attendanceByDate).length > 0 
                        ? Math.round(Object.values(attendanceByDate).reduce((sum, dateData) => 
                            sum + dateData.summary.attendancePercentage, 0) / Object.values(attendanceByDate).length
                        ) 
                        : 0
                },
                filters: {
                    date,
                    session,
                    startDate,
                    endDate
                }
            }
        });
    } catch (error) {
        console.error('Get batch attendance error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get attendance statistics
// @route   GET /api/attendance/stats
// @access  Private (Admin/Trainer)
const getAttendanceStats = async (req, res) => {
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
        
        // Overall statistics
        const overallStats = await Attendance.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }}
        ]);
        
        // Daily trend
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
        
        // Batch-wise statistics
        const batchStats = await Attendance.aggregate([
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
                late: {
                    $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] }
                }
            }},
            {
                $project: {
                    batch: '$_id',
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
            { $sort: { attendanceRate: -1 } }
        ]);
        
        // Calculate totals
        const totalAttendance = overallStats.reduce((sum, item) => sum + item.count, 0);
        const presentCount = overallStats
            .filter(item => item._id === 'present' || item._id === 'late')
            .reduce((sum, item) => sum + item.count, 0);
        
        const overallAttendanceRate = totalAttendance > 0 
            ? Math.round((presentCount / totalAttendance) * 100) 
            : 0;
        
        // Format daily trend
        const formattedDailyTrend = dailyTrend.map(item => ({
            date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
            total: item.total,
            present: item.present,
            attendanceRate: item.total > 0 ? Math.round((item.present / item.total) * 100) : 0
        }));
        
        res.json({
            success: true,
            data: {
                summary: {
                    totalRecords: totalAttendance,
                    presentCount,
                    overallAttendanceRate,
                    lateCount: overallStats.find(item => item._id === 'late')?.count || 0,
                    absentCount: overallStats.find(item => item._id === 'absent')?.count || 0
                },
                byStatus: overallStats.reduce((acc, curr) => {
                    acc[curr._id] = {
                        count: curr.count,
                        percentage: totalAttendance > 0 ? Math.round((curr.count / totalAttendance) * 100) : 0
                    };
                    return acc;
                }, {}),
                dailyTrend: formattedDailyTrend,
                batchStats,
                filters: {
                    startDate,
                    endDate,
                    batch
                }
            }
        });
    } catch (error) {
        console.error('Get attendance stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Generate attendance report
// @route   POST /api/attendance/report
// @access  Private (Admin/Trainer)
const generateAttendanceReport = async (req, res) => {
    try {
        const { startDate, endDate, batch, student, format = 'json' } = req.body;
        
        const query = {};
        
        // Date range filter
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        
        if (batch) query.batch = batch;
        if (student) query.student = student;
        
        const attendanceRecords = await Attendance.find(query)
            .populate('student', 'studentId personalDetails.fullName')
            .populate('batch', 'batchId name')
            .populate('session', 'topic date')
            .sort({ date: -1 })
            .lean();
        
        // Group data for report
        let reportData;
        
        if (batch && !student) {
            // Batch report
            const batchData = await Batch.findById(batch)
                .populate('course', 'name courseCode')
                .populate('instructor', 'username profile.firstName profile.lastName');
            
            // Group by student
            const studentMap = {};
            attendanceRecords.forEach(record => {
                const studentId = record.student._id.toString();
                if (!studentMap[studentId]) {
                    studentMap[studentId] = {
                        student: record.student,
                        records: [],
                        summary: {
                            total: 0,
                            present: 0,
                            absent: 0,
                            late: 0,
                            leave: 0
                        }
                    };
                }
                
                studentMap[studentId].records.push(record);
                studentMap[studentId].summary.total++;
                
                switch(record.status) {
                    case 'present':
                        studentMap[studentId].summary.present++;
                        break;
                    case 'absent':
                        studentMap[studentId].summary.absent++;
                        break;
                    case 'late':
                        studentMap[studentId].summary.late++;
                        break;
                    case 'leave':
                        studentMap[studentId].summary.leave++;
                        break;
                }
            });
            
            // Calculate percentages
            Object.values(studentMap).forEach(studentData => {
                const summary = studentData.summary;
                summary.attendancePercentage = summary.total > 0 
                    ? Math.round(((summary.present + summary.late) / summary.total) * 100) 
                    : 0;
            });
            
            reportData = {
                type: 'batch_report',
                batch: batchData,
                period: {
                    start: startDate,
                    end: endDate
                },
                generatedAt: new Date(),
                studentAttendance: Object.values(studentMap),
                summary: {
                    totalStudents: Object.keys(studentMap).length,
                    totalSessions: attendanceRecords.length,
                    averageAttendance: Object.values(studentMap).length > 0 
                        ? Math.round(Object.values(studentMap).reduce((sum, studentData) => 
                            sum + studentData.summary.attendancePercentage, 0) / Object.values(studentMap).length
                        ) 
                        : 0
                }
            };
            
        } else if (student) {
            // Individual student report
            const studentData = await Student.findById(student);
            
            reportData = {
                type: 'student_report',
                student: studentData,
                period: {
                    start: startDate,
                    end: endDate
                },
                generatedAt: new Date(),
                attendanceRecords,
                summary: {
                    totalSessions: attendanceRecords.length,
                    presentSessions: attendanceRecords.filter(r => 
                        r.status === 'present' || r.status === 'late'
                    ).length,
                    attendancePercentage: attendanceRecords.length > 0 
                        ? Math.round((attendanceRecords.filter(r => 
                            r.status === 'present' || r.status === 'late'
                        ).length / attendanceRecords.length) * 100) 
                        : 0
                }
            };
            
        } else {
            // Overall report
            const overallStats = await Attendance.aggregate([
                { $match: query },
                { $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }}
            ]);
            
            const totalAttendance = overallStats.reduce((sum, item) => sum + item.count, 0);
            const presentCount = overallStats
                .filter(item => item._id === 'present' || item._id === 'late')
                .reduce((sum, item) => sum + item.count, 0);
            
            reportData = {
                type: 'overall_report',
                period: {
                    start: startDate,
                    end: endDate
                },
                generatedAt: new Date(),
                summary: {
                    totalRecords: totalAttendance,
                    presentCount,
                    attendanceRate: totalAttendance > 0 
                        ? Math.round((presentCount / totalAttendance) * 100) 
                        : 0,
                    byStatus: overallStats.reduce((acc, curr) => {
                        acc[curr._id] = {
                            count: curr.count,
                            percentage: totalAttendance > 0 ? Math.round((curr.count / totalAttendance) * 100) : 0
                        };
                        return acc;
                    }, {})
                },
                recentRecords: attendanceRecords.slice(0, 50)
            };
        }
        
        // Return in requested format
        if (format === 'csv') {
            // TODO: Implement CSV generation
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${Date.now()}.csv`);
            // Generate CSV content
            return res.send('CSV generation not implemented in this example');
        } else if (format === 'pdf') {
            // TODO: Implement PDF generation
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${Date.now()}.pdf`);
            // Generate PDF content
            return res.send('PDF generation not implemented in this example');
        }
        
        // Default to JSON
        res.json({
            success: true,
            message: 'Attendance report generated successfully',
            data: reportData
        });
    } catch (error) {
        console.error('Generate attendance report error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

module.exports = {
    getAttendance,
    getAttendanceById,
    markAttendance,
    updateAttendance,
    deleteAttendance,
    getStudentAttendance,
    getBatchAttendance,
    getAttendanceStats,
    generateAttendanceReport
};