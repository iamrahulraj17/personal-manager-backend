
const jwt = require('jsonwebtoken');
const db = require('../config/database');

async function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Access token is required'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_ACCESS_SECRET
        );

        if (!decoded.userId || !decoded.sessionId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token'
            });
        }

        const [sessions] = await db.execute(
            `SELECT s.id, s.user_id, u.email
             FROM user_sessions s
             INNER JOIN users u ON u.id = s.user_id
             WHERE s.id = ?
               AND s.user_id = ?
               AND s.revoked_at IS NULL
               AND s.expires_at > NOW()
               AND u.account_status = 'active'
             LIMIT 1`,
            [decoded.sessionId, decoded.userId]
        );

        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Session expired or revoked. Please login again.'
            });
        }

        req.user = {
            userId: sessions[0].user_id,
            email: sessions[0].email,
            sessionId: sessions[0].id
        };

        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Access token has expired'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token'
            });
        }

        console.error('Authentication middleware error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Authentication service error'
        });
    }
}

module.exports = authenticateToken;
