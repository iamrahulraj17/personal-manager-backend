require('dotenv').config();

const nodemailer = require('nodemailer');

async function testEmail() {
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });

        await transporter.verify();

        console.log('Gmail SMTP connection successful!');
    } catch (error) {
        console.error('Gmail SMTP error:', error.message);
    }
}

testEmail();
