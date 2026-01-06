/**
 * Comprehensive Validators for Education Management System
 * Centralized validation utilities for all data models
 */

const Joi = require('joi');
const mongoose = require('mongoose');

// Common validation patterns
const PATTERNS = {
    email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    phone: /^[0-9]{10}$/,
    pincode: /^[0-9]{6}$/,
    aadhaar: /^[0-9]{12}$/,
    pan: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
    gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
    accountNumber: /^[0-9]{9,18}$/,
    url: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
    username: /^[a-zA-Z0-9_]{3,30}$/,
    password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    date: /^\d{4}-\d{2}-\d{2}$/,
    time: /^([01]\d|2[0-3]):([0-5]\d)$/,
    percentage: /^100(\.0{1,2})?$|^\d{1,2}(\.\d{1,2})?$/,
    amount: /^\d+(\.\d{1,2})?$/,
    studentId: /^STU\d{6}$/,
    receiptNumber: /^RCPT\d{8}$/
};

// Common validation messages
const MESSAGES = {
    required: 'is required',
    invalid: 'is invalid',
    minLength: 'must be at least {#limit} characters',
    maxLength: 'must not exceed {#limit} characters',
    invalidEmail: 'must be a valid email address',
    invalidPhone: 'must be a valid 10-digit phone number',
    invalidPassword: 'must contain at least 8 characters, one uppercase, one lowercase, one number and one special character',
    invalidDate: 'must be a valid date (YYYY-MM-DD)',
    invalidAmount: 'must be a valid amount',
    invalidPercentage: 'must be a valid percentage (0-100)'
};

/**
 * Base validation schemas for common fields
 */
const baseSchemas = {
    id: () => Joi.string().custom((value, helpers) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
            return helpers.error('any.invalid');
        }
        return value;
    }, 'MongoDB ObjectId validation'),

    email: () => Joi.string()
        .required()
        .email()
        .pattern(PATTERNS.email)
        .messages({
            'string.empty': `Email ${MESSAGES.required}`,
            'string.email': `Email ${MESSAGES.invalidEmail}`,
            'string.pattern.base': `Email ${MESSAGES.invalidEmail}`
        }),

    phone: () => Joi.string()
        .required()
        .pattern(PATTERNS.phone)
        .messages({
            'string.empty': `Phone ${MESSAGES.required}`,
            'string.pattern.base': `Phone ${MESSAGES.invalidPhone}`
        }),

    password: () => Joi.string()
        .min(8)
        .pattern(PATTERNS.password)
        .messages({
            'string.min': `Password ${MESSAGES.minLength}`,
            'string.pattern.base': `Password ${MESSAGES.invalidPassword}`
        }),

    date: () => Joi.string()
        .pattern(PATTERNS.date)
        .custom((value, helpers) => {
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                return helpers.error('any.invalid');
            }
            return value;
        }, 'Date validation'),

    amount: () => Joi.number()
        .positive()
        .precision(2)
        .messages({
            'number.positive': 'Amount must be positive',
            'number.precision': 'Amount must have max 2 decimal places'
        }),

    percentage: () => Joi.number()
        .min(0)
        .max(100)
        .precision(2)
        .messages({
            'number.min': 'Percentage must be at least 0',
            'number.max': 'Percentage must not exceed 100',
            'number.precision': 'Percentage must have max 2 decimal places'
        }),

    url: () => Joi.string()
        .pattern(PATTERNS.url)
        .messages({
            'string.pattern.base': 'Must be a valid URL'
        })
};

/**
 * User validators
 */
