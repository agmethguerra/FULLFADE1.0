// FullFade — Módulo de Notificaciones (citas del link público)

let _notifBarbershopId = null;
let _notifLeidas = new Set();
let _notifPanelOpen = false;

function initNotificaciones(barbershopId) {
  _notifBarbershopId = barbershopId;

  // Cargar IDs ya leídos de localStorage
  try {
    const stored = localStorage.getItem(`fullfade_notif_leidas_${barbershopId}`);
    if (stored) _notifLeidas = new Set(JSON.parse(stored));
  } catch(e) {}

  subscribeNotificaciones();

  // Cerrar panel al hacer clic fuera
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    const bell  = document.getElementById('notifBell');
    if (panel && bell && !panel.contains(e.target) && !bell.contains(e.target)) {
      panel.style.display = 'none';
      _notifPanelOpen = false;
    }
  });
}

function subscribeNotificaciones() {
  // Escuchar citas que llegaron por booking_link, últimas 48h
  const desde = new Date();
  desde.setHours(desde.getHours() - 48);

  const unsub = db.collection('appointments')
    .where('barbershopId', '==', _notifBarbershopId)
    .where('source', '==', 'booking_link')
    .where('createdAt', '>=', desde)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      const citas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderNotificaciones(citas);

      // Toast para citas nuevas (docChanges)
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const d = change.doc.data();
          if (!_notifLeidas.has(change.doc.id)) {
            Toast.info(`Nueva cita — ${d.clientName} agendó vía link público`);
          }
        }
      });
    }, err => console.warn('Notif listener:', err.message));

  RealtimeManager.register('notificaciones', unsub);
}

function renderNotificaciones(citas) {
  const badge   = document.getElementById('notifBadge');
  const listEl  = document.getElementById('notifList');
  if (!badge || !listEl) return;

  const noLeidas = citas.filter(c => !_notifLeidas.has(c.id));
  const count    = noLeidas.length;

  // Badge
  if (count > 0) {
    badge.style.display = 'flex';
    badge.textContent   = count > 9 ? '9+' : count;
  } else {
    badge.style.display = 'none';
  }

  if (citas.length === 0) {
    listEl.innerHTML = '<div class="empty-state" style="padding:32px 20px"><i class="bi bi-bell-slash empty-icon"></i><p>Sin citas por link público aún</p></div>';
    return;
  }

  listEl.innerHTML = citas.map(c => {
    const leida = _notifLeidas.has(c.id);
    const fecha = c.date?.toDate ? c.date.toDate() : new Date(c.date);
    const creadaEn = c.createdAt?.toDate ? c.createdAt.toDate() : new Date();
    const hace     = tiempoRelativo(creadaEn);

    return `
      <div onclick="marcarLeida('${c.id}')" style="padding:14px 18px;border-bottom:1px solid var(--border);
           cursor:pointer;transition:background 0.15s;${leida?'opacity:0.55':'background:rgba(201,168,76,0.04)'}"
           onmouseenter="this.style.background='var(--surface2)'"
           onmouseleave="this.style.background='${leida?'':'rgba(201,168,76,0.04)'}'">
        <div style="display:flex;align-items:flex-start;gap:10px">
          ${!leida ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-top:5px"></div>' : '<div style="width:7px;flex-shrink:0"></div>'}
          <div style="flex:1;min-width:0">
            <div style="font-size:0.85rem;font-weight:${leida?'400':'600'};color:var(--text);margin-bottom:3px">
              <i class="bi bi-calendar-plus" style="margin-right:5px;color:var(--accent)"></i>
              ${escHtmlN(c.clientName)} agendó una cita
            </div>
            <div style="font-size:0.78rem;color:var(--muted);line-height:1.5">
              ${escHtmlN(c.serviceName||'—')} · ${escHtmlN(c.employeeName||'—')}<br>
              ${fecha.toLocaleDateString('es-CO',{weekday:'short',day:'numeric',month:'short'})}
              ${fecha.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}
              ${c.clientPhone ? `· <a href="https://wa.me/57${c.clientPhone.replace(/\\D/g,'')}" target="_blank" style="color:#25D366" onclick="event.stopPropagation()"><i class="bi bi-whatsapp"></i></a>` : ''}
            </div>
            <div style="font-size:0.72rem;color:var(--muted);margin-top:4px">${hace}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  _notifPanelOpen = !_notifPanelOpen;
  panel.style.display = _notifPanelOpen ? 'block' : 'none';
}

function marcarLeida(id) {
  _notifLeidas.add(id);
  guardarLeidas();
  // Re-render actualiza badge automáticamente via el onSnapshot
}

function marcarTodasLeidas() {
  const items = document.querySelectorAll('#notifList [onclick^="marcarLeida"]');
  items.forEach(el => {
    const match = el.getAttribute('onclick').match(/'([^']+)'/);
    if (match) _notifLeidas.add(match[1]);
  });
  guardarLeidas();
  const badge = document.getElementById('notifBadge');
  if (badge) badge.style.display = 'none';
  // Actualizar UI
  document.querySelectorAll('#notifList > div').forEach(el => {
    el.style.opacity = '0.55';
    el.style.background = '';
    const dot = el.querySelector('div[style*="background:var(--accent)"]');
    if (dot) dot.style.background = 'transparent';
  });
  Toast.success('Todas las notificaciones marcadas como leídas');
}

function guardarLeidas() {
  try {
    localStorage.setItem(
      `fullfade_notif_leidas_${_notifBarbershopId}`,
      JSON.stringify([..._notifLeidas])
    );
  } catch(e) {}
}

function tiempoRelativo(fecha) {
  const diff = Math.floor((Date.now() - fecha.getTime()) / 1000);
  if (diff < 60)   return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.floor(diff/60)} min`;
  if (diff < 86400)return `Hace ${Math.floor(diff/3600)} h`;
  return `Hace ${Math.floor(diff/86400)} días`;
}

function escHtmlN(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
