// Session-based authentication guard middleware

// Protect routes — redirects to login if no session
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  // API requests get JSON response, page requests get redirect
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  return res.redirect('/');
}

// Admin-only middleware — must be used after requireAuth
function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  return res.redirect('/dashboard.html');
}

module.exports = { requireAuth, requireAdmin };
