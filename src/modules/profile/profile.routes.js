
const express = require('express');
const authenticateToken = require('../../middleware/auth.middleware');

const router = express.Router();

const {
    getProfile,
    updateProfile,
    getPreferences,
    updatePreferences
} = require('./profile.controller');

router.use(authenticateToken);

router.get('/', getProfile);
router.put('/', updateProfile);

router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);

module.exports = router;
