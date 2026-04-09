// Exam routes — admin exam management + student submissions
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, requireStudent } = require('../middleware/auth');
const ctrl = require('../controllers/examController');
const examUpload = require('../middleware/examUpload');

router.use(requireAuth);

// ── Admin routes ──────────────────────────────────────────
router.get('/', requireAdmin, ctrl.listExams);
router.post('/create', requireAdmin, ctrl.createExam);
router.put('/update/:id', requireAdmin, ctrl.updateExam);
router.delete('/delete/:id', requireAdmin, ctrl.deleteExam);
router.post('/:id/status', requireAdmin, ctrl.changeStatus);

// Slot management
router.get('/:id/slots', requireAdmin, ctrl.getSlots);
router.post('/:id/slots', requireAdmin, ctrl.addSlot);
router.delete('/slots/:slotId', requireAdmin, ctrl.deleteSlot);

// Question paper management (admin)
router.post('/:id/question-papers', requireAdmin,
  examUpload.single('question_paper'), ctrl.uploadQuestionPaper);
router.get('/:id/question-papers', requireAdmin, ctrl.listQuestionPapers);
router.delete('/question-papers/:id', requireAdmin, ctrl.deleteQuestionPaper);

// Question paper download (admin + students)
router.get('/question-papers/download/:id', ctrl.downloadQuestionPaper);

// Student assignment management (admin)
router.get('/:id/assigned-students', requireAdmin, ctrl.getAssignedStudents);
router.post('/:id/assign-students', requireAdmin, ctrl.assignStudents);
router.post('/:id/assign-students-csv', requireAdmin,
  examUpload.single('csv_file'), ctrl.assignStudentsCSV);
router.delete('/:id/unassign-student/:studentId', requireAdmin, ctrl.unassignStudent);

// Submissions
router.get('/:id/submissions', requireAdmin, ctrl.listSubmissions);
router.get('/submissions/download/:id', ctrl.downloadSubmission);
router.get('/:id/submissions/export', requireAdmin, ctrl.exportCSV);
router.get('/:id/submissions/download-zip', requireAdmin, ctrl.downloadAllSubmissionsZip);

// Admin helpers
router.get('/admin/students', requireAdmin, ctrl.listStudents);
router.get('/admin/exam-stats', requireAdmin, ctrl.examStats);

// ── Student routes ────────────────────────────────────────
router.get('/student/list', requireStudent, ctrl.studentExamList);
router.get('/student/history', requireStudent, ctrl.studentHistory);
router.get('/student/:id', requireStudent, ctrl.studentExamDetail);
router.post('/student/:id/submit', requireStudent,
  examUpload.single('answer_file'), ctrl.submitAnswer);

module.exports = router;
