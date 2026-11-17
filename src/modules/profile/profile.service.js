
const db = require('../../config/database');

// --------------------------------------------------
// PROFILE
// --------------------------------------------------

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

// --------------------------------------------------
// APPLICATION PREFERENCES
// --------------------------------------------------

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

// --------------------------------------------------
// MODULE MANAGEMENT
// --------------------------------------------------

async function getModules(userId) {
    const [moduleRows] = await db.execute(
        `SELECT
            m.id,
            m.module_key,
            m.module_name,
            m.description,
            m.icon,
            m.route_path,
            m.is_system,
            m.is_active,
            COALESCE(ump.is_enabled, 1) AS is_enabled,
            COALESCE(ump.display_order, m.default_order) AS display_order
         FROM modules m
         LEFT JOIN user_module_preferences ump
            ON ump.module_id = m.id
            AND ump.user_id = ?
         WHERE m.is_active = 1
         ORDER BY display_order ASC, m.id ASC`,
        [userId]
    );

    const [submoduleRows] = await db.execute(
        `SELECT
            s.id,
            s.module_id,
            s.submodule_key,
            s.submodule_name,
            s.description,
            s.icon,
            s.route_path,
            s.is_active,
            COALESCE(usp.is_enabled, 1) AS is_enabled,
            COALESCE(usp.display_order, s.default_order) AS display_order
         FROM submodules s
         INNER JOIN modules m ON m.id = s.module_id
         LEFT JOIN user_submodule_preferences usp
            ON usp.submodule_id = s.id
            AND usp.user_id = ?
         WHERE s.is_active = 1
           AND m.is_active = 1
         ORDER BY s.module_id ASC, display_order ASC, s.id ASC`,
        [userId]
    );

    return moduleRows.map(module => {
        const isSystem = Boolean(module.is_system);
        const isEnabled = isSystem || Boolean(module.is_enabled);

        return {
            id: module.id,
            module_key: module.module_key,
            module_name: module.module_name,
            description: module.description,
            icon: module.icon,
            route_path: module.route_path,
            is_system: isSystem,
            is_enabled: isEnabled,
            display_order: module.display_order,
            submodules: submoduleRows
                .filter(submodule => submodule.module_id === module.id)
                .map(submodule => ({
                    id: submodule.id,
                    submodule_key: submodule.submodule_key,
                    submodule_name: submodule.submodule_name,
                    description: submodule.description,
                    icon: submodule.icon,
                    route_path: submodule.route_path,
                    is_enabled: isEnabled && Boolean(submodule.is_enabled),
                    display_order: submodule.display_order
                }))
        };
    });
}

async function updateModules(userId, modules) {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Fetch active modules from the database.
        const [databaseModules] = await connection.execute(
            `SELECT id, module_key, is_system
             FROM modules
             WHERE is_active = 1`
        );

        const moduleMap = new Map(
            databaseModules.map(module => [module.module_key, module])
        );

        const submittedKeys = new Set();

        for (const item of modules) {
            if (submittedKeys.has(item.module_key)) {
                const error = new Error('Duplicate module key: ' + item.module_key);
                error.statusCode = 400;
                throw error;
            }

            submittedKeys.add(item.module_key);

            const databaseModule = moduleMap.get(item.module_key);

            if (!databaseModule) {
                const error = new Error('Invalid or inactive module: ' + item.module_key);
                error.statusCode = 400;
                throw error;
            }

            if (databaseModule.is_system && !item.is_enabled) {
                const error = new Error('System modules cannot be disabled');
                error.statusCode = 400;
                throw error;
            }

            const moduleEnabled =
                Boolean(databaseModule.is_system) || item.is_enabled;

            await connection.execute(
                `INSERT INTO user_module_preferences
                    (user_id, module_id, is_enabled, display_order)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    is_enabled = VALUES(is_enabled),
                    display_order = VALUES(display_order)`,
                [
                    userId,
                    databaseModule.id,
                    moduleEnabled ? 1 : 0,
                    item.display_order
                ]
            );

            // Validate submitted submodules belong to this module.
            const [databaseSubmodules] = await connection.execute(
                `SELECT id, submodule_key
                 FROM submodules
                 WHERE module_id = ?
                   AND is_active = 1`,
                [databaseModule.id]
            );

            const submoduleMap = new Map(
                databaseSubmodules.map(submodule => [
                    submodule.submodule_key,
                    submodule
                ])
            );

            const submittedSubmoduleKeys = new Set();

            for (const submodule of item.submodules) {
                if (submittedSubmoduleKeys.has(submodule.submodule_key)) {
                    const error = new Error(
                        'Duplicate submodule key: ' + submodule.submodule_key
                    );
                    error.statusCode = 400;
                    throw error;
                }

                submittedSubmoduleKeys.add(submodule.submodule_key);

                const databaseSubmodule = submoduleMap.get(
                    submodule.submodule_key
                );

                if (!databaseSubmodule) {
                    const error = new Error(
                        'Invalid submodule: ' + submodule.submodule_key
                    );
                    error.statusCode = 400;
                    throw error;
                }

                const submoduleEnabled =
                    moduleEnabled && submodule.is_enabled;

                await connection.execute(
                    `INSERT INTO user_submodule_preferences
                        (user_id, module_id, submodule_id, is_enabled, display_order)
                     VALUES (?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        is_enabled = VALUES(is_enabled),
                        display_order = VALUES(display_order)`,
                    [
                        userId,
                        databaseModule.id,
                        databaseSubmodule.id,
                        submoduleEnabled ? 1 : 0,
                        submodule.display_order
                    ]
                );
            }

            // If the parent is disabled, disable every submodule,
            // including any not included in the request.
            if (!moduleEnabled) {
                await connection.execute(
                    `UPDATE user_submodule_preferences
                     SET is_enabled = 0
                     WHERE user_id = ?
                       AND module_id = ?`,
                    [userId, databaseModule.id]
                );
            }
        }

        await connection.commit();

        return getModules(userId);

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
    updatePreferences,
    getModules,
    updateModules
};
