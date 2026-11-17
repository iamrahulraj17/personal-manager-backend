
const passwordManagerService = require('./password-manager.service');

function isBase64(value) {
    if (typeof value !== 'string' || value.length === 0) {
        return false;
    }

    return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
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

        const {
            memoryCost,
            timeCost,
            parallelism
        } = kdf_parameters;

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

        // AES-GCM requires a 12-byte nonce and 16-byte authentication tag.
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
            Buffer.from(kdf_salt, 'base64').length < 16 ||
            Buffer.from(recovery_kdf_salt, 'base64').length < 16
        ) {
            return res.status(400).json({
                success: false,
                message: 'KDF salts must contain at least 16 bytes'
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
        console.error('Setup vault error:', error.message);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : 'Unable to initialize vault'
        });
    }
}

module.exports = {
    getVaultStatus,
    setupVault
};
