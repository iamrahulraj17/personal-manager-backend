
const db = require('../../config/database');

async function getVaultStatus(userId) {
    const [rows] = await db.execute(
        `SELECT
            id,
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
            encryption_version,
            created_at
         FROM password_vaults
         WHERE user_id = ?
         LIMIT 1`,
        [userId]
    );

    if (rows.length === 0) {
        return {
            vaultInitialized: false
        };
    }

    const vault = rows[0];

    // Ensure KDF parameters are returned as an object.
    // MySQL JSON columns may already be parsed by mysql2.
    if (typeof vault.kdf_parameters === 'string') {
        vault.kdf_parameters = JSON.parse(vault.kdf_parameters);
    }

    return {
        vaultInitialized: true,
        vault
    };
}

async function setupVault(userId, data) {
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
    } = data;

    const connection = await db.getConnection();
    let transactionStarted = false;

    try {
        await connection.beginTransaction();
        transactionStarted = true;

        const [existing] = await connection.execute(
            `SELECT id
             FROM password_vaults
             WHERE user_id = ?
             LIMIT 1
             FOR UPDATE`,
            [userId]
        );

        if (existing.length > 0) {
            const error = new Error('Vault is already initialized');
            error.statusCode = 409;
            throw error;
        }

        await connection.execute(
            `INSERT INTO password_vaults (
                user_id,
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                encryption_algorithm,
                kdf_algorithm,
                kdf_salt,
                JSON.stringify(kdf_parameters),
                encrypted_vault_key,
                vault_key_nonce,
                vault_key_auth_tag,
                recovery_kdf_salt,
                recovery_wrapped_vault_key,
                recovery_nonce,
                recovery_auth_tag,
                encryption_version
            ]
        );

        await connection.commit();
        transactionStarted = false;

        return {
            vaultInitialized: true,
            message: 'Vault initialized successfully'
        };

    } catch (error) {
        if (transactionStarted) {
            await connection.rollback();
        }

        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    getVaultStatus,
    setupVault
};
