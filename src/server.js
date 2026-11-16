require('dotenv').config();

const app = require('./app');
const db = require('./config/database');

const PORT = process.env.PORT || 5000;

// Verify database connection before starting server
async function startServer() {
    try {
        const connection = await db.getConnection();

        console.log('MySQL Database connected successfully!');

        connection.release();

        app.get('/api/health/db', async (req, res) => {
            try {
                const [rows] = await db.query('SELECT 1 AS database_connected');

                res.status(200).json({
                    success: true,
                    message: 'Database connection successful',
                    database: process.env.DB_NAME,
                    result: rows[0]
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    message: 'Database connection failed'
                });
            }
        });

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('Failed to connect to MySQL:', error.message);
        process.exit(1);
    }
}

startServer();
