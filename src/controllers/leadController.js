const Lead = require('../models/Lead');
const Student = require('../models/Student');
const User = require('../models/User');
const { LEAD_STATUS, LEAD_SOURCE } = require('../utils/constants');
const { calculatePercentage } = require('../utils/helpers');

// @desc    Get all leads
// @route   GET /api/leads
// @access  Private
const getLeads = async (req, res) => {
    try {
        const {
            status,
            source,
            assignedTo,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 10,
            sortBy = 'meta.createdAt',
            sortOrder = 'desc'
        } = req.query;
        
        // Build query
        const query = {};
        
        if (status) query.status = status;
        if (source) query.source = source;
        if (assignedTo) query.assignedTo = assignedTo;
        
        // Date range filter
        if (startDate || endDate) {
            query['meta.createdAt'] = {};
            if (startDate) query['meta.createdAt'].$gte = new Date(startDate);
            if (endDate) query['meta.createdAt'].$lte = new Date(endDate);
        }
        
        // Search filter
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { fullName: searchRegex },
                { email: searchRegex },
                { phone: searchRegex },
                { leadId: searchRegex },
                { 'education.qualification': searchRegex },
                { notes: searchRegex }
            ];
        }
        
        // Sort
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        
        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [leads, total] = await Promise.all([
            Lead.find(query)
                .populate('assignedTo', 'username profile.firstName profile.lastName profile.designation')
                .populate('interestedCourses', 'name courseCode')
                .populate('primaryCourse', 'name courseCode')
                .populate('convertedStudentId', 'studentId personalDetails.fullName')
                .populate('meta.createdBy', 'username profile.firstName')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Lead.countDocuments(query)
        ]);
        
        // Calculate days since created
        leads.forEach(lead => {
            lead.daysSinceCreated = Math.floor(
                (Date.now() - new Date(lead.meta.createdAt)) / (1000 * 60 * 60 * 24)
            );
        });
        
        res.json({
            success: true,
            count: leads.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: leads
        });
    } catch (error) {
        console.error('Get leads error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get single lead
// @route   GET /api/leads/:id
// @access  Private
const getLeadById = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id)
            .populate('assignedTo', 'username profile.firstName profile.lastName profile.designation email profile.phone')
            .populate('interestedCourses', 'name courseCode duration fees.regular')
            .populate('primaryCourse', 'name courseCode duration fees.regular')
            .populate('convertedStudentId', 'studentId personalDetails.fullName personalDetails.phone')
            .populate('meta.createdBy', 'username profile.firstName')
            .populate('communications.createdBy', 'username profile.firstName');
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }
        
        // Calculate days since created
        lead.daysSinceCreated = Math.floor(
            (Date.now() - new Date(lead.meta.createdAt)) / (1000 * 60 * 60 * 24)
        );
        
        res.json({
            success: true,
            data: lead
        });
    } catch (error) {
        console.error('Get lead error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Create lead
// @route   POST /api/leads
// @access  Private
const createLead = async (req, res) => {
    try {
        const leadData = {
            ...req.body,
            meta: {
                createdBy: req.user.id,
                updatedBy: req.user.id
            }
        };
        
        // If phone is provided, check for duplicates
        if (leadData.phone) {
            const existingLead = await Lead.findOne({ phone: leadData.phone });
            if (existingLead) {
                return res.status(400).json({
                    success: false,
                    message: 'Lead with this phone number already exists'
                });
            }
        }
        
        const lead = await Lead.create(leadData);
        
        res.status(201).json({
            success: true,
            message: 'Lead created successfully',
            data: lead
        });
    } catch (error) {
        console.error('Create lead error:', error);
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Phone number or email already exists'
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

// @desc    Update lead
// @route   PUT /api/leads/:id
// @access  Private
const updateLead = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }
        
        // Check if phone is being updated and if it already exists
        if (req.body.phone && req.body.phone !== lead.phone) {
            const existingLead = await Lead.findOne({ phone: req.body.phone });
            if (existingLead && existingLead._id.toString() !== req.params.id) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number already exists'
                });
            }
        }
        
        // Update lead
        Object.keys(req.body).forEach(key => {
            if (key !== 'meta' && key !== 'communications') {
                lead[key] = req.body[key];
            }
        });
        
        lead.meta.updatedBy = req.user.id;
        lead.meta.updatedAt = new Date();
        
        await lead.save();
        
        res.json({
            success: true,
            message: 'Lead updated successfully',
            data: lead
        });
    } catch (error) {
        console.error('Update lead error:', error);
        
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

// @desc    Delete lead
// @route   DELETE /api/leads/:id
// @access  Private
const deleteLead = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }
        
        // Check if lead is converted
        if (lead.convertedToStudent) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete converted lead'
            });
        }
        
        await lead.deleteOne();
        
        res.json({
            success: true,
            message: 'Lead deleted successfully'
        });
    } catch (error) {
        console.error('Delete lead error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Add communication to lead
// @route   POST /api/leads/:id/communications
// @access  Private
const addCommunication = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }
        
        const communication = {
            ...req.body,
            createdBy: req.user.id,
            createdAt: new Date()
        };
        
        lead.communications.push(communication);
        lead.meta.updatedBy = req.user.id;
        lead.meta.updatedAt = new Date();
        
        await lead.save();
        
        res.json({
            success: true,
            message: 'Communication added successfully',
            data: lead.communications
        });
    } catch (error) {
        console.error('Add communication error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Convert lead to student
// @route   POST /api/leads/:id/convert
// @access  Private
const convertToStudent = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }
        
        if (lead.convertedToStudent) {
            return res.status(400).json({
                success: false,
                message: 'Lead already converted to student'
            });
        }
        
        // Create student from lead
        const studentData = {
            personalDetails: {
                fullName: lead.fullName,
                phone: lead.phone,
                email: lead.email,
                gender: lead.gender,
                address: lead.address
            },
            admissionDetails: {
                admissionType: 'lead_conversion',
                leadSource: lead._id,
                admissionCounselor: req.user.id,
                admissionDate: new Date()
            },
            academicBackground: lead.education ? {
                qualification: lead.education.qualification,
                yearOfPassing: lead.education.yearOfPassing,
                percentage: lead.education.percentage
            } : undefined,
            meta: {
                createdBy: req.user.id,
                updatedBy: req.user.id
            }
        };
        
        const student = await Student.create(studentData);
        
        // Update lead with conversion details
        lead.convertedToStudent = true;
        lead.convertedDate = new Date();
        lead.convertedStudentId = student._id;
        lead.status = 'converted';
        lead.meta.updatedBy = req.user.id;
        lead.meta.updatedAt = new Date();
        
        await lead.save();
        
        res.status(201).json({
            success: true,
            message: 'Lead converted to student successfully',
            data: {
                lead,
                student
            }
        });
    } catch (error) {
        console.error('Convert lead error:', error);
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Student with this phone or email already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get lead statistics
// @route   GET /api/leads/stats
// @access  Private
const getLeadStats = async (req, res) => {
    try {
        // Get total leads count
        const totalLeads = await Lead.countDocuments();
        
        // Get converted leads count
        const convertedLeads = await Lead.countDocuments({ convertedToStudent: true });
        
        // Get leads by status
        const leadsByStatus = await Lead.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Get leads by source
        const leadsBySource = await Lead.aggregate([
            {
                $group: {
                    _id: '$source',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Get leads by month (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const leadsByMonth = await Lead.aggregate([
            {
                $match: {
                    'meta.createdAt': { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$meta.createdAt' },
                        month: { $month: '$meta.createdAt' }
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
        
        // Format monthly data
        const monthlyData = leadsByMonth.map(item => ({
            month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
            count: item.count
        }));
        
        // Get leads assigned to current user
        const myLeads = await Lead.countDocuments({ assignedTo: req.user.id });
        const myConverted = await Lead.countDocuments({
            assignedTo: req.user.id,
            convertedToStudent: true
        });
        
        res.json({
            success: true,
            data: {
                total: totalLeads,
                converted: convertedLeads,
                conversionRate: calculatePercentage(convertedLeads, totalLeads),
                byStatus: leadsByStatus.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                bySource: leadsBySource.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                monthlyTrend: monthlyData,
                myStats: {
                    total: myLeads,
                    converted: myConverted,
                    conversionRate: calculatePercentage(myConverted, myLeads)
                }
            }
        });
    } catch (error) {
        console.error('Get lead stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

module.exports = {
    getLeads,
    getLeadById,
    createLead,
    updateLead,
    deleteLead,
    addCommunication,
    convertToStudent,
    getLeadStats
};