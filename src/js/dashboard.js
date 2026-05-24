// FullFade — Dashboard principal

let currentUser = null;
let userData    = null;
let barbershop  = null;

// Reintenta leer el doc del usuario hasta 5 veces (para nuevos registros)
async function retryGetUserData(uid, maxTries = 5) {
  for (let i = 1; i <= maxTries; i++) {
    const data = await BarbershopService.getUserData(uid);
    if (data) return data;
    if (i < maxTries) {
      // Espera progresiva: 400ms, 800ms, 1200ms, 1600ms
      await new Promise(r => setTimeout(r, 400 * i));
    }
  }
  return null;
}

requireAuth(async (user) => {
  currentUser = user;
  try {
    // Retry getUserData hasta 5 veces con backoff progresivo.
    // Necesario porque onAuthStateChanged puede disparar antes de que
    // Firestore termine de escribir el documento users/{uid} al registrarse.
    userData = await retryGetUserData(user.uid);

    // Superadmin — redirigir ANTES de verificar barbershopId
    if (userData?.role === 'superadmin') {
      window.location.href = '/src/pages/admin.html';
      return;
    }

    if (!userData || !userData.barbershopId) {
      mostrarPantallaRecuperacion(user);
      return;
    }

    barbershop = await BarbershopService.getById(userData.barbershopId);

    // Contexto de plan
    setPlanContext(barbershop);

    // Mostrar badge de plan en sidebar
    const planEl = document.getElementById('sidebarPlan');
    if (planEl) {
      const active = isPlanActive();
      planEl.textContent = getPlanName() + (active ? '' : ' (Expirado)');
      planEl.style.color = active ? '' : 'var(--danger)';
    }

    // Alerta si el plan expira pronto (≤3 días)
    if (barbershop?.planExpiresAt) {
      const exp = barbershop.planExpiresAt.toDate ? barbershop.planExpiresAt.toDate() : new Date(barbershop.planExpiresAt);
      const diffDays = Math.ceil((exp - new Date()) / 86400000);
      if (diffDays <= 3 && diffDays >= 0) {
        Toast.info(`⚠️ Tu plan vence en ${diffDays} día(s). Renueva para no perder acceso.`);
      }
    }

    document.getElementById('shopName').textContent =
      barbershop?.name || 'Mi Barbería';
    document.getElementById('userName').textContent =
      user.displayName || user.email;
    document.getElementById('userInitials').textContent =
      (user.displayName || user.email || '?').charAt(0).toUpperCase();
    document.getElementById('todayDate').textContent =
      new Intl.DateTimeFormat('es-CO', { weekday:'long', day:'numeric', month:'long' }).format(new Date());

    // Mostrar teléfono del owner como método de contacto en sidebar
    const ownerPhone = userData.phone || barbershop?.phone || '';
    const contactEl  = document.getElementById('ownerContact');
    if (contactEl && ownerPhone) {
      const clean = ownerPhone.replace(/\D/g,'');
      contactEl.innerHTML = `
        <a href="https://wa.me/57${clean}" target="_blank"
           style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--radius);
                  font-size:0.78rem;color:#25D366;text-decoration:none;transition:background 0.15s"
           onmouseenter="this.style.background='var(--surface2)'"
           onmouseleave="this.style.background=''">
          <i class="bi bi-whatsapp" style="font-size:1rem"></i>
          <span>${ownerPhone}</span>
        </a>
        <a href="mailto:${user.email}"
           style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--radius);
                  font-size:0.78rem;color:var(--muted);text-decoration:none;transition:background 0.15s"
           onmouseenter="this.style.background='var(--surface2)'"
           onmouseleave="this.style.background=''">
          <i class="bi bi-envelope" style="font-size:0.9rem"></i>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${user.email}</span>
        </a>`;
    } else if (contactEl) {
      contactEl.innerHTML = `
        <a href="mailto:${user.email}"
           style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--radius);
                  font-size:0.78rem;color:var(--muted);text-decoration:none;transition:background 0.15s"
           onmouseenter="this.style.background='var(--surface2)'"
           onmouseleave="this.style.background=''">
          <i class="bi bi-envelope" style="font-size:0.9rem"></i>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${user.email}</span>
        </a>`;
    }

    // Iniciar temporizador de inactividad (1 hora = 3600000 ms)
    initInactivityTimer();

    initCaja(userData.barbershopId);
    initClientes(userData.barbershopId);
    initBarberos(userData.barbershopId);
    initServicios(userData.barbershopId);
    initCitas(userData.barbershopId);
    initReportes(userData.barbershopId);
    initSuscripcion(barbershop);
    initNominas(userData.barbershopId);
    initHorarios(userData.barbershopId);
    initNotificaciones(userData.barbershopId);
    subscribeDashboardKPIs(userData.barbershopId);
    subscribePlanChanges(userData.barbershopId);

  } catch(err) {
    console.error('Error cargando datos:', err);
    Toast.error('Error al cargar los datos. Recarga la página.');
  }
});

