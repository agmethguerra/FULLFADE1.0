// FullFade — Panel SuperAdmin

let _allNegocios = [];
let _editingId   = null;

// Guard: solo superadmin
requireAuth(async (user) => {
  const ud = await BarbershopService.getUserData(user.uid);
  if (!ud || ud.role !== 'superadmin') {
    window.location.href = '/src/pages/dashboard.html';
    return;
  }
  document.getElementById('adminName').textContent =
    user.displayName || user.email;
  document.getElementById('adminInitials').textContent =
    (user.displayName || user.email).charAt(0).toUpperCase();

  subscribeNegocios();
  loadPlanDistribucion();

  document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
    if (confirm('¿Cerrar sesión?')) await AuthService.logout();
  });
  document.getElementById('cambiarPlanBtn').addEventListener('click', cambiarPlan);
  document.getElementById('seedDemoBtn').addEventListener('click', seedDemo);
  document.getElementById('clearDemoBtn').addEventListener('click', clearDemo);
  document.getElementById('adminSearchNegocio').addEventListener('input', debounce(filterNegocios, 300));
  document.getElementById('adminFiltroPlan').addEventListener('change', filterNegocios);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => { goAdminModule(item.dataset.module); closeSidebar(); });
  });
  const _sb  = document.getElementById('sidebar');
  const _bd  = document.getElementById('sidebarBackdrop');
  function openSidebar()  { _sb.classList.add('open');    if(_bd) _bd.classList.add('visible');    document.body.style.overflow='hidden'; }
  function closeSidebar() { _sb.classList.remove('open'); if(_bd) _bd.classList.remove('visible'); document.body.style.overflow=''; }
  document.getElementById('sidebarToggle').addEventListener('click', () =>
    _sb.classList.contains('open') ? closeSidebar() : openSidebar());
  if (_bd) _bd.addEventListener('click', closeSidebar);
  document.querySelectorAll('[data-close]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  document.querySelectorAll('.modal-overlay').forEach(o =>
    o.addEventListener('click', e => { if (e.target===o) o.classList.remove('open'); }));
  document.getElementById('guardarNegocioBtn').addEventListener('click', guardarNegocio);
});

const adminModuleNames = {
  negocios:'Negocios Registrados', usuarios:'Usuarios', planes:'Gestión de Planes', demo:'Cuenta Demo'
};
function goAdminModule(name) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  document.querySelector(`.nav-item[data-module="${name}"]`)?.classList.add('active');
  document.getElementById(`mod-${name}`)?.classList.add('active');
  document.getElementById('adminModuleTitle').textContent = adminModuleNames[name] || name;
  if (name === 'usuarios') loadUsuarios();
  if (name === 'planes') loadPlanDistribucion();
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// ─── NEGOCIOS ─────────────────────────────────────────────────────────────────
function subscribeNegocios() {
  db.collection('barbershops').orderBy('createdAt','desc')
    .onSnapshot(async snap => {
      // Enriquecer cada negocio con el email/teléfono del owner
      const negocios = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Buscar datos del owner para cada negocio (batch, no más de 10 a la vez)
      const enriched = await Promise.all(negocios.map(async n => {
        if (!n.ownerId || n._ownerLoaded) return n;
        try {
          const uSnap = await db.collection('users').doc(n.ownerId).get();
          if (uSnap.exists) {
            const ud = uSnap.data();
            return { ...n, ownerEmail: ud.email || '', ownerPhone: ud.phone || '', ownerName: ud.displayName || '', _ownerLoaded: true };
          }
        } catch(e) { /* ignorar */ }
        return n;
      }));

      _allNegocios = enriched;
      filterNegocios();
      loadPlanDistribucion();
    }, err => console.error('Error negocios:', err));
}

