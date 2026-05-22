# FullFade — Software SaaS para Barberías

## 🚀 Cómo comenzar

### 1. Configurar Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com)
2. Crea un nuevo proyecto llamado `fullfade`
3. Habilita **Authentication → Email/Password**
4. Crea una base de datos **Firestore** (modo producción)
5. Ve a Configuración del proyecto → SDK de configuración
6. Copia tus credenciales en `src/firebase/config.js`

### 2. Índices de Firestore necesarios

En Firebase Console → Firestore → Índices, crea los siguientes índices compuestos:

| Colección      | Campo 1        | Campo 2      | Orden      |
|----------------|----------------|--------------|------------|
| transactions   | barbershopId   | type         | ASC        |
| transactions   | barbershopId   | createdAt    | DESC       |
| transactions   | cashRegisterId | createdAt    | DESC       |
| cash_registers | barbershopId   | status       | ASC        |
| cash_registers | barbershopId   | openedAt     | ASC        |
| appointments   | barbershopId   | date         | ASC        |
| employees      | barbershopId   | active       | ASC        |
| services       | barbershopId   | active       | ASC        |
| customers      | barbershopId   | name         | ASC        |

### 3. Reglas de seguridad Firestore

Copia las reglas del archivo `src/firebase/security-rules.js` en:
Firebase Console → Firestore → Reglas

### 4. Abrir con Live Server (VS Code)

1. Instala la extensión **Live Server** en VS Code
2. Abre la carpeta `fullfade` en VS Code
3. Clic derecho sobre `index.html` → **Open with Live Server**
4. ¡Listo! La app correrá en `http://127.0.0.1:5500`

---

## 📁 Estructura del Proyecto

```
fullfade/
├── index.html                  ← Landing page
├── src/
│   ├── css/
│   │   ├── global.css          ← Variables, tokens, utilidades
│   │   ├── landing.css         ← Estilos de la landing
│   │   ├── auth.css            ← Login y registro
│   │   └── dashboard.css       ← Layout del dashboard
│   ├── js/
│   │   ├── dashboard.js        ← Navegación, KPIs, usuario
│   │   ├── caja.js             ← Módulo de caja
│   │   ├── clientes.js         ← Módulo de clientes
│   │   ├── barberos.js         ← Módulo de barberos
│   │   ├── servicios.js        ← Módulo de servicios
│   │   └── citas.js            ← Módulo de agenda
│   ├── pages/
│   │   ├── login.html
│   │   ├── register.html
│   │   └── dashboard.html
│   ├── services/
│   │   ├── auth.service.js     ← Autenticación Firebase
│   │   └── barbershop.service.js ← CRUD barbería / usuarios
│   ├── utils/
│   │   └── helpers.js          ← Toast, loader, formato, guards
│   └── firebase/
│       ├── config.js           ← ⚠️ Poner credenciales aquí
│       └── security-rules.js   ← Reglas Firestore (referencia)
```

---

## 🔧 Próximos pasos de desarrollo

- [ ] Integrar Mercado Pago (suscripción)
- [ ] Reportes con gráficas (Chart.js)
- [ ] Vista semanal de citas
- [ ] Módulo de inventario
- [ ] Gestión multi-sucursal
- [ ] Notificaciones WhatsApp API

---

## 🏗 Stack tecnológico

| Tecnología           | Uso                        |
|----------------------|----------------------------|
| HTML5 / CSS3 / JS    | Frontend (sin frameworks)  |
| Firebase Auth        | Autenticación              |
| Firestore            | Base de datos NoSQL        |
| Vercel               | Hosting (producción)       |
| GitHub               | Control de versiones       |
| Mercado Pago         | Pasarela de pagos          |
