// FullFade — Validaciones de entrada

const Validate = {

  // Nombre / texto libre — mínimo N chars
  name(val, min = 2) {
    if (!val || val.trim().length < min)
      return `Debe tener al menos ${min} caracteres.`;
    return null;
  },

  // Email
  email(val) {
    if (!val || !val.trim()) return 'El correo es obligatorio.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim()))
      return 'Formato de correo inválido.';
    return null;
  },

  // Teléfono colombiano (7-10 dígitos, puede empezar con +57)
  phone(val) {
    if (!val || !val.trim()) return null; // Opcional
    const clean = val.replace(/[\s\-\(\)]/g, '').replace(/^\+57/, '');
    if (!/^\d{7,10}$/.test(clean))
      return 'Teléfono inválido (7-10 dígitos).';
    return null;
  },

  // Monto positivo
  amount(val) {
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) return 'Ingresa un monto mayor a 0.';
    return null;
  },

  // Entero positivo
  positiveInt(val, label = 'Valor') {
    const n = parseInt(val);
    if (isNaN(n) || n <= 0) return `${label} debe ser un número mayor a 0.`;
    return null;
  },

  // Fecha/hora futura
  futureDate(val) {
    if (!val) return 'Selecciona una fecha y hora.';
    const d   = new Date(val);
    const now = new Date();
    if (isNaN(d.getTime())) return 'Fecha inválida.';

    // Comparar solo la fecha (sin hora)
    const hoy     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diaEleg = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());

    if (diaEleg < hoy) {
      const fmt = d.toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long' });
      return `La fecha "${fmt}" ya pasó. Selecciona una fecha de hoy en adelante.`;
    }

    // Mismo día: validar que la hora sea futura
    if (diaEleg.getTime() === hoy.getTime() && d <= now) {
      const hStr = d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
      return `La hora ${hStr} ya pasó. Selecciona una hora futura para hoy.`;
    }

    return null;
  },

  // Contraseña mínima
  password(val) {
    if (!val || val.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
    return null;
  },

  // Mostrar errores en un elemento
  showError(elId, msg) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  },

  // Marcar campo con error visual
  markField(inputEl, errorMsg) {
    if (!inputEl) return;
    if (errorMsg) {
      inputEl.style.borderColor = 'var(--danger)';
      inputEl.style.boxShadow = '0 0 0 3px rgba(224,49,49,0.12)';
    } else {
      inputEl.style.borderColor = '';
      inputEl.style.boxShadow = '';
    }
  },

  // Limpiar todos los errores de un formulario
  clearAll(fieldIds) {
    fieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
    });
  }
};
