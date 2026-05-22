// FullFade — Módulo de Citas (cliente nuevo/antiguo, visitas, contactar, tiempo real)

let citasBarbershopId = null;
let _serviciosCache   = [];
let _barberosCache    = [];
let _clienteSeleccionado = null; // { id, name, phone } del cliente antiguo elegido

function initCitas(barbershopId) {
  citasBarbershopId = barbershopId;
  subscribeCitas();

  document.getElementById('addCitaBtn').addEventListener('click', () => abrirModalCita());
  document.getElementById('guardarCita').addEventListener('click', guardarCita);

  // Tabs cliente nuevo/antiguo
  document.getElementById('tabClienteNuevo')?.addEventListener('click',  () => switchTabCliente('nuevo'));
  document.getElementById('tabClienteAntiguo')?.addEventListener('click', () => switchTabCliente('antiguo'));

  // Búsqueda de cliente antiguo
  document.getElementById('citaClienteBusqueda')?.addEventListener('input',
    debounce(e => buscarClientes(e.target.value.trim()), 300));
}

// ─── Abrir modal ──────────────────────────────────────────────────────────────
async function abrirModalCita() {
  if (!isPlanActive()) { Toast.error('Tu plan ha expirado. Renueva para agendar citas.'); return; }

  _clienteSeleccionado = null;
  switchTabCliente('nuevo');

  document.getElementById('citaClienteNombre').value = '';
  document.getElementById('citaClienteBusqueda').value = '';
  document.getElementById('citaClienteResultados').innerHTML = '';
  document.getElementById('citaClienteSeleccionado').innerHTML = '';
  document.getElementById('citaNotas').value = '';

  const pad     = n => String(n).padStart(2,'0');
  const nowMin  = new Date();
  const minStr  = `${nowMin.getFullYear()}-${pad(nowMin.getMonth()+1)}-${pad(nowMin.getDate())}T${pad(nowMin.getHours())}:${pad(nowMin.getMinutes())}`;
  const citaFechaEl = document.getElementById('citaFecha');
  citaFechaEl.min   = minStr;
  citaFechaEl.value = '';

  citaFechaEl.oninput = () => {
    const err = Validate.futureDate(citaFechaEl.value);
    Validate.markField(citaFechaEl, err);
    let hint = document.getElementById('citaFechaHint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'citaFechaHint';
      hint.style.cssText = 'font-size:0.78rem;margin-top:4px;min-height:16px';
      citaFechaEl.parentNode.appendChild(hint);
    }
    hint.textContent = err || '';
    hint.style.color = err ? 'var(--danger)' : 'var(--success)';
    if (!err && citaFechaEl.value) {
      const d = new Date(citaFechaEl.value);
      hint.textContent = '✓ ' + d.toLocaleString('es-CO',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
    }
  };

  const [servicios, barberos] = await Promise.all([
    getServiciosOptions(citasBarbershopId),
    getBarb(citasBarbershopId)
  ]);
  _serviciosCache = servicios;
  _barberosCache  = barberos;

  document.getElementById('citaServicio').innerHTML =
    '<option value="">Selecciona un servicio</option>' +
    servicios.map(s => `<option value="${s.id}">${escHtml(s.name)} — ${formatCOP(s.price)}</option>`).join('');
  document.getElementById('citaBarbero').innerHTML =
    '<option value="">Selecciona un barbero</option>' +
    barberos.map(b => `<option value="${b.id}">${escHtml(b.name)}</option>`).join('');

  ['citaServicio','citaBarbero','citaFecha'].forEach(id =>
    Validate.markField(document.getElementById(id), null));

  openModal('modalCita');
}

// ─── Tabs cliente nuevo / antiguo ────────────────────────────────────────────
function switchTabCliente(tab) {
  const tabNuevo   = document.getElementById('tabClienteNuevo');
  const tabAntiguo = document.getElementById('tabClienteAntiguo');
  const paneNuevo  = document.getElementById('paneClienteNuevo');
  const paneAntiguo= document.getElementById('paneClienteAntiguo');

  if (tab === 'nuevo') {
    tabNuevo.classList.add('tab-active');
    tabAntiguo.classList.remove('tab-active');
    paneNuevo.style.display  = 'block';
    paneAntiguo.style.display= 'none';
    _clienteSeleccionado = null;
  } else {
    tabAntiguo.classList.add('tab-active');
    tabNuevo.classList.remove('tab-active');
    paneAntiguo.style.display= 'block';
    paneNuevo.style.display  = 'none';
  }
}

// ─── Búsqueda de clientes existentes ─────────────────────────────────────────
function buscarClientes(q) {
  const resEl = document.getElementById('citaClienteResultados');
  if (!q || q.length < 2) { resEl.innerHTML = ''; return; }
  const matches = _allClientes.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    (c.phone||'').includes(q)
  ).slice(0, 6);

  if (matches.length === 0) {
    resEl.innerHTML = `<div style="padding:10px 14px;font-size:0.83rem;color:var(--muted)">
      No se encontró ningún cliente. <button class="btn btn-ghost btn-sm" style="color:var(--accent)"
        onclick="switchTabCliente('nuevo')">Registrar nuevo</button></div>`;
    return;
  }

  resEl.innerHTML = matches.map(c => `
    <div onclick="seleccionarClienteAntiguo('${c.id}')"
         style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;
                border-bottom:1px solid var(--border);transition:background 0.15s"
         onmouseenter="this.style.background='var(--surface2)'"
         onmouseleave="this.style.background=''">
      <div style="width:30px;height:30px;border-radius:50%;background:var(--accent-light);
                  display:flex;align-items:center;justify-content:center;font-weight:700;
                  font-size:0.8rem;color:var(--accent);flex-shrink:0">
        ${(c.name).charAt(0).toUpperCase()}
      </div>
      <div>
        <div style="font-weight:600;font-size:0.88rem">${escHtml(c.name)}</div>
        <div style="font-size:0.75rem;color:var(--muted)">${c.phone||'Sin teléfono'} · ${c.visits||0} visita${(c.visits||0)!==1?'s':''}</div>
      </div>
    </div>`).join('');
}