// ─── Pantalla de recuperación ─────────────────────────────────────────────────
function mostrarPantallaRecuperacion(user) {
  document.querySelector('.app-layout').innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg2);padding:24px">
      <div class="card" style="max-width:440px;width:100%;text-align:center">
        <i class="bi bi-exclamation-triangle" style="font-size:2rem;color:var(--accent);display:block;margin-bottom:14px"></i>
        <h2 style="font-size:1.2rem;font-weight:700;margin-bottom:8px">Registro incompleto</h2>
        <p style="font-size:0.88rem;color:var(--text-sub);margin-bottom:24px;line-height:1.6">
          Tu cuenta fue creada pero los datos de tu barbería no se guardaron. Completa la configuración.
        </p>
        <div id="recErrorMsg" class="error-msg" style="display:none;margin-bottom:16px"></div>
        <div class="form-group" style="text-align:left">
          <label class="label">Nombre de tu barbería</label>
          <input class="input" type="text" id="recShopName" placeholder="Ej: Barbería El Clásico" />
        </div>
        <div class="form-group" style="text-align:left">
          <label class="label">Tu nombre completo</label>
          <input class="input" type="text" id="recDisplayName" value="${user.displayName||''}" placeholder="Ej: Andrés Torres" />
        </div>
        <div class="form-group" style="text-align:left">
          <label class="label">Teléfono / WhatsApp (opcional)</label>
          <input class="input" type="tel" id="recPhone" placeholder="Ej: 3001234567" />
        </div>
        <button class="btn btn-gold" style="width:100%;margin-top:8px" id="recBtn">
          <i class="bi bi-check-lg"></i> Completar registro
        </button>
        <button class="btn btn-ghost" style="width:100%;margin-top:10px;font-size:0.83rem" id="recLogoutBtn">
          <i class="bi bi-box-arrow-left"></i> Cerrar sesión y volver
        </button>
      </div>
    </div>`;
  document.getElementById('recBtn').addEventListener('click', async () => {
    const shopName    = document.getElementById('recShopName').value.trim();
    const displayName = document.getElementById('recDisplayName').value.trim();
    const phone       = document.getElementById('recPhone').value.trim();
    const errEl       = document.getElementById('recErrorMsg');
    if (!shopName)    { errEl.textContent='Ingresa el nombre de tu barbería.'; errEl.style.display='block'; return; }
    if (!displayName) { errEl.textContent='Ingresa tu nombre completo.'; errEl.style.display='block'; return; }
    errEl.style.display='none';
    const btn = document.getElementById('recBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loader" style="width:16px;height:16px;border-width:2px;vertical-align:middle"></span> Guardando...';
    try {
      if (user.displayName !== displayName) await user.updateProfile({ displayName });
      await BarbershopService.create(user.uid, { name:shopName, email:user.email, displayName, phone, address:'' });
      window.location.reload();
    } catch(err) {
      errEl.textContent = 'Error al guardar. Verifica tu conexión.';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-lg"></i> Completar registro';
    }
  });
  document.getElementById('recLogoutBtn').addEventListener('click', () => AuthService.logout());
}

// ─── Navegación ───────────────────────────────────────────────────────────────
const moduleNames = {
  dashboard:'Dashboard', caja:'Control de Caja', citas:'Agenda de Citas',
  horarios:'Horarios', clientes:'Clientes', barberos:'Barberos', servicios:'Servicios',
  reportes:'Reportes', nominas:'Nóminas', suscripcion:'Suscripción'
};

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    goModule(item.dataset.module);
    closeSidebar();
  });
});

function goModule(name) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-module="${name}"]`);
  if (navItem) navItem.classList.add('active');
  document.getElementById(`mod-${name}`)?.classList.add('active');
  document.getElementById('moduleTitle').textContent = moduleNames[name] || name;
  if (name === 'reportes' && typeof loadReportes === 'function') {
    if (!RealtimeManager._listeners['reportes-tx']) loadReportes();
  }
  if (name === 'nominas' && typeof cargarBarberosSelect === 'function') {
    cargarBarberosSelect();
  }
  if (name === 'horarios' && typeof loadHorarios === 'function') {
    loadHorarios();
  }
}

