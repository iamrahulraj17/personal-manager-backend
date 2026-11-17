
const db = require('../../config/database');

function decodeBase64(value) {
    return Buffer.from(value, 'base64');
}

function encodeBase64(value) {
    return Buffer.isBuffer(value)
        ? value.toString('base64')
        : value;
}

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
        return { vaultInitialized: false };
    }

    const vault = rows[0];

    if (typeof vault.kdf_parameters === 'string') {
        vault.kdf_parameters = JSON.parse(vault.kdf_parameters);
    }

    const binaryFields = [
        'kdf_salt',
        'encrypted_vault_key',
        'vault_key_nonce',
        'vault_key_auth_tag',
        'recovery_kdf_salt',
        'recovery_wrapped_vault_key',
        'recovery_nonce',
        'recovery_auth_tag'
    ];

    for (const field of binaryFields) {
        vault[field] = encodeBase64(vault[field]);
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

        const [result] = await connection.execute(
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
                decodeBase64(kdf_salt),
                JSON.stringify(kdf_parameters),
                decodeBase64(encrypted_vault_key),
                decodeBase64(vault_key_nonce),
                decodeBase64(vault_key_auth_tag),
                decodeBase64(recovery_kdf_salt),
                decodeBase64(recovery_wrapped_vault_key),
                decodeBase64(recovery_nonce),
                decodeBase64(recovery_auth_tag),
                encryption_version
            ]
        );

        await connection.commit();
        transactionStarted = false;

        return {
            vaultInitialized: true,
            vaultId: result.insertId,
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

async function getCredentials(userId) {
    const [vaultRows] = await db.execute(
        `SELECT id
         FROM password_vaults
         WHERE user_id = ?
         LIMIT 1`,
        [userId]
    );

    if (vaultRows.length === 0) {
        const error = new Error('Password vault is not initialized');
        error.statusCode = 409;
        throw error;
    }

    const vaultId = vaultRows[0].id;

    const [rows] = await db.execute(
        `SELECT
            id,
            vault_id,
            encrypted_payload,
            nonce,
            auth_tag,
            encryption_version,
            created_at,
            updated_at
         FROM credentials
         WHERE user_id = ?
           AND vault_id = ?
         ORDER BY updated_at DESC`,
        [userId, vaultId]
    );

    return rows.map(credential => ({
        id: String(credential.id),
        vault_id: String(credential.vault_id),
        encrypted_payload: encodeBase64(credential.encrypted_payload),
        nonce: encodeBase64(credential.nonce),
        auth_tag: encodeBase64(credential.auth_tag),
        encryption_version: credential.encryption_version,
        created_at: credential.created_at,
        updated_at: credential.updated_at
    }));
}

async function createCredential(userId, data) {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Always resolve the vault using the authenticated user ID.
        const [vaultRows] = await connection.execute(
            `SELECT id
             FROM password_vaults
             WHERE user_id = ?
             LIMIT 1
             FOR UPDATE`,
            [userId]
        );

        if (vaultRows.length === 0) {
            const error = new Error('Password vault is not initialized');
            error.statusCode = 409;
            throw error;
        }

        const vaultId = vaultRows[0].id;

        const [result] = await connection.execute(
            `INSERT INTO credentials (
                user_id,
                vault_id,
                encrypted_payload,
                nonce,
                auth_tag,
                encryption_version
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
                userId,
                vaultId,
                decodeBase64(data.encrypted_payload),
                decodeBase64(data.nonce),
                decodeBase64(data.auth_tag),
                data.encryption_version
            ]
        );

        await connection.commit();

        return {
            id: result.insertId,
            vaultId,
            encryptionVersion: data.encryption_version
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function deleteCredential(userId, credentialId) {
    const [result] = await db.execute(
        `DELETE FROM credentials
         WHERE id = ?
           AND user_id = ?`,
        [credentialId, userId]
    );

    if (result.affectedRows === 0) {
        const error = new Error('Credential not found');
        error.statusCode = 404;
        throw error;
    }

    return {
        id: credentialId
    };
}

module.exports = {
    getVaultStatus,
    setupVault,
    getCredentials,
    createCredential,
    deleteCredential
};
