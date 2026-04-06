// Admin routes — user management, logs, reports
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// Multer for CSV upload (memory storage)
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// All admin routes require auth + admin role
router.use(requireAuth);
router.use(requireAdmin);

// GET /admin/users — list all users
router.get('/users', adminController.listUsers);

// POST /admin/users/add — create a new user
router.post('/users/add', adminController.addUser);

// POST /admin/users/upload — bulk upload students via CSV
router.post('/users/upload', csvUpload.single('csv_file'), adminController.bulkUploadStudents);

// DELETE /admin/users/:id — delete a user
router.delete('/users/:id', adminController.deleteUser);

// GET /admin/logs — activity log
router.get('/logs', adminController.getLogs);

// GET /admin/reports — analytics data
router.get('/reports', adminController.getReports);

module.exports = router;
