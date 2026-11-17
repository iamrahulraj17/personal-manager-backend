const express = require('express');
const authenticateToken = require('../../middleware/auth.middleware');

const router = express.Router();

const {
    getVaultStatus,
    setupVault,
    getCredentials,
    createCredential,
    deleteCredential
} = require('./password-manager.controller');

router.use(authenticateToken);

router.get('/vault/status', getVaultStatus);
router.post('/vault/setup', setupVault);

router.get('/credentials', getCredentials);
router.post('/credentials', createCredential);
router.delete('/credentials/:id', deleteCredential);

module.exports = router;