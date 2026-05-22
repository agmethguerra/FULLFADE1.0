// FullFade — Módulo de Barberos (soft delete, tiempo real, límite de plan)

let barberosBarbershopId = null;

function initBarberos(barbershopId) {
  barberosBarbershopId = barbershopId;
  subscribeBarberos();

  document.getElementById('addBarberoBtn').addEventListener('click', () => {
    if (!isPlanActive()) { Toast.error('Tu plan ha expirado.'); return; }
    document.getElementById('barberoNombre').value       = '';
    document.getElementById('barberoTelefono').value     = '';
    document.getElementById('barberoEspecialidad').value = '';
    ['barberoNombre','barberoTelefono'].forEach(id =>
      Validate.markField(document.getElementById(id), null));
    openModal('modalBarbero');
  });
  document.getElementById('guardarBarbero').addEventListener('click', guardarBarbero);
}

let _allBarberos = [];

function subscribeBarberos() {
  const unsub = db.collection('employees')
    .where('barbershopId', '==', barberosBarbershopId)
    .orderBy('name')
    .onSnapshot(snap => {
      const newIds = new Set(snap.docChanges().filter(ch=>ch.type==='added').map(ch=>ch.doc.id));
      _allBarberos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderBarberos(_allBarberos, newIds);
    }, err => console.error('Error barberos realtime:', err));
  RealtimeManager.register('barberos', unsub);
}

function renderBarberos(todos, newIds = new Set()) {
  const activos   = todos.filter(b => b.active);
  const inactivos = todos.filter(b => !b.active);

  let html = '';
  if (activos.length === 0) {
    html += '<div class="empty-state"><i class="bi bi-scissors empty-icon"></i><p>No hay barberos activos.</p></div>';
  } else {
    html += activos.map(d => tarjetaBarbero(d, true, newIds.has(d.id))).join('');
  }
  if (inactivos.length > 0) {
    html += `<div style="margin:24px 0 10px;font-size:0.78rem;font-weight:600;letter-spacing:.07em;
                         text-transform:uppercase;color:var(--muted)">Dados de baja</div>
             ${inactivos.map(d => tarjetaBarbero(d, false)).join('')}`;
  }
  document.getElementById('barberosList').innerHTML = html;
}

function tarjetaBarbero(d, activo, isNew = false) {
  const initials = d.name.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();
  const avatarBg = activo ? 'var(--accent-light)' : 'var(--surface2)';
  const avatarC  = activo ? 'var(--accent)'       : 'var(--muted)';
  const nameStyle= activo ? 'font-weight:600'     : 'font-weight:600;color:var(--muted);text-decoration:line-through';
  const opacity  = activo ? '1' : '0.6';
  const badge    = activo
    ? `<span class="badge badge-success">Activo</span>`
    : `<span class="badge" style="background:var(--surface2);color:var(--muted)">Baja</span>`;
  const boton = activo
    ? `<button class="btn btn-ghost" style="font-size:0.8rem;padding:6px 10px;color:var(--danger)"
               onclick="desactivarBarbero('${d.id}')">Dar de baja</button>`
    : `<button class="btn btn-ghost" style="font-size:0.8rem;padding:6px 10px;color:var(--success)"
               onclick="reactivarBarbero('${d.id}')">Reactivar</button>`;
  return `
    <div class="card ${isNew ? 'card-new' : ''}" style="display:flex;align-items:center;gap:16px;padding:18px 20px;margin-bottom:12px;opacity:${opacity}">
      <div style="width:44px;height:44px;border-radius:50%;background:${avatarBg};border:1px solid ${activo?'rgba(0,0,0,0.08)':'var(--border)'};
                  display:flex;align-items:center;justify-content:center;font-weight:600;color:${avatarC};flex-shrink:0">${initials}</div>
      <div style="flex:1;min-width:0">
        <div style="${nameStyle}">${escHtml(d.name)}</div>
        <div style="font-size:0.82rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escHtml(d.specialty)||'Sin especialidad'} · ${escHtml(d.phone)||'Sin teléfono'}
        </div>
      </div>
      ${badge}${boton}
    </div>`;
}

async function guardarBarbero() {
  const nombre       = document.getElementById('barberoNombre').value.trim();
  const telefono     = document.getElementById('barberoTelefono').value.trim();
  const especialidad = document.getElementById('barberoEspecialidad').value.trim();

  const errNombre = Validate.name(nombre);
  const errTel    = Validate.phone(telefono);
  Validate.markField(document.getElementById('barberoNombre'),   errNombre);
  Validate.markField(document.getElementById('barberoTelefono'), errTel);
  if (errNombre || errTel) { Toast.error(errNombre || errTel); return; }

  const activos = _allBarberos.filter(b => b.active).length;
  if (!canAddBarber(activos)) {
    Toast.error(`Tu plan (${getPlanName()}) permite hasta ${getPlan().maxBarbers} barberos activos. Mejora tu plan.`);
    return;
  }

  const btn = document.getElementById('guardarBarbero');
  btn.disabled = true; btn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px"></span> Guardando...';
  try {
    await db.collection('employees').add({
      barbershopId: barberosBarbershopId,
      name: nombre, phone: telefono, specialty: especialidad,
      role: 'barber', active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeModal('modalBarbero');
    Toast.success('Barbero añadido ✓');
  } catch(err) { Toast.error('Error al guardar el barbero.'); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar barbero'; }
}

async function desactivarBarbero(id) {
  if (!confirm('¿Dar de baja a este barbero? Sus registros se conservarán.')) return;
  try {
    await db.collection('employees').doc(id).update({ active: false });
    Toast.success('Barbero dado de baja.');
  } catch(err) { Toast.error('Error al actualizar.'); }
}

async function reactivarBarbero(id) {
  const activos = _allBarberos.filter(b => b.active).length;
  if (!canAddBarber(activos)) {
    Toast.error(`Tu plan no permite más barberos activos. Mejora tu plan.`); return;
  }
  try {
    await db.collection('employees').doc(id).update({ active: true });
    Toast.success('Barbero reactivado ✓');
  } catch(err) { Toast.error('Error al reactivar.'); }
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