const userValidators = {
    createUser: Joi.object({
        username: Joi.string()
            .required()
            .pattern(PATTERNS.username)
            .min(3)
            .max(30)
            .messages({
                'string.empty': 'Username is required',
                'string.pattern.base': 'Username can only contain letters, numbers and underscores',
                'string.min': 'Username must be at least 3 characters',
                'string.max': 'Username must not exceed 30 characters'
            }),

        email: baseSchemas.email(),

        password: baseSchemas.password(),

        role: Joi.string()
            .valid('admin', 'employee', 'trainer', 'counselor', 'student')
            .default('employee')
            .messages({
                'any.only': 'Role must be one of: admin, employee, trainer, counselor, student'
            }),

        profile: Joi.object({
            firstName: Joi.string()
                .required()
                .min(2)
                .max(50)
                .messages({
                    'string.empty': 'First name is required',
                    'string.min': 'First name must be at least 2 characters',
                    'string.max': 'First name must not exceed 50 characters'
                }),

            lastName: Joi.string()
                .min(2)
                .max(50)
                .messages({
                    'string.min': 'Last name must be at least 2 characters',
                    'string.max': 'Last name must not exceed 50 characters'
                }),

            phone: baseSchemas.phone(),

            address: Joi.string()
                .max(200)
                .messages({
                    'string.max': 'Address must not exceed 200 characters'
                }),

            designation: Joi.string()
                .max(100)
                .messages({
                    'string.max': 'Designation must not exceed 100 characters'
                }),

            department: Joi.string()
                .max(100)
                .messages({
                    'string.max': 'Department must not exceed 100 characters'
                })
        }).required(),

        status: Joi.string()
            .valid('active', 'inactive', 'suspended')
            .default('active'),

        permissions: Joi.object().optional()
    }),

    updateUser: Joi.object({
        username: Joi.string()
            .pattern(PATTERNS.username)
            .min(3)
            .max(30),

        email: Joi.string()
            .email()
            .pattern(PATTERNS.email),

        role: Joi.string()
            .valid('admin', 'employee', 'trainer', 'counselor', 'student'),

        profile: Joi.object({
            firstName: Joi.string().min(2).max(50),
            lastName: Joi.string().min(2).max(50),
            phone: Joi.string().pattern(PATTERNS.phone),
            address: Joi.string().max(200),
            designation: Joi.string().max(100),
            department: Joi.string().max(100)
        }),

        status: Joi.string()
            .valid('active', 'inactive', 'suspended'),

        permissions: Joi.object()
    }).min(1).messages({
        'object.min': 'At least one field must be provided for update'
    }),

    login: Joi.object({
        username: Joi.string().required().messages({
            'string.empty': 'Username or email is required'
        }),
        password: Joi.string().required().messages({
            'string.empty': 'Password is required'
        })
    }),

    changePassword: Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: baseSchemas.password(),
        confirmPassword: Joi.any().equal(Joi.ref('newPassword'))
            .required()
            .messages({
                'any.only': 'Confirm password must match new password'
            })
    })
};

/**
 * Student validators
 */
