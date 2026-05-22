// FullFade — Módulo de Caja (con tiempo real y flujo mejorado)

let cajaActiva    = null;
let cajaId        = null;
let cajaBarbershopId = null;
let movType       = 'ingreso';

function initCaja(barbershopId) {
  cajaBarbershopId = barbershopId;
  subscribeCajaAbierta();

  document.getElementById('abrirCajaBtn').addEventListener('click', () => {
    if (!isPlanActive()) { Toast.error('Tu plan ha expirado. Renueva para operar la caja.'); return; }
    document.getElementById('saldoInicial').value = '';
    document.getElementById('obsApertura').value  = '';
    openModal('modalAbrirCaja');
  });
  document.getElementById('cerrarCajaBtn').addEventListener('click', cerrarCaja);
  document.getElementById('addIngresoBtn').addEventListener('click', () => {
    movType = 'ingreso';
    document.getElementById('modalMovTitulo').textContent = 'Registrar Ingreso';
    document.getElementById('movMonto').value    = '';
    document.getElementById('movConcepto').value = '';
    Validate.markField(document.getElementById('movMonto'), null);
    Validate.markField(document.getElementById('movConcepto'), null);
    openModal('modalMovimiento');
  });
  document.getElementById('addEgresoBtn').addEventListener('click', () => {
    movType = 'egreso';
    document.getElementById('modalMovTitulo').textContent = 'Registrar Egreso';
    document.getElementById('movMonto').value    = '';
    document.getElementById('movConcepto').value = '';
    Validate.markField(document.getElementById('movMonto'), null);
    Validate.markField(document.getElementById('movConcepto'), null);
    openModal('modalMovimiento');
  });
  document.getElementById('confirmarApertura').addEventListener('click', abrirCaja);
  document.getElementById('confirmarMovimiento').addEventListener('click', registrarMovimiento);
  document.getElementById('saldoInicial').addEventListener('input', e => { if (e.target.value < 0) e.target.value = 0; });
  document.getElementById('movMonto').addEventListener('input', e => { if (e.target.value < 0) e.target.value = ''; });
}

function subscribeCajaAbierta() {
  const today    = new Date();
  const startDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const unsub = db.collection('cash_registers')
    .where('barbershopId', '==', cajaBarbershopId)
    .where('status', '==', 'open')
    .where('openedAt', '>=', startDay)
    .limit(1)
    .onSnapshot(snap => {
      if (!snap.empty) {
        cajaId    = snap.docs[0].id;
        cajaActiva = snap.docs[0].data();
        setCajaState(true);
        actualizarResumen();
        subscribeTransacciones();
      } else {
        cajaId = null; cajaActiva = null;
        setCajaState(false);
        actualizarResumen();
        RealtimeManager.unregister('transacciones');
        document.getElementById('cajaTxList').innerHTML =
          '<div class="empty-state"><i class="bi bi-safe2 empty-icon"></i><p>Abre la caja para registrar movimientos.</p></div>';
      }
      actualizarEstadoCaja();
    }, err => console.error('Error caja realtime:', err));
  RealtimeManager.register('caja', unsub);
}

function actualizarEstadoCaja() {
  const badge = document.getElementById('cajaBadgeEstado');
  if (!badge) return;
  if (cajaId) {
    badge.innerHTML = '<i class="bi bi-circle-fill" style="color:var(--success);font-size:0.65rem;vertical-align:middle"></i> Caja abierta';
    badge.style.color = 'var(--success)';
  } else {
    badge.innerHTML = '<i class="bi bi-circle-fill" style="color:var(--danger);font-size:0.65rem;vertical-align:middle"></i> Caja cerrada';
    badge.style.color = 'var(--danger)';
  }
}

function setCajaState(open) {
  document.getElementById('abrirCajaBtn').disabled  =  open;
  document.getElementById('cerrarCajaBtn').disabled = !open;
  document.getElementById('addIngresoBtn').disabled = !open;
  document.getElementById('addEgresoBtn').disabled  = !open;
}

