/* ============================================================
   app.js — Utilidades globales compartidas
   ============================================================ */

const API = '/api';

// ─── Token / Sesión ──────────────────────────────────────────────────────
const Auth = {
  get token()   { return localStorage.getItem('token'); },
  get usuario() {
    const u = localStorage.getItem('usuario');
    return u ? JSON.parse(u) : null;
  },
  save(token, usuario) {
    localStorage.setItem('token', token);
    localStorage.setItem('usuario', JSON.stringify(usuario));
  },
  clear() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
  },
  requireAuth(rolPermitido = null) {
    if (!this.token) { window.location.href = '/index.html'; return false; }
    if (rolPermitido && this.usuario?.rol !== rolPermitido) {
      window.location.href = '/index.html'; return false;
    }
    return true;
  }
};

// ─── Fetch wrapper ────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (Auth.token) headers['Authorization'] = `Bearer ${Auth.token}`;
  const res = await fetch(API + endpoint, { ...options, headers: { ...headers, ...options.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ─── Toast ────────────────────────────────────────────────────────────────
function toast(msg, tipo = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Modal helper ─────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// Cerrar modal al hacer click fuera
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ─── Badge estado ─────────────────────────────────────────────────────────
const ESTADO_LABELS = {
  pendiente_pago: 'Pendiente pago',
  confirmado:     'Confirmado',
  entregado:      'Entregado',
  recogido:       'Recogido',
  en_revision:    'En revisión',
  cerrado:        'Cerrado'
};
const ESTADO_CSS = {
  pendiente_pago: 'badge-pendiente',
  confirmado:     'badge-confirmado',
  entregado:      'badge-entregado',
  recogido:       'badge-recogido',
  en_revision:    'badge-revision',
  cerrado:        'badge-cerrado'
};
function badgeEstado(estado) {
  return `<span class="badge ${ESTADO_CSS[estado] || ''}">${ESTADO_LABELS[estado] || estado}</span>`;
}

// ─── Formato moneda ───────────────────────────────────────────────────────
function sol(num) {
  return 'S/ ' + parseFloat(num || 0).toFixed(2);
}

// ─── Formato fecha ────────────────────────────────────────────────────────
function fmtFecha(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'numeric' });
}

// ─── Logout ───────────────────────────────────────────────────────────────
function logout() {
  Auth.clear();
  window.location.href = '/index.html';
}

// ─── Inicializar sidebar usuario ──────────────────────────────────────────
function initSidebarUser() {
  const u = Auth.usuario;
  const el = document.getElementById('sidebar-user-name');
  const rol = document.getElementById('sidebar-user-rol');
  if (el) el.textContent = u?.nombre || '';
  if (rol) rol.textContent = u?.rol || '';
}

// ─── Marcar link activo en sidebar ───────────────────────────────────────
function markActiveSidebarLink() {
  const path = window.location.pathname;
  document.querySelectorAll('.sidebar nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === path || path.endsWith(a.getAttribute('href')));
  });
}

// ─── Menú hamburguesa (sidebar móvil) — global para todas las páginas ────
function initMenuToggle() {
  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (!menuToggle || !sidebar) return;

  menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target) && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initSidebarUser();
  markActiveSidebarLink();
  initMenuToggle();
});