const studentValidators = {
    createStudent: Joi.object({
        personalDetails: Joi.object({
            fullName: Joi.string()
                .required()
                .min(3)
                .max(100)
                .messages({
                    'string.empty': 'Full name is required',
                    'string.min': 'Full name must be at least 3 characters',
                    'string.max': 'Full name must not exceed 100 characters'
                }),

            email: baseSchemas.email(),

            phone: baseSchemas.phone(),

            alternatePhone: Joi.string()
                .pattern(PATTERNS.phone)
                .optional(),

            dateOfBirth: baseSchemas.date()
                .required()
                .custom((value, helpers) => {
                    const dob = new Date(value);
                    const today = new Date();
                    const age = today.getFullYear() - dob.getFullYear();
                    
                    if (age < 15 || age > 60) {
                        return helpers.error('any.invalid', { message: 'Age must be between 15 and 60 years' });
                    }
                    return value;
                }),

            gender: Joi.string()
                .valid('male', 'female', 'other')
                .required(),

            address: Joi.object({
                street: Joi.string().required().max(200),
                city: Joi.string().required().max(100),
                state: Joi.string().required().max(100),
                pincode: Joi.string()
                    .required()
                    .pattern(PATTERNS.pincode)
                    .messages({
                        'string.pattern.base': 'Pincode must be 6 digits'
                    }),
                country: Joi.string().default('India')
            }).required(),

            fatherName: Joi.string()
                .required()
                .min(3)
                .max(100),

            motherName: Joi.string()
                .required()
                .min(3)
                .max(100),

            aadhaarNumber: Joi.string()
                .pattern(PATTERNS.aadhaar)
                .messages({
                    'string.pattern.base': 'Aadhaar must be 12 digits'
                }),

            panNumber: Joi.string()
                .pattern(PATTERNS.pan)
                .messages({
                    'string.pattern.base': 'PAN must be in format: ABCDE1234F'
                })
        }).required(),

        academicDetails: Joi.object({
            qualification: Joi.string()
                .required()
                .valid('10th', '12th', 'Graduate', 'Post Graduate', 'Diploma', 'Other'),

            yearOfPassing: Joi.number()
                .integer()
                .min(1900)
                .max(new Date().getFullYear())
                .required(),

            percentage: baseSchemas.percentage(),

            institution: Joi.string()
                .max(200)
                .required(),

            marksheetNumber: Joi.string()
                .max(50)
                .optional()
        }),

        admissionDetails: Joi.object({
            admissionDate: baseSchemas.date()
                .required()
                .default(() => new Date().toISOString().split('T')[0]),

            admissionType: Joi.string()
                .valid('regular', 'direct', 'lateral', 'transfer')
                .default('regular'),

            batch: Joi.string()
                .max(50)
                .required(),

            studentId: Joi.string()
                .pattern(PATTERNS.studentId)
                .messages({
                    'string.pattern.base': 'Student ID must be in format: STU000001'
                }),

            remarks: Joi.string()
                .max(500)
                .optional()
        }).required(),

        documents: Joi.array().items(
            Joi.object({
                name: Joi.string().required(),
                type: Joi.string()
                    .valid('photo', 'aadhaar', 'marksheet', 'transfer', 'caste', 'income', 'medical', 'other')
                    .required(),
                url: baseSchemas.url().required(),
                status: Joi.string()
                    .valid('pending', 'verified', 'rejected')
                    .default('pending')
            })
        ).optional()
    }),

    updateStudent: Joi.object({
        personalDetails: Joi.object({
            fullName: Joi.string().min(3).max(100),
            email: Joi.string().email().pattern(PATTERNS.email),
            phone: Joi.string().pattern(PATTERNS.phone),
            alternatePhone: Joi.string().pattern(PATTERNS.phone),
            dateOfBirth: baseSchemas.date(),
            gender: Joi.string().valid('male', 'female', 'other'),
            address: Joi.object({
                street: Joi.string().max(200),
                city: Joi.string().max(100),
                state: Joi.string().max(100),
                pincode: Joi.string().pattern(PATTERNS.pincode),
                country: Joi.string()
            }),
            fatherName: Joi.string().min(3).max(100),
            motherName: Joi.string().min(3).max(100)
        }),

        academicDetails: Joi.object({
            qualification: Joi.string().valid('10th', '12th', 'Graduate', 'Post Graduate', 'Diploma', 'Other'),
            yearOfPassing: Joi.number().integer().min(1900).max(new Date().getFullYear()),
            percentage: baseSchemas.percentage(),
            institution: Joi.string().max(200),
            marksheetNumber: Joi.string().max(50)
        }),

        status: Joi.string()
            .valid('active', 'inactive', 'completed', 'dropped', 'suspended')
    }).min(1)
};

/**
 * Lead validators
 */
