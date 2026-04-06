// Exam controller — admin exam management + student submissions
// No enrollment, no grading — students see all active exams and submit files
const pool = require('../config/db');
const path = require('path');
const fs = require('fs');

// ════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ════════════════════════════════════════════════════════════

// GET /exams — list all exams
exports.listExams = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT e.*, u.username AS created_by_name,
        (SELECT COUNT(*) FROM exam_submissions WHERE exam_id = e.id) AS submission_count
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

// GET /exams/:id/submissions — view all submissions for an exam
exports.listSubmissions = async (req, res) => {
  try {
    const examId = req.params.id;

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

    return res.json({
      success: true,
      data: { exam: exams[0], submissions }
    });
  } catch (err) {
    console.error('List submissions error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch submissions' });
  }
};

// GET /exams/submissions/download/:id — download a submission file
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

// GET /exams/:id/submissions/export — export CSV
exports.exportCSV = async (req, res) => {
  try {
    const examId = req.params.id;

    const [exams] = await pool.execute('SELECT title FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const [rows] = await pool.execute(`
      SELECT u.username AS student, es.original_name AS file,
             es.submitted_at, es.size_bytes
      FROM exam_submissions es
      LEFT JOIN users u ON es.student_id = u.id
      WHERE es.exam_id = ?
      ORDER BY u.username
    `, [examId]);

    let csv = 'Student,File,Submitted At,Size\n';
    for (const r of rows) {
      csv += [
        r.student,
        `"${(r.file || '').replace(/"/g, '""')}"`,
        r.submitted_at,
        r.size_bytes
      ].join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=exam_${examId}_submissions.csv`);
    return res.send(csv);
  } catch (err) {
    console.error('Export CSV error:', err);
    return res.status(500).json({ success: false, message: 'Failed to export' });
  }
};

// GET /admin/students — list all student accounts
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

// GET /admin/exam-stats — exam overview for reports
exports.examStats = async (req, res) => {
  try {
    const [totalExams] = await pool.execute('SELECT COUNT(*) AS count FROM exams');
    const [activeExams] = await pool.execute("SELECT COUNT(*) AS count FROM exams WHERE status = 'active'");
    const [closedExams] = await pool.execute("SELECT COUNT(*) AS count FROM exams WHERE status = 'closed'");
    const [totalSubs] = await pool.execute('SELECT COUNT(*) AS count FROM exam_submissions');
    const [totalStudents] = await pool.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'student'");

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
        totalStudents: totalStudents[0].count,
        subsPerExam
      }
    });
  } catch (err) {
    console.error('Exam stats error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch exam stats' });
  }
};

// ════════════════════════════════════════════════════════════
// STUDENT ENDPOINTS
// ════════════════════════════════════════════════════════════

// GET /exams/student/list — all active exams visible to students
exports.studentExamList = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const [exams] = await pool.execute(`
      SELECT e.*,
        (SELECT COUNT(*) FROM exam_submissions sub WHERE sub.exam_id = e.id AND sub.student_id = ?) AS submitted,
        (SELECT sub.id FROM exam_submissions sub WHERE sub.exam_id = e.id AND sub.student_id = ? LIMIT 1) AS submission_id
      FROM exams e
      ORDER BY e.due_date ASC
    `, [userId, userId]);

    return res.json({ success: true, data: exams });
  } catch (err) {
    console.error('Student exam list error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch exams' });
  }
};

// GET /exams/student/:id — single exam detail
exports.studentExamDetail = async (req, res) => {
  try {
    const examId = req.params.id;
    const userId = req.session.user.id;

    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

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

// POST /exams/student/:id/submit — upload answer file
exports.submitAnswer = async (req, res) => {
  try {
    const examId = req.params.id;
    const userId = req.session.user.id;

    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const exam = exams[0];

    if (exam.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Exam is closed, submissions not accepted' });
    }

    if (new Date(exam.due_date) < new Date()) {
      return res.status(400).json({ success: false, message: 'Due date has passed' });
    }

    const [existing] = await pool.execute(
      'SELECT id FROM exam_submissions WHERE exam_id = ? AND student_id = ?',
      [examId, userId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'You have already submitted for this exam' });
    }

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

// GET /exams/student/history — student's own submissions
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
