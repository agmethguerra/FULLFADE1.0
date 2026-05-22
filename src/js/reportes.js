// FullFade — Módulo de Reportes + Facturación PDF

let reportesBarbershopId = null;
let _reporteData = [];

function initReportes(barbershopId) {
  reportesBarbershopId = barbershopId;
  document.getElementById('exportarReporteBtn')?.addEventListener('click', exportarCSV);
  document.getElementById('generarFacturaBtn')?.addEventListener('click', generarFacturaPDF);
  document.getElementById('facturaDesde')?.addEventListener('change', actualizarVistaFactura);
  document.getElementById('facturaHasta')?.addEventListener('change', actualizarVistaFactura);
}

// ─── CARGA PRINCIPAL ──────────────────────────────────────────────────────────
function loadReportes() {
  if (!reportesBarbershopId) return;

  const now      = new Date();
  const startMes = new Date(now.getFullYear(), now.getMonth(), 1);
  const endMes   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // ── Transacciones del mes en tiempo real ────────────────────────────────────
  const unsubTx = db.collection('transactions')
    .where('barbershopId', '==', reportesBarbershopId)
    .where('type', '==', 'ingreso')
    .where('createdAt', '>=', startMes)
    .where('createdAt', '<',  endMes)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      let totalMes = 0;
      const txDocs = [];
      const porDia = {};

      snap.forEach(doc => {
        const d = doc.data();
        totalMes += d.amount || 0;
        txDocs.push({ id: doc.id, ...d });
        if (d.createdAt) {
          const f   = d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt);
          const key = f.toISOString().slice(0, 10);
          porDia[key] = (porDia[key] || 0) + (d.amount || 0);
        }
      });

      // KPIs
      document.getElementById('rep-mes').textContent       = formatCOP(totalMes);
      document.getElementById('rep-servicios').textContent = snap.size;

      let mejorDia = null, mejorMonto = 0;
      Object.entries(porDia).forEach(([dia, monto]) => {
        if (monto > mejorMonto) { mejorMonto = monto; mejorDia = dia; }
      });
      document.getElementById('rep-mejor').textContent = mejorDia
        ? new Date(mejorDia+'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short'}) + ' · ' + formatCOP(mejorMonto)
        : '—';

      renderChartBars(porDia);

      if (!canViewAdvReports()) {
        showProPlaceholder('reporteList', 'Tabla detallada de transacciones');
        document.getElementById('exportarReporteBtn').disabled = true;
      } else {
        document.getElementById('exportarReporteBtn').disabled = false;
        renderTablaReportes(txDocs, snap.docChanges());
        _reporteData = txDocs;
      }

      renderSeccionFacturacion();
    }, err => {
      console.error('Error reportes realtime:', err);
    });

  RealtimeManager.register('reportes-tx', unsubTx);

  // ── Clientes nuevos del mes en tiempo real ──────────────────────────────────
  const unsubCli = db.collection('customers')
    .where('barbershopId', '==', reportesBarbershopId)
    .where('createdAt', '>=', startMes)
    .where('createdAt', '<',  endMes)
    .onSnapshot(snap => {
      document.getElementById('rep-clientes-nuevos').textContent = snap.size;
    }, () => {});

  RealtimeManager.register('reportes-cli', unsubCli);
}

function renderTablaReportes(txDocs, changes) {
  if (txDocs.length === 0) {
    document.getElementById('reporteList').innerHTML =
      '<div class="empty-state"><i class="bi bi-bar-chart-line empty-icon"></i><p>No hay transacciones este mes.</p></div>';
    return;
  }

  // IDs de documentos recién añadidos para resaltarlos
  const newIds = new Set(
    (changes || []).filter(ch => ch.type === 'added').map(ch => ch.doc.id)
  );

  const rows = txDocs.slice(0, 100).map(d => {
    const fecha   = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
    const isNew   = newIds.has(d.id);
    const rowStyle = isNew
      ? 'background:rgba(201,168,76,0.08);animation:rowFadeIn 0.5s ease'
      : '';
    return `<tr style="${rowStyle}" data-id="${d.id}">
      <td>${fecha.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}</td>
      <td>${fecha.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</td>
      <td>${escHtml(d.concept || '—')}</td>
      <td style="font-weight:600;color:var(--success)">${formatCOP(d.amount)}</td>
    </tr>`;
  }).join('');

  document.getElementById('reporteList').innerHTML = `
    <div class="table-responsive">
    <table>
      <thead><tr><th>Fecha</th><th>Hora</th><th>Concepto / Servicio</th><th>Monto</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
    ${txDocs.length > 100 ? `<p style="padding:12px 16px;font-size:0.8rem;color:var(--muted)">Mostrando 100 de ${txDocs.length} registros.</p>` : ''}`;
}