const leadValidators = {
    createLead: Joi.object({
        fullName: Joi.string()
            .required()
            .min(3)
            .max(100),

        email: baseSchemas.email(),

        phone: baseSchemas.phone(),

        alternatePhone: Joi.string()
            .pattern(PATTERNS.phone)
            .optional(),

        source: Joi.string()
            .valid('website', 'walkin', 'reference', 'social', 'campaign', 'other')
            .default('website'),

        sourceDetails: Joi.string()
            .max(200)
            .optional(),

        interestedCourse: Joi.string()
            .required()
            .messages({
                'string.empty': 'Interested course is required'
            }),

        qualification: Joi.string()
            .valid('10th', '12th', 'Graduate', 'Post Graduate', 'Diploma', 'Other'),

        status: Joi.string()
            .valid('new', 'contacted', 'followup', 'converted', 'lost')
            .default('new'),

        priority: Joi.string()
            .valid('low', 'medium', 'high')
            .default('medium'),

        assignedTo: baseSchemas.id(),

        notes: Joi.string()
            .max(1000)
            .optional(),

        nextFollowUp: baseSchemas.date()
            .optional()
    }),

    updateLead: Joi.object({
        fullName: Joi.string().min(3).max(100),
        email: Joi.string().email().pattern(PATTERNS.email),
        phone: Joi.string().pattern(PATTERNS.phone),
        source: Joi.string().valid('website', 'walkin', 'reference', 'social', 'campaign', 'other'),
        interestedCourse: Joi.string(),
        status: Joi.string().valid('new', 'contacted', 'followup', 'converted', 'lost'),
        priority: Joi.string().valid('low', 'medium', 'high'),
        assignedTo: baseSchemas.id(),
        notes: Joi.string().max(1000),
        nextFollowUp: baseSchemas.date()
    }).min(1)
};

/**
 * Course validators
 */
const courseValidators = {
    createCourse: Joi.object({
        name: Joi.string()
            .required()
            .min(3)
            .max(200)
            .messages({
                'string.empty': 'Course name is required'
            }),

        code: Joi.string()
            .required()
            .pattern(/^[A-Z]{3}\d{3}$/)
            .messages({
                'string.pattern.base': 'Course code must be in format: ABC123'
            }),

        description: Joi.string()
            .max(1000)
            .required(),

        category: Joi.string()
            .required()
            .valid('technology', 'business', 'arts', 'science', 'professional', 'certification'),

        duration: Joi.object({
            months: Joi.number()
                .integer()
                .min(1)
                .max(48)
                .required(),
            hours: Joi.number()
                .integer()
                .min(10)
                .max(1000)
                .required()
        }).required(),

        fees: Joi.object({
            amount: baseSchemas.amount().required(),
            currency: Joi.string()
                .valid('INR', 'USD', 'EUR')
                .default('INR'),
            installments: Joi.array().items(
                Joi.object({
                    amount: baseSchemas.amount().required(),
                    dueDate: baseSchemas.date().required(),
                    description: Joi.string().max(100)
                })
            ).optional()
        }).required(),

        prerequisites: Joi.array()
            .items(Joi.string())
            .optional(),

        syllabus: Joi.array()
            .items(Joi.object({
                module: Joi.string().required(),
                topics: Joi.array().items(Joi.string()).required(),
                duration: Joi.number().integer().min(1).required()
            }))
            .optional(),

        status: Joi.string()
            .valid('active', 'inactive', 'upcoming', 'archived')
            .default('active'),

        seats: Joi.number()
            .integer()
            .min(1)
            .max(1000)
            .default(30),

        trainers: Joi.array()
            .items(baseSchemas.id())
            .optional()
    }),

    updateCourse: Joi.object({
        name: Joi.string().min(3).max(200),
        description: Joi.string().max(1000),
        category: Joi.string().valid('technology', 'business', 'arts', 'science', 'professional', 'certification'),
        duration: Joi.object({
            months: Joi.number().integer().min(1).max(48),
            hours: Joi.number().integer().min(10).max(1000)
        }),
        fees: Joi.object({
            amount: baseSchemas.amount(),
            currency: Joi.string().valid('INR', 'USD', 'EUR'),
            installments: Joi.array().items(
                Joi.object({
                    amount: baseSchemas.amount(),
                    dueDate: baseSchemas.date(),
                    description: Joi.string().max(100)
                })
            )
        }),
        status: Joi.string().valid('active', 'inactive', 'upcoming', 'archived'),
        seats: Joi.number().integer().min(1).max(1000)
    }).min(1)
};

/**
 * Payment validators
 */