// ─── Sidebar toggle con backdrop ─────────────────────────────────────────────
const _sidebar    = document.getElementById('sidebar');
const _backdrop   = document.getElementById('sidebarBackdrop');
const _toggleBtn  = document.getElementById('sidebarToggle');

function openSidebar() {
  _sidebar.classList.add('open');
  if (_backdrop) _backdrop.classList.add('visible');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  _sidebar.classList.remove('open');
  if (_backdrop) _backdrop.classList.remove('visible');
  document.body.style.overflow = '';
}

_toggleBtn.addEventListener('click', () => {
  _sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});
if (_backdrop) _backdrop.addEventListener('click', closeSidebar);

document.getElementById('logoutBtn').addEventListener('click', async () => {
  if (confirm('¿Cerrar sesión?')) {
    RealtimeManager.unregisterAll();
    await AuthService.logout();
  }
});

// ─── Modals ───────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
});

// ─── KPIs en tiempo real ──────────────────────────────────────────────────────
function subscribeDashboardKPIs(barbershopId) {
  const today    = new Date();
  const startDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endDay   = new Date(startDay.getTime() + 86400000);

  // Ingresos de hoy
  const unsubTx = db.collection('transactions')
    .where('barbershopId', '==', barbershopId)
    .where('type', '==', 'ingreso')
    .where('createdAt', '>=', startDay)
    .where('createdAt', '<', endDay)
    .onSnapshot(snap => {
      let total = 0;
      const rows = [];
      snap.forEach(doc => { const d=doc.data(); total+=d.amount||0; rows.push(d); });
      document.getElementById('kpi-ingresos').textContent = formatCOP(total);
      if (rows.length > 0) {
        const html = `<table>
          <thead><tr><th>Concepto</th><th>Monto</th><th>Hora</th></tr></thead>
          <tbody>${rows.slice(0,5).map(t=>`<tr>
            <td>${escHtml(t.concept||'—')}</td>
            <td style="color:var(--success);font-weight:500">${formatCOP(t.amount)}</td>
            <td>${formatTime(t.createdAt)}</td>
          </tr>`).join('')}</tbody>
        </table>`;
        document.getElementById('dashTxList').innerHTML = html;
      }
    }, ()=>{});
  RealtimeManager.register('kpi-tx', unsubTx);

  // Citas de hoy
  const unsubCitas = db.collection('appointments')
    .where('barbershopId', '==', barbershopId)
    .where('date', '>=', startDay)
    .where('date', '<', endDay)
    .onSnapshot(snap => {
      document.getElementById('kpi-citas').textContent = snap.size;
    }, ()=>{});
  RealtimeManager.register('kpi-citas', unsubCitas);

  // Barberos activos
  const unsubBar = db.collection('employees')
    .where('barbershopId', '==', barbershopId)
    .where('active', '==', true)
    .onSnapshot(snap => {
      document.getElementById('kpi-barberos').textContent = snap.size;
    }, ()=>{});
  RealtimeManager.register('kpi-bar', unsubBar);

  // Clientes
  const unsubCli = db.collection('customers')
    .where('barbershopId', '==', barbershopId)
    .onSnapshot(snap => {
      document.getElementById('kpi-clientes').textContent = snap.size;
    }, ()=>{});
  RealtimeManager.register('kpi-cli', unsubCli);
}

// ─── Temporizador de inactividad (cierre automático a 1 hora) ────────────────
let _inactivityTimer   = null;
let _warningTimer      = null;
let _warningEl         = null;
const INACTIVITY_MS    = 60 * 60 * 1000; // 1 hora
const WARNING_MS       = 55 * 60 * 1000; // aviso a los 55 min

