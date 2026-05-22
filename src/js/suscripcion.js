// FullFade — Módulo de Suscripción (gestión de pagos y validaciones de plan)

const FAQS = [
  { q:'¿Puedo cancelar en cualquier momento?', a:'Sí. Cancela cuando quieras desde esta pantalla. Sin permanencias ni cargos adicionales.' },
  { q:'¿Qué métodos de pago aceptan?', a:'Tarjetas débito/crédito, PSE, Nequi, Daviplata. Todos los pagos son seguros y procesados por Mercado Pago Colombia.' },
  { q:'¿Mis datos están seguros?', a:'Sí. Datos almacenados en Firebase (Google) con cifrado en tránsito y reposo. Solo tú y tu equipo acceden a la información de tu barbería.' },
  { q:'¿Qué pasa cuando termina mi Trial?', a:'Recibirás un aviso 3 días antes. Si no activas un plan Pro, algunas funciones se limitarán pero tus datos quedan 30 días.' },
  { q:'¿Puedo tener varias sucursales?', a:'El plan Empresa incluye gestión multi-sucursal. Contáctanos para cotizar.' }
];

let _barbershopSub = null;

function initSuscripcion(barbershopData) {
  _barbershopSub = barbershopData;
  renderPlanActual(barbershopData);
  renderFAQ();
  document.getElementById('payBtnPro')?.addEventListener('click', () => iniciarPago('pro'));
  document.getElementById('contactarVentasBtn')?.addEventListener('click', contactarVentas);
}

function renderPlanActual(b) {
  if (!b) return;
  const plan      = b.plan || 'trial';
  const planLabel = PLANS[plan]?.label || plan;
  const el        = document.getElementById('planActualLabel');
  if (el) el.textContent = planLabel;

  // Fecha de expiración
  const expEl = document.getElementById('planExpiraDate');
  if (expEl && b.planExpiresAt) {
    const exp = b.planExpiresAt.toDate ? b.planExpiresAt.toDate() : new Date(b.planExpiresAt);
    const diffDays = Math.ceil((exp - new Date()) / 86400000);
    expEl.textContent = diffDays >= 0
      ? `Vence el ${exp.toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'})} (${diffDays} día${diffDays!==1?'s':''})`
      : `Venció el ${exp.toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'})}`;
    expEl.style.color = diffDays <= 3 ? 'var(--danger)' : 'var(--muted)';
  }

  // Resaltar plan activo en la tarjeta de planes
  document.querySelectorAll('.plan-card').forEach(c => {
    c.classList.toggle('plan-card-active', c.dataset.plan === plan);
  });

  // Botón del plan actual deshabilitado
  document.querySelectorAll('.btn-plan-select').forEach(btn => {
    const isPlan = btn.dataset.plan === plan;
    btn.disabled = isPlan;
    if (isPlan) btn.textContent = 'Plan actual';
  });
}

async function iniciarPago(plan) {
  // En producción: llama a tu backend que crea preapproval en Mercado Pago
  // y redirige a la URL de pago. Aquí simulamos el flujo.
  const btn = document.getElementById('payBtnPro');
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px"></span> Redirigiendo...';
  setTimeout(() => {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-credit-card"></i> Suscribirse con Mercado Pago';
    Toast.info('Integración con Mercado Pago pendiente de configuración. Contáctanos para activarla.');
  }, 2000);
}

function contactarVentas() {
  const msg = encodeURIComponent('Hola, me interesa el plan Empresa de FullFade para varias sucursales.');
  window.open(`https://wa.me/573000000000?text=${msg}`, '_blank');
}

function renderFAQ() {
  const el = document.getElementById('faqList');
  if (!el) return;
  el.innerHTML = FAQS.map((faq, i) => `
    <div style="border-top:1px solid var(--border)">
      <button onclick="toggleFAQ(${i})"
              style="width:100%;text-align:left;padding:14px 0;display:flex;align-items:center;justify-content:space-between;
                     font-size:0.9rem;font-weight:500;color:var(--text);background:none;border:none;cursor:pointer;gap:16px">
        <span>${faq.q}</span>
        <i class="bi bi-chevron-down" id="faq-icon-${i}" style="font-size:0.85rem;color:var(--muted);flex-shrink:0;transition:transform 0.2s"></i>
      </button>
      <div id="faq-body-${i}" style="max-height:0;overflow:hidden;transition:max-height 0.3s ease">
        <p style="padding-bottom:14px;font-size:0.875rem;color:var(--text-sub);line-height:1.65">${faq.a}</p>
      </div>
    </div>`).join('') + `<div style="border-top:1px solid var(--border)"></div>`;
}

function toggleFAQ(index) {
  const body = document.getElementById(`faq-body-${index}`);
  const icon = document.getElementById(`faq-icon-${index}`);
  if (!body) return;
  const isOpen = body.style.maxHeight && body.style.maxHeight !== '0px';
  FAQS.forEach((_, i) => {
    const b=document.getElementById(`faq-body-${i}`);
    const ic=document.getElementById(`faq-icon-${i}`);
    if (b) b.style.maxHeight='0px';
    if (ic) ic.style.transform='';
  });
  if (!isOpen) {
    body.style.maxHeight = body.scrollHeight + 'px';
    if (icon) icon.style.transform = 'rotate(180deg)';
  }
}
