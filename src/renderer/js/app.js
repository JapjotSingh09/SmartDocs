/**
 * SmartDocs – Client Application Logic
 *
 * Core capabilities:
 *  1. Supabase Auth (Sign Up, Sign In, Sign Out, Session Persistence)
 *  2. Profile Management & Self-Healing (PostgreSQL public.profiles)
 *  3. Document Upload (Private Supabase Storage bucket + PostgreSQL public.documents)
 *  4. Document Retrieval & Instant Filter (Row Level Security enforced)
 *  5. Direct Download (Signed URLs converted to local Blob URLs for desktop stability)
 *  6. Permanent Deletion with Confirmation Modal (Cloud storage + database cleanup)
 *  7. Offline detection, desktop environment integration, and beginner-friendly error handling
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS & MIME CONFIGURATION
   ═══════════════════════════════════════════════════════════════════ */

// Maximum allowed file size: 10 Megabytes (Supabase Storage limit)
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const MIME_MAP = {
  'application/pdf': { label: 'PDF', icon: '📕' },
  'application/msword': { label: 'DOC', icon: '📘' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { label: 'DOCX', icon: '📘' },
  'application/vnd.ms-excel': { label: 'XLS', icon: '📗' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { label: 'XLSX', icon: '📗' },
  'text/plain': { label: 'TXT', icon: '📄' }
};

/* ═══════════════════════════════════════════════════════════════════
   DOM UTILITY & ELEMENT CACHE
   ═══════════════════════════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);

// Layout & Status
const offlineBanner     = $('offline-banner');
const configNotice      = $('config-notice');
const authView          = $('auth-view');
const dashboardView     = $('dashboard-view');
const desktopEnvBadge   = $('desktop-env-badge');
const desktopEnvText    = $('desktop-env-text');

// Header
const userHeaderProfile = $('user-header-profile');
const headerAvatar      = $('header-avatar');
const headerUserName    = $('header-user-name');
const headerUserEmail   = $('header-user-email');
const logoutBtn         = $('logout-btn');

// Sidebar
const sidebarAvatar     = $('sidebar-avatar');
const sidebarName       = $('sidebar-name');
const sidebarEmail      = $('sidebar-email');
const navItems          = document.querySelectorAll('.nav-item');
const panelViews        = document.querySelectorAll('.panel-view');

// Auth Form Elements
const authAlert         = $('auth-alert');
const tabLogin          = $('tab-login');
const tabSignup         = $('tab-signup');
const loginForm         = $('login-form');
const signupForm        = $('signup-form');
const loginEmail        = $('login-email');
const loginPassword     = $('login-password');
const loginSubmitBtn    = $('login-submit-btn');
const loginSpinner      = $('login-spinner');
const loginBtnText      = $('login-btn-text');
const signupName        = $('signup-name');
const signupEmail       = $('signup-email');
const signupPassword    = $('signup-password');
const signupConfirm     = $('signup-confirm');
const signupSubmitBtn   = $('signup-submit-btn');
const signupSpinner     = $('signup-spinner');
const signupBtnText     = $('signup-btn-text');
const authSwitchPrompt  = $('auth-switch-prompt');
const authSwitchBtn     = $('auth-switch-btn');

// Document View Elements
const docsAlert         = $('docs-alert');
const docsLoading       = $('docs-loading');
const docsEmpty         = $('docs-empty');
const docsSearchEmpty   = $('docs-search-empty');
const docsError         = $('docs-error');
const docsTableWrap     = $('docs-table-wrap');
const docsTbody         = $('docs-tbody');
const docsSearchInput   = $('docs-search-input');
const docsTypeFilter    = $('docs-type-filter');
const docsDateFilter    = $('docs-date-filter');
const clearFiltersBtn   = $('clear-filters-btn');
const refreshDocsBtn    = $('refresh-docs-btn');
const retryDocsBtn      = $('retry-docs-btn');

// Dashboard overview
const dashboardAlert      = $('dashboard-alert');
const dashboardGreeting   = $('dashboard-greeting');
const dashboardSubgreeting = $('dashboard-subgreeting');
const statTotalDocs       = $('stat-total-docs');
const statPdfDocs         = $('stat-pdf-docs');
const statWordDocs        = $('stat-word-docs');
const statExcelDocs       = $('stat-excel-docs');
const recentLoading       = $('recent-loading');
const recentEmpty         = $('recent-empty');
const recentError         = $('recent-error');
const recentTableWrap     = $('recent-table-wrap');
const recentTbody         = $('recent-tbody');
const sidebarLogoutBtn    = $('sidebar-logout-btn');
const retryRecentBtn      = $('retry-recent-btn');

// Upload View Elements
const uploadAlert         = $('upload-alert');
const dropZone            = $('drop-zone');
const fileInput           = $('file-input');
const filePreview         = $('file-preview');
const previewIcon         = $('preview-icon');
const previewName         = $('preview-name');
const previewType         = $('preview-type');
const previewSize         = $('preview-size');
const fileClearBtn        = $('file-clear-btn');
const uploadProgressWrap  = $('upload-progress-wrap');
const uploadProgressBar   = $('upload-progress-bar');
const uploadProgressLabel = $('upload-progress-label');
const uploadBtn           = $('upload-btn');
const uploadSpinner       = $('upload-spinner');
const uploadBtnText       = $('upload-btn-text');

// Profile View Elements
const profileAvatarLg   = $('profile-avatar-lg');
const profileName       = $('profile-name');
const profileEmail      = $('profile-email');
const profileId         = $('profile-id');
const profileCreated    = $('profile-created');
const profileRuntime    = $('profile-runtime');

// Delete Modal Elements
const deleteModal       = $('delete-modal');
const modalFilename     = $('modal-filename');
const modalCancelBtn    = $('modal-cancel-btn');
const modalConfirmBtn   = $('modal-confirm-btn');
const modalConfirmText  = $('modal-confirm-text');
const modalSpinner      = $('modal-spinner');

/* ═══════════════════════════════════════════════════════════════════
   APPLICATION STATE
   ═══════════════════════════════════════════════════════════════════ */
let currentUser      = null; // { id, email, fullName }
let currentProfile   = null; // { id, full_name, created_at }
let cachedDocuments  = [];   // Array of fetched documents
let selectedFile     = null; // File chosen for upload
let pendingDeleteDoc = null; // Document queued for deletion
let alertTimer       = null;
let isUploading      = false;
let isDeleting       = false;
let logoutInProgress = false;
let documentsLoadFailed = false;

/* ═══════════════════════════════════════════════════════════════════
   OFFLINE DETECTION & NETWORK STATUS
   ═══════════════════════════════════════════════════════════════════ */
function updateNetworkStatus(e) {
  const isOnline = e && e.type ? (e.type !== 'offline') : navigator.onLine;
  if (isOnline) {
    offlineBanner.classList.add('hidden');
  } else {
    offlineBanner.classList.remove('hidden');
  }
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

/* ═══════════════════════════════════════════════════════════════════
   USER-FRIENDLY ERROR TRANSLATION
   ═══════════════════════════════════════════════════════════════════ */
function isSessionExpiredError(error) {
  const msg = typeof error === 'string' ? error : (error?.message || '');
  return msg.includes('JWT expired') || msg.includes('PGRST301') || msg.includes('AuthSessionMissingError');
}

function requireOnline() {
  if (navigator.onLine) return true;
  return false;
}

function formatErrorMessage(error) {
  if (!navigator.onLine) {
    return 'Unable to connect. Please check your internet connection.';
  }
  if (!error) {
    return 'An unexpected issue occurred. Please try again.';
  }

  const msg = typeof error === 'string' ? error : (error.message || '');

  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
    return 'Unable to connect. Please check your internet connection.';
  }
  if (msg.includes('Invalid login credentials')) {
    return 'Incorrect email address or password. Please try again.';
  }
  if (msg.includes('User already registered')) {
    return 'An account with this email address already exists. Please sign in instead.';
  }
  if (msg.includes('Password should be at least')) {
    return 'Your password must contain at least 6 characters.';
  }
  if (msg.includes('Email not confirmed')) {
    return 'Please check your email and confirm your address before logging in.';
  }
  if (isSessionExpiredError(error)) {
    return 'Your session has expired. Please sign in again.';
  }
  if (msg.includes('rate limit') || msg.includes('Too many requests')) {
    return 'Too many attempts in a short time. Please wait a moment and try again.';
  }
  if (msg.includes('row-level security') || msg.includes('42501')) {
    return 'Access denied: You are only permitted to view and manage your own documents.';
  }
  if (msg.includes('Duplicate') || msg.includes('23505')) {
    return 'A record with this information already exists.';
  }
  if (msg.includes('Payload too large') || msg.includes('entity too large')) {
    return 'File size exceeds the server limit (maximum 10 MB).';
  }

  return msg || 'An unexpected error occurred. Please try again.';
}

/* ═══════════════════════════════════════════════════════════════════
   ALERT & FEEDBACK NOTIFICATIONS
   ═══════════════════════════════════════════════════════════════════ */
function showAlert(element, message, type = 'error', autoDismissMs = 0) {
  if (alertTimer) {
    clearTimeout(alertTimer);
    alertTimer = null;
  }
  element.textContent = message;
  element.className = `alert alert-${type}`;
  element.classList.remove('hidden');

  if (autoDismissMs > 0) {
    alertTimer = setTimeout(() => {
      clearAlert(element);
    }, autoDismissMs);
  }
}

function clearAlert(element) {
  element.textContent = '';
  element.className = 'alert hidden';
}

function showAuthAlert(msg, type = 'error') {
  showAlert(authAlert, msg, type, type === 'success' ? 4000 : 0);
}
function clearAuthAlert() { clearAlert(authAlert); }

function showDocsAlert(msg, type = 'error') {
  showAlert(docsAlert, msg, type, type === 'success' ? 4000 : 0);
}
function clearDocsAlert() { clearAlert(docsAlert); }

function showUploadAlert(msg, type = 'error') {
  showAlert(uploadAlert, msg, type, type === 'success' ? 4000 : 0);
}
function clearUploadAlert() { clearAlert(uploadAlert); }

/* ═══════════════════════════════════════════════════════════════════
   FORMATTING HELPERS
   ═══════════════════════════════════════════════════════════════════ */
function humanSize(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—';
  const value = Number(bytes);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return '—';
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function extToMime(ext) {
  const map = {
    pdf:  'application/pdf',
    doc:  'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls:  'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt:  'text/plain'
  };
  return map[ext] || '';
}

function guessMimeFromName(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  return extToMime(ext);
}

function classifyDoc(fileName) {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'doc' || ext === 'docx') return 'word';
  if (ext === 'xls' || ext === 'xlsx') return 'excel';
  if (ext === 'txt') return 'txt';
  return 'other';
}

function getDocTypeInfo(fileName) {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  const mime = extToMime(ext);
  return MIME_MAP[mime] || { label: ext.toUpperCase() || 'FILE', icon: '📄' };
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW & TAB MANAGEMENT
   ═══════════════════════════════════════════════════════════════════ */
function switchDashboardView(viewId) {
  panelViews.forEach(v => v.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));

  const targetPanel = $(`view-${viewId}`);
  if (targetPanel) targetPanel.classList.add('active');

  const targetNav = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if (targetNav) targetNav.classList.add('active');
}

function navigateTo(viewId, options = {}) {
  switchDashboardView(viewId);
  if (viewId === 'dashboard' || viewId === 'my-documents') {
    if (options.refresh || documentsLoadFailed) {
      loadDocuments();
    } else if (viewId === 'my-documents') {
      applyDocumentFilters();
    } else {
      updateDashboardStats();
      renderRecentDocuments();
    }
  }
}

function switchAuthTab(target) {
  clearAuthAlert();
  if (target === 'login') {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    tabLogin.setAttribute('aria-selected', 'true');
    tabSignup.setAttribute('aria-selected', 'false');
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    authSwitchPrompt.textContent = "Don't have an account?";
    authSwitchBtn.textContent    = 'Create one';
  } else {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    tabSignup.setAttribute('aria-selected', 'true');
    tabLogin.setAttribute('aria-selected', 'false');
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    authSwitchPrompt.textContent = 'Already have an account?';
    authSwitchBtn.textContent    = 'Sign in';
  }
}

tabLogin.addEventListener('click', () => switchAuthTab('login'));
tabSignup.addEventListener('click', () => switchAuthTab('signup'));
authSwitchBtn.addEventListener('click', () => {
  switchAuthTab(tabLogin.classList.contains('active') ? 'signup' : 'login');
});

/* ═══════════════════════════════════════════════════════════════════
   SESSION & UI STATE TRANSITIONS
   ═══════════════════════════════════════════════════════════════════ */
function showDashboard(user, profile) {
  currentUser    = user;
  currentProfile = profile;

  const displayName = profile?.full_name || user?.fullName || 'User';
  const email       = user?.email || 'user@example.com';
  const id          = user?.id || '—';
  const initial     = displayName.charAt(0).toUpperCase();

  // Header update
  headerAvatar.textContent    = initial;
  headerUserName.textContent  = displayName;
  headerUserEmail.textContent = email;
  userHeaderProfile.classList.remove('hidden');

  // Sidebar update
  sidebarAvatar.textContent = initial;
  sidebarName.textContent   = displayName;
  sidebarEmail.textContent  = email;

  // Profile panel update
  profileAvatarLg.textContent = initial;
  profileName.textContent     = displayName;
  profileEmail.textContent    = email;
  profileId.textContent       = id;
  profileCreated.textContent  = formatDate(profile?.created_at || user?.created_at);

  if (dashboardGreeting) {
    dashboardGreeting.textContent = `Welcome back, ${displayName}`;
  }
  if (dashboardSubgreeting) {
    dashboardSubgreeting.textContent = 'Here is an overview of your documents.';
  }

  // Switch view visibility
  authView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  clearAuthAlert();

  switchDashboardView('dashboard');
  loadDocuments();
}

function showAuth(message = null) {
  currentUser      = null;
  currentProfile   = null;
  cachedDocuments  = [];
  pendingDeleteDoc = null;
  selectedFile     = null;
  isUploading      = false;
  isDeleting       = false;
  documentsLoadFailed = false;

  userHeaderProfile.classList.add('hidden');
  dashboardView.classList.add('hidden');
  authView.classList.remove('hidden');

  if (statTotalDocs) statTotalDocs.textContent = '0';
  if (statPdfDocs) statPdfDocs.textContent = '0';
  if (statWordDocs) statWordDocs.textContent = '0';
  if (statExcelDocs) statExcelDocs.textContent = '0';
  if (recentTbody) recentTbody.innerHTML = '';
  if (docsTbody) docsTbody.innerHTML = '';
  if (docsSearchInput) docsSearchInput.value = '';
  if (docsTypeFilter) docsTypeFilter.value = 'all';
  if (docsDateFilter) docsDateFilter.value = 'all';
  if (docsError) docsError.classList.add('hidden');
  if (recentError) recentError.classList.add('hidden');

  loginPassword.value  = '';
  signupPassword.value = '';
  signupConfirm.value  = '';

  if (message) {
    showAuthAlert(message, 'warning');
  } else {
    clearAuthAlert();
  }
}

/* ═══════════════════════════════════════════════════════════════════
   PROFILE SELF-HEALING (Ensure profiles row exists)
   ═══════════════════════════════════════════════════════════════════ */
async function fetchOrCreateProfile(supabase, user, fallbackName) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, created_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profile) {
      return profile;
    }

    // Profile row missing: create it now with active authenticated session
    const resolvedName = fallbackName || user.user_metadata?.full_name || 'SmartDocs User';
    const { data: newProfile, error: insertErr } = await supabase
      .from('profiles')
      .upsert({ id: user.id, full_name: resolvedName })
      .select()
      .maybeSingle();

    if (insertErr) {
      console.warn('Profile self-healing notice:', insertErr.message);
      return { id: user.id, full_name: resolvedName, created_at: new Date().toISOString() };
    }
    return newProfile || { id: user.id, full_name: resolvedName, created_at: new Date().toISOString() };
  } catch (err) {
    console.warn('Profile retrieval notice:', err);
    return { id: user.id, full_name: fallbackName || 'SmartDocs User', created_at: new Date().toISOString() };
  }
}

