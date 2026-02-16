const mysql = require("mysql2");

// Connection pool — handles concurrent queries without bottleneck
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "dj_saas",
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

// Verify connectivity on startup
pool.getConnection((err, conn) => {
  if (err) {
    console.error("MySQL pool failed:", err.message);
    console.log("Running in demo mode (no database)");
  } else {
    console.log("MySQL pool connected (20 connections)");
    conn.release();
  }
});

// Export pool — it has the same .query() API as a single connection
module.exports = pool;
