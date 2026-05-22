// FullFade — Módulo de Clientes (tiempo real + editar + contactar + visitas)

let clientesBarbershopId = null;
let _allClientes = [];
let _editingClienteId = null;
let _newClienteIds = new Set();

function initClientes(barbershopId) {
  clientesBarbershopId = barbershopId;
  subscribeClientes();

  document.getElementById('addClienteBtn').addEventListener('click', () => abrirModalCliente());
  document.getElementById('guardarCliente').addEventListener('click', guardarCliente);
  document.getElementById('clienteSearch').addEventListener('input', debounce(e =>
    filterClientes(e.target.value.trim()), 300));
}

// ─── Abrir modal (nuevo o edición) ────────────────────────────────────────────
function abrirModalCliente(clienteId = null) {
  if (!isPlanActive()) { Toast.error('Tu plan ha expirado.'); return; }

  _editingClienteId = clienteId;
  const c = clienteId ? _allClientes.find(x => x.id === clienteId) : null;

  document.getElementById('modalClienteTitulo').textContent =
    clienteId ? 'Editar Cliente' : 'Nuevo Cliente';
  document.getElementById('clienteNombre').value   = c?.name    || '';
  document.getElementById('clienteTelefono').value = c?.phone   || '';
  document.getElementById('clienteNotas').value    = c?.notes   || '';

  ['clienteNombre','clienteTelefono'].forEach(id =>
    Validate.markField(document.getElementById(id), null));

  openModal('modalCliente');
}

// ─── Suscripción tiempo real ──────────────────────────────────────────────────
function subscribeClientes() {
  const unsub = db.collection('customers')
    .where('barbershopId', '==', clientesBarbershopId)
    .orderBy('name')
    .onSnapshot(snap => {
      _allClientes   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      _newClienteIds = new Set(snap.docChanges().filter(ch=>ch.type==='added').map(ch=>ch.doc.id));
      filterClientes(document.getElementById('clienteSearch')?.value?.trim() || '');
    }, err => console.error('Error clientes:', err));
  RealtimeManager.register('clientes', unsub);
}

function filterClientes(search) {
  if (!search) { renderClientes(_allClientes); return; }
  const q = search.toLowerCase();
  renderClientes(_allClientes.filter(c =>
    c.name.toLowerCase().includes(q) || (c.phone||'').includes(q)
  ));
}

// ─── Render tabla ─────────────────────────────────────────────────────────────
function renderClientes(docs) {
  if (docs.length === 0) {
    document.getElementById('clientesList').innerHTML =
      '<div class="empty-state"><i class="bi bi-people empty-icon"></i><p>No se encontraron clientes.</p></div>';
    return;
  }

  const rows = docs.map(c => {
    const phone   = c.phone ? c.phone.replace(/\D/g,'') : '';
    const waLink  = phone
      ? `<a href="https://wa.me/57${phone}" target="_blank" class="btn btn-ghost btn-sm"
            title="Contactar por WhatsApp" style="color:#25D366;padding:4px 8px">
           <i class="bi bi-whatsapp"></i>
         </a>`
      : `<span style="color:var(--muted);font-size:0.75rem;padding:4px 8px">Sin tel.</span>`;

    const visitas = c.visits || 0;
    const visitasBadge = visitas > 0
      ? `<span class="badge badge-gold">${visitas} visita${visitas!==1?'s':''}</span>`
      : `<span style="color:var(--muted);font-size:0.8rem">0 visitas</span>`;

    const isNew = _newClienteIds.has(c.id);
    return `<tr class="${isNew ? 'row-new' : ''}">
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--accent-light);
                      display:flex;align-items:center;justify-content:center;font-weight:700;
                      font-size:0.8rem;color:var(--accent);flex-shrink:0">
            ${(c.name||'?').charAt(0).toUpperCase()}
          </div>
          <strong>${escHtml(c.name)}</strong>
        </div>
      </td>
      <td>${escHtml(c.phone) || '<span style="color:var(--muted)">—</span>'}</td>
      <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(c.notes) || '—'}</td>
      <td>${visitasBadge}</td>
      <td style="color:var(--muted);font-size:0.8rem">${formatDate(c.createdAt)}</td>
      <td>
        <div style="display:flex;gap:4px;align-items:center">
          ${waLink}
          <button class="btn btn-ghost btn-sm" title="Editar cliente"
                  style="padding:4px 8px;color:var(--accent)"
                  onclick="abrirModalCliente('${c.id}')">
            <i class="bi bi-pencil"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('clientesList').innerHTML = `
    <div class="table-responsive">
    <table>
      <thead><tr>
        <th>Cliente</th><th>Teléfono</th><th>Notas</th>
        <th>Historial</th><th>Desde</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

// ─── Guardar (nuevo o edición) ────────────────────────────────────────────────
async function guardarCliente() {
  const nombre   = document.getElementById('clienteNombre').value.trim();
  const telefono = document.getElementById('clienteTelefono').value.trim();
  const notas    = document.getElementById('clienteNotas').value.trim();

  const errNombre = Validate.name(nombre);
  const errTel    = Validate.phone(telefono);
  Validate.markField(document.getElementById('clienteNombre'),   errNombre);
  Validate.markField(document.getElementById('clienteTelefono'), errTel);
  if (errNombre || errTel) { Toast.error(errNombre || errTel); return; }

  if (!_editingClienteId && !canAddCliente(_allClientes.length)) {
    Toast.error(`Tu plan permite hasta ${getPlan().maxClientes} clientes. Mejora tu plan.`);
    return;
  }

  const btn = document.getElementById('guardarCliente');
  btn.disabled = true;
  btn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px"></span> Guardando...';

  try {
    if (_editingClienteId) {
      await db.collection('customers').doc(_editingClienteId).update({
        name: nombre, phone: telefono, notes: notas,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      Toast.success('Cliente actualizado ✓');
    } else {
      await db.collection('customers').add({
        barbershopId: clientesBarbershopId,
        name: nombre, phone: telefono, notes: notas,
        visits: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      Toast.success('Cliente registrado ✓');
    }
    closeModal('modalCliente');
  } catch(err) {
    console.error(err);
    Toast.error('Error al guardar el cliente.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar cliente';
  }
}

// ─── Incrementar visitas al completar cita ────────────────────────────────────
async function incrementarVisitasCliente(clienteId) {
  if (!clienteId) return;
  try {
    await db.collection('customers').doc(clienteId).update({
      visits: firebase.firestore.FieldValue.increment(1),
      lastVisit: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e) { console.warn('No se pudo incrementar visitas:', e.message); }
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
