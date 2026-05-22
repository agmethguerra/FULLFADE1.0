// FullFade — Configuración de Planes y Límites

const PLANS = {
  trial: {
    label: 'Trial',
    maxBarbers:      2,
    maxServices:     5,
    maxClientes:     30,       // ← cambiado de 50 a 30
    advancedReports: false,
    exportCSV:       false,
    exportPDF:       false,    // ← facturación PDF bloqueada
    multiSucursal:   false,
    durationDays:    14,
  },
  pro: {
    label: 'Pro',
    maxBarbers:      Infinity,
    maxServices:     Infinity,
    maxClientes:     Infinity,
    advancedReports: true,
    exportCSV:       true,
    exportPDF:       true,
    multiSucursal:   false,
    durationDays:    30,
  },
  empresa: {
    label: 'Empresa',
    maxBarbers:      Infinity,
    maxServices:     Infinity,
    maxClientes:     Infinity,
    advancedReports: true,
    exportCSV:       true,
    exportPDF:       true,
    multiSucursal:   true,
    durationDays:    30,
  },
  demo: {
    label: 'Demo',
    maxBarbers:      Infinity,
    maxServices:     Infinity,
    maxClientes:     Infinity,
    advancedReports: true,
    exportCSV:       true,
    exportPDF:       true,
    multiSucursal:   true,
    durationDays:    999,
  }
};

let _currentPlan    = 'trial';
let _planExpiresAt  = null;
let _barbershopName = 'Mi Barbería';

function setPlanContext(barbershop) {
  _currentPlan    = barbershop?.plan || 'trial';
  _planExpiresAt  = barbershop?.planExpiresAt || null;
  _barbershopName = barbershop?.name || 'Mi Barbería';
}

function getPlan()     { return PLANS[_currentPlan] || PLANS.trial; }
function getPlanName() { return getPlan().label; }
function getShopName() { return _barbershopName; }

function isPlanActive() {
  if (_currentPlan === 'demo') return true;
  if (_planExpiresAt) {
    const exp = _planExpiresAt.toDate ? _planExpiresAt.toDate() : new Date(_planExpiresAt);
    // Vence a las 00:00:00 del día de cobro — si hoy es ese día y no ha pagado, está vencido
    return new Date() < exp;
  }
  return true; // sin fecha = activo (hasta que el admin ponga fecha)
}

function canAddBarber(currentCount) {
  if (!isPlanActive()) return false;
  return currentCount < getPlan().maxBarbers;
}
function canAddService(currentCount) {
  if (!isPlanActive()) return false;
  return currentCount < getPlan().maxServices;
}
function canAddCliente(currentCount) {
  if (!isPlanActive()) return false;
  return currentCount < getPlan().maxClientes;
}
function canExportCSV()      { return isPlanActive() && getPlan().exportCSV; }
function canExportPDF()      { return isPlanActive() && getPlan().exportPDF; }
function canViewAdvReports() { return isPlanActive() && getPlan().advancedReports; }

// Banner de bloqueo Pro dentro de un contenedor — versión placeholder visible
function showProPlaceholder(containerId, feature) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div style="padding:52px 24px;text-align:center;position:relative;overflow:hidden">
      <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(201,168,76,0.04),transparent);pointer-events:none;border-radius:inherit"></div>
      <div style="width:56px;height:56px;border-radius:50%;background:var(--accent-light);border:2px solid rgba(201,168,76,0.3);
                  display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:1.6rem">🔒</div>
      <div style="font-family:var(--font-display);font-size:1.15rem;letter-spacing:0.04em;margin-bottom:8px">
        Hazte Pro para usar esta función
      </div>
      <div style="font-size:0.85rem;color:var(--muted);max-width:360px;margin:0 auto 22px;line-height:1.6">
        <strong>${feature}</strong> está disponible en el Plan Pro y superior.
        Accede a reportes completos, facturación en PDF y mucho más.
      </div>
      <button class="btn btn-gold" onclick="goModule('suscripcion')" style="min-width:180px">
        <i class="bi bi-star-fill"></i> Ver planes y precios
      </button>
      <div style="margin-top:14px;font-size:0.75rem;color:var(--muted)">
        Desde <strong>$79.000 COP/mes</strong> · Cancela cuando quieras
      </div>
    </div>`;
}

function showPlanBanner(containerId, feature) {
  showProPlaceholder(containerId, feature);
}
