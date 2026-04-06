// Auth routes — login, logout, session check
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST /auth/login — admin/user login with username + password
router.post('/login', authController.login);

// POST /auth/student-login — student login with app_id only
router.post('/student-login', authController.studentLogin);

// GET /auth/logout — destroy session
router.get('/logout', authController.logout);

// GET /auth/check — check if session is active (used by frontend)
router.get('/check', authController.check);

module.exports = router;
