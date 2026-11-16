
const db = require('../../config/database');

async function getProfile(userId) {
    const [rows] = await db.execute(
        `SELECT
            u.id AS user_id,
            u.email,
            u.email_verified,
            u.account_status,
            u.last_login_at,
            up.full_name,
            up.profile_image,
            up.created_at,
            up.updated_at
         FROM users u
         INNER JOIN user_profiles up ON up.user_id = u.id
         WHERE u.id = ?
         LIMIT 1`,
        [userId]
    );

    if (rows.length === 0) {
        const error = new Error('Profile not found');
        error.statusCode = 404;
        throw error;
    }

    return rows[0];
}

async function updateProfile(userId, data) {
    const { full_name, profile_image } = data;

    const updates = [];
    const values = [];

    if (full_name !== undefined) {
        updates.push('full_name = ?');
        values.push(full_name.trim());
    }

    if (profile_image !== undefined) {
        updates.push('profile_image = ?');
        values.push(profile_image);
    }

    if (updates.length === 0) {
        const error = new Error('No profile fields provided');
        error.statusCode = 400;
        throw error;
    }

    values.push(userId);

    const [result] = await db.execute(
        `UPDATE user_profiles
         SET ${updates.join(', ')}
         WHERE user_id = ?`,
        values
    );

    if (result.affectedRows === 0) {
        // Confirm whether the profile exists.
        const [rows] = await db.execute(
            'SELECT user_id FROM user_profiles WHERE user_id = ?',
            [userId]
        );

        if (rows.length === 0) {
            const error = new Error('Profile not found');
            error.statusCode = 404;
            throw error;
        }
    }

    return getProfile(userId);
}

async function getPreferences(userId) {
    const [rows] = await db.execute(
        `SELECT
            up.theme,
            up.default_landing_module_id,
            m.module_key AS default_module_key,
            m.module_name AS default_module_name,
            m.route_path AS default_module_route
         FROM user_preferences up
         LEFT JOIN modules m
            ON m.id = up.default_landing_module_id
         WHERE up.user_id = ?
         LIMIT 1`,
        [userId]
    );

    if (rows.length === 0) {
        const error = new Error('User preferences not found');
        error.statusCode = 404;
        throw error;
    }

    return rows[0];
}

async function updatePreferences(userId, data) {
    const { theme, default_landing_module_id } = data;

    if (theme === undefined && default_landing_module_id === undefined) {
        const error = new Error('No preference fields provided');
        error.statusCode = 400;
        throw error;
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Verify that the selected default module is active
        // and enabled for this user.
        if (default_landing_module_id !== undefined) {
            const [modules] = await connection.execute(
                `SELECT m.id
                 FROM modules m
                 INNER JOIN user_module_preferences ump
                    ON ump.module_id = m.id
                 WHERE m.id = ?
                   AND m.is_active = 1
                   AND ump.user_id = ?
                   AND ump.is_enabled = 1
                 LIMIT 1`,
                [default_landing_module_id, userId]
            );

            if (modules.length === 0) {
                const error = new Error(
                    'Selected default module is inactive or disabled'
                );
                error.statusCode = 400;
                throw error;
            }
        }

        const updates = [];
        const values = [];

        if (theme !== undefined) {
            updates.push('theme = ?');
            values.push(theme);
        }

        if (default_landing_module_id !== undefined) {
            updates.push('default_landing_module_id = ?');
            values.push(default_landing_module_id);
        }

        values.push(userId);

        const [result] = await connection.execute(
            `UPDATE user_preferences
             SET ${updates.join(', ')}
             WHERE user_id = ?`,
            values
        );

        if (result.affectedRows === 0) {
            const [existing] = await connection.execute(
                'SELECT user_id FROM user_preferences WHERE user_id = ?',
                [userId]
            );

            if (existing.length === 0) {
                const error = new Error('User preferences not found');
                error.statusCode = 404;
                throw error;
            }
        }

        await connection.commit();

        return getPreferences(userId);

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    getProfile,
    updateProfile,
    getPreferences,
    updatePreferences
};