/* ═══════════════════════════════════════════════════════════════════
   AUTHENTICATION: SIGN UP
   ═══════════════════════════════════════════════════════════════════ */
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthAlert();

  if (!requireOnline()) {
    showAuthAlert('Unable to connect. Please check your internet connection.');
    return;
  }

  const supabase = window.SmartDocsSupabase.getClient();
  if (!supabase) {
    showAuthAlert('Supabase configuration missing. Check supabaseClient.js.', 'warning');
    return;
  }

  const fullName = signupName.value.trim();
  const email    = signupEmail.value.trim();
  const password = signupPassword.value;
  const confirm  = signupConfirm.value;

  // Validation
  if (!fullName) {
    showAuthAlert('Please enter your full name.');
    signupName.focus();
    return;
  }
  if (!email || !isValidEmail(email)) {
    showAuthAlert('Please enter a valid email address.');
    signupEmail.focus();
    return;
  }
  if (password.length < 6) {
    showAuthAlert('Password must be at least 6 characters in length.');
    signupPassword.focus();
    return;
  }
  if (password !== confirm) {
    showAuthAlert('Passwords do not match. Please verify both fields.');
    signupConfirm.focus();
    return;
  }

  setButtonLoading(signupSubmitBtn, signupSpinner, signupBtnText, true, 'Creating Account…');

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });

    if (error) {
      showAuthAlert(formatErrorMessage(error));
      return;
    }

    const user = data.user;
    if (!user) {
      showAuthAlert('Registration completed, but no user record was returned.');
      return;
    }

    // Attempt profile creation
    try {
      await supabase.from('profiles').upsert({ id: user.id, full_name: fullName });
    } catch (upsertErr) {
      console.warn('Notice: profile row will be verified upon login:', upsertErr);
    }

    if (!data.session) {
      // Email confirmation is required by Supabase project settings
      showAuthAlert('Account created successfully! Check your inbox to confirm your email, then sign in.', 'success');
      signupForm.reset();
      switchAuthTab('login');
    } else {
      // Instant login permitted
      const profile = await fetchOrCreateProfile(supabase, user, fullName);
      showDashboard({ id: user.id, email: user.email, fullName }, profile);
    }
  } catch (err) {
    showAuthAlert(formatErrorMessage(err));
  } finally {
    setButtonLoading(signupSubmitBtn, signupSpinner, signupBtnText, false, 'Create Account');
  }
});