// ─── SECCIÓN FACTURACIÓN ──────────────────────────────────────────────────────
function renderSeccionFacturacion() {
  const el = document.getElementById('facturacionSection');
  if (!el) return;

  const puedeFacturar = canExportPDF();

  // Fechas por defecto: inicio y fin del mes actual
  const now    = new Date();
  const pad    = n => String(n).padStart(2,'0');
  const desde  = `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`;
  const hasta  = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(new Date(now.getFullYear(),now.getMonth()+1,0).getDate())}`;

  el.innerHTML = `
    <div class="table-wrapper" style="margin-top:24px">
      <div class="table-header">
        <h3><i class="bi bi-file-earmark-pdf" style="margin-right:6px;color:var(--danger)"></i>Facturación por período</h3>
        ${puedeFacturar ? `
          <button class="btn btn-gold btn-sm" id="generarFacturaBtn">
            <i class="bi bi-file-earmark-pdf"></i> Generar PDF
          </button>` : ''}
      </div>

      ${puedeFacturar ? `
        <div style="padding:20px 22px;border-bottom:1px solid var(--border)">
          <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">
            <div class="form-group" style="margin:0;flex:1;min-width:140px">
              <label class="label">Desde</label>
              <input class="input" type="date" id="facturaDesde" value="${desde}" />
            </div>
            <div class="form-group" style="margin:0;flex:1;min-width:140px">
              <label class="label">Hasta</label>
              <input class="input" type="date" id="facturaHasta" value="${hasta}" />
            </div>
            <button class="btn btn-outline btn-sm" onclick="actualizarVistaFactura()" style="margin-bottom:1px">
              <i class="bi bi-arrow-clockwise"></i> Actualizar
            </button>
          </div>
        </div>
        <div id="facturaPreview" style="padding:20px 22px">
          <div class="empty-state"><i class="bi bi-hourglass-split empty-icon"></i><p>Selecciona un período y haz clic en Actualizar.</p></div>
        </div>` : `
        <div id="facturaPreview">
          ${(() => { showProPlaceholder('facturaPreview','Facturación y exportación en PDF'); return ''; })()}
        </div>`
      }
    </div>`;

  // Re-attach listeners tras re-render
  document.getElementById('generarFacturaBtn')?.addEventListener('click', generarFacturaPDF);
  document.getElementById('facturaDesde')?.addEventListener('change', actualizarVistaFactura);
  document.getElementById('facturaHasta')?.addEventListener('change', actualizarVistaFactura);

  // Si no puede facturar, mostrar placeholder en el div correcto
  if (!puedeFacturar) {
    showProPlaceholder('facturaPreview', 'Facturación y exportación en PDF');
  }
}

// ─── PREVISUALIZACIÓN DE FACTURA ──────────────────────────────────────────────
let _facturaItems  = [];
let _facturaTotal  = 0;
let _facturaDesde  = '';
let _facturaHasta  = '';

async function actualizarVistaFactura() {
  if (!canExportPDF()) return;
  const desde = document.getElementById('facturaDesde')?.value;
  const hasta = document.getElementById('facturaHasta')?.value;
  if (!desde || !hasta) return;
  if (new Date(desde) > new Date(hasta)) {
    Toast.error('La fecha "Desde" no puede ser mayor que "Hasta".');
    return;
  }
  _facturaDesde = desde;
  _facturaHasta = hasta;

  const preview = document.getElementById('facturaPreview');
  preview.innerHTML = '<div style="padding:32px;text-align:center;color:var(--muted)"><span class="loader"></span> Cargando...</div>';

  try {
    const startDate = new Date(desde + 'T00:00:00');
    const endDate   = new Date(hasta + 'T23:59:59');

    const snap = await db.collection('transactions')
      .where('barbershopId', '==', reportesBarbershopId)
      .where('type', '==', 'ingreso')
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .orderBy('createdAt', 'asc')
      .get();

    _facturaItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _facturaTotal = _facturaItems.reduce((s, d) => s + (d.amount || 0), 0);

    if (_facturaItems.length === 0) {
      preview.innerHTML = '<div class="empty-state"><i class="bi bi-receipt empty-icon"></i><p>No hay ingresos en este período.</p></div>';
      return;
    }

    const rows = _facturaItems.map((d, i) => {
      const fecha = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
      return `<tr>
        <td style="color:var(--muted);width:30px">${i+1}</td>
        <td>${fecha.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}</td>
        <td>${escHtml(d.concept || 'Servicio')}</td>
        <td style="text-align:right;font-weight:600">${formatCOP(d.amount)}</td>
      </tr>`;
    }).join('');

    preview.innerHTML = `
      <div style="overflow-x:auto">
      <table style="min-width:360px">
        <thead><tr><th>#</th><th>Fecha</th><th>Servicio facturado</th><th style="text-align:right">Monto</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="border-top:2px solid var(--border)">
            <td colspan="3" style="font-weight:700;padding:14px 16px;font-size:0.95rem">
              Total facturado (${_facturaItems.length} servicios)
            </td>
            <td style="text-align:right;font-weight:700;font-size:1.1rem;color:var(--success);padding:14px 16px">
              ${formatCOP(_facturaTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
      </div>`;

  } catch(err) {
    console.error(err);
    preview.innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-triangle empty-icon"></i><p>Error al cargar el período.</p></div>';
  }
}

// ─── GENERAR PDF ──────────────────────────────────────────────────────────────
function generarFacturaPDF() {
  if (!canExportPDF()) {
    showProPlaceholder('facturaPreview', 'Exportación de factura en PDF');
    return;
  }
  if (!_facturaItems || _facturaItems.length === 0) {
    Toast.error('Primero selecciona un período con transacciones.');
    return;
  }

  const shopName  = getShopName();
  const fechaHoy  = new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'});
  const periodoStr = `${formatDateShort(_facturaDesde)} — ${formatDateShort(_facturaHasta)}`;
  const factNum   = `FF-${Date.now().toString().slice(-6)}`;

  const filas = _facturaItems.map((d, i) => {
    const fecha = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
    const f     = fecha.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'});
    const h     = fecha.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    return `<tr>
      <td>${i+1}</td>
      <td>${f}</td>
      <td>${h}</td>
      <td>${(d.concept||'Servicio').replace(/</g,'&lt;')}</td>
      <td class="money">${formatCOP(d.amount)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Factura ${factNum} — ${shopName}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; background:#fff; color:#111; font-size:13px; }

  .page { max-width:800px; margin:0 auto; padding:48px 48px 64px; }

  /* Header con marca */
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:40px; padding-bottom:24px; border-bottom:3px solid #111; }
  .brand  { display:flex; align-items:center; gap:12px; }
  .brand-icon { width:44px; height:44px; background:#111; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#C9A84C; font-size:1.5rem; flex-shrink:0; }
  .brand-name { font-size:2rem; font-weight:900; letter-spacing:0.08em; color:#111; line-height:1; }
  .brand-sub  { font-size:0.7rem; letter-spacing:0.18em; text-transform:uppercase; color:#888; margin-top:3px; }
  .header-right { text-align:right; }
  .factura-titulo { font-size:1.8rem; font-weight:800; color:#111; letter-spacing:0.04em; }
  .factura-num    { font-size:0.78rem; color:#888; margin-top:4px; }
  .factura-fecha  { font-size:0.78rem; color:#888; }

  /* Info banda dorada */
  .info-band { background:#111; color:#fff; border-radius:10px; padding:18px 24px; margin-bottom:32px; display:flex; gap:40px; flex-wrap:wrap; }
  .info-item label { font-size:0.65rem; text-transform:uppercase; letter-spacing:0.14em; color:#C9A84C; font-weight:600; display:block; margin-bottom:4px; }
  .info-item span  { font-size:0.92rem; font-weight:500; }

  /* Tabla */
  table { width:100%; border-collapse:collapse; margin-bottom:0; }
  thead tr { background:#f5f5f5; }
  th { padding:10px 14px; text-align:left; font-size:0.68rem; text-transform:uppercase; letter-spacing:0.08em; color:#555; font-weight:700; border-bottom:2px solid #e0e0e0; }
  td { padding:10px 14px; border-bottom:1px solid #f0f0f0; color:#333; }
  tr:last-child td { border-bottom:none; }
  tr:nth-child(even) td { background:#fafafa; }
  .money { text-align:right; font-weight:600; font-variant-numeric:tabular-nums; }

  /* Total */
  .total-row { background:#111; color:#fff; }
  .total-row td { border:none; padding:14px 14px; font-size:1rem; }
  .total-row .money { color:#C9A84C; font-size:1.2rem; font-weight:800; }

  /* Footer */
  .footer { margin-top:48px; padding-top:20px; border-top:1px solid #e0e0e0; display:flex; justify-content:space-between; align-items:flex-end; gap:20px; }
  .footer-brand { font-size:0.72rem; color:#aaa; }
  .footer-brand strong { color:#111; display:block; font-size:0.85rem; margin-bottom:2px; }
  .footer-note { font-size:0.7rem; color:#bbb; text-align:right; line-height:1.5; }
  .gold { color:#C9A84C; }

  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .page { padding:24px; }
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
    <div class="header-right">
      <div class="factura-titulo">FACTURA</div>
      <div class="factura-num"># ${factNum}</div>
      <div class="factura-fecha">Emitida: ${fechaHoy}</div>
    </div>
  </div>

  <div class="info-band">
    <div class="info-item">
      <label>Negocio</label>
      <span>${shopName.replace(/</g,'&lt;')}</span>
    </div>
    <div class="info-item">
      <label>Período facturado</label>
      <span>${periodoStr}</span>
    </div>
    <div class="info-item">
      <label>Total servicios</label>
      <span>${_facturaItems.length} registros</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th>Fecha</th>
        <th>Hora</th>
        <th>Servicio facturado</th>
        <th style="text-align:right">Monto</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="4" style="font-weight:700;letter-spacing:0.04em">
          TOTAL FACTURADO — ${_facturaItems.length} servicios · ${periodoStr}
        </td>
        <td class="money">${formatCOP(_facturaTotal)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <div class="footer-brand">
      <strong>FullFade</strong>
      Software de gestión para barberías<br>
      <span class="gold">fullfade.com</span>
    </div>
    <div class="footer-note">
      Este documento es generado automáticamente por FullFade.<br>
      No requiere firma para su validez interna.
    </div>
  </div>

</div>
</body>
</html>`;

  // Abrir en ventana nueva y disparar impresión/guardar como PDF
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    setTimeout(() => win.print(), 300);
  };

  Toast.success('PDF generado — usa "Guardar como PDF" en el diálogo de impresión ✓');
}

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'});
}

// ─── GRÁFICA DE BARRAS ────────────────────────────────────────────────────────
function renderChartBars(porDia) {
  const wrapper = document.getElementById('chartWrapper');
  if (!wrapper) return;

  // Datos 7 dias
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      key,
      label: d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }),
      monto: porDia[key] || 0
    });
  }

  const todayK = new Date().toISOString().slice(0, 10);
  const maxVal = Math.max(...days.map(d => d.monto), 1);

  // Reconstruir canvas cada vez
  wrapper.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;display:block';
  wrapper.appendChild(canvas);

  const W = wrapper.clientWidth || 600;
  const H = 160;
  canvas.width  = W;
  canvas.height = H;

  const ctx    = canvas.getContext('2d');
  const PAD_L  = 8;
  const PAD_R  = 8;
  const PAD_T  = 32;   // espacio arriba para etiquetas
  const PAD_B  = 28;   // espacio abajo para fecha
  const chartH = H - PAD_T - PAD_B;
  const barW   = Math.floor((W - PAD_L - PAD_R) / days.length);
  const gap    = Math.max(3, Math.floor(barW * 0.18));

  // Animar barras creciendo desde 0
  let progress = 0;
  const DURATION = 600; // ms
  const startTime = performance.now();

  function draw(now) {
    progress = Math.min((now - startTime) / DURATION, 1);
    // easeOutBack
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const ease = 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2);
    const p = Math.max(0, Math.min(ease, 1));

    ctx.clearRect(0, 0, W, H);

    days.forEach((day, i) => {
      const x       = PAD_L + i * barW;
      const isHoy   = day.key === todayK;
      const prev    = i > 0 ? days[i - 1].monto : null;
      const diff    = prev !== null ? day.monto - prev : null;
      const fullH   = day.monto > 0 ? Math.max(Math.round((day.monto / maxVal) * chartH), 4) : 0;
      const animH   = Math.round(fullH * p);
      const bx      = x + gap / 2;
      const bw      = barW - gap;
      const by      = PAD_T + chartH - animH;

      // Color de barra
      let color = '#cccccc';
      if (isHoy)                                   color = '#C9A84C';
      else if (diff !== null && diff > 0)          color = 'rgba(47,158,68,0.75)';
      else if (diff !== null && diff < 0 && day.monto > 0) color = 'rgba(224,49,49,0.65)';

      // Barra con bordes redondeados arriba
      if (animH > 0) {
        const r = Math.min(4, bw / 2, animH);
        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + bw - r, by);
        ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
        ctx.lineTo(bx + bw, by + animH);
        ctx.lineTo(bx, by + animH);
        ctx.lineTo(bx, by + r);
        ctx.quadraticCurveTo(bx, by, bx + r, by);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        // Glow dorado para hoy
        if (isHoy) {
          ctx.shadowColor = 'rgba(201,168,76,0.35)';
          ctx.shadowBlur  = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Solo mostrar texto cuando la animación terminó (evita parpadeo)
      if (progress >= 1) {
        const centerX = bx + bw / 2;

        // Monto corto encima de la barra
        if (day.monto > 0) {
          const short = day.monto >= 1000000
            ? (day.monto / 1000000).toFixed(1) + 'M'
            : day.monto >= 1000
              ? Math.round(day.monto / 1000) + 'k'
              : String(day.monto);
          ctx.fillStyle = isHoy ? '#C9A84C' : '#888';
          ctx.font = `${isHoy ? '600' : '400'} 10px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(short, centerX, by - 4);
        }

        // Indicador de crecimiento
        if (diff !== null && prev > 0 && day.monto > 0) {
          const pct = Math.round(((day.monto - prev) / prev) * 100);
          if (pct !== 0) {
            const isUp  = pct > 0;
            const arrow = isUp ? '▲' : '▼';
            ctx.fillStyle = isUp ? 'rgba(47,158,68,0.9)' : 'rgba(224,49,49,0.9)';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(arrow + Math.abs(pct) + '%', centerX, by - 15);
          }
        }

        // Etiqueta fecha abajo
        ctx.fillStyle = isHoy ? '#C9A84C' : '#999';
        ctx.font = `${isHoy ? 'bold' : 'normal'} 10px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(day.label, centerX, H - 6);
      }
    });

    // Línea base
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_L, PAD_T + chartH);
    ctx.lineTo(W - PAD_R, PAD_T + chartH);
    ctx.stroke();

    if (progress < 1) requestAnimationFrame(draw);
    else {
      // Segundo pass solo para texto (garantiza que se pinte al final)
      requestAnimationFrame(() => {
        days.forEach((day, i) => {
          const x       = PAD_L + i * barW;
          const isHoy   = day.key === todayK;
          const prev    = i > 0 ? days[i - 1].monto : null;
          const diff    = prev !== null ? day.monto - prev : null;
          const fullH   = day.monto > 0 ? Math.max(Math.round((day.monto / maxVal) * chartH), 4) : 0;
          const bx      = x + gap / 2;
          const bw      = barW - gap;
          const by      = PAD_T + chartH - fullH;
          const centerX = bx + bw / 2;

          if (day.monto > 0) {
            const short = day.monto >= 1000000
              ? (day.monto / 1000000).toFixed(1) + 'M'
              : day.monto >= 1000
                ? Math.round(day.monto / 1000) + 'k'
                : String(day.monto);
            ctx.fillStyle = isHoy ? '#C9A84C' : '#888';
            ctx.font = `${isHoy ? '600' : '400'} 10px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(short, centerX, by - 4);
          }

          if (diff !== null && prev > 0 && day.monto > 0) {
            const pct = Math.round(((day.monto - prev) / prev) * 100);
            if (pct !== 0) {
              ctx.fillStyle = pct > 0 ? 'rgba(47,158,68,0.9)' : 'rgba(224,49,49,0.9)';
              ctx.font = 'bold 9px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText((pct > 0 ? '▲' : '▼') + Math.abs(pct) + '%', centerX, by - 15);
            }
          }

          ctx.fillStyle = isHoy ? '#C9A84C' : '#999';
          ctx.font = `${isHoy ? 'bold' : 'normal'} 10px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(day.label, centerX, H - 6);
        });
      });
    }
  }

  requestAnimationFrame(draw);
}

// ─── EXPORTAR CSV ─────────────────────────────────────────────────────────────
function exportarCSV() {
  if (!canExportCSV()) { showProPlaceholder('reporteList','Exportación CSV'); return; }
  if (!_reporteData || _reporteData.length === 0) { Toast.info('No hay datos para exportar.'); return; }
  const BOM  = '\uFEFF';
  const sep  = ',';
  const head = ['Fecha','Hora','Concepto / Servicio','Monto (COP)'].join(sep);
  const rows = _reporteData.map(d => {
    const fecha = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
    const fStr  = fecha.toLocaleDateString('es-CO');
    const hStr  = fecha.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const con   = (d.concept||'').replace(/"/g,'""');
    return [`"${fStr}"`,`"${hStr}"`,`"${con}"`,d.amount||0].join(sep);
  }).join('\r\n');
  const blob = new Blob([BOM+head+'\r\n'+rows],{type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const mes  = new Date().toLocaleDateString('es-CO',{month:'long',year:'numeric'}).replace(/ /g,'_');
  a.href=url; a.download=`fullfade-reporte-${mes}.csv`; a.click();
  URL.revokeObjectURL(url);
  Toast.success('Reporte CSV exportado ✓');
}

function escHtml(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
