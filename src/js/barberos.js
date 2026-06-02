// FullFade — Módulo de Barberos (soft delete, tiempo real, límite de plan, edición, foto)

let barberosBarbershopId = null;
let _barberoFotoBase64   = null;   // base64 de la foto pendiente de guardar
let _barberoFotoQuitada  = false;  // flag: el usuario explícitamente quitó la foto existente

function initBarberos(barbershopId) {
  barberosBarbershopId = barbershopId;
  subscribeBarberos();

  document.getElementById('addBarberoBtn').addEventListener('click', () => {
    if (!isPlanActive()) { Toast.error('Tu plan ha expirado.'); return; }
    _abrirModalBarbero(null);
  });
  document.getElementById('guardarBarbero').addEventListener('click', guardarBarbero);
}

// ─── Abrir modal ─────────────────────────────────────────────────────────────
function _abrirModalBarbero(barbero) {
  const esEdicion = !!barbero;

  // Título y botón
  document.getElementById('modalBarberoTitulo').textContent = esEdicion ? 'Editar Barbero' : 'Añadir Barbero';
  document.getElementById('guardarBarberoTxt').textContent  = esEdicion ? 'Guardar cambios' : 'Guardar barbero';

  // Campos de texto
  document.getElementById('barberoEditId').value        = esEdicion ? barbero.id : '';
  document.getElementById('barberoNombre').value        = esEdicion ? (barbero.name        || '') : '';
  document.getElementById('barberoTelefono').value      = esEdicion ? (barbero.phone       || '') : '';
  document.getElementById('barberoEspecialidad').value  = esEdicion ? (barbero.specialty   || '') : '';

  // Reset foto
  _barberoFotoBase64  = null;
  _barberoFotoQuitada = false;
  document.getElementById('barberoFotoInput').value = '';
  document.getElementById('barberoFotoNombre').textContent = 'Sin foto seleccionada';

  const preview  = document.getElementById('barberoFotoPreview');
  const quitarBtn = document.getElementById('barberoFotoQuitarBtn');

  if (esEdicion && barbero.photoBase64) {
    preview.innerHTML = `<img src="${barbero.photoBase64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`;
    quitarBtn.style.display = 'block';
    document.getElementById('barberoFotoNombre').textContent = 'Foto actual';
  } else {
    const initials = esEdicion
      ? (barbero.name || '?').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()
      : '?';
    preview.textContent = initials;
    preview.style.fontSize = '1.5rem';
    quitarBtn.style.display = 'none';
  }

  // Limpiar errores de validación
  ['barberoNombre','barberoTelefono'].forEach(id =>
    Validate.markField(document.getElementById(id), null));

  openModal('modalBarbero');
}

