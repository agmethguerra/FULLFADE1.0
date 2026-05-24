// FullFade — Módulo de Horarios y Configuración de Agenda Pública

let horariosBarbershopId = null;
let _horariosData = null;

const DIAS = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
const DIAS_LABEL = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// Horario por defecto
const HORARIO_DEFAULT = {
  domingo:   { abierto: false, apertura: '08:00', cierre: '18:00' },
  lunes:     { abierto: true,  apertura: '08:00', cierre: '18:00' },
  martes:    { abierto: true,  apertura: '08:00', cierre: '18:00' },
  miercoles: { abierto: true,  apertura: '08:00', cierre: '18:00' },
  jueves:    { abierto: true,  apertura: '08:00', cierre: '18:00' },
  viernes:   { abierto: true,  apertura: '08:00', cierre: '18:00' },
  sabado:    { abierto: true,  apertura: '08:00', cierre: '14:00' },
  slotMinutos: 30,
  bookingToken: null
};

function initHorarios(barbershopId) {
  horariosBarbershopId = barbershopId;
  loadHorarios();
  document.getElementById('guardarHorariosBtn')?.addEventListener('click', guardarHorarios);
  document.getElementById('copiarLinkBtn')?.addEventListener('click', copiarLinkPublico);
}

async function loadHorarios() {
  try {
    const snap = await db.collection('barbershops').doc(horariosBarbershopId).get();
    const data = snap.data();
    _horariosData = data.horario || { ...HORARIO_DEFAULT };

    // Generar token si no existe
    if (!_horariosData.bookingToken) {
      _horariosData.bookingToken = generarToken();
      await db.collection('barbershops').doc(horariosBarbershopId).update({
        'horario.bookingToken': _horariosData.bookingToken
      });
    }

    renderHorarios(_horariosData);
    actualizarLinkPublico(_horariosData.bookingToken);
  } catch(err) {
    console.error('Error cargando horarios:', err);
  }
}

function generarToken() {
  // Token de 12 chars alfanumérico - no expone el barbershopId
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function actualizarLinkPublico(token) {
  const origin = window.location.origin;
  const link   = `${origin}/src/pages/book.html?t=${token}`;
  const el     = document.getElementById('linkPublicoUrl');
  if (el) el.value = link;
}

async function copiarLinkPublico() {
  const el = document.getElementById('linkPublicoUrl');
  if (!el) return;
  try {
    await navigator.clipboard.writeText(el.value);
    Toast.success('Link copiado al portapapeles ✓');
  } catch(e) {
    el.select();
    document.execCommand('copy');
    Toast.success('Link copiado ✓');
  }
}

function renderHorarios(h) {
  const container = document.getElementById('horariosGrid');
  if (!container) return;

  const slotVal = h.slotMinutos || 30;

  container.innerHTML = `
    <div style="margin-bottom:20px">
      <label class="label">Duración de cada cita (slot)</label>
      <select class="input" id="slotMinutos" style="max-width:200px">
        <option value="15"  ${slotVal===15?'selected':''}>15 minutos</option>
        <option value="20"  ${slotVal===20?'selected':''}>20 minutos</option>
        <option value="30"  ${slotVal===30?'selected':''}>30 minutos</option>
        <option value="45"  ${slotVal===45?'selected':''}>45 minutos</option>
        <option value="60"  ${slotVal===60?'selected':''}>1 hora</option>
        <option value="90"  ${slotVal===90?'selected':''}>1 hora 30 min</option>
      </select>
    </div>
    <div style="display:grid;gap:10px">
      ${DIAS.map((dia, i) => {
        const cfg = h[dia] || { abierto: false, apertura: '08:00', cierre: '18:00' };
        return `
          <div style="display:grid;grid-template-columns:140px 1fr;align-items:center;gap:14px;
                      padding:14px 16px;border-radius:var(--radius);background:var(--surface2);
                      border:1px solid var(--border)" id="dia-row-${dia}">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none">
              <input type="checkbox" id="dia-${dia}" ${cfg.abierto?'checked':''}
                     onchange="toggleDia('${dia}')"
                     style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer" />
              <span style="font-weight:${cfg.abierto?'600':'400'};color:${cfg.abierto?'var(--text)':'var(--muted)'}"
                    id="dia-label-${dia}">${DIAS_LABEL[i]}</span>
            </label>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"
                 id="dia-horas-${dia}" ${!cfg.abierto?'style="opacity:0.35;pointer-events:none"':''}>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:0.78rem;color:var(--muted)">Abre</span>
                <input type="time" class="input" id="apertura-${dia}" value="${cfg.apertura}"
                       style="width:110px;padding:6px 10px;font-size:0.85rem" />
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:0.78rem;color:var(--muted)">Cierra</span>
                <input type="time" class="input" id="cierre-${dia}" value="${cfg.cierre}"
                       style="width:110px;padding:6px 10px;font-size:0.85rem" />
              </div>
              <span style="font-size:0.75rem;font-weight:600;color:var(--success)">Abierto</span>
            </div>
            ${!cfg.abierto ? `<div style="color:var(--muted);font-size:0.82rem">Cerrado</div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function toggleDia(dia) {
  const chk   = document.getElementById(`dia-${dia}`);
  const horas = document.getElementById(`dia-horas-${dia}`);
  const label = document.getElementById(`dia-label-${dia}`);
  const row   = document.getElementById(`dia-row-${dia}`);
  const open  = chk.checked;

  if (horas) {
    horas.style.opacity        = open ? '1' : '0.35';
    horas.style.pointerEvents  = open ? '' : 'none';
  }
  if (label) {
    label.style.fontWeight = open ? '600' : '400';
    label.style.color      = open ? 'var(--text)' : 'var(--muted)';
  }
}

async function guardarHorarios() {
  const btn = document.getElementById('guardarHorariosBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px"></span> Guardando...';

  try {
    const slotMinutos = parseInt(document.getElementById('slotMinutos').value) || 30;
    const horario     = { slotMinutos, bookingToken: _horariosData?.bookingToken };

    DIAS.forEach(dia => {
      const abierto  = document.getElementById(`dia-${dia}`)?.checked || false;
      const apertura = document.getElementById(`apertura-${dia}`)?.value || '08:00';
      const cierre   = document.getElementById(`cierre-${dia}`)?.value  || '18:00';

      if (abierto && apertura >= cierre) {
        throw new Error(`El horario de ${dia} no es válido: la hora de cierre debe ser después de la apertura.`);
      }

      horario[dia] = { abierto, apertura, cierre };
    });

    await db.collection('barbershops').doc(horariosBarbershopId).update({ horario });
    _horariosData = horario;
    Toast.success('Horarios guardados ✓');
  } catch(err) {
    Toast.error(err.message || 'Error al guardar los horarios.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar horarios';
  }
}

// ─── Helpers para la página pública ──────────────────────────────────────────
// Genera slots de tiempo dado el horario de un día
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
