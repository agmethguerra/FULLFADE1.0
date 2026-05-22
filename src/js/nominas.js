// FullFade — Módulo de Nóminas por Barbero

let nominasBarbershopId = null;
let _nominaItems        = [];
let _nominaBarberoNombre = '';
let _nominaDesde        = '';
let _nominaHasta        = '';
let _nominaPorcentaje   = 50;
let _nominaTotal        = 0;
let _nominaTotalBarbero = 0;

function initNominas(barbershopId) {
  nominasBarbershopId = barbershopId;

  // Fechas por defecto: mes actual
  const now  = new Date();
  const pad  = n => String(n).padStart(2,'0');
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  document.getElementById('nominaDesde').value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`;
  document.getElementById('nominaHasta').value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(lastDay)}`;

  cargarBarberosSelect();

  document.getElementById('nominaPreviewBtn').addEventListener('click', previsualizarNomina);
  document.getElementById('nominaPdfBtn').addEventListener('click', generarNominaPDF);

  // Validaciones de input
  document.getElementById('nominaPorcentaje').addEventListener('input', e => {
    let v = parseInt(e.target.value);
    if (v < 1)   e.target.value = 1;
    if (v > 100) e.target.value = 100;
  });

  // Verificar plan
  const planEl = document.getElementById('nominasPlanBadge');
  if (!canExportPDF() && planEl) {
    planEl.innerHTML = `<span class="badge badge-muted"><i class="bi bi-lock" style="margin-right:4px"></i>Solo Plan Pro</span>`;
  }
}

// ─── Cargar barberos en el select ─────────────────────────────────────────────
async function cargarBarberosSelect() {
  try {
    const snap = await db.collection('employees')
      .where('barbershopId', '==', nominasBarbershopId)
      .orderBy('name')
      .get();

    const sel = document.getElementById('nominaBarberoSelect');
    if (snap.empty) {
      sel.innerHTML = '<option value="">No hay barberos registrados</option>';
      return;
    }
    sel.innerHTML = '<option value="">— Selecciona un barbero —</option>' +
      snap.docs.map(d => `<option value="${d.id}">${escHtml(d.data().name)}${d.data().active ? '' : ' (baja)'}</option>`).join('');
  } catch(err) {
    console.error('Error cargando barberos:', err);
  }
}