async function abrirCaja() {
  const saldo = parseFloat(document.getElementById('saldoInicial').value) || 0;
  const obs   = document.getElementById('obsApertura').value.trim();
  if (saldo < 0) { Toast.error('El saldo inicial no puede ser negativo.'); return; }
  const btn = document.getElementById('confirmarApertura');
  btn.disabled = true; btn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px"></span> Abriendo...';
  try {
    await db.collection('cash_registers').add({
      barbershopId: cajaBarbershopId, openingBalance: saldo,
      ingresos: 0, egresos: 0, status: 'open', notes: obs,
      openedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeModal('modalAbrirCaja');
    Toast.success('Caja abierta correctamente ✓');
  } catch(err) { console.error(err); Toast.error('Error al abrir la caja.'); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i> Abrir caja'; }
}

async function cerrarCaja() {
  if (!cajaId) return;
  if (!confirm('¿Cerrar la caja del día? Esta acción no se puede deshacer.')) return;
  try {
    await db.collection('cash_registers').doc(cajaId).update({
      status: 'closed', closedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    Toast.success('Caja cerrada correctamente.');
  } catch(err) { Toast.error('Error al cerrar la caja.'); }
}

async function registrarMovimiento() {
  const montoVal = document.getElementById('movMonto').value;
  const concepto = document.getElementById('movConcepto').value.trim();
  const errMonto    = Validate.amount(montoVal);
  const errConcepto = !concepto ? 'El concepto es obligatorio.' : null;
  Validate.markField(document.getElementById('movMonto'), errMonto);
  Validate.markField(document.getElementById('movConcepto'), errConcepto);
  if (errMonto || errConcepto) { Toast.error(errMonto || errConcepto); return; }
  const monto = parseFloat(montoVal);
  const btn = document.getElementById('confirmarMovimiento');
  btn.disabled = true; btn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px"></span> Guardando...';
  try {
    await db.collection('transactions').add({
      barbershopId: cajaBarbershopId, cashRegisterId: cajaId,
      type: movType, amount: monto, concept: concepto,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const field = movType === 'ingreso' ? 'ingresos' : 'egresos';
    await db.collection('cash_registers').doc(cajaId).update({
      [field]: firebase.firestore.FieldValue.increment(monto)
    });
    closeModal('modalMovimiento');
    Toast.success(`${movType === 'ingreso' ? 'Ingreso' : 'Egreso'} registrado ✓`);
  } catch(err) { console.error(err); Toast.error('Error al registrar el movimiento.'); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar'; }
}

function actualizarResumen() {
  const apertura = cajaActiva?.openingBalance || 0;
  const ingresos = cajaActiva?.ingresos || 0;
  const egresos  = cajaActiva?.egresos  || 0;
  const saldo    = apertura + ingresos - egresos;
  document.getElementById('cajaApertura').textContent = formatCOP(apertura);
  document.getElementById('cajaIngresos').textContent = formatCOP(ingresos);
  document.getElementById('cajaEgresos').textContent  = formatCOP(egresos);
  const saldoEl = document.getElementById('cajaSaldo');
  saldoEl.textContent    = formatCOP(saldo);
  saldoEl.style.color    = saldo >= 0 ? 'var(--success)' : 'var(--danger)';
}

function subscribeTransacciones() {
  if (!cajaId) return;
  const unsub = db.collection('transactions')
    .where('cashRegisterId', '==', cajaId)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      if (snap.empty) {
        document.getElementById('cajaTxList').innerHTML =
          '<div class="empty-state"><i class="bi bi-receipt empty-icon"></i><p>Sin movimientos aún. Registra el primero.</p></div>';
        // Resetear resumen a solo apertura
        actualizarResumenDesdeTransacciones([], cajaActiva?.openingBalance || 0);
        return;
      }

      let totalIngresos = 0;
      let totalEgresos  = 0;

      const newTxIds = new Set(snap.docChanges().filter(ch=>ch.type==='added').map(ch=>ch.doc.id));

      const rows = snap.docs.map(doc => {
        const d      = doc.data();
        const esIng  = d.type === 'ingreso';
        const color  = esIng ? 'var(--success)' : 'var(--danger)';
        const sign   = esIng ? '+' : '−';
        const badge  = esIng
          ? '<span class="badge badge-success"><i class="bi bi-arrow-up-circle"></i> Ingreso</span>'
          : '<span class="badge badge-danger"><i class="bi bi-arrow-down-circle"></i> Egreso</span>';
        const isNew  = newTxIds.has(doc.id);

        if (esIng) totalIngresos += d.amount || 0;
        else       totalEgresos  += d.amount || 0;

        return `<tr class="${isNew ? 'row-new' : ''}">
          <td style="color:var(--muted);font-size:0.8rem">${formatTime(d.createdAt)}</td>
          <td>${escHtml(d.concept)}</td>
          <td>${badge}</td>
          <td style="color:${color};font-weight:700;text-align:right">${sign} ${formatCOP(d.amount)}</td>
        </tr>`;
      }).join('');

      document.getElementById('cajaTxList').innerHTML = `
        <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Concepto</th>
              <th>Tipo</th>
              <th style="text-align:right">Monto</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        </div>`;

      // Actualizar resumen KPIs con datos reales de las transacciones
      actualizarResumenDesdeTransacciones(
        snap.docs.map(d => d.data()),
        cajaActiva?.openingBalance || 0
      );

    }, err => console.error('Error transacciones realtime:', err));
  RealtimeManager.register('transacciones', unsub);
}

// Recalcula KPIs de caja desde los datos reales de transacciones (no el campo en cash_registers)
function actualizarResumenDesdeTransacciones(txList, apertura) {
  let ingresos = 0;
  let egresos  = 0;
  txList.forEach(d => {
    if (d.type === 'ingreso') ingresos += d.amount || 0;
    else                      egresos  += d.amount || 0;
  });
  const saldo = apertura + ingresos - egresos;

  document.getElementById('cajaApertura').textContent = formatCOP(apertura);
  document.getElementById('cajaIngresos').textContent = formatCOP(ingresos);
  document.getElementById('cajaEgresos').textContent  = formatCOP(egresos);
  const saldoEl = document.getElementById('cajaSaldo');
  saldoEl.textContent  = formatCOP(saldo);
  saldoEl.style.color  = saldo >= 0 ? 'var(--success)' : 'var(--danger)';
}

function escHtml(str) {
  if (!str) return '—';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
