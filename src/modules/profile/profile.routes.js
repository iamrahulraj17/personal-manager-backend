
const express = require('express');
const authenticateToken = require('../../middleware/auth.middleware');

const router = express.Router();

const {
    getProfile,
    updateProfile,
    getPreferences,
    updatePreferences,
    getModules,
    updateModules
} = require('./profile.controller');

router.use(authenticateToken);

// Profile
router.get('/', getProfile);
router.put('/', updateProfile);

// Application Preferences
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);

// Module Management
router.get('/modules', getModules);
router.put('/modules', updateModules);

module.exports = router;