// ─── Preview de foto al seleccionar archivo ───────────────────────────────────
function previsualizarFoto(input) {
  const file = input.files[0];
  if (!file) return;

  // Validaciones de archivo
  const maxMB = 2;
  if (file.size > maxMB * 1024 * 1024) {
    Toast.error(`La foto no puede superar ${maxMB} MB.`);
    input.value = '';
    return;
  }
  if (!file.type.startsWith('image/')) {
    Toast.error('Solo se permiten archivos de imagen (JPG, PNG, WebP).');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    _barberoFotoBase64  = e.target.result;
    _barberoFotoQuitada = false;

    const preview = document.getElementById('barberoFotoPreview');
    preview.innerHTML = `<img src="${_barberoFotoBase64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`;

    document.getElementById('barberoFotoNombre').textContent = file.name;
    document.getElementById('barberoFotoQuitarBtn').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

// ─── Quitar foto ─────────────────────────────────────────────────────────────
function quitarFotoBarbero() {
  _barberoFotoBase64  = null;
  _barberoFotoQuitada = true;

  const nombre    = document.getElementById('barberoNombre').value.trim();
  const initials  = nombre
    ? nombre.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()
    : '?';
  const preview   = document.getElementById('barberoFotoPreview');
  preview.innerHTML   = '';
  preview.textContent = initials;

  document.getElementById('barberoFotoInput').value   = '';
  document.getElementById('barberoFotoNombre').textContent = 'Sin foto seleccionada';
  document.getElementById('barberoFotoQuitarBtn').style.display = 'none';
}

// ─── Suscripción en tiempo real ───────────────────────────────────────────────
let _allBarberos = [];

function subscribeBarberos() {
  const unsub = db.collection('employees')
    .where('barbershopId', '==', barberosBarbershopId)
    .orderBy('name')
    .onSnapshot(snap => {
      const newIds = new Set(snap.docChanges().filter(ch => ch.type === 'added').map(ch => ch.doc.id));
      _allBarberos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderBarberos(_allBarberos, newIds);
    }, err => console.error('Error barberos realtime:', err));
  RealtimeManager.register('barberos', unsub);
}

// ─── Render de tarjetas ───────────────────────────────────────────────────────
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
  const initials  = d.name.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();
  const avatarBg  = activo ? 'var(--accent-light)' : 'var(--surface2)';
  const avatarC   = activo ? 'var(--accent)'       : 'var(--muted)';
  const nameStyle = activo ? 'font-weight:600'     : 'font-weight:600;color:var(--muted);text-decoration:line-through';
  const opacity   = activo ? '1' : '0.6';

  const avatarHtml = d.photoBase64
    ? `<div style="width:44px;height:44px;border-radius:50%;overflow:hidden;flex-shrink:0;border:1px solid ${activo ? 'rgba(0,0,0,0.08)' : 'var(--border)'}">
         <img src="${d.photoBase64}" style="width:100%;height:100%;object-fit:cover" />
       </div>`
    : `<div style="width:44px;height:44px;border-radius:50%;background:${avatarBg};border:1px solid ${activo ? 'rgba(0,0,0,0.08)' : 'var(--border)'};
                  display:flex;align-items:center;justify-content:center;font-weight:600;color:${avatarC};flex-shrink:0">${initials}</div>`;

  const badge = activo
    ? `<span class="badge badge-success">Activo</span>`
    : `<span class="badge" style="background:var(--surface2);color:var(--muted)">Baja</span>`;

  const editBtn = `<button class="btn btn-ghost" style="font-size:0.8rem;padding:6px 10px;"
                           onclick="editarBarbero('${d.id}')"><i class="bi bi-pencil"></i> Editar</button>`;

  const toggleBtn = activo
    ? `<button class="btn btn-ghost" style="font-size:0.8rem;padding:6px 10px;color:var(--danger)"
               onclick="desactivarBarbero('${d.id}')">Dar de baja</button>`
    : `<button class="btn btn-ghost" style="font-size:0.8rem;padding:6px 10px;color:var(--success)"
               onclick="reactivarBarbero('${d.id}')">Reactivar</button>`;

  return `
    <div class="card ${isNew ? 'card-new' : ''}" style="display:flex;align-items:center;gap:16px;padding:18px 20px;margin-bottom:12px;opacity:${opacity}">
      ${avatarHtml}
      <div style="flex:1;min-width:0">
        <div style="${nameStyle}">${escHtml(d.name)}</div>
        <div style="font-size:0.82rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escHtml(d.specialty) || 'Sin especialidad'} · ${escHtml(d.phone) || 'Sin teléfono'}
        </div>
      </div>
      ${badge}
      <div style="display:flex;gap:6px;flex-shrink:0">${editBtn}${toggleBtn}</div>
    </div>`;
}

// ─── Editar barbero ───────────────────────────────────────────────────────────
function editarBarbero(id) {
  const barbero = _allBarberos.find(b => b.id === id);
  if (!barbero) { Toast.error('Barbero no encontrado.'); return; }
  _abrirModalBarbero(barbero);
}

// ─── Guardar (crear o actualizar) ─────────────────────────────────────────────
async function guardarBarbero() {
  const editId       = document.getElementById('barberoEditId').value.trim();
  const esEdicion    = !!editId;
  const nombre       = document.getElementById('barberoNombre').value.trim();
  const telefono     = document.getElementById('barberoTelefono').value.trim();
  const especialidad = document.getElementById('barberoEspecialidad').value.trim();

  // Validaciones
  const errNombre = Validate.name(nombre);
  const errTel    = Validate.phone(telefono);
  Validate.markField(document.getElementById('barberoNombre'),   errNombre);
  Validate.markField(document.getElementById('barberoTelefono'), errTel);
  if (errNombre || errTel) { Toast.error(errNombre || errTel); return; }

  // Límite de plan solo al crear
  if (!esEdicion) {
    const activos = _allBarberos.filter(b => b.active).length;
    if (!canAddBarber(activos)) {
      Toast.error(`Tu plan (${getPlanName()}) permite hasta ${getPlan().maxBarbers} barberos activos. Mejora tu plan.`);
      return;
    }
  }

  const btn = document.getElementById('guardarBarbero');
  btn.disabled = true;
  btn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px"></span> Guardando...';

  try {
    // Determinar photoBase64 final
    let photoBase64Final = undefined;  // undefined = no tocar el campo

    if (_barberoFotoBase64) {
      // Nueva foto seleccionada
      photoBase64Final = _barberoFotoBase64;
    } else if (_barberoFotoQuitada) {
      // Usuario quitó la foto explícitamente
      photoBase64Final = '';
    } else if (esEdicion) {
      // No se tocó la foto; mantener la existente (no incluir en update)
      photoBase64Final = undefined;
    }

    if (esEdicion) {
      const updateData = {
        name: nombre, phone: telefono, specialty: especialidad,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (photoBase64Final !== undefined) updateData.photoBase64 = photoBase64Final;
      await db.collection('employees').doc(editId).update(updateData);
      Toast.success('Barbero actualizado ✓');
    } else {
      const newData = {
        barbershopId: barberosBarbershopId,
        name: nombre, phone: telefono, specialty: especialidad,
        role: 'barber', active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (photoBase64Final) newData.photoBase64 = photoBase64Final;
      await db.collection('employees').add(newData);
      Toast.success('Barbero añadido ✓');
    }

    closeModal('modalBarbero');
  } catch(err) {
    console.error(err);
    Toast.error('Error al guardar el barbero.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-lg"></i> <span id="guardarBarberoTxt">Guardar barbero</span>';
  }
}

// ─── Desactivar / Reactivar ───────────────────────────────────────────────────
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
    Toast.error('Tu plan no permite más barberos activos. Mejora tu plan.'); return;
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
