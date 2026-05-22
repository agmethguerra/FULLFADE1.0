// FullFade — Módulo de Servicios (tiempo real + validaciones + límite de plan)

let serviciosBarbershopId = null;
let _allServicios = [];

function initServicios(barbershopId) {
  serviciosBarbershopId = barbershopId;
  subscribeServicios();

  document.getElementById('addServicioBtn').addEventListener('click', () => {
    if (!isPlanActive()) { Toast.error('Tu plan ha expirado.'); return; }
    document.getElementById('servicioNombre').value   = '';
    document.getElementById('servicioPrecio').value   = '';
    document.getElementById('servicioDuracion').value = '30';
    ['servicioNombre','servicioPrecio','servicioDuracion'].forEach(id =>
      Validate.markField(document.getElementById(id), null));
    openModal('modalServicio');
  });
  document.getElementById('guardarServicio').addEventListener('click', guardarServicio);
  document.getElementById('servicioPrecio').addEventListener('input', e => { if (e.target.value < 0) e.target.value = ''; });
  document.getElementById('servicioDuracion').addEventListener('input', e => { if (e.target.value < 1) e.target.value = ''; });
}

function subscribeServicios() {
  const unsub = db.collection('services')
    .where('barbershopId', '==', serviciosBarbershopId)
    .where('active', '==', true)
    .orderBy('name')
    .onSnapshot(snap => {
      const newIds = new Set(snap.docChanges().filter(ch=>ch.type==='added').map(ch=>ch.doc.id));
      _allServicios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderServicios(snap.docs, newIds);
    }, err => console.error('Error servicios realtime:', err));
  RealtimeManager.register('servicios', unsub);
}

function renderServicios(docs, newIds = new Set()) {
  if (docs.length === 0) {
    document.getElementById('serviciosList').innerHTML =
      '<div class="empty-state"><i class="bi bi-list-ul empty-icon"></i><p>No hay servicios configurados.</p></div>';
    return;
  }
  const rows = docs.map((item) => {
    const d   = item.data ? item.data() : item;
    const id  = item.id;
    const isNew = newIds.has(id);
    return `<tr class="${isNew ? 'row-new' : ''}">
      <td><strong>${escHtml(d.name)}</strong></td>
      <td style="color:var(--accent);font-weight:600">${formatCOP(d.price)}</td>
      <td>${d.duration} min</td>
      <td><span class="badge badge-success">Activo</span></td>
      <td>
        <button class="btn btn-ghost" style="font-size:0.8rem;color:var(--danger);padding:4px 8px"
                onclick="eliminarServicio('${id}')">Eliminar</button>
      </td>
    </tr>`;
  }).join('');
  document.getElementById('serviciosList').innerHTML = `
    <div class="table-responsive">
    <table>
      <thead><tr><th>Servicio</th><th>Precio</th><th>Duración</th><th>Estado</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

async function guardarServicio() {
  const nombre   = document.getElementById('servicioNombre').value.trim();
  const precioV  = document.getElementById('servicioPrecio').value;
  const duracionV= document.getElementById('servicioDuracion').value;

  const errNombre  = Validate.name(nombre);
  const errPrecio  = Validate.amount(precioV);
  const errDuracion= Validate.positiveInt(duracionV, 'La duración');
  Validate.markField(document.getElementById('servicioNombre'),  errNombre);
  Validate.markField(document.getElementById('servicioPrecio'),  errPrecio);
  Validate.markField(document.getElementById('servicioDuracion'),errDuracion);
  if (errNombre || errPrecio || errDuracion) { Toast.error(errNombre || errPrecio || errDuracion); return; }

  if (!canAddService(_allServicios.length)) {
    Toast.error(`Tu plan permite hasta ${getPlan().maxServices} servicios. Mejora tu plan.`);
    return;
  }

  const btn = document.getElementById('guardarServicio');
  btn.disabled = true; btn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px"></span> Guardando...';
  try {
    await db.collection('services').add({
      barbershopId: serviciosBarbershopId,
      name: nombre, price: parseFloat(precioV), duration: parseInt(duracionV),
      active: true, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeModal('modalServicio');
    Toast.success('Servicio creado ✓');
  } catch(err) { Toast.error('Error al guardar el servicio.'); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar servicio'; }
}

async function eliminarServicio(id) {
  if (!confirm('¿Eliminar este servicio?')) return;
  try {
    await db.collection('services').doc(id).update({ active: false });
    Toast.success('Servicio eliminado.');
  } catch(err) { Toast.error('Error al eliminar.'); }
}

async function getServiciosOptions(barbershopId) {
  const snap = await db.collection('services')
    .where('barbershopId', '==', barbershopId)
    .where('active', '==', true)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
