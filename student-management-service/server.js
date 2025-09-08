require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const client = require('prom-client'); // Prometheus client

const app = express();
const PORT = process.env.PORT || 3001;

// ----------------- Prometheus Metrics -----------------
client.collectDefaultMetrics(); // Collect default Node.js metrics

// Create a custom counter example
const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status']
});

// Middleware to count requests
app.use((req, res, next) => {
    res.on('finish', () => {
        httpRequestsTotal.inc({ method: req.method, route: req.path, status: res.statusCode });
    });
    next();
});

// /metrics endpoint
app.get('/metrics', (req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(client.register.metrics());
});
// ------------------------------------------------------

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'mysql',
    port: process.env.DB_PORT || 3306,
    user: process.env.MYSQL_USER || 'attendance_user',
    password: process.env.MYSQL_PASSWORD || 'attendance_pass',
    database: process.env.MYSQL_NAME || 'attendancemsystem',
    charset: 'utf8mb4',
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
};

let pool;
try {
    pool = mysql.createPool(dbConfig);
    console.log('Database pool created successfully');
} catch (error) {
    console.error('Failed to create database pool:', error);
    process.exit(1);
}

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') : 
    ['http://localhost', 'http://localhost:80', 'http://student-attendance.local'];

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ----------------- REST APIs -----------------
// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'Student Management Service',
        database: dbConfig.database,
        timestamp: new Date().toISOString()
    });
});

// Test DB
app.get('/api/test-db', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [tables] = await connection.execute('SHOW TABLES');
        connection.release();
        res.json({ success: true, tables, database: dbConfig.database });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Students API (GET, POST, PUT, DELETE, search)
// ... keep your existing logic here ...

// ----------------- Error & 404 Handling -----------------
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong' });
});

app.use('*', (req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// ----------------- Start Server -----------------
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Student Management Service running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        if (pool) pool.end();
        process.exit(0);
    });
});

module.exports = app;

