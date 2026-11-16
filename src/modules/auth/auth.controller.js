const { validationResult } = require('express-validator');
const { signupUser } = require('./auth.service');
const { loginUser } = require('./auth.service');
const { refreshUserSession } = require('./auth.service');
const { logoutUser } = require('./auth.service');

async function signup(req, res) {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }

    try {
        const { full_name, email, password } = req.body;

        const user = await signupUser({
            full_name: full_name.trim(),
            email: email.trim().toLowerCase(),
            password
        });

        return res.status(201).json({
            success: true,
            message: 'Account created successfully',
            data: user
        });

    } catch (error) {
        console.error('Signup error:', error.message);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : 'Unable to create account'
        });
    }
}

async function login(req, res) {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }

    try {
        const { email, password, device_name } = req.body;

        const result = await loginUser({
            email: email.trim().toLowerCase(),
            password,
            device_name,
            ip_address: req.ip,
            user_agent: req.get('user-agent')
        });

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            data: result
        });

    } catch (error) {
        console.error('Login error:', error.message);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : 'Unable to login'
        });
    }
}

async function refreshToken(req, res) {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required'
            });
        }

        const result = await refreshUserSession(refreshToken);

        return res.status(200).json({
            success: true,
            message: 'Token refreshed successfully',
            data: result
        });

    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : 'Unable to refresh token'
        });
    }
}

async function logout(req, res) {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required'
            });
        }

        await logoutUser(refreshToken);

        return res.status(200).json({
            success: true,
            message: 'Logout successful'
        });

    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : 'Unable to logout'
        });
    }
}

module.exports = { signup, login, refreshToken, logout };
