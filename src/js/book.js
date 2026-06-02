// FullFade — Lógica de la página pública de agendamiento

const DIAS_KEY = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

// Estado global del wizard
let _barbershopId  = null;
let _barbershopData= null;
let _horario       = null;
let _barberos      = [];
let _servicios     = [];
let _slotsTomados  = {}; // { 'HH:MM': true } para la fecha+barbero seleccionado
let _lastSlotsTodos = []; // copia de los slots generados para refrescar la vista

let sel = {
  barberoId:    null, barberoNombre: '',
  servicioId:   null, servicioNombre: '', servicioPrice: 0,
  fecha:        null, fechaStr: '',
  hora:         null,
};

// ID del lock temporal que este cliente colocó (para liberarlo si desiste)
let _lockDocId = null;

let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();

// ── Inicialización ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('t');

  if (!token) { showError(); return; }

  try {
    // Buscar barbershop por token
    const snap = await db.collection('barbershops')
      .where('horario.bookingToken', '==', token)
      .where('active', '==', true)
      .limit(1)
      .get();

    if (snap.empty) { showError(); return; }

    const doc         = snap.docs[0];
    _barbershopId     = doc.id;
    _barbershopData   = { id: doc.id, ...doc.data() };
    _horario          = _barbershopData.horario || null;

    // Nombre del negocio en el header
    document.getElementById('bookShopName').textContent = _barbershopData.name || 'Barbería';
    document.title = `Agendar cita - ${_barbershopData.name || 'Barbería'}`;

    // Cargar barberos y servicios en paralelo
    const [bSnap, sSnap] = await Promise.all([
      db.collection('employees')
        .where('barbershopId', '==', _barbershopId)
        .where('active', '==', true)
        .get(),
      db.collection('services')
        .where('barbershopId', '==', _barbershopId)
        .where('active', '==', true)
        .get()
    ]);

    _barberos  = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    _servicios = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (_barberos.length === 0) { showError('Sin barberos disponibles'); return; }

    document.getElementById('bookLoading').style.display = 'none';
    document.getElementById('bookBody').style.display    = 'block';

    renderBarberos();
    renderCalendar();
  } catch(err) {
    console.error(err);
    showError();
  }
});

function showError(msg) {
  document.getElementById('bookLoading').style.display = 'none';
  const el = document.getElementById('bookError');
  el.style.display = 'flex';
  if (msg) el.querySelector('p').textContent = msg;
}