/* ═══════════════════════════════════════════════════════════════════
   AUTHENTICATION: SIGN IN
   ═══════════════════════════════════════════════════════════════════ */
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthAlert();

  if (!requireOnline()) {
    showAuthAlert('Unable to connect. Please check your internet connection.');
    return;
  }

  const supabase = window.SmartDocsSupabase.getClient();
  if (!supabase) {
    showAuthAlert('Supabase configuration missing. Check supabaseClient.js.', 'warning');
    return;
  }

  const email    = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !isValidEmail(email)) {
    showAuthAlert('Please enter a valid email address.');
    loginEmail.focus();
    return;
  }
  if (!password) {
    showAuthAlert('Please enter your password.');
    loginPassword.focus();
    return;
  }

  setButtonLoading(loginSubmitBtn, loginSpinner, loginBtnText, true, 'Signing in…');

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showAuthAlert(formatErrorMessage(error));
      return;
    }

    const user = data.user;
    const profile = await fetchOrCreateProfile(supabase, user, user.user_metadata?.full_name);
    const resolvedName = profile?.full_name || user.user_metadata?.full_name || '';

    showDashboard({ id: user.id, email: user.email, fullName: resolvedName }, profile);
  } catch (err) {
    showAuthAlert(formatErrorMessage(err));
  } finally {
    setButtonLoading(loginSubmitBtn, loginSpinner, loginBtnText, false, 'Sign In');
  }
});

