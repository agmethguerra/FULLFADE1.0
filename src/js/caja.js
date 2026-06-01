// FullFade — Módulo de Caja (con tiempo real y flujo mejorado)

let cajaActiva    = null;
let cajaId        = null;
let cajaBarbershopId = null;
let movType       = 'ingreso';
let _cajaTxCache  = [];   // transacciones en memoria — evita re-query al cerrar

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
        // NO llamar actualizarResumen() aquí — los KPIs los maneja
        // exclusivamente subscribeTransacciones desde las transacciones reales,
        // evitando la carrera entre dos fuentes de verdad desincronizadas
        subscribeTransacciones();
      } else {
        cajaId = null; cajaActiva = null; _cajaTxCache = [];
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
    // Capturar openedAt ANTES del update — el listener puede resetear cajaActiva a null
    // en cuanto Firestore confirma el cierre, perdiendo la hora de apertura
    const openedAt       = cajaActiva?.openedAt       ?? null;
    const openingBalance  = cajaActiva?.openingBalance  ?? 0;

    const txDocs = [..._cajaTxCache].sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return ta - tb;
    });

    await db.collection('cash_registers').doc(cajaId).update({
      status: 'closed', closedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    _generarInformeCierreCaja(txDocs, openedAt, openingBalance);

    Toast.success('Caja cerrada. Informe Excel generado ✓');
  } catch(err) {
    console.error(err);
    Toast.error('Error al cerrar la caja.');
  }
}

function _generarInformeCierreCaja(txDocs, openedAt, openingBalance) {
  const _cargar = () => {
    if (typeof XLSX !== 'undefined') { _buildInformeXLS(txDocs, openedAt, openingBalance); return; }
    const s   = document.createElement('script');
    s.src     = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload  = () => _buildInformeXLS(txDocs, openedAt, openingBalance);
    s.onerror = () => Toast.error('No se pudo cargar la librería de Excel para el informe.');
    document.head.appendChild(s);
  };
  _cargar();
}

