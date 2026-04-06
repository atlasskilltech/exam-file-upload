// Exam controller — admin exam management + student submissions
const pool = require('../config/db');
const path = require('path');
const fs = require('fs');
const calcGrade = require('../utils/gradeCalc');

// ════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ════════════════════════════════════════════════════════════

// GET /exams — list all exams
exports.listExams = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT e.*, u.username AS created_by_name,
        (SELECT COUNT(*) FROM exam_submissions WHERE exam_id = e.id) AS submission_count,
        (SELECT COUNT(*) FROM exam_students WHERE exam_id = e.id) AS enrolled_count
      FROM exams e
      LEFT JOIN users u ON e.created_by = u.id
      ORDER BY e.created_at DESC
    `);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List exams error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch exams' });
  }
};

// POST /exams/create
exports.createExam = async (req, res) => {
  try {
    const { title, subject, due_date, room } = req.body;
    const user = req.session.user;

    if (!title || !subject || !due_date) {
      return res.status(400).json({ success: false, message: 'Title, subject, and due date are required' });
    }

    // Due date must be in the future
    if (new Date(due_date) <= new Date()) {
      return res.status(400).json({ success: false, message: 'Due date must be in the future' });
    }

    const [result] = await pool.execute(
      'INSERT INTO exams (title, subject, due_date, room, created_by) VALUES (?, ?, ?, ?, ?)',
      [title.trim(), subject.trim(), due_date, room || null, user.id]
    );

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [user.id, 'created exam', title.trim()]
    );

    return res.json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    console.error('Create exam error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create exam' });
  }
};

// PUT /exams/update/:id
exports.updateExam = async (req, res) => {
  try {
    const { title, subject, due_date, room } = req.body;
    const examId = req.params.id;

    if (!title || !subject || !due_date) {
      return res.status(400).json({ success: false, message: 'Title, subject, and due date are required' });
    }

    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    await pool.execute(
      'UPDATE exams SET title = ?, subject = ?, due_date = ?, room = ? WHERE id = ?',
      [title.trim(), subject.trim(), due_date, room || null, examId]
    );

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [req.session.user.id, 'updated exam', title.trim()]
    );

    return res.json({ success: true, message: 'Exam updated' });
  } catch (err) {
    console.error('Update exam error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update exam' });
  }
};

// DELETE /exams/delete/:id
exports.deleteExam = async (req, res) => {
  try {
    const examId = req.params.id;

    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    // Delete files from disk
    const examDir = path.join(__dirname, '..', 'uploads', 'exam_submissions', `exam_${examId}`);
    if (fs.existsSync(examDir)) {
      fs.rmSync(examDir, { recursive: true, force: true });
    }

    // CASCADE handles submissions + enrollment
    await pool.execute('DELETE FROM exams WHERE id = ?', [examId]);

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [req.session.user.id, 'deleted exam', exams[0].title]
    );

    return res.json({ success: true, message: 'Exam deleted' });
  } catch (err) {
    console.error('Delete exam error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete exam' });
  }
};

// POST /exams/:id/status
exports.changeStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const examId = req.params.id;

    if (!['active', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be active or closed' });
    }

    await pool.execute('UPDATE exams SET status = ? WHERE id = ?', [status, examId]);

    return res.json({ success: true, message: `Exam ${status}` });
  } catch (err) {
    console.error('Change status error:', err);
    return res.status(500).json({ success: false, message: 'Failed to change status' });
  }
};

// POST /exams/:id/enroll
exports.enrollStudents = async (req, res) => {
  try {
    const examId = req.params.id;
    const { student_ids } = req.body;

    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Provide an array of student IDs' });
    }

    // Validate all IDs are students
    const placeholders = student_ids.map(() => '?').join(',');
    const [students] = await pool.execute(
      `SELECT id FROM users WHERE id IN (${placeholders}) AND role = 'student'`,
      student_ids
    );

    const validIds = students.map(s => s.id);
    let enrolled = 0;

    for (const sid of validIds) {
      try {
        await pool.execute(
          'INSERT IGNORE INTO exam_students (exam_id, student_id) VALUES (?, ?)',
          [examId, sid]
        );
        enrolled++;
      } catch { /* duplicate, skip */ }
    }

    return res.json({ success: true, data: { enrolled } });
  } catch (err) {
    console.error('Enroll error:', err);
    return res.status(500).json({ success: false, message: 'Failed to enroll students' });
  }
};

// DELETE /exams/:id/unenroll/:sid
exports.unenrollStudent = async (req, res) => {
  try {
    const { id, sid } = req.params;
    await pool.execute(
      'DELETE FROM exam_students WHERE exam_id = ? AND student_id = ?',
      [id, sid]
    );
    return res.json({ success: true, message: 'Student unenrolled' });
  } catch (err) {
    console.error('Unenroll error:', err);
    return res.status(500).json({ success: false, message: 'Failed to unenroll student' });
  }
};

// GET /exams/:id/submissions
exports.listSubmissions = async (req, res) => {
  try {
    const examId = req.params.id;

    // Get exam info
    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const [submissions] = await pool.execute(`
      SELECT es.*, u.username AS student_name
      FROM exam_submissions es
      LEFT JOIN users u ON es.student_id = u.id
      WHERE es.exam_id = ?
      ORDER BY es.submitted_at DESC
    `, [examId]);

    // Get enrolled students
    const [enrolled] = await pool.execute(`
      SELECT es.student_id, u.username
      FROM exam_students es
      LEFT JOIN users u ON es.student_id = u.id
      WHERE es.exam_id = ?
    `, [examId]);

    return res.json({
      success: true,
      data: { exam: exams[0], submissions, enrolled }
    });
  } catch (err) {
    console.error('List submissions error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch submissions' });
  }
};

// GET /exams/submissions/download/:id
exports.downloadSubmission = async (req, res) => {
  try {
    const subId = req.params.id;
    const user = req.session.user;

    let query = 'SELECT es.*, e.title AS exam_title FROM exam_submissions es LEFT JOIN exams e ON es.exam_id = e.id WHERE es.id = ?';
    const params = [subId];

    // Students can only download their own
    if (user.role === 'student') {
      query += ' AND es.student_id = ?';
      params.push(user.id);
    }

    const [rows] = await pool.execute(query, params);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const sub = rows[0];
    const filePath = path.join(
      __dirname, '..', 'uploads', 'exam_submissions',
      `exam_${sub.exam_id}`, `student_${sub.student_id}`, sub.stored_name
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on disk' });
    }

    res.download(filePath, sub.original_name);
  } catch (err) {
    console.error('Download submission error:', err);
    return res.status(500).json({ success: false, message: 'Download failed' });
  }
};

// POST /exams/submissions/grade/:id
exports.gradeSubmission = async (req, res) => {
  try {
    const subId = req.params.id;
    const { marks_obtained, remarks } = req.body;

    if (marks_obtained === undefined || marks_obtained === null) {
      return res.status(400).json({ success: false, message: 'Marks are required' });
    }

    const [subs] = await pool.execute(
      'SELECT es.*, e.title FROM exam_submissions es LEFT JOIN exams e ON es.exam_id = e.id WHERE es.id = ?',
      [subId]
    );
    if (subs.length === 0) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const marks = parseInt(marks_obtained);
    // Auto-calculate grade (assume 100 as max if no total defined)
    const grade = calcGrade(marks, 100);

    await pool.execute(
      `UPDATE exam_submissions SET marks_obtained = ?, grade = ?, remarks = ?,
       status = 'graded', graded_at = NOW(), graded_by = ? WHERE id = ?`,
      [marks, grade, remarks || null, req.session.user.id, subId]
    );

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [req.session.user.id, 'graded submission', subs[0].title + ' - ' + subs[0].original_name]
    );

    return res.json({ success: true, data: { marks, grade } });
  } catch (err) {
    console.error('Grade submission error:', err);
    return res.status(500).json({ success: false, message: 'Failed to grade submission' });
  }
};

// POST /exams/submissions/reject/:id
exports.rejectSubmission = async (req, res) => {
  try {
    const subId = req.params.id;
    const { remarks } = req.body;

    const [subs] = await pool.execute('SELECT * FROM exam_submissions WHERE id = ?', [subId]);
    if (subs.length === 0) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    await pool.execute(
      "UPDATE exam_submissions SET status = 'rejected', remarks = ? WHERE id = ?",
      [remarks || 'Rejected', subId]
    );

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [req.session.user.id, 'rejected submission', subs[0].original_name]
    );

    return res.json({ success: true, message: 'Submission rejected' });
  } catch (err) {
    console.error('Reject submission error:', err);
    return res.status(500).json({ success: false, message: 'Failed to reject submission' });
  }
};

// GET /exams/:id/submissions/export
exports.exportCSV = async (req, res) => {
  try {
    const examId = req.params.id;

    const [exams] = await pool.execute('SELECT title FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const [rows] = await pool.execute(`
      SELECT u.username AS student, es.original_name AS file,
             es.submitted_at, es.status, es.marks_obtained, es.grade, es.remarks
      FROM exam_submissions es
      LEFT JOIN users u ON es.student_id = u.id
      WHERE es.exam_id = ?
      ORDER BY u.username
    `, [examId]);

    // Build CSV
    let csv = 'Student,File,Submitted At,Status,Marks,Grade,Remarks\n';
    for (const r of rows) {
      csv += [
        r.student,
        `"${(r.file || '').replace(/"/g, '""')}"`,
        r.submitted_at,
        r.status,
        r.marks_obtained || '',
        r.grade || '',
        `"${(r.remarks || '').replace(/"/g, '""')}"`
      ].join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=exam_${examId}_results.csv`);
    return res.send(csv);
  } catch (err) {
    console.error('Export CSV error:', err);
    return res.status(500).json({ success: false, message: 'Failed to export' });
  }
};

// GET /admin/students — list all students (for enrollment UI)
exports.listStudents = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, username, created_at FROM users WHERE role = 'student' ORDER BY username"
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List students error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch students' });
  }
};

// ════════════════════════════════════════════════════════════
// STUDENT ENDPOINTS
// ════════════════════════════════════════════════════════════

// GET /exams/student/list — exams assigned to this student
exports.studentExamList = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const [exams] = await pool.execute(`
      SELECT e.*, es_enroll.enrolled_at,
        (SELECT COUNT(*) FROM exam_submissions sub WHERE sub.exam_id = e.id AND sub.student_id = ?) AS submitted,
        (SELECT sub.status FROM exam_submissions sub WHERE sub.exam_id = e.id AND sub.student_id = ? LIMIT 1) AS submission_status,
        (SELECT sub.marks_obtained FROM exam_submissions sub WHERE sub.exam_id = e.id AND sub.student_id = ? LIMIT 1) AS marks_obtained,
        (SELECT sub.grade FROM exam_submissions sub WHERE sub.exam_id = e.id AND sub.student_id = ? LIMIT 1) AS grade,
        (SELECT sub.remarks FROM exam_submissions sub WHERE sub.exam_id = e.id AND sub.student_id = ? LIMIT 1) AS remarks,
        (SELECT sub.id FROM exam_submissions sub WHERE sub.exam_id = e.id AND sub.student_id = ? LIMIT 1) AS submission_id
      FROM exams e
      INNER JOIN exam_students es_enroll ON e.id = es_enroll.exam_id
      WHERE es_enroll.student_id = ?
      ORDER BY e.due_date ASC
    `, [userId, userId, userId, userId, userId, userId, userId]);

    return res.json({ success: true, data: exams });
  } catch (err) {
    console.error('Student exam list error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch exams' });
  }
};

// GET /exams/student/:id — single exam detail for student
exports.studentExamDetail = async (req, res) => {
  try {
    const examId = req.params.id;
    const userId = req.session.user.id;

    // Verify enrollment
    const [enrolled] = await pool.execute(
      'SELECT * FROM exam_students WHERE exam_id = ? AND student_id = ?',
      [examId, userId]
    );
    if (enrolled.length === 0) {
      return res.status(403).json({ success: false, message: 'You are not enrolled in this exam' });
    }

    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    // Get student's submission if exists
    const [subs] = await pool.execute(
      'SELECT * FROM exam_submissions WHERE exam_id = ? AND student_id = ?',
      [examId, userId]
    );

    return res.json({
      success: true,
      data: { exam: exams[0], submission: subs[0] || null }
    });
  } catch (err) {
    console.error('Student exam detail error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch exam' });
  }
};

// POST /exams/student/:id/submit — upload answer
exports.submitAnswer = async (req, res) => {
  try {
    const examId = req.params.id;
    const userId = req.session.user.id;

    // Check exam exists
    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const exam = exams[0];

    // Check exam is active
    if (exam.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Exam is closed, submissions not accepted' });
    }

    // Check enrollment
    const [enrolled] = await pool.execute(
      'SELECT * FROM exam_students WHERE exam_id = ? AND student_id = ?',
      [examId, userId]
    );
    if (enrolled.length === 0) {
      return res.status(403).json({ success: false, message: 'You are not enrolled in this exam' });
    }

    // Check due date
    if (new Date(exam.due_date) < new Date()) {
      return res.status(400).json({ success: false, message: 'Due date has passed' });
    }

    // Check no existing submission
    const [existing] = await pool.execute(
      'SELECT id FROM exam_submissions WHERE exam_id = ? AND student_id = ?',
      [examId, userId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'You have already submitted for this exam' });
    }

    // File should be uploaded by multer
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const file = req.file;
    const [result] = await pool.execute(
      `INSERT INTO exam_submissions (exam_id, student_id, original_name, stored_name, mime_type, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [examId, userId, file.originalname, file.filename, file.mimetype, file.size]
    );

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [userId, 'submitted exam answer', exam.title + ' - ' + file.originalname]
    );

    return res.json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    console.error('Submit answer error:', err);
    return res.status(500).json({ success: false, message: 'Submission failed' });
  }
};

