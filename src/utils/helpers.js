const crypto = require('crypto');

/**
 * Generate a random string of specified length
 * @param {number} length - Length of the string
 * @returns {string} Random string
 */
const generateRandomString = (length = 8) => {
    return crypto.randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .slice(0, length)
        .toUpperCase();
};

/**
 * Format date to readable string
 * @param {Date} date - Date to format
 * @returns {string} Formatted date
 */
const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
};

/**
 * Format currency
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency
 */
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0
    }).format(amount);
};

/**
 * Calculate age from date of birth
 * @param {Date} dob - Date of birth
 * @returns {number} Age
 */
const calculateAge = (dob) => {
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
};

/**
 * Calculate percentage
 * @param {number} value - Current value
 * @param {number} total - Total value
 * @returns {number} Percentage
 */
const calculatePercentage = (value, total) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
};

/**
 * Generate password hash
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password) => {
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} Whether email is valid
 */
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} Whether phone is valid
 */
const isValidPhone = (phone) => {
    const phoneRegex = /^[0-9]{10}$/;
    return phoneRegex.test(phone);
};

/**
 * Paginate array of data
 * @param {Array} data - Data to paginate
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} Paginated result
 */
const paginate = (data, page = 1, limit = 10) => {
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    
    const result = {};
    
    if (endIndex < data.length) {
        result.next = {
            page: page + 1,
            limit
        };
    }
    
    if (startIndex > 0) {
        result.previous = {
            page: page - 1,
            limit
        };
    }
    
    result.total = data.length;
    result.totalPages = Math.ceil(data.length / limit);
    result.currentPage = page;
    result.data = data.slice(startIndex, endIndex);
    
    return result;
};

/**
 * Remove sensitive fields from object
 * @param {Object} obj - Object to sanitize
 * @param {Array} fields - Fields to remove
 * @returns {Object} Sanitized object
 */
const sanitizeObject = (obj, fields = ['password', 'token', 'refreshToken']) => {
    const sanitized = { ...obj };
    fields.forEach(field => {
        if (sanitized[field]) {
            delete sanitized[field];
        }
    });
    return sanitized;
};

module.exports = {
    generateRandomString,
    formatDate,
    formatCurrency,
    calculateAge,
    calculatePercentage,
    hashPassword,
    isValidEmail,
    isValidPhone,
    paginate,
    sanitizeObject
};