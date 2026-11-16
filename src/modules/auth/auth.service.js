const argon2 = require('argon2');
const db = require('../../config/database');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

async function signupUser({ full_name, email, password }) {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Check whether email already exists
        const [existingUsers] = await connection.execute(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [email]
        );

        if (existingUsers.length > 0) {
            const error = new Error('Email is already registered');
            error.statusCode = 409;
            throw error;
        }

        // Hash account password using Argon2id
        const passwordHash = await argon2.hash(password, {
            type: argon2.argon2id
        });

        // Create user (email remains unverified for now)
        const [userResult] = await connection.execute(
            `INSERT INTO users
             (email, password_hash, email_verified, account_status)
             VALUES (?, ?, 0, 'active')`,
            [email, passwordHash]
        );

        const userId = userResult.insertId;

        // Create user profile
        await connection.execute(
            `INSERT INTO user_profiles (user_id, full_name)
             VALUES (?, ?)`,
            [userId, full_name]
        );

        // Fetch active modules
        const [modules] = await connection.execute(
            `SELECT id, module_key, default_order
             FROM modules
             WHERE is_active = 1
             ORDER BY default_order`
        );

        const passwordModule = modules.find(
            module => module.module_key === 'password_manager'
        );

        if (!passwordModule) {
            throw new Error('Password Manager module is not configured');
        }

        // Create default user preferences
        await connection.execute(
            `INSERT INTO user_preferences
             (user_id, default_landing_module_id, theme)
             VALUES (?, ?, 'system')`,
            [userId, passwordModule.id]
        );

        // Fetch active submodules
        const [submodules] = await connection.execute(
            `SELECT id, module_id, default_order
             FROM submodules
             WHERE is_active = 1
             ORDER BY default_order`
        );

        // Enable modules and submodules by default
        for (const module of modules) {
            await connection.execute(
                `INSERT INTO user_module_preferences
                 (user_id, module_id, is_enabled, display_order)
                 VALUES (?, ?, 1, ?)`,
                [userId, module.id, module.default_order]
            );
        }

        for (const submodule of submodules) {
            await connection.execute(
                `INSERT INTO user_submodule_preferences
                 (user_id, module_id, submodule_id, is_enabled, display_order)
                 VALUES (?, ?, ?, 1, ?)`,
                [
                    userId,
                    submodule.module_id,
                    submodule.id,
                    submodule.default_order
                ]
            );
        }

        await connection.commit();

        return {
            userId,
            email,
            full_name,
            email_verified: false
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function loginUser({ email, password, device_name, ip_address, user_agent }) {
    const connection = await db.getConnection();

    try {
        const [users] = await connection.execute(
            `SELECT id, email, password_hash, account_status
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        if (users.length === 0) {
            const error = new Error('Invalid email or password');
            error.statusCode = 401;
            throw error;
        }

        const user = users[0];

        if (user.account_status !== 'active') {
            const error = new Error('Your account is not active');
            error.statusCode = 403;
            throw error;
        }

        const passwordMatches = await argon2.verify(
            user.password_hash,
            password
        );

        if (!passwordMatches) {
            const error = new Error('Invalid email or password');
            error.statusCode = 401;
            throw error;
        }

        const [sessionResult] = await connection.execute(
            `INSERT INTO user_sessions
            (user_id, refresh_token_hash, device_name, ip_address,
            user_agent, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                user.id,
                refreshTokenHash,
                device_name || 'Unknown Device',
                ip_address || null,
                user_agent || null,
                mysqlDate
            ]
        );

        const accessToken = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                sessionId: sessionResult.insertId
            },
            process.env.JWT_ACCESS_SECRET,
            {
                expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m'
            }
        );

        // Generate an opaque refresh token
        const refreshToken = crypto.randomBytes(64).toString('hex');

        // Store only its SHA-256 hash
        const refreshTokenHash = crypto
            .createHash('sha256')
            .update(refreshToken)
            .digest('hex');

        const refreshDays = Number(process.env.JWT_REFRESH_DAYS) || 7;

        const expiresAt = new Date(
            Date.now() + refreshDays * 24 * 60 * 60 * 1000
        );

        const mysqlDate = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

        await connection.beginTransaction();

        await connection.execute(
            `INSERT INTO user_sessions
             (user_id, refresh_token_hash, device_name, ip_address,
              user_agent, expires_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                user.id,
                refreshTokenHash,
                device_name || 'Unknown Device',
                ip_address || null,
                user_agent || null,
                mysqlDate
            ]
        );

        await connection.execute(
            'UPDATE users SET last_login_at = NOW() WHERE id = ?',
            [user.id]
        );

        await connection.commit();

        return {
            user: {
                id: user.id,
                email: user.email
            },
            accessToken,
            refreshToken,
            expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m'
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

function createAccessToken(user) {
    return jwt.sign(
        {
            userId: user.id,
            email: user.email,
            sessionId: user.session_id
        },
        process.env.JWT_ACCESS_SECRET,
        {
            expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m'
        }
    );
}

async function refreshUserSession(refreshToken) {
    if (
        typeof refreshToken !== 'string' ||
        !/^[a-f0-9]{128}$/i.test(refreshToken)
    ) {
        const error = new Error('Invalid refresh token');
        error.statusCode = 401;
        throw error;
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const oldHash = crypto
            .createHash('sha256')
            .update(refreshToken)
            .digest('hex');

        const [sessions] = await connection.execute(
            `SELECT
                s.id AS session_id,
                s.user_id,
                u.id,
                u.email,
                u.account_status
             FROM user_sessions s
             INNER JOIN users u ON u.id = s.user_id
             WHERE s.refresh_token_hash = ?
               AND s.revoked_at IS NULL
               AND s.expires_at > NOW()
             LIMIT 1
             FOR UPDATE`,
            [oldHash]
        );

        if (
            sessions.length === 0 ||
            sessions[0].account_status !== 'active'
        ) {
            const error = new Error('Invalid or expired refresh token');
            error.statusCode = 401;
            throw error;
        }

        const user = sessions[0];

        const newRefreshToken = crypto.randomBytes(64).toString('hex');

        const newRefreshTokenHash = crypto
            .createHash('sha256')
            .update(newRefreshToken)
            .digest('hex');

        const refreshDays = Number(process.env.JWT_REFRESH_DAYS) || 7;

        const expiresAt = new Date(
            Date.now() + refreshDays * 24 * 60 * 60 * 1000
        );

        const mysqlDate = expiresAt
            .toISOString()
            .slice(0, 19)
            .replace('T', ' ');

        await connection.execute(
            `UPDATE user_sessions
             SET refresh_token_hash = ?, expires_at = ?
             WHERE id = ?`,
            [newRefreshTokenHash, mysqlDate, user.session_id]
        );

        // The new access token is linked to the existing session.
        const accessToken = createAccessToken(user);

        await connection.commit();

        return {
            accessToken,
            refreshToken: newRefreshToken,
            expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m'
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function logoutUser(refreshToken) {
    if (
        typeof refreshToken !== 'string' ||
        !/^[a-f0-9]{128}$/i.test(refreshToken)
    ) {
        const error = new Error('Invalid refresh token');
        error.statusCode = 401;
        throw error;
    }

    const tokenHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');

    const [result] = await db.execute(
        `UPDATE user_sessions
         SET revoked_at = NOW()
         WHERE refresh_token_hash = ?
           AND revoked_at IS NULL`,
        [tokenHash]
    );

    if (result.affectedRows === 0) {
        const error = new Error('Session not found or already logged out');
        error.statusCode = 401;
        throw error;
    }

    return true;
}

module.exports = { signupUser, loginUser, refreshUserSession, logoutUser };
