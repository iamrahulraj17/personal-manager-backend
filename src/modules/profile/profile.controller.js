
const profileService = require('./profile.service');

async function getProfile(req, res) {
    try {
        const profile = await profileService.getProfile(req.user.userId);

        return res.status(200).json({
            success: true,
            message: 'Profile retrieved successfully',
            data: profile
        });

    } catch (error) {
        console.error('Get profile error:', error.message);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : 'Unable to retrieve profile'
        });
    }
}

async function updateProfile(req, res) {
    try {
        const { full_name, profile_image } = req.body;

        if (
            full_name === undefined &&
            profile_image === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: 'At least one profile field is required'
            });
        }

        if (
            full_name !== undefined &&
            (
                typeof full_name !== 'string' ||
                full_name.trim().length === 0 ||
                full_name.trim().length > 150
            )
        ) {
            return res.status(400).json({
                success: false,
                message: 'Full name must be between 1 and 150 characters'
            });
        }

        if (
            profile_image !== undefined &&
            profile_image !== null &&
            (
                typeof profile_image !== 'string' ||
                profile_image.length > 500
            )
        ) {
            return res.status(400).json({
                success: false,
                message: 'Profile image must be a valid string or null'
            });
        }

        const profile = await profileService.updateProfile(
            req.user.userId,
            { full_name, profile_image }
        );

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: profile
        });

    } catch (error) {
        console.error('Update profile error:', error.message);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : 'Unable to update profile'
        });
    }
}

async function getPreferences(req, res) {
    try {
        const preferences = await profileService.getPreferences(
            req.user.userId
        );

        return res.status(200).json({
            success: true,
            message: 'Preferences retrieved successfully',
            data: preferences
        });

    } catch (error) {
        console.error('Get preferences error:', error.message);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : 'Unable to retrieve preferences'
        });
    }
}

async function updatePreferences(req, res) {
    try {
        const { theme, default_landing_module_id } = req.body;

        if (
            theme === undefined &&
            default_landing_module_id === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: 'At least one preference field is required'
            });
        }

        if (
            theme !== undefined &&
            !['light', 'dark', 'system'].includes(theme)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Theme must be light, dark, or system'
            });
        }

        let moduleId;

        if (default_landing_module_id !== undefined) {
            moduleId = Number(default_landing_module_id);

            if (
                !Number.isSafeInteger(moduleId) ||
                moduleId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid default landing module ID'
                });
            }
        }

        const preferences = await profileService.updatePreferences(
            req.user.userId,
            {
                theme,
                default_landing_module_id: moduleId
            }
        );

        return res.status(200).json({
            success: true,
            message: 'Preferences updated successfully',
            data: preferences
        });

    } catch (error) {
        console.error('Update preferences error:', error.message);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : 'Unable to update preferences'
        });
    }
}

module.exports = {
    getProfile,
    updateProfile,
    getPreferences,
    updatePreferences
};