function filterNegocios() {
  const q    = document.getElementById('adminSearchNegocio').value.toLowerCase();
  const plan = document.getElementById('adminFiltroPlan').value;
  let docs   = _allNegocios;
  if (q)    docs = docs.filter(n => n.name?.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
  if (plan) docs = docs.filter(n => n.plan === plan);
  renderNegocios(docs);
}

function renderNegocios(docs) {
  document.getElementById('adminStats').textContent =
    `${docs.length} de ${_allNegocios.length} negocio(s)`;

  if (docs.length === 0) {
    document.getElementById('adminNegociosList').innerHTML =
      '<div class="empty-state"><i class="bi bi-shop empty-icon"></i><p>No se encontraron negocios.</p></div>';
    return;
  }

  const planColors = { trial:'badge-muted', pro:'badge-gold', empresa:'badge-success', demo:'badge-dark' };
  const now = new Date();

  const cards = docs.map(n => {
    const exp      = n.planExpiresAt?.toDate ? n.planExpiresAt.toDate() : null;
    const act      = n.planActiveAt?.toDate  ? n.planActiveAt.toDate()  : null;
    const expStr   = exp ? exp.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    const actStr   = act ? act.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    const diffDays = exp ? Math.ceil((exp - now) / 86400000) : null;
    const isExpired = diffDays !== null && diffDays < 0;
    const isUrgent  = diffDays !== null && diffDays >= 0 && diffDays <= 3;
    const badgeClass = planColors[n.plan] || 'badge-muted';

    // Estado de cobro
    let statusBadge = '';
    let borderColor = 'var(--border)';
    if (n.plan === 'demo') {
      statusBadge = '<span class="badge badge-dark" style="font-size:0.7rem">Demo</span>';
    } else if (isExpired) {
      statusBadge = '<span class="badge badge-danger" style="font-size:0.7rem"><i class="bi bi-exclamation-circle"></i> Vencido</span>';
      borderColor = 'rgba(224,49,49,0.3)';
    } else if (isUrgent) {
      statusBadge = `<span class="badge badge-gold" style="font-size:0.7rem"><i class="bi bi-clock"></i> Vence en ${diffDays}d</span>`;
      borderColor = 'rgba(201,168,76,0.35)';
    } else if (exp) {
      statusBadge = `<span class="badge badge-success" style="font-size:0.7rem"><i class="bi bi-check-circle"></i> Activo</span>`;
    } else {
      statusBadge = '<span class="badge badge-muted" style="font-size:0.7rem">Sin fecha</span>';
    }

    return `
      <div class="card" style="margin-bottom:10px;padding:14px 18px;border-left:3px solid ${borderColor}">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="width:38px;height:38px;border-radius:50%;background:var(--accent-light);display:flex;align-items:center;
                      justify-content:center;font-weight:700;font-size:0.95rem;color:var(--accent);flex-shrink:0">
            ${(n.name||'?').charAt(0).toUpperCase()}
          </div>
          <div style="flex:1;min-width:140px">
            <div style="font-weight:600;font-size:0.92rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              ${escHtml(n.name||'Sin nombre')}
              <span class="badge ${badgeClass}" style="font-size:0.68rem">${(n.plan||'trial').toUpperCase()}</span>
              ${statusBadge}
            </div>
            <div style="font-size:0.74rem;color:var(--muted);margin-top:3px;display:flex;gap:14px;flex-wrap:wrap">
              ${act ? `<span><i class="bi bi-play-circle" style="margin-right:3px"></i>Habilitado: <strong>${actStr}</strong></span>` : '<span style="color:var(--muted)"><i class="bi bi-play-circle" style="margin-right:3px"></i>Sin fecha de inicio</span>'}
              ${exp ? `<span><i class="bi bi-calendar-x" style="margin-right:3px;color:${isExpired?'var(--danger)':isUrgent?'var(--accent)':'inherit'}"></i>Vence: <strong style="color:${isExpired?'var(--danger)':isUrgent?'var(--accent)':'inherit'}">${expStr}</strong></span>` : '<span style="color:var(--muted)"><i class="bi bi-calendar-x" style="margin-right:3px"></i>Sin vencimiento</span>'}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${isExpired || (!exp && n.plan !== 'demo') ? `
            <button class="btn btn-gold btn-sm" onclick="renovarRapido('${n.id}','${n.plan||'pro'}')" title="Renovar 30 días">
              <i class="bi bi-arrow-clockwise"></i> Renovar
            </button>` : ''}
            <button class="btn btn-outline btn-sm" onclick="abrirModalNegocio('${n.id}')">
              <i class="bi bi-pencil"></i> Gestionar
            </button>
          </div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('adminNegociosList').innerHTML = cards;
}

function abrirModalNegocio(id) {
  const n = _allNegocios.find(x => x.id === id);
  if (!n) return;
  _editingId = id;
  document.getElementById('modalNegocioTitle').textContent = escHtml(n.name || 'Negocio');

  const exp = n.planExpiresAt?.toDate ? n.planExpiresAt.toDate() : null;
  const act = n.planActiveAt?.toDate  ? n.planActiveAt.toDate()  : null;
  const expVal = exp ? exp.toISOString().slice(0,10) : '';
  const actVal = act ? act.toISOString().slice(0,10) : '';

  // Estado de cobro actual
  const now      = new Date();
  const diffDays = exp ? Math.ceil((exp - now) / 86400000) : null;
  const isExpired = diffDays !== null && diffDays < 0;

  let estadoHtml = '';
  if (isExpired) {
    estadoHtml = `<div style="padding:10px 14px;background:rgba(224,49,49,0.08);border:1px solid rgba(224,49,49,0.2);
                              border-radius:var(--radius);margin-bottom:16px;font-size:0.83rem;color:var(--danger)">
      <i class="bi bi-exclamation-triangle-fill" style="margin-right:6px"></i>
      <strong>Plan vencido</strong> — hace ${Math.abs(diffDays)} día${Math.abs(diffDays)!==1?'s':''}.
      Registra el pago y establece nueva fecha de vencimiento.
    </div>`;
  } else if (diffDays !== null && diffDays <= 3) {
    estadoHtml = `<div style="padding:10px 14px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);
                              border-radius:var(--radius);margin-bottom:16px;font-size:0.83rem;color:var(--accent)">
      <i class="bi bi-clock-fill" style="margin-right:6px"></i>
      <strong>Vence en ${diffDays} día${diffDays!==1?'s':''}</strong> — 
      ${exp.toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'})}.
      Coordina el pago con el cliente.
    </div>`;
  }

  document.getElementById('modalNegocioBody').innerHTML = `
    ${estadoHtml}
    <div class="form-group">
      <label class="label">Nombre del negocio</label>
      <input class="input" id="editNombre" value="${escHtml(n.name||'')}" />
    </div>
    <div class="form-group">
      <label class="label">Plan</label>
      <select class="input" id="editPlan">
        ${['trial','pro','empresa','demo'].map(p =>
          `<option value="${p}" ${n.plan===p?'selected':''}>${PLANS[p]?.label||p}</option>`
        ).join('')}
      </select>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group" style="margin:0">
        <label class="label">
          <i class="bi bi-play-circle" style="color:var(--success);margin-right:4px"></i>
          Fecha de habilitación
        </label>
        <input class="input" type="date" id="editActivo" value="${actVal}" />
        <div style="font-size:0.72rem;color:var(--muted);margin-top:4px">Día en que se registró el pago</div>
      </div>
      <div class="form-group" style="margin:0">
        <label class="label">
          <i class="bi bi-calendar-x" style="color:var(--danger);margin-right:4px"></i>
          Fecha de vencimiento
        </label>
        <input class="input" type="date" id="editExpira" value="${expVal}" />
        <div style="font-size:0.72rem;color:var(--muted);margin-top:4px">El plan vence a las 00:00 de este día</div>
      </div>
    </div>

    <div style="margin:14px 0;border-top:1px solid var(--border);padding-top:14px">
      <div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:10px">
        Atajos de renovación
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="setRenovacion(30)">+30 días</button>
        <button class="btn btn-outline btn-sm" onclick="setRenovacion(60)">+60 días</button>
        <button class="btn btn-outline btn-sm" onclick="setRenovacion(90)">+90 días</button>
        <button class="btn btn-outline btn-sm" onclick="setRenovacion(365)">+1 año</button>
      </div>
      <div style="font-size:0.72rem;color:var(--muted);margin-top:6px">
        Establece hoy como fecha de inicio y calcula el vencimiento automáticamente.
      </div>
    </div>

    <div class="form-group">
      <label class="label">Suspender cuenta</label>
      <select class="input" id="editSuspendido">
        <option value="false" ${n.active!==false?'selected':''}>No — cuenta activa</option>
        <option value="true"  ${n.active===false?'selected':''}>Sí — suspender acceso inmediatamente</option>
      </select>
      <div style="font-size:0.72rem;color:var(--muted);margin-top:4px">
        Suspender bloquea el acceso aunque el plan no haya vencido.
      </div>
    </div>

    <div style="font-size:0.75rem;color:var(--muted);padding:10px 0 0;border-top:1px solid var(--border);margin-top:4px;line-height:1.9">
      ${n.ownerName  ? `<div><strong style="color:var(--text-sub)">Owner:</strong> ${escHtml(n.ownerName)}</div>` : ''}
      ${n.ownerEmail ? `<div><strong style="color:var(--text-sub)">Email:</strong> ${escHtml(n.ownerEmail)}</div>` : ''}
      ${n.ownerPhone ? `<div><strong style="color:var(--text-sub)">Teléfono:</strong> <a href="https://wa.me/57${n.ownerPhone.replace(/\D/g,'')}" target="_blank" style="color:#25D366">${escHtml(n.ownerPhone)}</a></div>` : ''}
      <div><strong style="color:var(--text-sub)">ID Barbería:</strong> <code>${n.id}</code></div>
      <div><strong style="color:var(--text-sub)">Registrado:</strong> ${n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'}) : '—'}</div>
    </div>\``;

  openModal('modalNegocio');
}

// Atajos de renovación: fecha inicio = hoy, vencimiento = hoy + N días
function setRenovacion(dias) {
  const hoy    = new Date();
  const vence  = new Date();
  vence.setDate(hoy.getDate() + dias);
  const pad    = n => String(n).padStart(2,'0');
  const fmt    = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  document.getElementById('editActivo').value = fmt(hoy);
  document.getElementById('editExpira').value  = fmt(vence);
  // Mostrar confirmación visual
  const btn = event.target;
  const orig = btn.textContent;
  btn.textContent = '✓ Aplicado';
  btn.style.color = 'var(--success)';
  setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
}

// Renovar rápido desde la tarjeta (30 días por defecto)
async function renovarRapido(id, plan) {
  const n = _allNegocios.find(x => x.id === id);
  const nombre = n?.name || 'este negocio';
  if (!confirm(`¿Renovar "${nombre}" por 30 días desde hoy?`)) return;
  const hoy   = new Date();
  const vence = new Date();
  vence.setDate(hoy.getDate() + 30);
  try {
    await db.collection('barbershops').doc(id).update({
      plan: plan === 'trial' ? 'pro' : plan,
      planActiveAt:   hoy,
      planExpiresAt:  vence,
      active: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    Toast.success(`✓ "${nombre}" renovado hasta ${vence.toLocaleDateString('es-CO',{day:'2-digit',month:'long'})}`);
  } catch(err) {
    Toast.error('Error al renovar: ' + err.message);
  }
}

async function guardarNegocio() {
  if (!_editingId) return;
  const nombre     = document.getElementById('editNombre').value.trim();
  const plan       = document.getElementById('editPlan').value;
  const expira     = document.getElementById('editExpira').value;
  const activeAt   = document.getElementById('editActivo').value;   // fecha de habilitación
  const suspendido = document.getElementById('editSuspendido').value === 'true';

  if (!nombre) { Toast.error('El nombre es obligatorio.'); return; }

  // Validar que vencimiento no sea anterior a habilitación
  if (activeAt && expira && new Date(activeAt) > new Date(expira)) {
    Toast.error('La fecha de vencimiento no puede ser anterior a la fecha de habilitación.');
    return;
  }

  const btn = document.getElementById('guardarNegocioBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px"></span> Guardando...';

  try {
    const update = {
      name:   nombre,
      plan,
      active: !suspendido,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Fecha de habilitación (día que pagó)
    if (activeAt) {
      update.planActiveAt = new Date(activeAt + 'T00:00:00');
    }

    // Fecha de vencimiento — el plan vence a las 00:00:00 de ese día
    // Si hoy es el día de cobro y no ha pagado, el plan ya está vencido
    if (expira) {
      update.planExpiresAt = new Date(expira + 'T00:00:00');
    }

    await db.collection('barbershops').doc(_editingId).update(update);
    closeModal('modalNegocio');

    // Mensaje informativo según estado
    const vence = expira ? new Date(expira + 'T00:00:00') : null;
    const diff  = vence ? Math.ceil((vence - new Date()) / 86400000) : null;
    if (diff !== null && diff < 0) {
      Toast.info('Plan guardado — el plan quedó marcado como vencido.');
    } else if (suspendido) {
      Toast.info('Cuenta suspendida correctamente.');
    } else {
      Toast.success('Negocio actualizado ✓');
    }
  } catch(err) {
    console.error(err);
    Toast.error('Error al guardar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar cambios';
  }
}

// ─── USUARIOS ─────────────────────────────────────────────────────────────────
async function loadUsuarios() {
  const snap = await db.collection('users').orderBy('createdAt','desc').limit(100).get();
  if (snap.empty) {
    document.getElementById('adminUsuariosList').innerHTML =
      '<div class="empty-state"><i class="bi bi-people empty-icon"></i><p>No hay usuarios.</p></div>';
    return;
  }
  const rows = snap.docs.map(doc => {
    const d = doc.data();
    const roleColor = d.role==='superadmin'?'var(--danger)': d.role==='owner'?'var(--accent)':'var(--muted)';
    return `<tr>
      <td><strong>${escHtml(d.displayName||'—')}</strong></td>
      <td>${escHtml(d.email||'—')}</td>
      <td><span style="color:${roleColor};font-weight:600">${d.role||'—'}</span></td>
      <td><code style="font-size:0.75rem">${d.barbershopId||'—'}</code></td>
      <td>${d.createdAt?.toDate ? d.createdAt.toDate().toLocaleDateString('es-CO') : '—'}</td>
    </tr>`;
  }).join('');
  document.getElementById('adminUsuariosList').innerHTML = `
    <div class="table-responsive">
    <table>
      <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>BarbershopId</th><th>Creado</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

// ─── PLANES ───────────────────────────────────────────────────────────────────
async function cambiarPlan() {
  const bsId = document.getElementById('planBarbershopId').value.trim();
  const plan  = document.getElementById('planNuevo').value;
  const msgEl = document.getElementById('planMsgResult');
  if (!bsId) { msgEl.textContent='Ingresa el ID del negocio.'; msgEl.style.color='var(--danger)'; return; }
  try {
    const planData = PLANS[plan];
    const expira = new Date();
    expira.setDate(expira.getDate() + (planData?.durationDays || 14));
    await db.collection('barbershops').doc(bsId).update({
      plan, planExpiresAt: expira,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    msgEl.textContent = `✓ Plan "${PLANS[plan]?.label}" aplicado. Vence: ${expira.toLocaleDateString('es-CO')}`;
    msgEl.style.color = 'var(--success)';
  } catch(err) {
    msgEl.textContent = 'Error: ' + err.message;
    msgEl.style.color = 'var(--danger)';
  }
}

async function loadPlanDistribucion() {
  const counts = {};
  _allNegocios.forEach(n => { counts[n.plan||'trial'] = (counts[n.plan||'trial']||0)+1; });
  const total = _allNegocios.length || 1;
  const colors = { trial:'var(--muted)', pro:'var(--accent)', empresa:'var(--success)', demo:'var(--info)' };
  const html = Object.entries(counts).map(([plan, count]) => {
    const pct = Math.round((count/total)*100);
    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div style="width:80px;font-size:0.82rem;font-weight:600">${PLANS[plan]?.label||plan}</div>
        <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${colors[plan]||'var(--muted)'};border-radius:4px;transition:width 0.4s"></div>
        </div>
        <div style="font-size:0.82rem;color:var(--muted);min-width:50px;text-align:right">${count} (${pct}%)</div>
      </div>`;
  }).join('') || '<p style="color:var(--muted)">Sin datos</p>';
  const el = document.getElementById('planDistribucion');
  if (el) el.innerHTML = html;
}

// ─── DEMO ─────────────────────────────────────────────────────────────────────
async function seedDemo() {
  const btn   = document.getElementById('seedDemoBtn');
  const msgEl = document.getElementById('demoMsg');
  btn.disabled = true; btn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px"></span> Sembrando datos...';
  try {
    // Buscar la cuenta demo en Auth → users
    const snap = await db.collection('users').where('email','==','demo@fullfade.com').limit(1).get();
    if (snap.empty) {
      msgEl.textContent = '⚠️ Primero crea el usuario demo@fullfade.com en Firebase Auth, luego regístralo en la app.';
      msgEl.style.color = 'var(--warning)';
      return;
    }
    const demoUser = snap.docs[0];
    const bsId     = demoUser.data().barbershopId;
    if (!bsId) { msgEl.textContent = 'El usuario demo no tiene barbershopId.'; msgEl.style.color='var(--danger)'; return; }

    const batch = db.batch();
    const now   = firebase.firestore.FieldValue.serverTimestamp();

    // Servicios demo
    const servicios = ['Corte clásico','Fade completo','Barba perfilada','Corte + barba','Afeitado con navaja'];
    const precios   = [25000,35000,20000,45000,30000];
    const srvIds    = [];
    servicios.forEach((name,i) => {
      const ref = db.collection('services').doc();
      srvIds.push(ref.id);
      batch.set(ref, { barbershopId:bsId, name, price:precios[i], duration:30, active:true, createdAt:now });
    });

    // Barberos demo
    const barberos = ['Miguel Torres','Andrés Ruiz','Carlos Meza'];
    const barIds   = [];
    barberos.forEach(name => {
      const ref = db.collection('employees').doc();
      barIds.push(ref.id);
      batch.set(ref, { barbershopId:bsId, name, phone:'3001234567', specialty:'Fades y degradados', role:'barber', active:true, createdAt:now });
    });

    // Clientes demo
    const clientes = ['Juan Pérez','Luis García','Carlos Vargas','Pedro Martínez','Sebastián López'];
    clientes.forEach(name => {
      const ref = db.collection('customers').doc();
      batch.set(ref, { barbershopId:bsId, name, phone:'3009876543', notes:'Cliente frecuente', visits:3, createdAt:now });
    });

    await batch.commit();

    // Caja del día
    const cajaRef = await db.collection('cash_registers').add({
      barbershopId:bsId, openingBalance:150000, ingresos:0, egresos:0,
      status:'open', notes:'Caja demo', openedAt:new Date()
    });
    // Transacciones demo
    const txBatch = db.batch();
    [['Corte + barba - Miguel',45000,'ingreso'],['Fade - Andrés',35000,'ingreso'],
     ['Compra de insumos',25000,'egreso'],['Corte clásico',25000,'ingreso']].forEach(([concept,amount,type]) => {
      const ref = db.collection('transactions').doc();
      txBatch.set(ref, { barbershopId:bsId, cashRegisterId:cajaRef.id, type, amount, concept, createdAt:new Date() });
    });
    await txBatch.commit();
    await db.collection('cash_registers').doc(cajaRef.id).update({ ingresos:105000, egresos:25000 });

    // Plan demo
    const expDemo = new Date(); expDemo.setFullYear(expDemo.getFullYear()+10);
    await db.collection('barbershops').doc(bsId).update({ plan:'demo', planExpiresAt:expDemo });

    msgEl.textContent = '✓ Datos demo cargados correctamente.';
    msgEl.style.color = 'var(--success)';
  } catch(err) {
    console.error(err);
    msgEl.textContent = 'Error: ' + err.message;
    msgEl.style.color = 'var(--danger)';
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="bi bi-database-fill-add"></i> Rellenar datos demo';
  }
}

async function clearDemo() {
  if (!confirm('¿Eliminar todos los datos de la cuenta demo? Esta acción no se puede deshacer.')) return;
  const btn   = document.getElementById('clearDemoBtn');
  const msgEl = document.getElementById('demoMsg');
  btn.disabled = true;
  try {
    const snap = await db.collection('users').where('email','==','demo@fullfade.com').limit(1).get();
    if (snap.empty) { msgEl.textContent='Usuario demo no encontrado.'; msgEl.style.color='var(--danger)'; return; }
    const bsId = snap.docs[0].data().barbershopId;
    if (!bsId) return;
    const cols = ['employees','services','customers','transactions','cash_registers','appointments'];
    for (const col of cols) {
      const s = await db.collection(col).where('barbershopId','==',bsId).get();
      const b = db.batch();
      s.docs.forEach(d => b.delete(d.ref));
      await b.commit();
    }
    msgEl.textContent='✓ Datos demo eliminados.'; msgEl.style.color='var(--success)';
  } catch(err) {
    msgEl.textContent = 'Error: ' + err.message; msgEl.style.color='var(--danger)';
  } finally { btn.disabled=false; }
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => Toast.success('Copiado ✓'));
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
