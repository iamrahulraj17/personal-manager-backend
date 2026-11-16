const crypto = require('crypto');

function hashToken(token) {
    const secret = process.env.OTP_SECRET;

    if (!secret) {
        throw new Error('OTP_SECRET is not configured');
    }

    return crypto
        .createHmac('sha256', secret)
        .update(token)
        .digest('hex');
}

module.exports = hashToken;
