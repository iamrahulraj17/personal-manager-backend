const express = require('express');
const cors = require('cors');

const app = express();
const authRoutes = require('./modules/auth/auth.routes');
const profileRoutes = require('./modules/profile/profile.routes');
const passwordManagerRoutes = require('./modules/password-manager/password-manager.routes');

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/password-manager', passwordManagerRoutes);
// Health check API
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Personal Manager API is running',
        environment: process.env.NODE_ENV
    });
});

module.exports = app;
