const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom'],
        required: true
    },
    period: {
        startDate: {
            type: Date,
            required: true
        },
        endDate: {
            type: Date,
            required: true
        },
        label: String
    },
    metrics: {
        students: {
            total: Number,
            active: Number,
            new: Number,
            byStatus: Map,
            byAdmissionType: Map,
            byGender: Map,
            ageDistribution: Map
        },
        courses: {
            total: Number,
            active: Number,
            byCategory: Map,
            enrollmentStats: {
                total: Number,
                active: Number,
                completed: Number,
                dropout: Number
            },
            topCourses: [{
                courseId: mongoose.Schema.Types.ObjectId,
                name: String,
                enrollments: Number,
                revenue: Number
            }]
        },
        enrollments: {
            total: Number,
            active: Number,
            completed: Number,
            byStatus: Map,
            byType: Map,
            monthlyTrend: [{
                month: String,
                count: Number
            }]
        },
        leads: {
            total: Number,
            converted: Number,
            conversionRate: Number,
            byStatus: Map,
            bySource: Map,
            monthlyTrend: [{
                month: String,
                count: Number,
                converted: Number
            }]
        },
        payments: {
            totalAmount: Number,
            totalTransactions: Number,
            byStatus: Map,
            byMode: Map,
            monthlyRevenue: [{
                month: String,
                amount: Number,
                transactions: Number
            }],
            collectionRate: Number
        },
        attendance: {
            totalRecords: Number,
            presentCount: Number,
            attendanceRate: Number,
            byStatus: Map,
            byBatch: [{
                batchId: mongoose.Schema.Types.ObjectId,
                name: String,
                attendanceRate: Number
            }]
        },
        performance: {
            averageScore: Number,
            gradeDistribution: Map,
            assignmentCompletion: Number,
            topPerformers: [{
                studentId: mongoose.Schema.Types.ObjectId,
                name: String,
                score: Number
            }]
        },
        revenue: {
            total: Number,
            byCourse: Map,
            byMonth: [{
                month: String,
                amount: Number
            }],
            growthRate: Number
        }
    },
    comparisons: {
        previousPeriod: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Analytics'
        },
        growth: {
            students: Number,
            enrollments: Number,
            revenue: Number,
            conversionRate: Number
        }
    },
    insights: [{
        title: String,
        description: String,
        type: {
            type: String,
            enum: ['positive', 'negative', 'neutral', 'warning', 'opportunity']
        },
        metrics: [String],
        recommendation: String
    }],
    generatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    meta: {
        createdAt: {
            type: Date,
            default: Date.now
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    }
}, {
    timestamps: true
});

// Indexes
analyticsSchema.index({ type: 1, 'period.startDate': 1, 'period.endDate': 1 });
analyticsSchema.index({ 'meta.createdAt': -1 });

// Method to calculate growth compared to previous period
analyticsSchema.methods.calculateGrowth = function(previousAnalytics) {
    if (!previousAnalytics) return null;
    
    const growth = {};
    
    // Calculate growth for key metrics
    const currentStudents = this.metrics.students.total || 0;
    const previousStudents = previousAnalytics.metrics.students.total || 0;
    growth.students = previousStudents > 0 
        ? ((currentStudents - previousStudents) / previousStudents) * 100 
        : 0;
    
    const currentEnrollments = this.metrics.enrollments.total || 0;
    const previousEnrollments = previousAnalytics.metrics.enrollments.total || 0;
    growth.enrollments = previousEnrollments > 0 
        ? ((currentEnrollments - previousEnrollments) / previousEnrollments) * 100 
        : 0;
    
    const currentRevenue = this.metrics.revenue.total || 0;
    const previousRevenue = previousAnalytics.metrics.revenue.total || 0;
    growth.revenue = previousRevenue > 0 
        ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 
        : 0;
    
    const currentConversion = this.metrics.leads.conversionRate || 0;
    const previousConversion = previousAnalytics.metrics.leads.conversionRate || 0;
    growth.conversionRate = previousConversion > 0 
        ? ((currentConversion - previousConversion) / previousConversion) * 100 
        : 0;
    
    return growth;
};

// Method to generate insights
analyticsSchema.methods.generateInsights = function() {
    const insights = [];
    const metrics = this.metrics;
    
    // Student growth insight
    if (metrics.students && metrics.students.new > 20) {
        insights.push({
            title: 'High Student Acquisition',
            description: `Acquired ${metrics.students.new} new students this period`,
            type: 'positive',
            metrics: ['students.new'],
            recommendation: 'Maintain current marketing strategies'
        });
    }
    
    // Conversion rate insight
    if (metrics.leads && metrics.leads.conversionRate < 20) {
        insights.push({
            title: 'Low Conversion Rate',
            description: `Conversion rate is ${metrics.leads.conversionRate.toFixed(1)}%, below target of 25%`,
            type: 'warning',
            metrics: ['leads.conversionRate'],
            recommendation: 'Review lead follow-up process and improve lead nurturing'
        });
    }
    
    // Attendance insight
    if (metrics.attendance && metrics.attendance.attendanceRate < 75) {
        insights.push({
            title: 'Attendance Below Target',
            description: `Overall attendance rate is ${metrics.attendance.attendanceRate.toFixed(1)}%`,
            type: 'negative',
            metrics: ['attendance.attendanceRate'],
            recommendation: 'Implement attendance improvement initiatives'
        });
    }
    
    // Revenue growth insight
    if (this.comparisons && this.comparisons.growth && this.comparisons.growth.revenue > 20) {
        insights.push({
            title: 'Strong Revenue Growth',
            description: `Revenue grew by ${this.comparisons.growth.revenue.toFixed(1)}% compared to last period`,
            type: 'positive',
            metrics: ['revenue.total', 'comparisons.growth.revenue'],
            recommendation: 'Continue successful revenue strategies'
        });
    }
    
    // Course popularity insight
    if (metrics.courses && metrics.courses.topCourses && metrics.courses.topCourses.length > 0) {
        const topCourse = metrics.courses.topCourses[0];
        if (topCourse.enrollments > 50) {
            insights.push({
                title: 'Highly Popular Course',
                description: `${topCourse.name} has ${topCourse.enrollments} enrollments`,
                type: 'opportunity',
                metrics: ['courses.topCourses'],
                recommendation: 'Consider adding more batches for this course'
            });
        }
    }
    
    return insights;
};

module.exports = mongoose.model('Analytics', analyticsSchema);