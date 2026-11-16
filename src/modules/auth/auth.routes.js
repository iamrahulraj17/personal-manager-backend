const express = require('express');
const authenticateToken = require('../../middleware/auth.middleware');

const router = express.Router();

const {
    signup,
    login,
    refreshToken,
    logout
} = require('./auth.controller');
const { signupValidation, loginValidation } = require('./auth.validation');

router.post('/signup', signupValidation, signup);
router.post('/login', loginValidation, login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);

router.get('/me', authenticateToken, (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Authenticated user retrieved successfully',
        data: {
            userId: req.user.userId,
            email: req.user.email,
            sessionId: req.user.sessionId
        }
    });
});

module.exports = router;
