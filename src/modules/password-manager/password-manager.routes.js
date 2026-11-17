
const express = require('express');
const authenticateToken = require('../../middleware/auth.middleware');

const router = express.Router();

const {
    getVaultStatus,
    setupVault
} = require('./password-manager.controller');

router.use(authenticateToken);

router.get('/vault/status', getVaultStatus);
router.post('/vault/setup', setupVault);

module.exports = router;
