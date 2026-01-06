const { validationResult } = require('express-validator');

const validate = (validations) => {
    return async (req, res, next) => {
        // Run all validations
        for (let validation of validations) {
            const result = await validation.run(req);
            if (result.errors.length) break;
        }

        const errors = validationResult(req);
        if (errors.isEmpty()) {
            return next();
        }

        res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(err => ({
                field: err.param,
                message: err.msg,
                value: err.value
            }))
        });
    };
};

// Common validation rules
const commonRules = {
    email: () => {
        return [
            body('email')
                .isEmail()
                .withMessage('Please provide a valid email')
                .normalizeEmail()
        ];
    },
    
    password: () => {
        return [
            body('password')
                .isLength({ min: 6 })
                .withMessage('Password must be at least 6 characters')
                .matches(/\d/)
                .withMessage('Password must contain at least one number')
                .matches(/[a-zA-Z]/)
                .withMessage('Password must contain at least one letter')
        ];
    },
    
    phone: () => {
        return [
            body('phone')
                .matches(/^[0-9]{10}$/)
                .withMessage('Phone number must be 10 digits')
        ];
    },
    
    objectId: (field) => {
        return [
            param(field)
                .isMongoId()
                .withMessage('Invalid ID format')
        ];
    }
};

module.exports = { validate, ...commonRules };