function seleccionarClienteAntiguo(id) {
  const c = _allClientes.find(x => x.id === id);
  if (!c) return;
  _clienteSeleccionado = c;

  document.getElementById('citaClienteResultados').innerHTML = '';
  document.getElementById('citaClienteBusqueda').value = '';
  document.getElementById('citaClienteSeleccionado').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;
                background:var(--accent-light);border:1px solid rgba(201,168,76,0.3);
                border-radius:var(--radius);margin-top:8px">
      <div style="width:32px;height:32px;border-radius:50%;background:var(--accent);
                  display:flex;align-items:center;justify-content:center;font-weight:700;
                  font-size:0.85rem;color:#fff;flex-shrink:0">
        ${c.name.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1">
        <div style="font-weight:600">${escHtml(c.name)}</div>
        <div style="font-size:0.75rem;color:var(--muted)">${c.phone||'Sin teléfono'} · ${c.visits||0} visitas previas</div>
      </div>
      <button onclick="deseleccionarCliente()" class="btn btn-ghost btn-sm" style="color:var(--muted)">
        <i class="bi bi-x"></i>
      </button>
    </div>`;
}

function deseleccionarCliente() {
  _clienteSeleccionado = null;
  document.getElementById('citaClienteSeleccionado').innerHTML = '';
}

// ─── Guardar cita ─────────────────────────────────────────────────────────────
async function guardarCita() {
  const esNuevo  = document.getElementById('paneClienteNuevo').style.display !== 'none';
  const servicio = document.getElementById('citaServicio').value;
  const barbero  = document.getElementById('citaBarbero').value;
  const fechaStr = document.getElementById('citaFecha').value;
  const notas    = document.getElementById('citaNotas').value.trim();

  // Validar cliente
  let clienteNombre = '';
  let clienteId     = null;

  if (esNuevo) {
    clienteNombre = document.getElementById('citaClienteNombre').value.trim();
    const errNombre = Validate.name(clienteNombre, 2);
    Validate.markField(document.getElementById('citaClienteNombre'), errNombre);
    if (errNombre) { Toast.error(errNombre); return; }
  } else {
    if (!_clienteSeleccionado) { Toast.error('Selecciona un cliente de la lista.'); return; }
    clienteNombre = _clienteSeleccionado.name;
    clienteId     = _clienteSeleccionado.id;
  }

  const errServicio = !servicio ? 'Selecciona un servicio.' : null;
  const errBarbero  = !barbero  ? 'Selecciona un barbero.'  : null;
  const errFecha    = Validate.futureDate(fechaStr);
  Validate.markField(document.getElementById('citaServicio'), errServicio);
  Validate.markField(document.getElementById('citaBarbero'),  errBarbero);
  Validate.markField(document.getElementById('citaFecha'),    errFecha);
  if (errServicio || errBarbero || errFecha) { Toast.error(errServicio||errBarbero||errFecha); return; }

  const fecha        = new Date(fechaStr);
  const servicioData = _serviciosCache.find(s => s.id === servicio);
  const barberoData  = _barberosCache.find(b => b.id === barbero);

  const btn = document.getElementById('guardarCita');
  btn.disabled = true;
  btn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px"></span> Guardando...';

  try {
    // Si es cliente nuevo, crearlo en customers primero
    if (esNuevo) {
      if (!canAddCliente(_allClientes.length)) {
        Toast.error(`Tu plan permite hasta ${getPlan().maxClientes} clientes. Mejora tu plan.`);
        btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i> Agendar cita';
        return;
      }
      const nuevoRef = await db.collection('customers').add({
        barbershopId: citasBarbershopId,
        name: clienteNombre, phone: '', notes: '',
        visits: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      clienteId = nuevoRef.id;
      Toast.info('Cliente nuevo registrado automáticamente.');
    }

    await db.collection('appointments').add({
      barbershopId: citasBarbershopId,
      clientName:   clienteNombre,
      clienteId:    clienteId || null,
      serviceId:    servicio,
      serviceName:  servicioData?.name  || '',
      servicePrice: servicioData?.price || 0,
      employeeId:   barbero,
      employeeName: barberoData?.name   || '',
      date:         fecha,
      notes:        notas,
      status:       'scheduled',
      createdAt:    firebase.firestore.FieldValue.serverTimestamp()
    });

    closeModal('modalCita');
    Toast.success('Cita agendada ✓');
  } catch(err) {
    console.error(err);
    Toast.error('Error al agendar la cita.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-lg"></i> Agendar cita';
  }
}

// ─── Suscripción en tiempo real ───────────────────────────────────────────────
function subscribeCitas() {
  const now = new Date();
  const unsub = db.collection('appointments')
    .where('barbershopId', '==', citasBarbershopId)
    .where('date', '>=', now)
    .where('status', '==', 'scheduled')
    .orderBy('date')
    .limit(50)
    .onSnapshot(snap => {
      const newIds = new Set(snap.docChanges().filter(ch=>ch.type==='added').map(ch=>ch.doc.id));
      renderCitasFromDocs(snap.docs, newIds);
    },
      () => loadCitasFallback());
  RealtimeManager.register('citas', unsub);
}

async function loadCitasFallback() {
  try {
    const snap = await db.collection('appointments')
      .where('barbershopId', '==', citasBarbershopId)
      .where('date', '>=', new Date())
      .orderBy('date').limit(50).get();
    renderCitasFromDocs(snap.docs);
  } catch(e) { console.error(e); }
}

// ─── Render tabla de citas ────────────────────────────────────────────────────
function renderCitasFromDocs(docs, newIds = new Set()) {
  if (docs.length === 0) {
    document.getElementById('citasList').innerHTML =
      '<div class="empty-state"><i class="bi bi-calendar2-x empty-icon"></i><p>No hay citas próximas agendadas.</p></div>';
    return;
  }

  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tom   = new Date(today.getTime() + 86400000);

  function dayLabel(d) {
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (dd.getTime() === today.getTime()) return 'Hoy';
    if (dd.getTime() === tom.getTime())   return 'Mañana';
    return d.toLocaleDateString('es-CO',{weekday:'short',day:'numeric',month:'short'});
  }

  const statusMap = {
    scheduled: '<span class="badge badge-gold">Agendada</span>',
    completed: '<span class="badge badge-success">Completada</span>',
    cancelled: '<span class="badge badge-danger">Cancelada</span>'
  };

  const rows = docs.map(doc => {
    const d      = doc.data();
    const dt     = d.date?.toDate ? d.date.toDate() : new Date(d.date);
    const hora   = dt.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const dia    = dayLabel(dt);
    const isNear = (dt - now) < 60 * 60000;

    const phone     = d.clientePhone || (_allClientes.find(c=>c.id===d.clienteId)?.phone) || '';
    const waLink    = phone
      ? `<a href="https://wa.me/57${phone.replace(/\D/g,'')}" target="_blank"
            class="btn btn-ghost btn-sm" title="WhatsApp" style="color:#25D366;padding:3px 7px">
           <i class="bi bi-whatsapp"></i>
         </a>`
      : '';

    const rowClass = newIds.has(doc.id) ? 'row-new' : '';
    const rowStyle = isNear && !newIds.has(doc.id) ? 'background:rgba(201,168,76,0.06)' : '';
    return `<tr class="${rowClass}" style="${rowStyle}">
      <td>
        <span style="font-weight:600">${dia}</span>
        <span style="color:var(--muted);margin-left:6px;font-size:0.82rem">${hora}</span>
        ${isNear ? '<span class="badge badge-gold" style="margin-left:6px;font-size:0.65rem">Pronto</span>' : ''}
      </td>
      <td><strong>${escHtml(d.clientName)}</strong></td>
      <td>${escHtml(d.serviceName||'—')}</td>
      <td>${escHtml(d.employeeName||'—')}</td>
      <td style="font-weight:600">${d.servicePrice ? formatCOP(d.servicePrice) : '—'}</td>
      <td>${statusMap[d.status] || d.status}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
          ${waLink}
          <button class="btn btn-ghost btn-sm" title="Completar"
                  style="color:var(--success);padding:3px 8px"
                  onclick="completarCita('${doc.id}','${d.clienteId||''}')">
            <i class="bi bi-check-lg"></i>
          </button>
          <button class="btn btn-ghost btn-sm" title="Cancelar"
                  style="color:var(--danger);padding:3px 8px"
                  onclick="updateCitaStatus('${doc.id}','cancelled')">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('citasList').innerHTML = `
    <div class="table-responsive">
    <table>
      <thead><tr>
        <th>Fecha / Hora</th><th>Cliente</th><th>Servicio</th>
        <th>Barbero</th><th>Precio</th><th>Estado</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

// ─── Completar cita e incrementar visitas ─────────────────────────────────────
async function completarCita(citaId, clienteId) {
  try {
    await db.collection('appointments').doc(citaId).update({ status: 'completed' });
    if (clienteId) await incrementarVisitasCliente(clienteId);
    Toast.success('Cita completada ✓');
  } catch(err) {
    Toast.error('Error al actualizar la cita.');
  }
}

async function updateCitaStatus(id, status) {
  try {
    await db.collection('appointments').doc(id).update({ status });
    Toast.success(status === 'completed' ? 'Cita completada ✓' : 'Cita cancelada.');
  } catch(err) {
    Toast.error('Error al actualizar la cita.');
  }
}

async function getBarb(barbershopId) {
  const snap = await db.collection('employees')
    .where('barbershopId', '==', barbershopId)
    .where('active', '==', true).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function escHtml(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