// ── Navegación entre pasos ──────────────────────────────────────────────────
function goStep(n) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step${i}`);
    if (el) el.style.display = i === n ? 'block' : 'none';
    const ind = document.getElementById(`step-ind-${i}`);
    if (ind) {
      ind.classList.remove('active','done');
      if (i === n)    ind.classList.add('active');
      if (i < n)      ind.classList.add('done');
    }
  }
  document.getElementById('successScreen').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (n === 4) loadSlots();
  if (n === 5) actualizarResumen();
}

// ── PASO 1: Barberos ─────────────────────────────────────────────────────────
function renderBarberos() {
  const grid = document.getElementById('barberoGrid');
  if (_barberos.length === 0) {
    grid.innerHTML = '<div class="empty-state-sm"><i class="bi bi-person-x"></i>No hay barberos disponibles</div>';
    return;
  }
  grid.innerHTML = _barberos.map(b => {
    const inicial   = (b.name || 'B').charAt(0).toUpperCase();
    const avatarHtml = b.photoBase64
      ? `<div class="barber-avatar barber-avatar--photo"><img src="${b.photoBase64}" alt="${escHtml(b.name)}" /></div>`
      : `<div class="barber-avatar">${inicial}</div>`;
    return `
      <div class="barber-option" id="barber-${b.id}" onclick="selectBarbero('${b.id}','${escHtml(b.name)}')">
        ${avatarHtml}
        <div class="barber-name">${escHtml(b.name)}</div>
        <div class="barber-spec">${escHtml(b.specialty || 'Barbero')}</div>
      </div>`;
  }).join('');
}

function selectBarbero(id, nombre) {
  sel.barberoId     = id;
  sel.barberoNombre = nombre;
  document.querySelectorAll('.barber-option').forEach(el => el.classList.remove('selected'));
  document.getElementById(`barber-${id}`)?.classList.add('selected');
  document.getElementById('step1Next').disabled = false;

  // Pre-cargar servicios
  renderServicios();
}

// ── PASO 2: Servicios ────────────────────────────────────────────────────────
function renderServicios() {
  const list = document.getElementById('servicioList');
  if (_servicios.length === 0) {
    list.innerHTML = '<div class="empty-state-sm"><i class="bi bi-list-x"></i>No hay servicios registrados</div>';
    return;
  }
  list.innerHTML = _servicios.map(s => `
    <div class="service-option" id="srv-${s.id}" onclick="selectServicio('${s.id}','${escHtml(s.name)}',${s.price||0})">
      <div>
        <div class="service-name">${escHtml(s.name)}</div>
        <div class="service-dur"><i class="bi bi-clock" style="margin-right:3px"></i>${s.duration||30} min</div>
      </div>
      <div class="service-price">${formatCOPSimple(s.price||0)}</div>
    </div>`).join('');
}

function selectServicio(id, nombre, price) {
  sel.servicioId     = id;
  sel.servicioNombre = nombre;
  sel.servicioPrice  = price;
  document.querySelectorAll('.service-option').forEach(el => el.classList.remove('selected'));
  document.getElementById(`srv-${id}`)?.classList.add('selected');
  document.getElementById('step2Next').disabled = false;
}

// ── PASO 3: Calendario ───────────────────────────────────────────────────────
function renderCalendar() {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('calTitle').textContent = `${meses[calMonth]} ${calYear}`;

  const hoy       = new Date();
  const todayY    = hoy.getFullYear();
  const todayM    = hoy.getMonth();
  const todayD    = hoy.getDate();

  const firstDay  = new Date(calYear, calMonth, 1).getDay();
  const daysInMon = new Date(calYear, calMonth + 1, 0).getDate();

  const grid = document.getElementById('calGrid');
  let html   = '';

  // Blanks
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

  for (let d = 1; d <= daysInMon; d++) {
    const date    = new Date(calYear, calMonth, d);
    const diaSem  = date.getDay(); // 0=domingo
    const isPast  = (calYear < todayY) ||
                    (calYear === todayY && calMonth < todayM) ||
                    (calYear === todayY && calMonth === todayM && d < todayD);
    const isToday = calYear === todayY && calMonth === todayM && d === todayD;

    // Verificar si el negocio abre ese día de la semana
    const diaKey  = DIAS_KEY[diaSem];
    const diaConf = _horario ? _horario[diaKey] : null;
    const isClosed = diaConf ? !diaConf.abierto : false;

    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isSelec = sel.fechaStr === dateStr;

    let cls = 'cal-day';
    if (isPast)     cls += ' past';
    else if (isClosed) cls += ' closed';
    else {
      cls += ' available';
      if (isToday)  cls += ' today';
      if (isSelec)  cls += ' selected';
    }

    const onclick = (!isPast && !isClosed)
      ? `onclick="selectFecha('${dateStr}',${d})"`
      : '';

    html += `<div class="${cls}" ${onclick}>${d}</div>`;
  }

  grid.innerHTML = html;

  // Bloquear ir a meses anteriores al actual
  const isCurrentMonth = calYear === todayY && calMonth === todayM;
  document.getElementById('calPrev').disabled = isCurrentMonth;
  document.getElementById('calPrev').style.opacity = isCurrentMonth ? '0.3' : '1';
}

function cambiarMes(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}

function selectFecha(dateStr, d) {
  sel.fecha    = new Date(dateStr + 'T00:00:00');
  sel.fechaStr = dateStr;

  // Actualizar UI del calendario
  document.querySelectorAll('.cal-day.available').forEach(el => el.classList.remove('selected'));
  event.target.classList.add('selected');

  const meses = ['enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const diaSemLabel = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const diaSem      = sel.fecha.getDay();
  sel.fechaLabel = `${diaSemLabel[diaSem]} ${d} de ${meses[calMonth]}`;

  document.getElementById('step3Next').disabled = false;
  // Reset hora si cambia la fecha
  sel.hora = null;
  document.getElementById('step4Next').disabled = true;
}

// ── PASO 4: Slots de hora ────────────────────────────────────────────────────
async function loadSlots() {
  const container = document.getElementById('slotsContainer');
  container.innerHTML = '<div class="empty-state-sm"><i class="spin" style="width:24px;height:24px;display:inline-block"></i></div>';

  const diaSem  = sel.fecha.getDay();
  const diaKey  = DIAS_KEY[diaSem];
  const diaConf = _horario ? _horario[diaKey] : null;

  if (!diaConf || !diaConf.abierto) {
    container.innerHTML = '<div class="empty-state-sm"><i class="bi bi-calendar-x"></i>El negocio está cerrado ese día.</div>';
    return;
  }

  const slotMin = parseInt(_horario?.slotMinutos) || 30;
  const todos   = generarSlots(diaConf.apertura, diaConf.cierre, slotMin);

  // Buscar citas ya tomadas para este barbero en esta fecha
  const inicio = new Date(sel.fechaStr + 'T00:00:00');
  const fin    = new Date(sel.fechaStr + 'T23:59:59');

  try {
    // Citas ya confirmadas
    const snap = await db.collection('appointments')
      .where('barbershopId', '==', _barbershopId)
      .where('employeeId',   '==', sel.barberoId)
      .where('date',         '>=', inicio)
      .where('date',         '<=', fin)
      .where('status',       '==', 'scheduled')
      .get();

    _slotsTomados = {};
    snap.forEach(doc => {
      const d    = doc.data();
      const dt   = d.date?.toDate ? d.date.toDate() : new Date(d.date);
      const hStr = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
      _slotsTomados[hStr] = true;
    });

    // Locks temporales activos de otros usuarios (no expirados)
    const ahora = new Date();
    const lockSnap = await db.collection('slot_locks')
      .where('barbershopId', '==', _barbershopId)
      .where('barberoId',    '==', sel.barberoId)
      .where('fecha',        '==', sel.fechaStr)
      .get();

    lockSnap.forEach(doc => {
      // Ignorar el propio lock y locks ya expirados
      if (doc.id === _lockDocId) return;
      const lk = doc.data();
      const expira = lk.expira?.toDate ? lk.expira.toDate() : new Date(lk.expira);
      if (expira > ahora) {
        _slotsTomados[lk.hora] = true; // marcar como ocupado temporalmente
      }
    });

    _lastSlotsTodos = todos; // guardar para refrescar si expira el lock
    renderSlots(todos);
  } catch(err) {
    console.error(err);
    _lastSlotsTodos = todos;
    renderSlots(todos); // mostrar slots sin bloquear si falla la consulta
  }
}

function generarSlots(apertura, cierre, slotMinutos) {
  const slots = [];
  const [aH, aM] = apertura.split(':').map(Number);
  const [cH, cM] = cierre.split(':').map(Number);
  let mins = aH * 60 + aM;
  const finMins = cH * 60 + cM;
  while (mins + slotMinutos <= finMins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    mins += slotMinutos;
  }
  return slots;
}

function renderSlots(todos) {
  const container = document.getElementById('slotsContainer');
  const now       = new Date();
  // Usar fecha local (no UTC) para evitar desfase horario en Colombia (UTC-5):
  // toISOString() devuelve UTC y después de las 7 PM ya es "mañana" en UTC,
  // lo que hace que isToday sea true para el día siguiente y bloquea sus slots.
  const todayStr  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const isToday   = sel.fechaStr === todayStr;
  const nowMins   = now.getHours() * 60 + now.getMinutes();

  if (todos.length === 0) {
    container.innerHTML = '<div class="empty-state-sm"><i class="bi bi-clock-history"></i>No hay slots disponibles para este día.</div>';
    return;
  }

  const html = todos.map(slot => {
    const [h, m] = slot.split(':').map(Number);
    const slotMins = h * 60 + m;
    const isTaken = _slotsTomados[slot];
    const isPast  = isToday && slotMins <= nowMins;
    const isSelec = sel.hora === slot;

    let cls  = 'slot-btn';
    let extra = '';
    if (isTaken)      { cls += ' taken'; extra = 'title="No disponible"'; }
    else if (isPast)  { cls += ' past';  extra = 'title="Hora pasada"'; }
    else if (isSelec) { cls += ' selected'; }

    const onclick = (!isTaken && !isPast)
      ? `onclick="selectSlot('${slot}')"` : '';

    // Formato 12h ampm
    const ampm = h < 12 ? 'a.m.' : 'p.m.';
    const h12  = h % 12 || 12;
    const label = `${h12}:${String(m).padStart(2,'0')} ${ampm}`;

    return `<div class="${cls}" ${extra} ${onclick}>${label}</div>`;
  }).join('');

  container.innerHTML = `<div class="slots-grid">${html}</div>`;
}

async function selectSlot(hora) {
  // Si ya había un lock previo (cambió de hora), liberarlo primero
  await _liberarLock();

  sel.hora = hora;
  document.querySelectorAll('.slot-btn').forEach(el => el.classList.remove('selected'));
  event.target.classList.add('selected');
  document.getElementById('step4Next').disabled = false;

  // Colocar lock temporal: dura 3 minutos máximo
  await _colocarLock(hora);
}

// ── Lock optimista: reserva el slot temporalmente mientras el usuario llena datos ──
async function _colocarLock(hora) {
  if (!sel.barberoId || !sel.fechaStr || !hora) return;
  try {
    const expira = new Date(Date.now() + 3 * 60 * 1000); // 3 minutos
    const ref = await db.collection('slot_locks').add({
      barbershopId: _barbershopId,
      barberoId:    sel.barberoId,
      fecha:        sel.fechaStr,
      hora:         hora,
      expira:       expira,
      createdAt:    firebase.firestore.FieldValue.serverTimestamp()
    });
    _lockDocId = ref.id;

    // Auto-liberar cuando vence el timer (por si el usuario abandona sin acción)
    setTimeout(() => {
      if (_lockDocId === ref.id) {
        _liberarLock();
        // Si el slot ya no está disponible, actualizar la vista
        renderSlots(_lastSlotsTodos || []);
      }
    }, 3 * 60 * 1000);
  } catch(err) {
    // Si falla el lock no bloqueamos al usuario; el double-check en confirmarCita protege igual
    console.warn('Lock no pudo crearse:', err.message);
  }
}

async function _liberarLock() {
  if (!_lockDocId) return;
  const id = _lockDocId;
  _lockDocId = null;
  try {
    await db.collection('slot_locks').doc(id).delete();
  } catch(err) {
    console.warn('Lock no pudo liberarse:', err.message);
  }
}

// ── PASO 5: Resumen y datos ──────────────────────────────────────────────────
function actualizarResumen() {
  document.getElementById('sumBarbero').textContent  = sel.barberoNombre || '—';
  document.getElementById('sumServicio').textContent = sel.servicioNombre || '—';
  document.getElementById('sumFecha').textContent    = sel.fechaLabel || sel.fechaStr || '—';

  // Hora en 12h
  if (sel.hora) {
    const [h, m] = sel.hora.split(':').map(Number);
    const ampm   = h < 12 ? 'a.m.' : 'p.m.';
    const h12    = h % 12 || 12;
    document.getElementById('sumHora').textContent = `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
  }
}