function initInactivityTimer() {
  const events = ['mousemove','keydown','click','touchstart','scroll'];

  function resetTimer() {
    clearTimeout(_inactivityTimer);
    clearTimeout(_warningTimer);
    // Quitar banner de advertencia si estaba
    if (_warningEl) { _warningEl.remove(); _warningEl = null; }

    // Aviso a los 55 min
    _warningTimer = setTimeout(() => {
      _warningEl = document.createElement('div');
      _warningEl.id = 'inactivityWarning';
      _warningEl.style.cssText = `
        position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
        background:#111;color:#fff;padding:14px 22px;border-radius:12px;
        font-size:0.88rem;z-index:9999;display:flex;align-items:center;gap:14px;
        box-shadow:0 8px 32px rgba(0,0,0,0.35);border:1px solid rgba(201,168,76,0.3)`;
      _warningEl.innerHTML = `
        <i class="bi bi-clock" style="color:var(--accent);font-size:1.1rem"></i>
        <span>Tu sesión cerrará por inactividad en <strong id="inactCountdown">5:00</strong></span>
        <button onclick="document.dispatchEvent(new Event('userActivity'))"
                style="background:var(--accent);color:#fff;border:none;border-radius:6px;
                       padding:6px 14px;font-size:0.82rem;cursor:pointer;font-weight:600">
          Seguir activo
        </button>`;
      document.body.appendChild(_warningEl);

      // Countdown de 5 minutos en el banner
      let secsLeft = 5 * 60;
      const countEl = document.getElementById('inactCountdown');
      const tick = setInterval(() => {
        secsLeft--;
        if (countEl) {
          const m = Math.floor(secsLeft / 60);
          const s = String(secsLeft % 60).padStart(2,'0');
          countEl.textContent = `${m}:${s}`;
        }
        if (secsLeft <= 0) clearInterval(tick);
      }, 1000);
    }, WARNING_MS);

    // Cierre a 1 hora
    _inactivityTimer = setTimeout(async () => {
      RealtimeManager.unregisterAll();
      if (_warningEl) _warningEl.remove();
      // Mostrar pantalla de cierre antes de desloguear
      document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
                    background:var(--bg2);font-family:var(--font-sans)">
          <div style="text-align:center;padding:40px 24px">
            <i class="bi bi-shield-lock" style="font-size:3rem;color:var(--accent);display:block;margin-bottom:16px"></i>
            <h2 style="font-size:1.2rem;font-weight:700;margin-bottom:8px">Sesión cerrada por inactividad</h2>
            <p style="color:var(--muted);font-size:0.88rem;margin-bottom:24px">Por seguridad, tu sesión fue cerrada tras 1 hora sin actividad.</p>
            <button onclick="window.location.href='/src/pages/login.html'"
                    style="background:#111;color:#fff;border:none;border-radius:8px;
                           padding:12px 28px;font-size:0.9rem;cursor:pointer;font-weight:600">
              Iniciar sesión nuevamente
            </button>
          </div>
        </div>`;
      await auth.signOut();
    }, INACTIVITY_MS);
  }

  // Escuchar eventos de actividad
  events.forEach(ev => document.addEventListener(ev, resetTimer, { passive: true }));
  document.addEventListener('userActivity', resetTimer);

  // Iniciar
  resetTimer();
}

// ─── Listener de cambios de plan en tiempo real ──────────────────────────────
// Si el superadmin cambia el plan, la UI se actualiza sin recargar
function subscribePlanChanges(barbershopId) {
  const unsub = db.collection('barbershops').doc(barbershopId)
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const data = snap.data();
      const wasActive = isPlanActive();

      setPlanContext({ ...data, id: snap.id });

      const planEl = document.getElementById('sidebarPlan');
      if (planEl) {
        const active = isPlanActive();
        planEl.textContent = getPlanName() + (active ? '' : ' (Expirado)');
        planEl.style.color = active ? '' : 'var(--danger)';

        // Si el plan acaba de vencer, avisar al usuario
        if (wasActive && !active) {
          Toast.error('⚠️ Tu plan ha vencido. Contacta al administrador para renovarlo.');
        }
        // Si el plan acaba de renovarse, avisar
        if (!wasActive && active) {
          Toast.success('✓ Tu plan ha sido renovado. ¡Bienvenido de vuelta!');
        }
      }

      // Alerta de vencimiento próximo (≤3 días)
      if (data.planExpiresAt) {
        const exp      = data.planExpiresAt.toDate ? data.planExpiresAt.toDate() : new Date(data.planExpiresAt);
        const diffDays = Math.ceil((exp - new Date()) / 86400000);
        if (diffDays >= 0 && diffDays <= 3) {
          const planEl2 = document.getElementById('sidebarPlan');
          if (planEl2) planEl2.style.color = 'var(--danger)';
        }
      }
    }, err => console.warn('Plan listener:', err.message));

  RealtimeManager.register('plan-changes', unsub);
}

function escHtml(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
