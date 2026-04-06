// ================================================================
// LocalVault — Global Frontend JavaScript
// ================================================================

// ── Session check — runs on every page except login ───────────
async function checkAuth() {
  try {
    const res = await fetch('/auth/check');
    if (!res.ok) {
      window.location.href = '/';
      return null;
    }
    const data = await res.json();
    return data.data; // { id, username, role }
  } catch {
    window.location.href = '/';
    return null;
  }
}

// ── Init sidebar with user info ───────────────────────────────
function initSidebar(user) {
  // Set username and role
  const usernameEl = document.querySelector('.sidebar-user .username');
  const roleEl = document.querySelector('.sidebar-user .role');
  if (usernameEl) usernameEl.textContent = user.username;
  if (roleEl) roleEl.textContent = user.role;

  // Show role-specific links
  if (user.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('show'));
  }
  if (user.role === 'student') {
    document.querySelectorAll('.student-only').forEach(el => el.classList.add('show'));
    // Hide non-student items
    document.querySelectorAll('.hide-student').forEach(el => el.style.display = 'none');
  }

  // Highlight active nav link
  const currentPage = window.location.pathname.replace('/', '').replace('.html', '') || 'dashboard';
  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    const href = link.getAttribute('href').replace('/', '').replace('.html', '');
    if (href === currentPage) {
      link.classList.add('active');
    }
  });

  // Logout button
  const logoutBtn = document.querySelector('.logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/auth/logout');
      window.location.href = '/';
    });
  }
}

// ── Toast notification system ─────────────────────────────────
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Confirm dialog ────────────────────────────────────────────
function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal">
        <h3>Confirm Action</h3>
        <p>${message}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="confirmCancel">Cancel</button>
          <button class="btn btn-danger" id="confirmOk">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#confirmOk').onclick = () => {
      overlay.remove();
      resolve(true);
    };
    overlay.querySelector('#confirmCancel').onclick = () => {
      overlay.remove();
      resolve(false);
    };
  });
}

// ── Format file size ──────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

// ── Format date ───────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ── Sidebar HTML template ─────────────────────────────────────
function getSidebarHTML() {
  return `
    <aside class="sidebar">
      <div class="sidebar-logo">LocalVault</div>
      <nav class="sidebar-nav">
        <a href="/dashboard.html"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-4h3v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.354 1.146z"/></svg> <span>Dashboard</span></a>
        <a href="/upload.html" class="hide-student"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/></svg> <span>Upload Files</span></a>
        <a href="/files.html" class="hide-student"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H4zm0 1h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/></svg> <span>My Files</span></a>
        <a href="/categories.html" class="hide-student"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3H13.5a2 2 0 0 1 2 2v1H.5v.5a.5.5 0 0 1-1 0V4.5a.5.5 0 0 1 .04-.13zM1.5 14a1 1 0 0 1-1-1V7h13v6a1 1 0 0 1-1 1h-11z"/></svg> <span>Categories</span></a>
        <a href="/exams.html" class="admin-only"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 0a.5.5 0 0 1 .5.5V2h4V.5a.5.5 0 0 1 1 0V2h1a2 2 0 0 1 2 2v1H2V4a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM2 7v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H2zm6.5 1a.5.5 0 0 1 .5.5v3.793l1.146-1.147a.5.5 0 0 1 .708.708l-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L8 12.293V8.5a.5.5 0 0 1 .5-.5z"/></svg> <span>Exam Manager</span></a>
        <a href="/student-exams.html" class="student-only"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 0a.5.5 0 0 1 .5.5V2h4V.5a.5.5 0 0 1 1 0V2h1a2 2 0 0 1 2 2v1H2V4a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM2 7v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H2zm6.5 1a.5.5 0 0 1 .5.5v3.793l1.146-1.147a.5.5 0 0 1 .708.708l-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L8 12.293V8.5a.5.5 0 0 1 .5-.5z"/></svg> <span>My Exams</span></a>
        <a href="/admin.html" class="admin-only"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/></svg> <span>Admin Panel</span></a>
        <a href="/reports.html" class="admin-only"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4 11H2v3h2v-3zm5-4H7v7h2V7zm5-5h-2v12h2V2zm-2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1h-2zM6 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7zm-5 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-3z"/></svg> <span>Reports</span></a>
      </nav>
      <div class="sidebar-user">
        <div class="username"></div>
        <div class="role"></div>
        <button class="logout-btn">Logout</button>
      </div>
    </aside>
  `;
}

// ── Fetch helper with loading state ───────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Request failed');
  }
  return data;
}
