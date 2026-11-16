const { body } = require('express-validator');

const signupValidation = [
    body('full_name')
        .trim()
        .notEmpty()
        .withMessage('Full name is required')
        .isLength({ max: 150 })
        .withMessage('Full name cannot exceed 150 characters'),

    body('email')
        .trim()
        .isEmail()
        .withMessage('Enter a valid email address')
        .normalizeEmail(),

    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must contain at least 8 characters')
];


const loginValidation = [
    body('email')
        .trim()
        .isEmail()
        .withMessage('Enter a valid email address')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

module.exports = {
    signupValidation,
    loginValidation
};
