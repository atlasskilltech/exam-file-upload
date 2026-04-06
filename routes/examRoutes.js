// Exam routes — admin exam management + student submissions
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, requireStudent } = require('../middleware/auth');
const ctrl = require('../controllers/examController');
const examUpload = require('../middleware/examUpload');

// All exam routes require authentication
router.use(requireAuth);

// ── Admin routes ──────────────────────────────────────────
router.get('/', requireAdmin, ctrl.listExams);
router.post('/create', requireAdmin, ctrl.createExam);
router.put('/update/:id', requireAdmin, ctrl.updateExam);
router.delete('/delete/:id', requireAdmin, ctrl.deleteExam);
router.post('/:id/status', requireAdmin, ctrl.changeStatus);
router.post('/:id/enroll', requireAdmin, ctrl.enrollStudents);
router.delete('/:id/unenroll/:sid', requireAdmin, ctrl.unenrollStudent);
router.get('/:id/submissions', requireAdmin, ctrl.listSubmissions);
router.get('/submissions/download/:id', ctrl.downloadSubmission);
router.post('/submissions/grade/:id', requireAdmin, ctrl.gradeSubmission);
router.post('/submissions/reject/:id', requireAdmin, ctrl.rejectSubmission);
router.get('/:id/submissions/export', requireAdmin, ctrl.exportCSV);

// Admin helper — list all students for enrollment
router.get('/admin/students', requireAdmin, ctrl.listStudents);

// Admin — exam stats for reports page
router.get('/admin/exam-stats', requireAdmin, ctrl.examStats);

// ── Student routes ────────────────────────────────────────
router.get('/student/list', requireStudent, ctrl.studentExamList);
router.get('/student/history', requireStudent, ctrl.studentHistory);
router.get('/student/:id', requireStudent, ctrl.studentExamDetail);
router.post('/student/:id/submit', requireStudent,
  examUpload.single('answer_file'), ctrl.submitAnswer);

module.exports = router;