const paymentValidators = {
    createPayment: Joi.object({
        studentId: baseSchemas.id().required(),
        enrollmentId: baseSchemas.id().required(),
        
        amount: baseSchemas.amount()
            .required()
            .messages({
                'number.base': 'Amount must be a valid number'
            }),

        paymentMode: Joi.string()
            .required()
            .valid('cash', 'cheque', 'card', 'online', 'bank_transfer', 'upi')
            .messages({
                'any.only': 'Payment mode must be one of: cash, cheque, card, online, bank_transfer, upi'
            }),

        paymentDate: baseSchemas.date()
            .required()
            .default(() => new Date().toISOString().split('T')[0]),

        referenceNumber: Joi.string()
            .max(50)
            .required()
            .messages({
                'string.empty': 'Reference number is required'
            }),

        description: Joi.string()
            .max(500)
            .optional(),

        status: Joi.string()
            .valid('pending', 'completed', 'failed', 'refunded')
            .default('completed'),

        receiptNumber: Joi.string()
            .pattern(PATTERNS.receiptNumber)
            .messages({
                'string.pattern.base': 'Receipt number must be in format: RCPT00000001'
            }),

        bankDetails: Joi.object({
            bankName: Joi.string().max(100),
            accountNumber: Joi.string().pattern(PATTERNS.accountNumber),
            ifscCode: Joi.string().pattern(PATTERNS.ifsc),
            branch: Joi.string().max(100)
        }).optional(),

        isInstallment: Joi.boolean()
            .default(false),

        installmentNumber: Joi.number()
            .integer()
            .min(1)
            .when('isInstallment', {
                is: true,
                then: Joi.required()
            })
    }),

    updatePayment: Joi.object({
        amount: baseSchemas.amount(),
        paymentMode: Joi.string().valid('cash', 'cheque', 'card', 'online', 'bank_transfer', 'upi'),
        paymentDate: baseSchemas.date(),
        referenceNumber: Joi.string().max(50),
        description: Joi.string().max(500),
        status: Joi.string().valid('pending', 'completed', 'failed', 'refunded'),
        bankDetails: Joi.object({
            bankName: Joi.string().max(100),
            accountNumber: Joi.string().pattern(PATTERNS.accountNumber),
            ifscCode: Joi.string().pattern(PATTERNS.ifsc),
            branch: Joi.string().max(100)
        })
    }).min(1)
};

/**
 * Attendance validators
 */
const attendanceValidators = {
    markAttendance: Joi.object({
        studentId: baseSchemas.id().required(),
        courseId: baseSchemas.id().required(),
        batchId: baseSchemas.id().required(),
        
        date: baseSchemas.date()
            .required()
            .default(() => new Date().toISOString().split('T')[0]),

        status: Joi.string()
            .required()
            .valid('present', 'absent', 'late', 'halfday', 'holiday')
            .messages({
                'any.only': 'Status must be one of: present, absent, late, halfday, holiday'
            }),

        timeIn: Joi.string()
            .pattern(PATTERNS.time)
            .messages({
                'string.pattern.base': 'Time must be in format: HH:MM'
            }),

        timeOut: Joi.string()
            .pattern(PATTERNS.time)
            .messages({
                'string.pattern.base': 'Time must be in format: HH:MM'
            }),

        remarks: Joi.string()
            .max(200)
            .optional(),

        markedBy: baseSchemas.id().required()
    }),

    bulkAttendance: Joi.array()
        .items(Joi.object({
            studentId: baseSchemas.id().required(),
            status: Joi.string()
                .valid('present', 'absent', 'late', 'halfday', 'holiday')
                .required(),
            timeIn: Joi.string().pattern(PATTERNS.time),
            timeOut: Joi.string().pattern(PATTERNS.time),
            remarks: Joi.string().max(200)
        }))
        .min(1)
        .required()
        .messages({
            'array.min': 'At least one attendance record is required'
        })
};

/**
 * Enrollment validators
 */
