-- ================================================================
-- LocalVault — Database Setup Script
-- Run: mysql -u root < setup.sql
-- ================================================================

CREATE DATABASE IF NOT EXISTS localvault_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE localvault_db;

-- Set timezone to IST
SET GLOBAL time_zone = '+05:30';
SET time_zone = '+05:30';

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) DEFAULT NULL,
  app_id   VARCHAR(50) UNIQUE DEFAULT NULL,
  role ENUM('admin', 'user', 'student') DEFAULT 'user',
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

-- Exams table (basic info only, scheduling in exam_slots)
CREATE TABLE IF NOT EXISTS exams (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  title        VARCHAR(255) NOT NULL,
  subject      VARCHAR(150) NOT NULL,
  status       ENUM('active','closed') DEFAULT 'active',
  pin_secret   VARCHAR(64) DEFAULT NULL,
  created_by   INT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Add pin_secret column to existing exams tables (idempotent)
SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'pin_secret');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE exams ADD COLUMN pin_secret VARCHAR(64) DEFAULT NULL AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Exam slots — multiple time slots per exam (same room, different times)
CREATE TABLE IF NOT EXISTS exam_slots (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  exam_id      INT NOT NULL,
  slot_date    DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  room         VARCHAR(100) NOT NULL,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

-- Exam submissions table
CREATE TABLE IF NOT EXISTS exam_submissions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  exam_id        INT NOT NULL,
  student_id     INT NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  stored_name    VARCHAR(255) NOT NULL,
  folder_name    VARCHAR(500) DEFAULT NULL,
  mime_type      VARCHAR(100),
  size_bytes     BIGINT,
  submitted_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id)    REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Question papers uploaded by admin for each exam
CREATE TABLE IF NOT EXISTS exam_question_papers (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  exam_id        INT NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  stored_name    VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(100),
  size_bytes     BIGINT,
  uploaded_by    INT,
  uploaded_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id)     REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Student-exam assignment (which students are assigned to which exams)
CREATE TABLE IF NOT EXISTS exam_students (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  exam_id     INT NOT NULL,
  student_id  INT NOT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id)    REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_exam_student (exam_id, student_id)
);

-- ── Performance indexes for 500+ concurrent students ──────
-- Exam slots: fast lookup by exam + time window
CREATE INDEX IF NOT EXISTS idx_exam_slots_exam_date ON exam_slots(exam_id, slot_date, start_time, end_time);

-- Exam submissions: fast lookup by exam+student
CREATE INDEX IF NOT EXISTS idx_exam_subs_exam_student ON exam_submissions(exam_id, student_id);

-- Exam students: fast assignment lookups
CREATE INDEX IF NOT EXISTS idx_exam_students_exam ON exam_students(exam_id, student_id);
CREATE INDEX IF NOT EXISTS idx_exam_students_student ON exam_students(student_id, exam_id);

-- Question papers: fast lookup by exam
CREATE INDEX IF NOT EXISTS idx_exam_qp_exam ON exam_question_papers(exam_id);

-- Activity log: fast recent lookups
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id, created_at);

-- Users: fast student lookup by app_id
CREATE INDEX IF NOT EXISTS idx_users_app_id ON users(app_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Exams: fast status filter
CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);

-- Seed users
-- admin login: username=admin, password=admin123
-- students login with app_id only (no password needed)
INSERT INTO users (username, password, app_id, role) VALUES
  ('admin', '$2a$10$oLdXBvIP4ZsnNDMArFcLyO1RD0q9eu1ITezMl52FW5UVZ5h3W7acS', NULL, 'admin'),
  ('Student One', NULL, 'STU001', 'student'),
  ('Student Two', NULL, 'STU002', 'student'),
  ('asha.uchil@atlasuniversity.edu.in', '$2a$10$.ziXZawLY2RvobYoychzieFVsGbXvMNbLmk4uM/wX7xw3VULCU1Q.', NULL, 'admin'),
  ('dhanashree.mane@atlasuniversity.edu.in', '$2a$10$.ziXZawLY2RvobYoychzieFVsGbXvMNbLmk4uM/wX7xw3VULCU1Q.', NULL, 'admin'),
  ('hemal.thakker@atlasuniversity.edu.in', '$2a$10$.ziXZawLY2RvobYoychzieFVsGbXvMNbLmk4uM/wX7xw3VULCU1Q.', NULL, 'admin')
ON DUPLICATE KEY UPDATE username = username;
