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

// ─── Descargar QR como imagen ──────────────────────────────────────────────
function descargarQR(containerId, filename) {
  const canvas = document.querySelector(`#${containerId} canvas`);
  if (!canvas) return toast('El QR aún no está listo, intenta de nuevo', 'warn');
  const link = document.createElement('a');
  link.download = filename || 'qr-menaje.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Cerrar modal al hacer click fuera
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ─── Badge estado ─────────────────────────────────────────────────────────
const ESTADO_LABELS = {
  confirmado:     'Confirmado',
  entregado:      'Entregado',
  recogido:       'Recogido',
  en_revision:    'En revisión',
  cerrado:        'Cerrado'
};
const ESTADO_CSS = {
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
// Las fechas son tipo DATE (sin hora), guardadas como medianoche UTC.
// Se formatea en UTC para que no se corra un día al verla desde un huso
// horario negativo como el de Perú (UTC-5).
function fmtFecha(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' });
}

// ─── Formato hora (TIME de Postgres llega como "HH:MM:SS") ────────────────
function fmtHora(str) {
  if (!str) return '—';
  return str.slice(0,5);
}

// ─── Logout ───────────────────────────────────────────────────────────────
function logout() {
  Auth.clear();
  window.location.href = '/index.html';
}

// ─── Ruta en Google Maps hacia la ubicación del evento ────────────────────
function irARuta(lat, lng) {
  if (!lat || !lng) return toast('Este alquiler no tiene ubicación registrada', 'warn');
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank');
}

// ─── Alertas de entregas atrasadas / próximas (sidebar de trabajador y dueño) ─
const ANTICIPACION_MIN = 30; // minutos de anticipación para la alerta amarilla

async function cargarAlertasEntregas() {
  const cont = document.getElementById('sidebar-alertas');
  if (!cont) return;
  try {
    const alqs = await apiFetch('/alquileres?estado=confirmado');
    const ahora = new Date();
    const atrasados = [], proximos = [];
    alqs.forEach(a => {
      const fechaSolo = (a.fecha_entrega || '').slice(0, 10);
      const dt = new Date(`${fechaSolo}T${a.hora_entrega || '00:00:00'}`);
      const minutosFaltantes = (dt - ahora) / 60000;
      if (minutosFaltantes <= 0) atrasados.push(a);
      else if (minutosFaltantes <= ANTICIPACION_MIN) proximos.push(a);
    });

    let html = '';
    if (atrasados.length) {
      html += `
        <div style="margin:0 14px 10px;padding:10px 12px;background:rgba(255,138,128,.14);border:1px solid var(--danger);border-radius:8px">
          <div style="display:flex;align-items:center;gap:6px;color:var(--danger);font-weight:700;font-size:.8rem;margin-bottom:6px">⚠ Entregas atrasadas</div>
          ${atrasados.map(a => `<div style="font-size:.76rem;color:var(--text);margin-bottom:2px;line-height:1.4">${a.cliente_nombre} — ${fmtHora(a.hora_entrega)}</div>`).join('')}
        </div>`;
    }
    if (proximos.length) {
      html += `
        <div style="margin:0 14px 12px;padding:10px 12px;background:rgba(var(--gold-rgb),.16);border:1px solid var(--gold);border-radius:8px">
          <div style="display:flex;align-items:center;gap:6px;color:var(--gold);font-weight:700;font-size:.8rem;margin-bottom:6px">⏱ Entregas próximas</div>
          ${proximos.map(a => `<div style="font-size:.76rem;color:var(--text);margin-bottom:2px;line-height:1.4">${a.cliente_nombre} — ${fmtHora(a.hora_entrega)}</div>`).join('')}
        </div>`;
    }
    cont.innerHTML = html;
  } catch (e) { /* no interrumpir la navegación por un error de alertas */ }
}
if (document.getElementById('sidebar-alertas')) {
  cargarAlertasEntregas();
  setInterval(cargarAlertasEntregas, 60000);
}

// ─── Inicializar sidebar usuario ──────────────────────────────────────────
function initSidebarUser() {
  const u = Auth.usuario;
  const el = document.getElementById('sidebar-user-name');
  const rol = document.getElementById('sidebar-user-rol');
  const avatar = document.getElementById('sidebar-user-avatar');
  if (el) el.textContent = u?.nombre || '';
  if (rol) rol.textContent = u?.rol || '';
  if (avatar) avatar.textContent = (u?.nombre || '?').trim().charAt(0).toUpperCase();
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
