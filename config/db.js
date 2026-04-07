// MySQL connection pool configuration — sized for 500+ concurrent students
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'localvault_db',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_SIZE) || 100,
  queueLimit: 500,
  timezone: '+05:30', // IST
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

module.exports = pool;
