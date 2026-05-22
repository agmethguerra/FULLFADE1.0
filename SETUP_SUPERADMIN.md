# FullFade — Configuración SuperAdmin y Cuenta Demo

## 1. Crear el SuperAdmin

En **Firebase Console → Authentication → Users → Agregar usuario:**
- Email: `admin@fullfade.com`
- Contraseña: (la que elijas, mín. 8 chars)

Luego en **Firestore → users → Agregar documento:**
- **ID del documento** = UID del usuario admin (cópialo de Authentication)
- Campos:
  ```
  email:        "admin@fullfade.com"
  displayName:  "SuperAdmin"
  role:         "superadmin"
  barbershopId: ""
  createdAt:    (timestamp)
  ```

Al iniciar sesión con ese usuario, el sistema lo redirigirá automáticamente a `/src/pages/admin.html`.

---

## 2. Crear la Cuenta Demo

En **Firebase Console → Authentication → Users → Agregar usuario:**
- Email: `demo@fullfade.com`
- Contraseña: `demo1234`

Luego **regístrala normalmente en la app** (Register) con:
- Email: `demo@fullfade.com`
- Contraseña: `demo1234`
- Nombre de la barbería: `Barbería Demo FullFade`

Una vez creada, desde el **Panel SuperAdmin → Cuenta Demo → "Rellenar datos demo"**, se cargan automáticamente barberos, servicios, clientes, caja y transacciones de ejemplo.

El SuperAdmin también asigna el plan `demo` (sin vencimiento) a esa barbería desde **Gestión de Planes**.

---

## 3. Reglas de Firestore

Copia el contenido de `src/firebase/security-rules.js` (sin los comentarios `/* */`) y pégalo en **Firestore → Reglas → Publicar**.

---

## 4. Índices compuestos requeridos

Ve a **Firestore → Índices → Agregar índice compuesto:**

| Colección       | Campos                                      |
|-----------------|---------------------------------------------|
| cash_registers  | barbershopId ASC, status ASC, openedAt ASC  |
| transactions    | cashRegisterId ASC, createdAt DESC          |
| transactions    | barbershopId ASC, type ASC, createdAt ASC   |
| appointments    | barbershopId ASC, date ASC, status ASC      |
| employees       | barbershopId ASC, name ASC                  |
| customers       | barbershopId ASC, name ASC                  |
| services        | barbershopId ASC, active ASC, name ASC      |

> 💡 También puedes abrirlos desde los errores en consola del navegador — Firebase te da el enlace directo.

---

## 5. Límites de Plan

| Plan    | Barberos | Servicios | Clientes | Reportes | CSV  |
|---------|----------|-----------|----------|----------|------|
| Trial   | 2        | 5         | 50       | ✗        | ✗    |
| Pro     | ∞        | ∞         | ∞        | ✓        | ✓    |
| Empresa | ∞        | ∞         | ∞        | ✓        | ✓    |
| Demo    | ∞        | ∞         | ∞        | ✓        | ✓    |

---

## 6. Resumen de limitaciones por plan

| Función               | Trial | Pro | Empresa | Demo |
|-----------------------|-------|-----|---------|------|
| Barberos activos      | 2     | ∞   | ∞       | ∞    |
| Clientes              | 30    | ∞   | ∞       | ∞    |
| Servicios             | 5     | ∞   | ∞       | ∞    |
| Exportar CSV          | ✗     | ✓   | ✓       | ✓    |
| Facturación PDF       | ✗ (visible, bloqueada) | ✓ | ✓ | ✓ |
| Reportes avanzados    | ✗     | ✓   | ✓       | ✓    |
| Multi-sucursal        | ✗     | ✗   | ✓       | ✓    |

---

## 7. Roadmap sugerido — Mejoras para escalar FullFade

### Corto plazo (1–3 meses)
- **Notificaciones WhatsApp automáticas** — recordatorio de cita 1 hora antes al cliente vía Twilio o Meta Cloud API
- **App móvil PWA** — instalar desde el navegador sin app store, con soporte offline para ver agenda sin internet
- **Módulo de propinas** — registrar propinas por barbero y sumarlas al cierre de caja
- **Estadísticas por barbero** — cuántos cortes hizo cada uno, cuánto generó, ranking mensual

### Mediano plazo (3–6 meses)
- **Reservas online públicas** — link tipo `fullfade.com/tu-barberia` donde el cliente agenda su propia cita sin llamar
- **Fidelización de clientes** — sistema de puntos o sellos (ej: 10 cortes = 1 gratis), visible para el cliente
- **Integración contable** — exportar a Siigo o Alegra para declarar renta sin trabajo manual
- **Control de inventario** — registrar productos (pomada, navajas, etc.), alertas de stock bajo, costo vs venta
- **Comisiones automáticas** — definir % por servicio por barbero y calcular nómina al cierre del mes

### Largo plazo (6–12 meses)
- **Marketplace de barberías** — directorio público donde usuarios buscan barberías cercanas por ciudad, reseñas y disponibilidad
- **FullFade Pay** — procesar pagos con tarjeta directamente desde el tablet del barbero (integración Mercado Pago Point)
- **Multi-sede real** — una sola cuenta maneja varias sucursales con reportes consolidados y por sede
- **IA de predicción** — sugerir horarios pico, qué días abrir más temprano, qué servicios promocionar según historial
- **Panel para franquicias** — una cuenta maestra controla N barberías franquiciadas, con reportes por red