// ── Confirmar cita ───────────────────────────────────────────────────────────
async function confirmarCita() {
  const nombre   = document.getElementById('clienteNombre').value.trim();
  const telefono = document.getElementById('clienteTelefono').value.trim();
  const notas    = document.getElementById('clienteNotas').value.trim();

  // Validaciones
  if (!nombre) {
    document.getElementById('clienteNombre').classList.add('error');
    document.getElementById('clienteNombre').focus();
    return;
  }
  if (!telefono || telefono.replace(/\D/g,'').length < 7) {
    document.getElementById('clienteTelefono').classList.add('error');
    document.getElementById('clienteTelefono').focus();
    return;
  }
  document.getElementById('clienteNombre').classList.remove('error');
  document.getElementById('clienteTelefono').classList.remove('error');

  // Construir datetime de la cita
  const [h, m]  = sel.hora.split(':').map(Number);
  const citaDate = new Date(sel.fecha);
  citaDate.setHours(h, m, 0, 0);

  // Verificar que no sea pasada (puede haber pasado tiempo desde que eligió)
  if (citaDate <= new Date()) {
    alert('Lo sentimos, ese slot ya pasó. Por favor elige otra hora.');
    goStep(4);
    return;
  }

  const btn = document.getElementById('confirmarCitaBtn');
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;margin-right:8px"></span> Confirmando...';

  try {
    // Verificar de nuevo si el slot sigue libre (race condition)
    const inicio = new Date(sel.fechaStr + 'T00:00:00');
    const fin    = new Date(sel.fechaStr + 'T23:59:59');
    const check  = await db.collection('appointments')
      .where('barbershopId', '==', _barbershopId)
      .where('employeeId',   '==', sel.barberoId)
      .where('date',         '>=', inicio)
      .where('date',         '<=', fin)
      .where('status',       '==', 'scheduled')
      .get();

    let slotOcupado = false;
    check.forEach(doc => {
      const d    = doc.data();
      const dt   = d.date?.toDate ? d.date.toDate() : new Date(d.date);
      const dH   = dt.getHours();
      const dM   = dt.getMinutes();
      if (dH === h && dM === m) slotOcupado = true;
    });

    if (slotOcupado) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-circle"></i> Confirmar cita';
      alert('Ese horario acaba de ser tomado por otro cliente. Por favor elige otra hora.');
      goStep(4);
      loadSlots();
      return;
    }

    // Buscar o crear cliente
    let clienteId = null;
    const cliSnap = await db.collection('customers')
      .where('barbershopId', '==', _barbershopId)
      .where('phone', '==', telefono)
      .limit(1)
      .get();

    if (!cliSnap.empty) {
      clienteId = cliSnap.docs[0].id;
    } else {
      const cliRef = await db.collection('customers').add({
        barbershopId: _barbershopId,
        name:         nombre,
        phone:        telefono,
        notes:        notas,
        visits:       0,
        source:       'booking_link',
        createdAt:    firebase.firestore.FieldValue.serverTimestamp()
      });
      clienteId = cliRef.id;
    }

    // Generar código único de cancelación (6 caracteres alfanumérico)
    const cancelCode = Math.random().toString(36).substring(2, 5).toUpperCase() +
                       Math.random().toString(36).substring(2, 5).toUpperCase().slice(0, 3);

    // Crear la cita
    const srvData = _servicios.find(s => s.id === sel.servicioId);
    const barData = _barberos.find(b => b.id === sel.barberoId);

    const apptRef = await db.collection('appointments').add({
      barbershopId:  _barbershopId,
      clientName:    nombre,
      clienteId:     clienteId,
      clientPhone:   telefono,
      serviceId:     sel.servicioId,
      serviceName:   srvData?.name  || '',
      servicePrice:  srvData?.price || 0,
      employeeId:    sel.barberoId,
      employeeName:  barData?.name  || '',
      date:          citaDate,
      notes:         notas,
      status:        'scheduled',
      source:        'booking_link',  // Identifica que vino del link público
      cancelCode:    cancelCode,
      createdAt:     firebase.firestore.FieldValue.serverTimestamp()
    });

    // Liberar el lock (ya no es necesario, la cita quedó confirmada)
    await _liberarLock();

    // Mostrar pantalla de éxito, pasando el id para poder cancelar
    mostrarExito(nombre, telefono, srvData, barData, citaDate, apptRef.id, cancelCode);

  } catch(err) {
    console.error(err);
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle"></i> Confirmar cita';
    alert('Ocurrió un error al confirmar la cita. Intenta de nuevo.');
  }
}