function _buildInformeXLS(txDocs, openedAt, openingBalance) {
  const shopName  = getShopName ? getShopName() : 'FullFade';
  // openingBalance se pasa como parámetro — cajaActiva ya es null al llegar aquí
  const apertura  = openingBalance ?? cajaActiva?.openingBalance ?? 0;
  // openedAt se pasa como parámetro porque cajaActiva puede ser null en este punto
  const _oa       = openedAt ?? cajaActiva?.openedAt ?? null;
  const horaAper  = _oa?.toDate
    ? _oa.toDate().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})
    : (_oa instanceof Date
        ? _oa.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})
        : '—');
  const fechaHoy  = new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'});
  const horaCierre= new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});

  let totalIngresos = 0, totalEgresos = 0;
  txDocs.forEach(d => {
    if (d.type === 'ingreso') totalIngresos += d.amount || 0;
    else                      totalEgresos  += d.amount || 0;
  });
  const saldoCierre = apertura + totalIngresos - totalEgresos;

  const wb = XLSX.utils.book_new();

  // ── Hoja 1: Resumen de caja ──────────────────────────────────────────────────
  const resumen = [
    ['INFORME DE CIERRE DE CAJA', ''],
    ['', ''],
    ['Negocio',           shopName],
    ['Fecha',             fechaHoy],
    ['Hora de apertura',  horaAper],
    ['Hora de cierre',    horaCierre],
    ['', ''],
    ['CONCEPTO',          'MONTO (COP)'],
    ['Saldo de apertura', apertura],
    ['Total ingresos',    totalIngresos],
    ['Total egresos',     totalEgresos],
    ['Saldo de cierre',   saldoCierre],
    ['', ''],
    ['Nº de movimientos', txDocs.length],
    ['Nº de ingresos',    txDocs.filter(d => d.type === 'ingreso').length],
    ['Nº de egresos',     txDocs.filter(d => d.type === 'egreso').length],
  ];

  const wsRes = XLSX.utils.aoa_to_sheet(resumen);
  wsRes['!cols'] = [{ wch: 22 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen de caja');

  // ── Hoja 2: Movimientos detallados (con saldo acumulado) ────────────────────
  let saldoAcum = apertura;
  const movRows = [];

  // Primera fila: saldo de apertura como punto de partida
  movRows.push({
    '#':              '—',
    'Fecha':          fechaHoy,
    'Hora':           horaAper !== '—' ? horaAper : '—',
    'Tipo':           'APERTURA',
    'Concepto':       'Saldo inicial de caja',
    'Ingreso (COP)':  '',
    'Egreso (COP)':   '',
    'Saldo (COP)':    apertura,
  });

  txDocs.forEach((d, i) => {
    const fecha   = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
    const esIng   = d.type === 'ingreso';
    const monto   = d.amount || 0;
    saldoAcum    += esIng ? monto : -monto;
    movRows.push({
      '#':              i + 1,
      'Fecha':          fecha.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'}),
      'Hora':           fecha.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),
      'Tipo':           esIng ? 'Ingreso' : 'Egreso',
      'Concepto':       d.concept || '—',
      'Ingreso (COP)':  esIng ? monto : '',
      'Egreso (COP)':   !esIng ? monto : '',
      'Saldo (COP)':    saldoAcum,
    });
  });

  // Fila de totales
  movRows.push({
    '#':             '',
    'Fecha':         '',
    'Hora':          '',
    'Tipo':          'CIERRE',
    'Concepto':      `Total: ${txDocs.length} movimiento(s)`,
    'Ingreso (COP)': totalIngresos,
    'Egreso (COP)':  totalEgresos,
    'Saldo (COP)':   saldoCierre,
  });

  const HDRS = ['#','Fecha','Hora','Tipo','Concepto','Ingreso (COP)','Egreso (COP)','Saldo (COP)'];
  const wsMov = XLSX.utils.json_to_sheet(movRows, { header: HDRS });
  wsMov['!cols'] = [
    { wch: 5  },  // #
    { wch: 13 },  // Fecha
    { wch: 10 },  // Hora
    { wch: 10 },  // Tipo
    { wch: 36 },  // Concepto
    { wch: 16 },  // Ingreso
    { wch: 14 },  // Egreso
    { wch: 16 },  // Saldo
  ];
  XLSX.utils.book_append_sheet(wb, wsMov, 'Movimientos');

  // ── Hoja 3: Solo ingresos ────────────────────────────────────────────────────
  const soloIngresos = txDocs
    .filter(d => d.type === 'ingreso')
    .map((d, i) => {
      const fecha = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
      return {
        '#':            i + 1,
        'Fecha':        fecha.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'}),
        'Hora':         fecha.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),
        'Concepto':     d.concept || '—',
        'Monto (COP)':  d.amount || 0,
      };
    });
  soloIngresos.push({ '#': '', 'Fecha': '', 'Hora': '', 'Concepto': 'TOTAL INGRESOS', 'Monto (COP)': totalIngresos });

  const wsIng = XLSX.utils.json_to_sheet(
    soloIngresos,
    { header: ['#','Fecha','Hora','Concepto','Monto (COP)'] }
  );
  wsIng['!cols'] = [{ wch: 5 }, { wch: 13 }, { wch: 10 }, { wch: 36 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsIng, 'Ingresos');

  // ── Hoja 4: Solo egresos ─────────────────────────────────────────────────────
  const soloEgresos = txDocs
    .filter(d => d.type === 'egreso')
    .map((d, i) => {
      const fecha = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
      return {
        '#':            i + 1,
        'Fecha':        fecha.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'}),
        'Hora':         fecha.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),
        'Concepto':     d.concept || '—',
        'Monto (COP)':  d.amount || 0,
      };
    });
  soloEgresos.push({ '#': '', 'Fecha': '', 'Hora': '', 'Concepto': 'TOTAL EGRESOS', 'Monto (COP)': totalEgresos });

  const wsEgr = XLSX.utils.json_to_sheet(
    soloEgresos,
    { header: ['#','Fecha','Hora','Concepto','Monto (COP)'] }
  );
  wsEgr['!cols'] = [{ wch: 5 }, { wch: 13 }, { wch: 10 }, { wch: 36 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsEgr, 'Egresos');

  // ── Descargar ────────────────────────────────────────────────────────────────
  const fechaFile = new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\//g,'-');
  XLSX.writeFile(wb, `fullfade-cierre-caja-${fechaFile}.xlsx`);
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
    // El resumen se recalcula en tiempo real desde las transacciones —
    // ya no se actualiza cash_registers.ingresos/egresos porque ese update
    // dispara subscribeCajaAbierta con datos parciales y borra el otro campo
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
  // Si ya hay un listener activo para esta caja, no crear otro.
  // subscribeCajaAbierta puede disparar varias veces mientras la caja esté abierta
  // (ej: cada vez que se escribe en cash_registers), y RealtimeManager.register
  // cancela el listener anterior — perdiendo snapshots en tránsito.
  if (RealtimeManager._listeners['transacciones']) return;
  const unsub = db.collection('transactions')
    .where('barbershopId', '==', cajaBarbershopId)
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

      // Guardar en cache para uso al cerrar (evita re-query con índice compuesto)
      _cajaTxCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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