/* ═══════════════════════════════════════════════════════════════════
   AUTHENTICATION: SIGN OUT
   ═══════════════════════════════════════════════════════════════════ */
async function handleLogout() {
  if (logoutInProgress) return;
  logoutInProgress = true;
  const buttons = [logoutBtn, sidebarLogoutBtn].filter(Boolean);
  buttons.forEach((btn) => {
    btn.disabled = true;
    if (btn === logoutBtn) btn.textContent = 'Signing out…';
  });

  try {
    const supabase = window.SmartDocsSupabase.getClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
  } catch (err) {
    console.warn('Sign out warning (clearing local state):', err);
  } finally {
    if (logoutBtn) {
      logoutBtn.disabled = false;
      logoutBtn.textContent = 'Sign Out';
    }
    if (sidebarLogoutBtn) sidebarLogoutBtn.disabled = false;
    showAuth('You have signed out successfully.');
    logoutInProgress = false;
  }
}

logoutBtn.addEventListener('click', handleLogout);
if (sidebarLogoutBtn) {
  sidebarLogoutBtn.addEventListener('click', handleLogout);
}

/* ═══════════════════════════════════════════════════════════════════
   SESSION RESTORATION ON APP STARTUP
   ═══════════════════════════════════════════════════════════════════ */
