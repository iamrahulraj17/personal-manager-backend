
const passwordManagerService = require('./password-manager.service');

function isBase64(value) {
    if (typeof value !== 'string' || value.length === 0) {
        return false;
    }

    // Validate canonical Base64 encoding.
    const buffer = Buffer.from(value, 'base64');
    return buffer.length > 0 && buffer.toString('base64') === value;
}

async function getVaultStatus(req, res) {
    try {
        const status = await passwordManagerService.getVaultStatus(
            req.user.userId
        );

        return res.status(200).json({
            success: true,
            message: 'Vault status retrieved successfully',
            data: status
        });
    } catch (error) {
        console.error('Get vault status error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Unable to retrieve vault status'
        });
    }
}

async function setupVault(req, res) {
    try {
        const {
            encryption_algorithm,
            kdf_algorithm,
            kdf_salt,
            kdf_parameters,
            encrypted_vault_key,
            vault_key_nonce,
            vault_key_auth_tag,
            recovery_kdf_salt,
            recovery_wrapped_vault_key,
            recovery_nonce,
            recovery_auth_tag,
            encryption_version
        } = req.body;

        const encodedFields = [
            kdf_salt,
            encrypted_vault_key,
            vault_key_nonce,
            vault_key_auth_tag,
            recovery_kdf_salt,
            recovery_wrapped_vault_key,
            recovery_nonce,
            recovery_auth_tag
        ];

        if (!encodedFields.every(isBase64)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or missing encoded encryption data'
            });
        }

        if (encryption_algorithm !== 'AES-256-GCM') {
            return res.status(400).json({
                success: false,
                message: 'Unsupported encryption algorithm'
            });
        }

        if (kdf_algorithm !== 'Argon2id') {
            return res.status(400).json({
                success: false,
                message: 'Unsupported key derivation algorithm'
            });
        }

        if (
            !kdf_parameters ||
            typeof kdf_parameters !== 'object' ||
            Array.isArray(kdf_parameters)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid KDF parameters'
            });
        }

        const { memoryCost, timeCost, parallelism } = kdf_parameters;

        if (
            !Number.isInteger(memoryCost) ||
            memoryCost < 19456 ||
            memoryCost > 262144 ||
            !Number.isInteger(timeCost) ||
            timeCost < 2 ||
            timeCost > 10 ||
            !Number.isInteger(parallelism) ||
            parallelism < 1 ||
            parallelism > 8
        ) {
            return res.status(400).json({
                success: false,
                message: 'KDF parameters are outside the allowed range'
            });
        }

        if (encryption_version !== 1) {
            return res.status(400).json({
                success: false,
                message: 'Unsupported encryption version'
            });
        }

        if (
            Buffer.from(vault_key_nonce, 'base64').length !== 12 ||
            Buffer.from(vault_key_auth_tag, 'base64').length !== 16 ||
            Buffer.from(recovery_nonce, 'base64').length !== 12 ||
            Buffer.from(recovery_auth_tag, 'base64').length !== 16
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid encryption nonce or authentication tag'
            });
        }

        if (
            Buffer.from(kdf_salt, 'base64').length !== 16 ||
            Buffer.from(recovery_kdf_salt, 'base64').length !== 16
        ) {
            return res.status(400).json({
                success: false,
                message: 'KDF salts must contain exactly 16 bytes'
            });
        }

        const result = await passwordManagerService.setupVault(
            req.user.userId,
            {
                encryption_algorithm,
                kdf_algorithm,
                kdf_salt,
                kdf_parameters,
                encrypted_vault_key,
                vault_key_nonce,
                vault_key_auth_tag,
                recovery_kdf_salt,
                recovery_wrapped_vault_key,
                recovery_nonce,
                recovery_auth_tag,
                encryption_version
            }
        );

        return res.status(201).json({
            success: true,
            message: result.message,
            data: {
                vaultInitialized: result.vaultInitialized
            }
        });
    } catch (error) {
        console.error('Setup vault error:', error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : 'Unable to initialize vault'
        });
    }
}

async function getCredentials(req, res) {
    try {
        const credentials = await passwordManagerService.getCredentials(
            req.user.userId
        );

        return res.status(200).json({
            success: true,
            message: 'Credentials retrieved successfully',
            data: credentials
        });
    } catch (error) {
        console.error('Get credentials error:', error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : 'Unable to retrieve credentials'
        });
    }
}

async function createCredential(req, res) {
    try {
        const {
            encrypted_payload,
            nonce,
            auth_tag,
            encryption_version
        } = req.body;

        if (
            !isBase64(encrypted_payload) ||
            !isBase64(nonce) ||
            !isBase64(auth_tag)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or missing encrypted credential data'
            });
        }

        if (Buffer.from(nonce, 'base64').length !== 12) {
            return res.status(400).json({
                success: false,
                message: 'AES-GCM nonce must contain exactly 12 bytes'
            });
        }

        if (Buffer.from(auth_tag, 'base64').length !== 16) {
            return res.status(400).json({
                success: false,
                message: 'AES-GCM authentication tag must contain exactly 16 bytes'
            });
        }

        if (encryption_version !== 1) {
            return res.status(400).json({
                success: false,
                message: 'Unsupported encryption version'
            });
        }

        const result = await passwordManagerService.createCredential(
            req.user.userId,
            {
                encrypted_payload,
                nonce,
                auth_tag,
                encryption_version
            }
        );

        return res.status(201).json({
            success: true,
            message: 'Credential saved successfully',
            data: {
                id: String(result.id),
                vault_id: String(result.vaultId),
                encryption_version: result.encryptionVersion
            }
        });
    } catch (error) {
        console.error('Create credential error:', error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : 'Unable to save credential'
        });
    }
}

async function deleteCredential(req, res) {
    try {
        const { id } = req.params;

        if (!/^[1-9]\d*$/.test(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid credential ID'
            });
        }

        const result = await passwordManagerService.deleteCredential(
            req.user.userId,
            id
        );

        return res.status(200).json({
            success: true,
            message: 'Credential deleted successfully',
            data: {
                id: String(result.id)
            }
        });

    } catch (error) {
        console.error('Delete credential error:', error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : 'Unable to delete credential'
        });
    }
}

module.exports = {
    getVaultStatus,
    setupVault,
    getCredentials,
    createCredential,
    deleteCredential
};
