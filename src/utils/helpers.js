// FullFade — Utilidades globales

// Toast notifications
const Toast = {
  show(msg, type = 'default', duration = 3500) {
    const container = document.getElementById('toast-container')
      || (() => {
        const el = document.createElement('div');
        el.id = 'toast-container';
        document.body.appendChild(el);
        return el;
      })();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(120%)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg)   { this.show(msg, 'error'); },
  info(msg)    { this.show(msg, 'default'); }
};

// Loader de página
const PageLoader = {
  show() {
    let el = document.getElementById('page-loader');
    if (!el) {
      el = document.createElement('div');
      el.id = 'page-loader';
      el.innerHTML = `<div class="loader" style="width:40px;height:40px;border-width:3px"></div>`;
      document.body.appendChild(el);
    }
    el.classList.remove('hide');
  },
  hide() {
    const el = document.getElementById('page-loader');
    if (el) el.classList.add('hide');
  }
};

// Formatear moneda COP
function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(value);
}

// Formatear fecha
function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric'
  }).format(date);
}

// Formatear hora
function formatTime(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit', minute: '2-digit'
  }).format(date);
}

// Guard de autenticación — redirige si no hay sesión
function requireAuth(callback) {
  PageLoader.show();
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = '/src/pages/login.html';
      return;
    }
    PageLoader.hide();
    if (callback) callback(user);
  });
}

// Guard público — redirige al dashboard si ya hay sesión
function redirectIfAuth() {
  auth.onAuthStateChanged((user) => {
    if (user) window.location.href = '/src/pages/dashboard.html';
  });
}

// Obtener parámetros de URL
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// Debounce
function debounce(fn, delay = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