async function restoreSession() {
  const supabase = window.SmartDocsSupabase.getClient();
  if (!supabase) return;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session) return;

    const user = data.session.user;
    const profile = await fetchOrCreateProfile(supabase, user, user.user_metadata?.full_name);
    const resolvedName = profile?.full_name || user.user_metadata?.full_name || '';

    showDashboard({ id: user.id, email: user.email, fullName: resolvedName }, profile);
  } catch (err) {
    console.warn('Session check note:', err);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   SIDEBAR NAVIGATION
   ═══════════════════════════════════════════════════════════════════ */
navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    navigateTo(btn.dataset.view);
  });
});

document.addEventListener('click', e => {
  const trigger = e.target.closest('[data-view-trigger]');
  if (trigger && trigger.dataset.viewTrigger) {
    navigateTo(trigger.dataset.viewTrigger);
  }
});

/* ═══════════════════════════════════════════════════════════════════
   DOCUMENT RETRIEVAL & FILTERING (Row Level Security Enforced)
   ═══════════════════════════════════════════════════════════════════ */
function notifyDocumentAction(msg, type = 'error') {
  const dashboardActive = $('view-dashboard') && $('view-dashboard').classList.contains('active');
  if (dashboardActive && dashboardAlert) {
    showAlert(dashboardAlert, msg, type, type === 'success' ? 4000 : 0);
  } else {
    showDocsAlert(msg, type);
  }
}

function getFilteredDocuments() {
  const query = (docsSearchInput?.value || '').trim().toLowerCase();
  const typeFilter = docsTypeFilter?.value || 'all';
  const dateFilter = docsDateFilter?.value || 'all';
  const now = new Date();

  return cachedDocuments.filter((doc) => {
    const name = (doc.file_name || '').toLowerCase();
    if (query && !name.includes(query)) return false;

    if (typeFilter !== 'all' && classifyDoc(doc.file_name) !== typeFilter) {
      return false;
    }

    if (dateFilter !== 'all' && doc.created_at) {
      const created = new Date(doc.created_at);
      if (Number.isNaN(created.getTime())) return true;
      if (dateFilter === 'year') {
        if (created.getFullYear() !== now.getFullYear()) return false;
      } else {
        const days = Number(dateFilter);
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        if (created < cutoff) return false;
      }
    }

    return true;
  });
}

function updateDashboardStats() {
  const docs = cachedDocuments;
  if (statTotalDocs) statTotalDocs.textContent = String(docs.length);
  if (statPdfDocs) {
    statPdfDocs.textContent = String(docs.filter((d) => classifyDoc(d.file_name) === 'pdf').length);
  }
  if (statWordDocs) {
    statWordDocs.textContent = String(docs.filter((d) => classifyDoc(d.file_name) === 'word').length);
  }
  if (statExcelDocs) {
    statExcelDocs.textContent = String(docs.filter((d) => classifyDoc(d.file_name) === 'excel').length);
  }
}

function buildDocumentRow(doc) {
  const info = getDocTypeInfo(doc.file_name);
  const tr = document.createElement('tr');
  tr.dataset.docId = doc.id;
  tr.innerHTML = `
      <td>
        <div class="doc-filename">
          <span>${info.icon}</span>
          <span>${escapeHtml(doc.file_name)}</span>
        </div>
      </td>
      <td><span class="doc-type-badge">${info.label}</span></td>
      <td>${escapeHtml(humanSize(doc.file_size))}</td>
      <td>${formatDate(doc.created_at)}</td>
      <td class="col-actions">
        <div class="table-actions">
          <button class="btn btn-secondary btn-sm" data-action="download"
                  data-id="${doc.id}" data-path="${escapeHtml(doc.file_path)}" data-name="${escapeHtml(doc.file_name)}"
                  title="Download file">
            ⬇ Download
          </button>
          <button class="btn btn-danger btn-sm" data-action="delete"
                  data-id="${doc.id}" data-path="${escapeHtml(doc.file_path)}" data-name="${escapeHtml(doc.file_name)}"
                  title="Delete file permanently">
            🗑 Delete
          </button>
        </div>
      </td>
    `;
  return tr;
}

function renderRecentDocuments() {
  if (!recentTbody) return;
  recentTbody.innerHTML = '';

  if (recentError) recentError.classList.add('hidden');

  if (documentsLoadFailed) {
    if (recentEmpty) recentEmpty.classList.add('hidden');
    if (recentTableWrap) recentTableWrap.classList.add('hidden');
    if (recentError) recentError.classList.remove('hidden');
    return;
  }

  if (cachedDocuments.length === 0) {
    recentEmpty.classList.remove('hidden');
    recentTableWrap.classList.add('hidden');
    return;
  }

  recentEmpty.classList.add('hidden');
  cachedDocuments.slice(0, 5).forEach((doc) => {
    recentTbody.appendChild(buildDocumentRow(doc));
  });
  recentTableWrap.classList.remove('hidden');
}