function mostrarExito(nombre, telefono, srv, bar, fecha, apptId, cancelCode) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step${i}`);
    if (el) el.style.display = 'none';
  }
  // Ocultar también tabs y stepsBar al mostrar el éxito
  const stepsBar = document.getElementById('stepsBar');
  if (stepsBar) stepsBar.style.display = 'none';
  const bookTabs = document.querySelector('.book-tabs');
  if (bookTabs) bookTabs.style.display = 'none';

  const screen = document.getElementById('successScreen');
  screen.style.display = 'flex';

  const [h, m] = sel.hora.split(':').map(Number);
  const ampm   = h < 12 ? 'a.m.' : 'p.m.';
  const h12    = h % 12 || 12;
  const horaLabel  = `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
  const fechaLabel = `${sel.fechaLabel || sel.fechaStr}`;

  document.getElementById('successDetail').innerHTML = `
    <div class="success-detail-row"><span>Barbero</span><span>${escHtml(bar?.name||'—')}</span></div>
    <div class="success-detail-row"><span>Servicio</span><span>${escHtml(srv?.name||'—')}</span></div>
    <div class="success-detail-row"><span>Fecha</span><span>${fechaLabel}</span></div>
    <div class="success-detail-row"><span>Hora</span><span>${horaLabel}</span></div>
    <div class="success-detail-row"><span>Precio</span><span>${formatCOPSimple(srv?.price||0)}</span></div>
  `;

  // Link de WhatsApp al negocio
  const phone = (_barbershopData.phone||'').replace(/\D/g,'');
  const waMsg = encodeURIComponent(
    `Hola, acabo de agendar una cita:\n` +
    `- Nombre: ${nombre}\n- Servicio: ${srv?.name}\n- Barbero: ${bar?.name}\n` +
    `- Fecha: ${fechaLabel} a las ${horaLabel}`
  );
  const waLink = phone
    ? `https://wa.me/57${phone}?text=${waMsg}`
    : `https://wa.me/?text=${waMsg}`;
  document.getElementById('successWa').href = waLink;

  // Mostrar código de cancelación
  const codeBox = document.getElementById('successCancelCode');
  const codeVal = document.getElementById('successCancelCodeValue');
  if (codeBox && codeVal && cancelCode) {
    codeVal.textContent = cancelCode;
    codeBox.style.display = 'block';
  }

  // El wrap inline ya no se usa (se reemplazó por el panel de código)
  const cancelWrap = document.getElementById('successCancelWrap');
  if (cancelWrap) cancelWrap.style.display = 'none';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Tab switcher ──────────────────────────────────────────────────────────────
