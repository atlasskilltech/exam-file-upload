-- ================================================================
-- LocalVault — Database Setup Script
-- Run: mysql -u root < setup.sql
-- ================================================================

CREATE DATABASE IF NOT EXISTS localvault_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE localvault_db;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  created_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Uploaded files table
CREATE TABLE IF NOT EXISTS uploaded_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  size_bytes BIGINT,
  category_id INT,
  uploaded_by INT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Activity log table
CREATE TABLE IF NOT EXISTS activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(255),
  target VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Seed admin user (password: admin123)
-- Seed student user (password: student123)
-- bcrypt hashes generated with 10 salt rounds
INSERT INTO users (username, password, role) VALUES
  ('admin', '$2a$10$oLdXBvIP4ZsnNDMArFcLyO1RD0q9eu1ITezMl52FW5UVZ5h3W7acS', 'admin'),
  ('student', '$2a$10$mk4YPTeFKE3DDpmG8k/D1.4DdFMTshV4x8C7G3JLnXEbfwG92ZqeG', 'user')
ON DUPLICATE KEY UPDATE username = username;