async function attachFileSizes(docs) {
  if (!docs.length || !currentUser) return docs;

  const supabase = window.SmartDocsSupabase.getClient();
  if (!supabase) return docs;

  try {
    const { data: files, error } = await supabase.storage
      .from('documents')
      .list(currentUser.id, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });

    if (error || !files) return docs;

    const sizeByPath = {};
    files.forEach((file) => {
      const fullPath = `${currentUser.id}/${file.name}`;
      const size = file.metadata && file.metadata.size;
      if (typeof size === 'number') {
        sizeByPath[fullPath] = size;
      }
    });

    docs.forEach((doc) => {
      if (sizeByPath[doc.file_path] != null) {
        doc.file_size = sizeByPath[doc.file_path];
      }
    });
  } catch (err) {
    console.warn('Could not load file sizes from storage:', err);
  }

  return docs;
}

async function loadDocuments() {
  const supabase = window.SmartDocsSupabase.getClient();
  if (!supabase || !currentUser) return;

  docsLoading.classList.remove('hidden');
  docsEmpty.classList.add('hidden');
  docsSearchEmpty.classList.add('hidden');
  docsTableWrap.classList.add('hidden');
  if (docsError) docsError.classList.add('hidden');
  docsTbody.innerHTML = '';

  if (recentLoading) recentLoading.classList.remove('hidden');
  if (recentEmpty) recentEmpty.classList.add('hidden');
  if (recentError) recentError.classList.add('hidden');
  if (recentTableWrap) recentTableWrap.classList.add('hidden');
  if (recentTbody) recentTbody.innerHTML = '';

  try {
    const { data: docs, error } = await supabase
      .from('documents')
      .select('id, user_id, file_name, file_path, created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) {
      if (isSessionExpiredError(error)) {
        showAuth(formatErrorMessage(error));
        return;
      }
      documentsLoadFailed = true;
      notifyDocumentAction(formatErrorMessage(error));
      if (docsError) docsError.classList.remove('hidden');
      if (recentError) recentError.classList.remove('hidden');
      return;
    }

    documentsLoadFailed = false;
    cachedDocuments = (docs || []).filter((doc) => doc.user_id === currentUser.id);
    if (docsAlert && docsAlert.classList.contains('alert-error')) clearDocsAlert();
    if (dashboardAlert && dashboardAlert.classList.contains('alert-error')) clearAlert(dashboardAlert);
    await attachFileSizes(cachedDocuments);
    updateDashboardStats();
    renderRecentDocuments();
    renderDocumentTable(getFilteredDocuments());
  } catch (err) {
    if (isSessionExpiredError(err)) {
      showAuth(formatErrorMessage(err));
      return;
    }
    documentsLoadFailed = true;
    notifyDocumentAction(formatErrorMessage(err));
    if (docsError) docsError.classList.remove('hidden');
    if (recentError) recentError.classList.remove('hidden');
  } finally {
    docsLoading.classList.add('hidden');
    if (recentLoading) recentLoading.classList.add('hidden');
  }
}

function renderDocumentTable(docs) {
  docsTbody.innerHTML = '';

  if (documentsLoadFailed) {
    docsEmpty.classList.add('hidden');
    docsSearchEmpty.classList.add('hidden');
    docsTableWrap.classList.add('hidden');
    if (docsError) docsError.classList.remove('hidden');
    return;
  }

  if (docsError) docsError.classList.add('hidden');

  if (cachedDocuments.length === 0) {
    docsEmpty.classList.remove('hidden');
    docsSearchEmpty.classList.add('hidden');
    docsTableWrap.classList.add('hidden');
    return;
  }

  if (docs.length === 0) {
    docsSearchEmpty.classList.remove('hidden');
    docsEmpty.classList.add('hidden');
    docsTableWrap.classList.add('hidden');
    return;
  }

  docsEmpty.classList.add('hidden');
  docsSearchEmpty.classList.add('hidden');

  docs.forEach((doc) => {
    docsTbody.appendChild(buildDocumentRow(doc));
  });

  docsTableWrap.classList.remove('hidden');
}

function applyDocumentFilters() {
  renderDocumentTable(getFilteredDocuments());
}

function clearDocumentFilters() {
  if (docsSearchInput) docsSearchInput.value = '';
  if (docsTypeFilter) docsTypeFilter.value = 'all';
  if (docsDateFilter) docsDateFilter.value = 'all';
  applyDocumentFilters();
}

docsSearchInput.addEventListener('input', applyDocumentFilters);
if (docsTypeFilter) docsTypeFilter.addEventListener('change', applyDocumentFilters);
if (docsDateFilter) docsDateFilter.addEventListener('change', applyDocumentFilters);

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener('click', clearDocumentFilters);
}

refreshDocsBtn.addEventListener('click', () => {
  loadDocuments();
});

if (retryDocsBtn) retryDocsBtn.addEventListener('click', () => loadDocuments());
if (retryRecentBtn) retryRecentBtn.addEventListener('click', () => loadDocuments());
const noResultsClearBtn = $('no-results-clear-btn');
if (noResultsClearBtn) noResultsClearBtn.addEventListener('click', clearDocumentFilters);

/* ═══════════════════════════════════════════════════════════════════
   DOWNLOAD HANDLER (Secure Signed URL -> Blob URL)
   ═══════════════════════════════════════════════════════════════════ */
async function onDocumentRowAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const action   = btn.dataset.action;
  const docId    = btn.dataset.id;
  const filePath = btn.dataset.path;
  const fileName = btn.dataset.name;

  if (action === 'download') {
    await handleDownload(docId, filePath, fileName, btn);
  } else if (action === 'delete') {
    openDeleteModal({ id: docId, file_path: filePath, file_name: fileName });
  }
}