function switchBookTab(tab) {
  const isAgendar = tab === 'agendar';
  document.getElementById('tabAgendar').classList.toggle('active',  isAgendar);
  document.getElementById('tabCancelar').classList.toggle('active', !isAgendar);

  const cancelPanel = document.getElementById('cancelPanel');
  const stepsBar    = document.getElementById('stepsBar');
  const successScr  = document.getElementById('successScreen');

  cancelPanel.style.display = isAgendar ? 'none' : 'block';

  if (isAgendar) {
    // Volver al wizard: mostrar stepsBar y el step activo
    if (stepsBar) stepsBar.style.display = '';
    if (successScr) successScr.style.display = 'none';
    // Mostrar el paso actual (step1 si no hay selección)
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById(`step${i}`);
      if (el) el.style.display = 'none';
    }
    const currentStep = (sel.barberoId && sel.servicioId && sel.fechaStr && sel.hora) ? 5
                      : (sel.barberoId && sel.servicioId && sel.fechaStr) ? 4
                      : (sel.barberoId && sel.servicioId) ? 3
                      : sel.barberoId ? 2 : 1;
    const activeEl = document.getElementById(`step${currentStep}`);
    if (activeEl) activeEl.style.display = 'block';
  } else {
    // Ir al panel de cancelación: ocultar wizard
    if (stepsBar) stepsBar.style.display = 'none';
    if (successScr) successScr.style.display = 'none';
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById(`step${i}`);
      if (el) el.style.display = 'none';
    }
    // Limpiar resultado anterior
    document.getElementById('cancelSearchResult').innerHTML = '';
    document.getElementById('cancelCodeInput').value = '';
    document.getElementById('cancelCodeInput').classList.remove('input-error');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Buscar cita por código ────────────────────────────────────────────────────