const enrollmentValidators = {
    createEnrollment: Joi.object({
        studentId: baseSchemas.id().required(),
        courseId: baseSchemas.id().required(),
        batchId: baseSchemas.id().required(),
        
        enrollmentDate: baseSchemas.date()
            .required()
            .default(() => new Date().toISOString().split('T')[0]),

        enrollmentType: Joi.string()
            .valid('regular', 'fasttrack', 'corporate', 'scholarship')
            .default('regular'),

        status: Joi.string()
            .valid('pending', 'active', 'completed', 'dropped', 'suspended')
            .default('pending'),

        fees: Joi.object({
            total: baseSchemas.amount().required(),
            paid: baseSchemas.amount().default(0),
            balance: baseSchemas.amount(),
            currency: Joi.string().valid('INR', 'USD', 'EUR').default('INR')
        }).required(),

        paymentPlan: Joi.array()
            .items(Joi.object({
                installmentNumber: Joi.number().integer().min(1).required(),
                amount: baseSchemas.amount().required(),
                dueDate: baseSchemas.date().required(),
                status: Joi.string().valid('pending', 'paid', 'overdue').default('pending')
            }))
            .optional(),

        documents: Joi.array()
            .items(Joi.object({
                name: Joi.string().required(),
                type: Joi.string().required(),
                url: baseSchemas.url().required(),
                status: Joi.string().valid('pending', 'verified', 'rejected').default('pending')
            }))
            .optional(),

        remarks: Joi.string()
            .max(500)
            .optional(),

        counselorId: baseSchemas.id()
            .required()
    }),

    updateEnrollment: Joi.object({
        status: Joi.string().valid('pending', 'active', 'completed', 'dropped', 'suspended'),
        fees: Joi.object({
            total: baseSchemas.amount(),
            paid: baseSchemas.amount(),
            balance: baseSchemas.amount(),
            currency: Joi.string().valid('INR', 'USD', 'EUR')
        }),
        paymentPlan: Joi.array().items(Joi.object({
            installmentNumber: Joi.number().integer().min(1),
            amount: baseSchemas.amount(),
            dueDate: baseSchemas.date(),
            status: Joi.string().valid('pending', 'paid', 'overdue')
        })),
        remarks: Joi.string().max(500)
    }).min(1)
};

/**
 * Main validation function
 * @param {Object} data - Data to validate
 * @param {Object} schema - Joi schema
 * @returns {Object} Validation result
 */
const validate = (data, schema) => {
    const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
        errors: {
            wrap: {
                label: ''
            }
        }
    });

    if (error) {
        const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            type: detail.type
        }));

        return {
            isValid: false,
            errors,
            value: null
        };
    }

    return {
        isValid: true,
        errors: null,
        value
    };
};

/**
 * Sanitize data by removing unwanted fields
 * @param {Object} data - Data to sanitize
 * @param {Array} allowedFields - Fields to keep
 * @returns {Object} Sanitized data
 */
const sanitize = (data, allowedFields = []) => {
    if (!data || typeof data !== 'object') return data;
    
    const sanitized = {};
    allowedFields.forEach(field => {
        if (data[field] !== undefined) {
            sanitized[field] = data[field];
        }
    });
    
    return sanitized;
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} Validation result
 */
const validateEmail = (email) => {
    return PATTERNS.email.test(email);
};

/**
 * Validate phone format
 * @param {string} phone - Phone to validate
 * @returns {boolean} Validation result
 */
const validatePhone = (phone) => {
    return PATTERNS.phone.test(phone);
};

/**
 * Validate date format
 * @param {string} date - Date to validate
 * @returns {boolean} Validation result
 */
const validateDate = (date) => {
    return PATTERNS.date.test(date) && !isNaN(new Date(date).getTime());
};

/**
 * Format validation errors for API response
 * @param {Array} errors - Validation errors
 * @returns {Object} Formatted response
 */
const formatValidationErrors = (errors) => {
    const formatted = {};
    errors.forEach(error => {
        if (!formatted[error.field]) {
            formatted[error.field] = [];
        }
        formatted[error.field].push(error.message);
    });
    
    return {
        success: false,
        message: 'Validation failed',
        errors: formatted
    };
};

module.exports = {
    PATTERNS,
    MESSAGES,
    baseSchemas,
    userValidators,
    studentValidators,
    leadValidators,
    courseValidators,
    paymentValidators,
    attendanceValidators,
    enrollmentValidators,
    validate,
    sanitize,
    validateEmail,
    validatePhone,
    validateDate,
    formatValidationErrors
};