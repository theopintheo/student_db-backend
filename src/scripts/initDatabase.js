const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('../models/User');
const Course = require('../models/Course');
const Counter = require('../models/Counter');
const { getPermissionsByRole } = require('../utils/permissions');

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://student_db_minipro:rtr2025@studentdatabase.wjsixmy.mongodb.net/?appName=studentdatabase');

const initDatabase = async () => {
    try {
        console.log('🚀 Initializing Education Management System Database...');
        
        // Drop database if in development (optional)
        if (process.env.NODE_ENV === 'development') {
            console.log('🧹 Clearing existing data...');
            await mongoose.connection.dropDatabase();
        }
        
        // Initialize Counters
        console.log('📊 Setting up counters...');
        await Counter.create([
            { _id: 'studentId', seq: 1000 },
            { _id: 'leadId', seq: 1000 },
            { _id: 'employeeId', seq: 1000 },
            { _id: 'enrollmentId', seq: 1000 },
            { _id: 'paymentId', seq: 1000 },
            { _id: 'batchId', seq: 0 },
            { _id: 'WEB_course', seq: 0 },
            { _id: 'DAT_course', seq: 0 },
            { _id: 'MOB_course', seq: 0 },
            { _id: 'DES_course', seq: 0 },
            { _id: 'BUS_course', seq: 0 }
        ]);
        
        console.log('✅ Counters initialized');
        
        // Create Default Admin User
        console.log('👨‍💼 Creating default admin user...');
        
       const adminPermissions = getPermissionsByRole('admin');
        
        const adminUser = await User.create({
            username: 'admin',
            email: 'admin@edumanage.com',
            password: 'admin@123',
            role: 'admin',
            profile: {
                firstName: 'System',
                lastName: 'Administrator',
                phone: '9876543210',
                designation: 'System Admin',
                department: 'Administration'
            },
            permissions: adminPermissions,
            status: 'active',
            isEmailVerified: true,
            employeeDetails: {
                employeeId: 'ADMIN001',
                salary: 0
            },
            meta: {
                createdBy: null,
                createdAt: new Date()
            }
        });
        
        console.log('✅ Admin user created:', adminUser.username);
        
        // Create Default Employee User
        console.log('👩‍💼 Creating default employee user...');
        
        
        const employeePermissions = getPermissionsByRole('employee');
        
        const employeeUser = await User.create({
            username: 'employee',
            email: 'employee@edumanage.com',
            password: 'employee123',
            role: 'employee',
            profile: {
                firstName: 'null',
                lastName: 'null',
                phone: 'null',
                designation: 'null',
                department: 'null'
            },
            permissions: employeePermissions,
            status: 'active',
            isEmailVerified: true,
            employeeDetails: {
                employeeId: 'EMP001',
                salary: 50000,
                reportingManager: adminUser._id
            },
            meta: {
                createdBy: adminUser._id,
                createdAt: new Date()
            }
        });
        
        console.log('✅ Employee user created:', employeeUser.username);
        
        // Create Default Counselor
        console.log('👨‍🏫 Creating default counselor...');
        
        const counselorPermissions = getPermissionsByRole('counselor');
        
        const counselorUser = await User.create({
            username: 'counselor',
            email: 'counselor@edumanage.com',
            password: 'counselor123',
            role: 'counselor',
            profile: {
                firstName: 'null',
                lastName: 'null',
                phone: 'null',
                designation: 'Admission Counselor',
                department: 'Admissions'
            },
            permissions: counselorPermissions,
            status: 'active',
            isEmailVerified: true,
            employeeDetails: {
                employeeId: 'COUN001',
                salary: 40000,
                reportingManager: adminUser._id
            },
            meta: {
                createdBy: adminUser._id,
                createdAt: new Date()
            }
        });
        
        console.log('✅ Counselor user created:', counselorUser.username);
        
        // Create Default Trainer
        console.log('👩‍🏫 Creating default trainer...');
        
        
        const trainerPermissions = getPermissionsByRole('trainer');
        
        const trainerUser = await User.create({
            username: 'trainer',
            email: 'trainer@edumanage.com',
            password: 'trainer123',
            role: 'trainer',
            profile: {
                firstName: 'Michael',
                lastName: 'Johnson',
                phone: '9876543213',
                designation: 'Senior Trainer',
                department: 'Training'
            },
            permissions: trainerPermissions,
            status: 'active',
            isEmailVerified: true,
            employeeDetails: {
                employeeId: 'TRN001',
                salary: 60000,
                reportingManager: adminUser._id
            },
            meta: {
                createdBy: adminUser._id,
                createdAt: new Date()
            }
        });
        
        console.log('✅ Trainer user created:', trainerUser.username);
        
        // Create Sample Courses
        console.log('📚 Creating sample courses...');
        
        const courses = [
            {
                name: 'Full Stack Web Development',
                courseCode: 'FSWD001',
                category: 'technology',
                description: 'Complete web development course covering frontend and backend technologies including HTML, CSS, JavaScript, React, Node.js, and MongoDB.',
                shortDescription: 'Become a full stack web developer in 6 months',
                duration: {
                    value: 6,
                    unit: 'months'
                },
                fees: {
                    regular: 45000,
                    installment: 5000,
                    discount: 10,
                    scholarshipAvailable: true
                },
                curriculum: [
                    {
                        moduleNumber: 1,
                        title: 'HTML & CSS Fundamentals',
                        description: 'Learn the building blocks of web development',
                        topics: ['HTML5', 'CSS3', 'Responsive Design', 'Flexbox', 'Grid'],
                        duration: '4 weeks',
                        resources: [
                            {
                                type: 'video',
                                title: 'HTML Crash Course',
                                url: 'https://example.com/html-course',
                                duration: '2 hours'
                            }
                        ]
                    },
                    {
                        moduleNumber: 2,
                        title: 'JavaScript Mastery',
                        description: 'Master JavaScript programming',
                        topics: ['ES6+', 'DOM Manipulation', 'Async Programming', 'OOP'],
                        duration: '6 weeks',
                        resources: [
                            {
                                type: 'video',
                                title: 'JavaScript Fundamentals',
                                url: 'https://example.com/js-course',
                                duration: '3 hours'
                            }
                        ]
                    }
                ],
                prerequisites: ['Basic Computer Knowledge', 'Logical Thinking'],
                learningOutcomes: [
                    'Build responsive websites',
                    'Create RESTful APIs',
                    'Develop full stack applications',
                    'Deploy applications to cloud'
                ],
                targetAudience: ['Beginners', 'Career Switchers', 'IT Professionals'],
                instructors: [trainerUser._id],
                enrollmentStats: {
                    totalEnrolled: 120,
                    active: 80,
                    completed: 35,
                    dropout: 5
                },
                rating: {
                    average: 4.5,
                    count: 45
                },
                batches: [
                    {
                        batchId: 'WEB-B001',
                        name: 'Weekend Batch',
                        startDate: new Date('2024-02-01'),
                        endDate: new Date('2024-07-31'),
                        schedule: {
                            days: ['saturday', 'sunday'],
                            time: '10:00 AM - 2:00 PM',
                            duration: '4 hours'
                        },
                        maxStudents: 30,
                        currentStudents: 25,
                        status: 'ongoing',
                        instructor: trainerUser._id,
                        classroom: 'Room 101'
                    },
                    {
                        batchId: 'WEB-B002',
                        name: 'Weekday Evening Batch',
                        startDate: new Date('2024-03-01'),
                        endDate: new Date('2024-08-31'),
                        schedule: {
                            days: ['monday', 'wednesday', 'friday'],
                            time: '6:00 PM - 8:00 PM',
                            duration: '2 hours'
                        },
                        maxStudents: 25,
                        currentStudents: 18,
                        status: 'ongoing',
                        instructor: trainerUser._id,
                        classroom: 'Room 102'
                    }
                ],
                meta: {
                    createdBy: adminUser._id,
                    createdAt: new Date()
                }
            },
            {
                name: 'Data Science with Python',
                courseCode: 'DSF002',
                category: 'technology',
                description: 'Comprehensive data science course covering Python, statistics, machine learning, and data visualization.',
                shortDescription: 'Master data science concepts and tools',
                duration: {
                    value: 8,
                    unit: 'months'
                },
                fees: {
                    regular: 60000,
                    installment: 7500,
                    discount: 15,
                    scholarshipAvailable: true
                },
                curriculum: [
                    {
                        moduleNumber: 1,
                        title: 'Python for Data Science',
                        description: 'Learn Python programming for data analysis',
                        topics: ['Python Basics', 'NumPy', 'Pandas', 'Matplotlib'],
                        duration: '6 weeks',
                        resources: []
                    },
                    {
                        moduleNumber: 2,
                        title: 'Statistics & Probability',
                        description: 'Essential statistics for data science',
                        topics: ['Descriptive Statistics', 'Probability', 'Hypothesis Testing'],
                        duration: '4 weeks',
                        resources: []
                    }
                ],
                prerequisites: ['Basic Programming Knowledge', 'Mathematics Background'],
                learningOutcomes: [
                    'Analyze and visualize data',
                    'Build machine learning models',
                    'Work with big data tools',
                    'Create data-driven solutions'
                ],
                targetAudience: ['Graduates', 'IT Professionals', 'Analysts'],
                instructors: [trainerUser._id],
                enrollmentStats: {
                    totalEnrolled: 80,
                    active: 50,
                    completed: 25,
                    dropout: 5
                },
                rating: {
                    average: 4.7,
                    count: 30
                },
                batches: [
                    {
                        batchId: 'DAT-B001',
                        name: 'Data Science Batch 1',
                        startDate: new Date('2024-01-15'),
                        endDate: new Date('2024-09-15'),
                        schedule: {
                            days: ['tuesday', 'thursday'],
                            time: '7:00 PM - 9:00 PM',
                            duration: '2 hours'
                        },
                        maxStudents: 20,
                        currentStudents: 15,
                        status: 'ongoing',
                        instructor: trainerUser._id,
                        classroom: 'Lab 201'
                    }
                ],
                meta: {
                    createdBy: adminUser._id,
                    createdAt: new Date()
                }
            },
            {
                name: 'Mobile App Development',
                courseCode: 'MOB003',
                category: 'technology',
                description: 'Learn to build native and cross-platform mobile applications for iOS and Android.',
                shortDescription: 'Build mobile apps for iOS and Android',
                duration: {
                    value: 5,
                    unit: 'months'
                },
                fees: {
                    regular: 40000,
                    installment: 5000,
                    discount: 5,
                    scholarshipAvailable: false
                },
                curriculum: [
                    {
                        moduleNumber: 1,
                        title: 'Flutter Fundamentals',
                        description: 'Learn Flutter for cross-platform development',
                        topics: ['Dart Language', 'Widgets', 'State Management'],
                        duration: '8 weeks',
                        resources: []
                    },
                    {
                        moduleNumber: 2,
                        title: 'React Native',
                        description: 'Build apps with React Native',
                        topics: ['React Native Basics', 'Navigation', 'APIs'],
                        duration: '6 weeks',
                        resources: []
                    }
                ],
                prerequisites: ['Basic Programming', 'Understanding of OOP'],
                learningOutcomes: [
                    'Build cross-platform mobile apps',
                    'Publish apps to stores',
                    'Implement mobile UI/UX',
                    'Work with device features'
                ],
                targetAudience: ['Web Developers', 'Beginners', 'Entrepreneurs'],
                instructors: [trainerUser._id],
                enrollmentStats: {
                    totalEnrolled: 60,
                    active: 40,
                    completed: 15,
                    dropout: 5
                },
                rating: {
                    average: 4.3,
                    count: 20
                },
                batches: [
                    {
                        batchId: 'MOB-B001',
                        name: 'Mobile Dev Batch',
                        startDate: new Date('2024-02-15'),
                        endDate: new Date('2024-07-15'),
                        schedule: {
                            days: ['monday', 'wednesday', 'friday'],
                            time: '5:00 PM - 7:00 PM',
                            duration: '2 hours'
                        },
                        maxStudents: 25,
                        currentStudents: 20,
                        status: 'ongoing',
                        instructor: trainerUser._id,
                        classroom: 'Room 103'
                    }
                ],
                meta: {
                    createdBy: adminUser._id,
                    createdAt: new Date()
                }
            }
        ];
        
        const createdCourses = await Course.insertMany(courses);
        console.log(`✅ ${createdCourses.length} sample courses created`);
        
        // Create receipt counter for current month
        const now = new Date();
        const year = now.getFullYear().toString().substr(-2);
        const month = String(now.getMonth() + 1).padStart(2, '0');
        await Counter.create({
            _id: `receipt_${year}${month}`,
            seq: 1000
        });
        
        console.log('✅ Receipt counter initialized');
        
        console.log('\n🎉 Database initialization completed successfully!');
        console.log('\n📋 Default Credentials:');
        console.log('=====================');
        console.log('Admin:     admin@edumanage.com / admin123');
        console.log('Employee:  employee@edumanage.com / employee123');
        console.log('Counselor: counselor@edumanage.com / counselor123');
        console.log('Trainer:   trainer@edumanage.com / trainer123');
        console.log('\n📚 Sample Courses Created:');
        console.log('========================');
        createdCourses.forEach(course => {
            console.log(`- ${course.name} (${course.courseCode}) - ₹${course.fees.regular}`);
        });
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error initializing database:', error);
        process.exit(1);
    }
};

// Run initialization
initDatabase();