// GET /exams/student/history — all submissions by this student
exports.studentHistory = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const [rows] = await pool.execute(`
      SELECT es.*, e.title AS exam_title, e.subject AS exam_subject
      FROM exam_submissions es
      LEFT JOIN exams e ON es.exam_id = e.id
      WHERE es.student_id = ?
      ORDER BY es.submitted_at DESC
    `, [userId]);

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Student history error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
};

// GET /admin/exam-stats — exam overview for reports
exports.examStats = async (req, res) => {
  try {
    const [totalExams] = await pool.execute('SELECT COUNT(*) AS count FROM exams');
    const [activeExams] = await pool.execute("SELECT COUNT(*) AS count FROM exams WHERE status = 'active'");
    const [closedExams] = await pool.execute("SELECT COUNT(*) AS count FROM exams WHERE status = 'closed'");
    const [totalSubs] = await pool.execute('SELECT COUNT(*) AS count FROM exam_submissions');
    const [totalEnrolled] = await pool.execute('SELECT COUNT(*) AS count FROM exam_students');
    const [gradedSubs] = await pool.execute("SELECT COUNT(*) AS count FROM exam_submissions WHERE status = 'graded'");
    const [pendingSubs] = await pool.execute("SELECT COUNT(*) AS count FROM exam_submissions WHERE status = 'submitted'");
    const [rejectedSubs] = await pool.execute("SELECT COUNT(*) AS count FROM exam_submissions WHERE status = 'rejected'");

    // Submissions per exam
    const [subsPerExam] = await pool.execute(`
      SELECT e.title, COUNT(es.id) AS count
      FROM exams e LEFT JOIN exam_submissions es ON e.id = es.exam_id
      GROUP BY e.id ORDER BY count DESC LIMIT 10
    `);

    return res.json({
      success: true,
      data: {
        totalExams: totalExams[0].count,
        activeExams: activeExams[0].count,
        closedExams: closedExams[0].count,
        totalSubmissions: totalSubs[0].count,
        totalEnrolled: totalEnrolled[0].count,
        gradedSubmissions: gradedSubs[0].count,
        pendingSubmissions: pendingSubs[0].count,
        rejectedSubmissions: rejectedSubs[0].count,
        submissionRate: totalEnrolled[0].count > 0
          ? Math.round((totalSubs[0].count / totalEnrolled[0].count) * 100)
          : 0,
        subsPerExam
      }
    });
  } catch (err) {
    console.error('Exam stats error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch exam stats' });
  }
};
