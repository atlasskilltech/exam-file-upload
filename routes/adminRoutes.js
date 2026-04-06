// Admin routes — user management, logs, reports
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// All admin routes require auth + admin role
router.use(requireAuth);
router.use(requireAdmin);

// GET /admin/users — list all users
router.get('/users', adminController.listUsers);

// POST /admin/users/add — create a new user
router.post('/users/add', adminController.addUser);

// DELETE /admin/users/:id — delete a user
router.delete('/users/:id', adminController.deleteUser);

// GET /admin/logs — activity log
router.get('/logs', adminController.getLogs);

// GET /admin/reports — analytics data
router.get('/reports', adminController.getReports);

module.exports = router;