docsTbody.addEventListener('click', onDocumentRowAction);
if (recentTbody) {
  recentTbody.addEventListener('click', onDocumentRowAction);
}

async function handleDownload(docId, filePath, fileName, triggerBtn) {
  const supabase = window.SmartDocsSupabase.getClient();
  if (!supabase) return;

  if (!requireOnline()) {
    notifyDocumentAction('Unable to download this document. Please check your internet connection.');
    return;
  }

  const originalHtml = triggerBtn.innerHTML;
  triggerBtn.disabled = true;
  triggerBtn.innerHTML = '<span class="btn-spinner"></span>';

  try {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 60, { download: fileName });

    if (error || !data?.signedUrl) {
      if (isSessionExpiredError(error)) {
        showAuth(formatErrorMessage(error));
        return;
      }
      throw new Error(error?.message || 'signed-url-failed');
    }

    const response = await fetch(data.signedUrl);
    if (response.status === 404) {
      throw new Error('missing-file');
    }
    if (!response.ok) {
      throw new Error(`download-http-${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl);
    }, 2000);

    notifyDocumentAction(`Downloaded "${fileName}" successfully.`, 'success');
  } catch (err) {
    if (isSessionExpiredError(err)) {
      showAuth(formatErrorMessage(err));
      return;
    }
    console.warn('Download failed:', err);
    notifyDocumentAction('Unable to download this document.');
  } finally {
    triggerBtn.disabled = false;
    triggerBtn.innerHTML = originalHtml;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   DOCUMENT DELETION (Confirmation Modal + Cloud Cleanup)
   ═══════════════════════════════════════════════════════════════════ */
function openDeleteModal(doc) {
  pendingDeleteDoc = doc;
  modalFilename.textContent = `"${doc.file_name}"`;
  deleteModal.classList.remove('hidden');
  modalConfirmBtn.focus();
}

function closeDeleteModal() {
  pendingDeleteDoc = null;
  isDeleting = false;
  deleteModal.classList.add('hidden');
  if (modalSpinner) modalSpinner.classList.add('hidden');
  modalConfirmBtn.disabled = false;
  if (modalConfirmText) {
    modalConfirmText.textContent = 'Delete';
  }
}

modalCancelBtn.addEventListener('click', closeDeleteModal);

deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) closeDeleteModal();
});

// Keyboard accessibility: Escape closes modal
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !deleteModal.classList.contains('hidden')) {
    closeDeleteModal();
  }
});

modalConfirmBtn.addEventListener('click', async () => {
  if (!pendingDeleteDoc || isDeleting) return;
  if (!currentUser) {
    closeDeleteModal();
    showAuth('Your session has expired. Please sign in again.');
    return;
  }
  const supabase = window.SmartDocsSupabase.getClient();
  if (!supabase) return;

  if (!requireOnline()) {
    notifyDocumentAction('Unable to delete this document. Please check your internet connection.');
    return;
  }

  isDeleting = true;
  modalConfirmBtn.disabled = true;
  if (modalSpinner) modalSpinner.classList.remove('hidden');
  if (modalConfirmText) modalConfirmText.textContent = 'Deleting…';

  const { id, file_path, file_name } = pendingDeleteDoc;

  try {
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([file_path]);

    if (storageError) {
      console.warn('Storage removal notice:', storageError.message);
    }

    const { error: dbError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUser.id);

    if (dbError) {
      if (isSessionExpiredError(dbError)) {
        closeDeleteModal();
        showAuth(formatErrorMessage(dbError));
        return;
      }
      throw dbError;
    }

    closeDeleteModal();
    notifyDocumentAction(`"${file_name}" was permanently deleted.`, 'success');
    loadDocuments();
  } catch (err) {
    closeDeleteModal();
    console.warn('Delete failed:', err);
    notifyDocumentAction('Unable to delete this document.');
  }
});

/* ═══════════════════════════════════════════════════════════════════
   FILE SELECTION & VALIDATION
   ═══════════════════════════════════════════════════════════════════ */
dropZone.addEventListener('click', (e) => {
  if (e.target === fileInput) return;
  fileInput.click();
});

dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    setSelectedFile(fileInput.files[0]);
  }
});

// Drag and drop handlers
dropZone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  if (e.relatedTarget && dropZone.contains(e.relatedTarget)) return;
  dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    setSelectedFile(files[0]);
  }
});

function setSelectedFile(file) {
  clearUploadAlert();
  const mime = file.type || guessMimeFromName(file.name);

  // Validate format
  if (!MIME_MAP[mime]) {
    showUploadAlert(`"${file.name}" is not a supported format. Please upload PDF, Word (.doc, .docx), Excel (.xls, .xlsx), or TXT files.`);
    return;
  }

  // Validate size
  if (file.size > MAX_FILE_BYTES) {
    showUploadAlert(`"${file.name}" exceeds the 10 MB size limit (${humanSize(file.size)}). Please choose a smaller file.`);
    return;
  }

  // Check duplicate filename in user's vault
  const duplicate = cachedDocuments.some(d => d.file_name.toLowerCase() === file.name.toLowerCase());
  if (duplicate) {
    showUploadAlert(`Note: A document named "${file.name}" is already in your vault. Uploading will save a new timestamped version.`, 'warning');
  }

  selectedFile = file;
  const info = MIME_MAP[mime] || { label: 'FILE', icon: '📄' };

  previewIcon.textContent = info.icon;
  previewName.textContent = file.name;
  if (previewType) previewType.textContent = info.label;
  previewSize.textContent = humanSize(file.size);

  filePreview.classList.remove('hidden');
  uploadBtn.disabled = false;
}

fileClearBtn.addEventListener('click', clearFileSelection);

function clearFileSelection() {
  selectedFile = null;
  fileInput.value = '';
  filePreview.classList.add('hidden');
  uploadBtn.disabled = true;
  clearUploadAlert();
  uploadProgressWrap.classList.add('hidden');
}

/* ═══════════════════════════════════════════════════════════════════
   DOCUMENT UPLOAD
   ═══════════════════════════════════════════════════════════════════ */
uploadBtn.addEventListener('click', async () => {
  if (!selectedFile || !currentUser || isUploading) return;

  const supabase = window.SmartDocsSupabase.getClient();
  if (!supabase) return;

  if (!requireOnline()) {
    showUploadAlert('Unable to connect. Please check your internet connection.');
    return;
  }

  clearUploadAlert();

  const safeName    = sanitizeFilename(selectedFile.name);
  const storagePath = `${currentUser.id}/${Date.now()}_${safeName}`;
  const mimeType    = selectedFile.type || guessMimeFromName(selectedFile.name);

  isUploading = true;
  setButtonLoading(uploadBtn, uploadSpinner, uploadBtnText, true, 'Uploading…');
  uploadProgressWrap.classList.remove('hidden');
  setProgress(10, 'Uploading to vault… 10%');

  try {
    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(storagePath, selectedFile, {
        contentType: mimeType,
        upsert: false
      });

    if (storageError) {
      if (isSessionExpiredError(storageError)) {
        showAuth(formatErrorMessage(storageError));
        return;
      }
      throw storageError;
    }

    setProgress(75, 'Saving document record… 75%');

    const { error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id:   currentUser.id,
        file_name: selectedFile.name,
        file_path: storagePath
      });

    if (dbError) {
      try {
        const { error: rollbackError } = await supabase.storage.from('documents').remove([storagePath]);
        if (rollbackError) {
          console.warn('Upload rollback notice:', rollbackError.message);
        }
      } catch (rollbackErr) {
        console.warn('Upload rollback failed:', rollbackErr);
      }
      throw dbError;
    }

    setProgress(100, 'Upload complete! 100%');
    showUploadAlert(`"${selectedFile.name}" was uploaded successfully!`, 'success');

    setTimeout(() => {
      clearFileSelection();
    }, 1200);

    await loadDocuments();
    setTimeout(() => {
      navigateTo('my-documents');
    }, 1500);

  } catch (err) {
    if (isSessionExpiredError(err)) {
      showAuth(formatErrorMessage(err));
      return;
    }
    console.warn('Upload failed:', err);
    showUploadAlert('Upload failed. Please try again.');
  } finally {
    isUploading = false;
    setButtonLoading(uploadBtn, uploadSpinner, uploadBtnText, false, '⬆️ Upload Document');
  }
});

/* ═══════════════════════════════════════════════════════════════════
   BUTTON HELPERS
   ═══════════════════════════════════════════════════════════════════ */
function setButtonLoading(btn, spinner, textEl, isLoading, text) {
  btn.disabled = isLoading;
  if (isLoading) {
    spinner.classList.remove('hidden');
    textEl.textContent = text;
  } else {
    spinner.classList.add('hidden');
    textEl.textContent = text;
  }
}

function setProgress(pct, label) {
  uploadProgressBar.style.width = `${pct}%`;
  uploadProgressLabel.textContent = label;
}

/* ═══════════════════════════════════════════════════════════════════
   APPLICATION INITIALIZATION
   ═══════════════════════════════════════════════════════════════════ */
async function initializeApp() {
  updateNetworkStatus();

  // Detect Electron Desktop Runtime
  if (window.electronAPI) {
    desktopEnvBadge.classList.remove('hidden');
    try {
      const info = await window.electronAPI.getAppInfo();
      if (info && profileRuntime) {
        profileRuntime.textContent = `SmartDocs Desktop v${info.version} (Electron ${info.electronVersion}, Node ${info.nodeVersion})`;
      }
      if (info && desktopEnvText) {
        desktopEnvText.textContent = `SmartDocs Desktop`;
      }
    } catch {
      if (profileRuntime) profileRuntime.textContent = 'SmartDocs Desktop Application';
    }
  } else {
    if (profileRuntime) profileRuntime.textContent = 'SmartDocs Web Browser';
  }

  // Validate Supabase configuration
  if (!window.SmartDocsSupabase.credentialsConfigured()) {
    configNotice.classList.remove('hidden');
    authView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
    return;
  }

  // Attempt to restore persistent session
  authView.classList.remove('hidden');
  await restoreSession();

  // Real-time auth listener for session expiration or external sign-out
  const supabase = window.SmartDocsSupabase.getClient();
  if (supabase) {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (logoutInProgress) return;
        if (currentUser) {
          showAuth('Your session has ended. Please sign in again.');
        }
      } else if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && !session && currentUser) {
        showAuth('Your session has expired. Please sign in again.');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', initializeApp);