async function buscarCitaPorCodigo() {
  const codigo = document.getElementById('cancelCodeInput').value.trim().toUpperCase();
  const input  = document.getElementById('cancelCodeInput');
  const result = document.getElementById('cancelSearchResult');
  const btn    = document.getElementById('btnBuscarCodigo');

  if (!codigo || codigo.length < 6) {
    input.classList.add('input-error');
    result.innerHTML = `<p style="text-align:center;font-size:0.85rem;color:var(--danger)">Ingresa el código completo de 6 caracteres.</p>`;
    return;
  }
  input.classList.remove('input-error');

  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;margin-right:6px"></span> Buscando...';
  result.innerHTML = '';

  try {
    const snap = await db.collection('appointments')
      .where('barbershopId', '==', _barbershopId)
      .where('cancelCode',   '==', codigo)
      .where('status',       '==', 'scheduled')
      .limit(1)
      .get();

    if (snap.empty) {
      result.innerHTML = `
        <div style="text-align:center;padding:20px 0">
          <i class="bi bi-search" style="font-size:1.8rem;color:var(--gray3);display:block;margin-bottom:10px"></i>
          <p style="font-size:0.88rem;color:var(--gray4);line-height:1.6">
            No se encontró ninguna cita activa con ese código.<br>
            Verifica que el código sea correcto.
          </p>
        </div>`;
      return;
    }

    const doc    = snap.docs[0];
    const data   = doc.data();
    const fecha  = data.date?.toDate ? data.date.toDate() : new Date(data.date);
    const [fH, fM] = [fecha.getHours(), fecha.getMinutes()];
    const ampm   = fH < 12 ? 'a.m.' : 'p.m.';
    const h12    = fH % 12 || 12;
    const horaLabel  = `${h12}:${String(fM).padStart(2,'0')} ${ampm}`;
    const fechaLabel = fecha.toLocaleDateString('es-CO', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });

    result.innerHTML = `
      <div class="appt-found-card">
        <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--gray4);margin-bottom:10px;font-weight:600">Cita encontrada</div>
        <div class="appt-found-row"><span>Cliente</span><span>${escHtml(data.clientName||'—')}</span></div>
        <div class="appt-found-row"><span>Barbero</span><span>${escHtml(data.employeeName||'—')}</span></div>
        <div class="appt-found-row"><span>Servicio</span><span>${escHtml(data.serviceName||'—')}</span></div>
        <div class="appt-found-row"><span>Fecha</span><span>${fechaLabel}</span></div>
        <div class="appt-found-row"><span>Hora</span><span>${horaLabel}</span></div>
      </div>
      <button onclick="confirmarCancelacionPorCodigo('${doc.id}')"
              style="width:100%;padding:13px;background:none;border:2px solid var(--danger);
                     color:var(--danger);border-radius:var(--radius);font-size:0.92rem;font-weight:600;
                     cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;
                     transition:background 0.18s"
              onmouseenter="this.style.background='rgba(224,49,49,0.06)'"
              onmouseleave="this.style.background='none'">
        <i class="bi bi-x-circle"></i> Cancelar esta cita
      </button>`;
  } catch(err) {
    console.error('Error buscando cita:', err);
    result.innerHTML = `<p style="text-align:center;font-size:0.85rem;color:var(--danger)">Ocurrió un error. Intenta de nuevo.</p>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-search"></i> Buscar cita';
  }
}

// ── Confirmar cancelación por código ─────────────────────────────────────────
async function confirmarCancelacionPorCodigo(apptId) {
  if (!confirm('¿Seguro que deseas cancelar tu cita? Esta acción no se puede deshacer.')) return;

  const result = document.getElementById('cancelSearchResult');
  const btn    = result.querySelector('button');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(224,49,49,0.3);border-top-color:var(--danger);border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;margin-right:6px"></span> Cancelando...';
  }

  try {
    await db.collection('appointments').doc(apptId).update({
      status:      'cancelled',
      cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
      cancelledBy: 'client_cancel_code'
    });

    result.innerHTML = `
      <div style="text-align:center;padding:24px 16px;border:1px solid rgba(47,158,68,0.3);
                  background:rgba(47,158,68,0.05);border-radius:var(--radius)">
        <i class="bi bi-check-circle" style="font-size:2rem;color:var(--success);display:block;margin-bottom:10px"></i>
        <p style="font-size:0.95rem;font-weight:700;color:var(--success);margin-bottom:6px">Cita cancelada</p>
        <p style="font-size:0.82rem;color:var(--gray4);line-height:1.6">Tu cita ha sido cancelada exitosamente.<br>Si deseas reagendar, usa la pestaña <strong>"Agendar cita"</strong>.</p>
      </div>`;

    // Limpiar input
    document.getElementById('cancelCodeInput').value = '';
  } catch(err) {
    console.error('Error cancelando cita:', err);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-x-circle"></i> Cancelar esta cita';
    }
    alert('Ocurrió un error al cancelar. Intenta de nuevo.');
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatCOPSimple(v) {
  if (!v) return '$0';
  return '$' + Number(v).toLocaleString('es-CO');
}
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