// ─── Previsualizar nómina ─────────────────────────────────────────────────────
async function previsualizarNomina() {
  const barberoId   = document.getElementById('nominaBarberoSelect').value;
  const desde       = document.getElementById('nominaDesde').value;
  const hasta       = document.getElementById('nominaHasta').value;
  const porcentaje  = parseInt(document.getElementById('nominaPorcentaje').value) || 50;
  const msgEl       = document.getElementById('nominaMsg');

  // Validaciones
  if (!barberoId) { Toast.error('Selecciona un barbero.'); return; }
  if (!desde || !hasta) { Toast.error('Selecciona el período.'); return; }
  if (new Date(desde) > new Date(hasta)) { Toast.error('La fecha "Desde" no puede ser mayor que "Hasta".'); return; }
  if (porcentaje < 1 || porcentaje > 100) { Toast.error('El porcentaje debe estar entre 1% y 100%.'); return; }

  const btn = document.getElementById('nominaPreviewBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px"></span> Cargando...';
  msgEl.textContent = '';

  try {
    // Nombre del barbero
    const barSnap = await db.collection('employees').doc(barberoId).get();
    _nominaBarberoNombre = barSnap.exists ? barSnap.data().name : 'Barbero';

    // Rango: desde 00:00:00 del día "desde" hasta 00:00:00 del día siguiente al "hasta"
    const startDate = new Date(desde + 'T00:00:00');
    const endDate   = new Date(hasta  + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 1); // 00:00 del día siguiente

    // Buscar citas completadas del barbero en ese período
    const snap = await db.collection('appointments')
      .where('barbershopId', '==', nominasBarbershopId)
      .where('employeeId',   '==', barberoId)
      .where('status',       '==', 'completed')
      .where('date',         '>=', startDate)
      .where('date',         '<',  endDate)
      .orderBy('date', 'asc')
      .get();

    _nominaItems       = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _nominaDesde       = desde;
    _nominaHasta       = hasta;
    _nominaPorcentaje  = porcentaje;

    // Calcular totales
    _nominaTotal        = _nominaItems.reduce((s, d) => s + (d.servicePrice || 0), 0);
    _nominaTotalBarbero = Math.round(_nominaTotal * (porcentaje / 100));

    // Render previsualización
    document.getElementById('nominaPreviewSection').style.display = 'block';
    document.getElementById('nominaPreviewTitle').innerHTML =
      `<i class="bi bi-table" style="margin-right:6px"></i>
       Nómina de <strong>${escHtml(_nominaBarberoNombre)}</strong> —
       <span style="color:var(--muted);font-weight:400">${formatDateShort(desde)} al ${formatDateShort(hasta)}</span>`;

    if (_nominaItems.length === 0) {
      document.getElementById('nominaPreviewBody').innerHTML =
        '<div class="empty-state"><i class="bi bi-scissors empty-icon"></i><p>No hay citas completadas en este período para este barbero.</p></div>';
      document.getElementById('nominaTotalesBar').innerHTML = '';
      document.getElementById('nominaPdfBtn').disabled = true;
      document.getElementById('nominaResumenBadge').innerHTML = '';
    } else {
      renderNominaPreview();
      const puedeGenerarPDF = canExportPDF();
      document.getElementById('nominaPdfBtn').disabled = !puedeGenerarPDF;
      if (!puedeGenerarPDF) {
        document.getElementById('nominaPdfBtn').title = 'Requiere Plan Pro para generar PDF';
        document.getElementById('nominaPdfBtn').innerHTML = '<i class="bi bi-lock"></i> Generar PDF (Pro)';
      } else {
        document.getElementById('nominaPdfBtn').title = '';
        document.getElementById('nominaPdfBtn').innerHTML = '<i class="bi bi-file-earmark-pdf"></i> Generar PDF';
      }
      document.getElementById('nominaResumenBadge').innerHTML =
        `<span class="badge badge-success">${_nominaItems.length} servicio${_nominaItems.length!==1?'s':''}</span>`;
    }

    // Scroll hacia la previsualización
    document.getElementById('nominaPreviewSection').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch(err) {
    console.error('Error cargando nómina:', err);
    msgEl.textContent = 'Error al cargar los datos. Verifica los índices de Firestore.';
    msgEl.style.color = 'var(--danger)';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-eye"></i> Previsualizar';
  }
}

// ─── Render tabla previsualización ────────────────────────────────────────────
function renderNominaPreview() {
  const porcentajeBarbero = _nominaPorcentaje;
  const porcentajeCasa    = 100 - porcentajeBarbero;

  const rows = _nominaItems.map((d, i) => {
    const fecha     = d.date?.toDate ? d.date.toDate() : new Date(d.date);
    const precio    = d.servicePrice || 0;
    const ganancia  = Math.round(precio * (porcentajeBarbero / 100));
    return `<tr class="${i % 2 === 0 ? '' : ''}">
      <td style="color:var(--muted);font-size:0.8rem;white-space:nowrap">
        ${fecha.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}
        <span style="color:var(--muted);font-size:0.75rem;display:block">
          ${fecha.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}
        </span>
      </td>
      <td><strong>${escHtml(d.clientName || '—')}</strong></td>
      <td>${escHtml(d.serviceName || '—')}</td>
      <td style="text-align:right;font-weight:600">${formatCOP(precio)}</td>
      <td style="text-align:right;color:var(--success);font-weight:700">${formatCOP(ganancia)}</td>
    </tr>`;
  }).join('');

  document.getElementById('nominaPreviewBody').innerHTML = `
    <div class="table-responsive">
    <table>
      <thead>
        <tr>
          <th>Fecha / Hora</th>
          <th>Cliente</th>
          <th>Servicio</th>
          <th style="text-align:right">Precio servicio</th>
          <th style="text-align:right">Ganancia barbero (${porcentajeBarbero}%)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;

  document.getElementById('nominaTotalesBar').innerHTML = `
    <div style="display:flex;gap:32px;flex-wrap:wrap;align-items:center">
      <div>
        <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;font-weight:600">
          Total facturado
        </div>
        <div style="font-size:1.3rem;font-weight:700">${formatCOP(_nominaTotal)}</div>
      </div>
      <div>
        <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;font-weight:600">
          Casa (${porcentajeCasa}%)
        </div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--accent)">
          ${formatCOP(Math.round(_nominaTotal * (porcentajeCasa / 100)))}
        </div>
      </div>
      <div style="background:rgba(47,158,68,0.08);border:1px solid rgba(47,158,68,0.2);
                  border-radius:var(--radius);padding:12px 20px">
        <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;font-weight:600">
          A pagar a ${escHtml(_nominaBarberoNombre)} (${_nominaPorcentaje}%)
        </div>
        <div style="font-size:1.6rem;font-weight:800;color:var(--success)">${formatCOP(_nominaTotalBarbero)}</div>
      </div>
    </div>`;
}

// ─── Generar PDF de nómina ────────────────────────────────────────────────────
function generarNominaPDF() {
  if (!canExportPDF()) {
    Toast.error('Generar PDF de nóminas requiere Plan Pro. Actualiza tu plan en la sección Suscripción.');
    return;
  }
  if (!_nominaItems || _nominaItems.length === 0) {
    Toast.error('Primero previsualiza la nómina.');
    return;
  }

  const shopName        = getShopName();
  const factNum         = `NOM-${Date.now().toString().slice(-6)}`;
  const fechaEmision    = new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'});
  const periodoStr      = `${formatDateShort(_nominaDesde)} — ${formatDateShort(_nominaHasta)}`;
  const porcentajeCasa  = 100 - _nominaPorcentaje;
  const totalCasa       = Math.round(_nominaTotal * (porcentajeCasa / 100));

  const filas = _nominaItems.map((d, i) => {
    const fecha    = d.date?.toDate ? d.date.toDate() : new Date(d.date);
    const precio   = d.servicePrice || 0;
    const ganancia = Math.round(precio * (_nominaPorcentaje / 100));
    const fStr     = fecha.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'});
    const hStr     = fecha.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    return `<tr>
      <td>${i+1}</td>
      <td>${fStr}<br><span style="color:#888;font-size:0.78em">${hStr}</span></td>
      <td>${(d.clientName||'—').replace(/</g,'&lt;')}</td>
      <td>${(d.serviceName||'—').replace(/</g,'&lt;')}</td>
      <td class="money">${formatCOP(precio)}</td>
      <td class="money" style="color:#2f9e44">${formatCOP(ganancia)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Nómina ${factNum} — ${_nominaBarberoNombre.replace(/</g,'&lt;')}</title>
<style>
  *{ margin:0;padding:0;box-sizing:border-box }
  body{ font-family:'Helvetica Neue',Arial,sans-serif;background:#fff;color:#111;font-size:13px }
  .page{ max-width:820px;margin:0 auto;padding:44px 48px 60px }

  /* Header */
  .header{ display:flex;justify-content:space-between;align-items:flex-start;
           margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #111 }
  .brand{ display:flex;align-items:center;gap:12px }
  .brand-icon{ width:42px;height:42px;background:#111;border-radius:8px;
               display:flex;align-items:center;justify-content:center;
               color:#C9A84C;font-size:1.4rem;flex-shrink:0 }
  .brand-name{ font-size:1.9rem;font-weight:900;letter-spacing:0.08em;color:#111;line-height:1 }
  .brand-sub{ font-size:0.68rem;letter-spacing:0.18em;text-transform:uppercase;color:#888;margin-top:3px }
  .doc-title{ font-size:1.7rem;font-weight:800;color:#111;letter-spacing:0.03em }
  .doc-sub{ font-size:0.78rem;color:#888;margin-top:3px }

  /* Info band */
  .info-band{ background:#111;color:#fff;border-radius:10px;padding:16px 22px;
              margin-bottom:28px;display:flex;gap:32px;flex-wrap:wrap }
  .info-item label{ font-size:0.62rem;text-transform:uppercase;letter-spacing:0.14em;
                    color:#C9A84C;font-weight:600;display:block;margin-bottom:3px }
  .info-item span{ font-size:0.9rem;font-weight:500 }

  /* Barbero highlight */
  .barbero-card{ border:2px solid #C9A84C;border-radius:10px;padding:16px 22px;
                 margin-bottom:24px;display:flex;align-items:center;gap:20px;
                 background:linear-gradient(135deg,#fffdf5,#fff) }
  .barbero-avatar{ width:52px;height:52px;border-radius:50%;background:#111;
                   color:#C9A84C;display:flex;align-items:center;justify-content:center;
                   font-size:1.4rem;font-weight:900;flex-shrink:0 }
  .barbero-info-name{ font-size:1.15rem;font-weight:800;color:#111 }
  .barbero-info-sub{ font-size:0.8rem;color:#888;margin-top:2px }
  .comision-badge{ margin-left:auto;background:#C9A84C;color:#fff;border-radius:8px;
                   padding:8px 18px;font-size:1.2rem;font-weight:800;white-space:nowrap }

  /* Tabla */
  table{ width:100%;border-collapse:collapse;margin-bottom:0 }
  thead tr{ background:#f5f5f5 }
  th{ padding:9px 12px;text-align:left;font-size:0.67rem;text-transform:uppercase;
      letter-spacing:0.08em;color:#555;font-weight:700;border-bottom:2px solid #e0e0e0 }
  td{ padding:9px 12px;border-bottom:1px solid #f0f0f0;color:#333;vertical-align:top }
  tr:nth-child(even) td{ background:#fafafa }
  tr:last-child td{ border-bottom:none }
  .money{ text-align:right;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap }

  /* Totales */
  .totales-grid{ display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;
                 border:2px solid #111;border-radius:10px;overflow:hidden;margin-top:24px }
  .total-box{ padding:16px 20px;text-align:center }
  .total-box:not(:last-child){ border-right:1px solid #e0e0e0 }
  .total-box.highlight{ background:#111;color:#fff }
  .total-label{ font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;
                color:#888;font-weight:600;margin-bottom:6px }
  .total-box.highlight .total-label{ color:#C9A84C }
  .total-value{ font-size:1.25rem;font-weight:800;color:#111 }
  .total-box.highlight .total-value{ color:#C9A84C;font-size:1.5rem }

  /* Footer */
  .footer{ margin-top:40px;padding-top:18px;border-top:1px solid #e0e0e0;
           display:flex;justify-content:space-between;align-items:flex-end;gap:16px }
  .footer-left{ font-size:0.72rem;color:#aaa;line-height:1.6 }
  .footer-left strong{ color:#111;display:block;font-size:0.82rem;margin-bottom:2px }
  .footer-right{ font-size:0.7rem;color:#bbb;text-align:right;line-height:1.5 }
  .gold{ color:#C9A84C }

  .firma-box{ margin-top:48px;display:flex;justify-content:flex-end }
  .firma-line{ border-top:1px solid #111;width:220px;text-align:center;
               padding-top:6px;font-size:0.75rem;color:#555 }

  @media print{
    body{ -webkit-print-color-adjust:exact;print-color-adjust:exact }
    .page{ padding:20px }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="brand">
      <div class="brand-icon">✂</div>
      <div>
        <div class="brand-name">FULL<span style="opacity:0.4">FADE</span></div>
        <div class="brand-sub">Software para Barberías</div>
      </div>
    </div>
    <div style="text-align:right">
      <div class="doc-title">LIQUIDACIÓN DE NÓMINA</div>
      <div class="doc-sub">N° ${factNum} · Emitida: ${fechaEmision}</div>
    </div>
  </div>

  <div class="info-band">
    <div class="info-item">
      <label>Negocio</label>
      <span>${shopName.replace(/</g,'&lt;')}</span>
    </div>
    <div class="info-item">
      <label>Período</label>
      <span>${periodoStr}</span>
    </div>
    <div class="info-item">
      <label>Total cortes</label>
      <span>${_nominaItems.length} servicio${_nominaItems.length!==1?'s':''}</span>
    </div>
    <div class="info-item">
      <label>Comisión acordada</label>
      <span>${_nominaPorcentaje}% barbero / ${porcentajeCasa}% casa</span>
    </div>
  </div>

  <div class="barbero-card">
    <div class="barbero-avatar">${(_nominaBarberoNombre||'B').charAt(0).toUpperCase()}</div>
    <div>
      <div class="barbero-info-name">${_nominaBarberoNombre.replace(/</g,'&lt;')}</div>
      <div class="barbero-info-sub">Barbero · Período: ${periodoStr}</div>
    </div>
    <div class="comision-badge">${_nominaPorcentaje}%</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:28px">#</th>
        <th>Fecha / Hora</th>
        <th>Cliente</th>
        <th>Servicio realizado</th>
        <th style="text-align:right">Precio</th>
        <th style="text-align:right">Ganancia (${_nominaPorcentaje}%)</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>

  <div class="totales-grid">
    <div class="total-box">
      <div class="total-label">Total facturado</div>
      <div class="total-value">${formatCOP(_nominaTotal)}</div>
    </div>
    <div class="total-box">
      <div class="total-label">Para la casa (${porcentajeCasa}%)</div>
      <div class="total-value">${formatCOP(totalCasa)}</div>
    </div>
    <div class="total-box highlight">
      <div class="total-label">A pagar a ${_nominaBarberoNombre.replace(/</g,'&lt;')}</div>
      <div class="total-value">${formatCOP(_nominaTotalBarbero)}</div>
    </div>
  </div>

  <div class="firma-box">
    <div class="firma-line">
      Firma y recibido conforme<br>
      <strong>${_nominaBarberoNombre.replace(/</g,'&lt;')}</strong>
    </div>
  </div>

  <div class="footer">
    <div class="footer-left">
      <strong>FullFade</strong>
      Software de gestión para barberías<br>
      <span class="gold">fullfade.com</span>
    </div>
    <div class="footer-right">
      Documento generado automáticamente por FullFade.<br>
      Período: ${periodoStr} · Comisión: ${_nominaPorcentaje}%
    </div>
  </div>

</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=920,height=720');
  win.document.write(html);
  win.document.close();
  win.onload = () => setTimeout(() => win.print(), 350);
  Toast.success('PDF de nómina generado ✓ — usa "Guardar como PDF" en el diálogo de impresión');
}

function escHtml(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
