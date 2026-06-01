/*
 * FullFade — Reglas de Seguridad Firestore (v2)
 * Copia este contenido en Firebase Console > Firestore > Reglas
 */

/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuth() {
      return request.auth != null;
    }
    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    function isSuperAdmin() {
      return isAuth() && getUserData().role == 'superadmin';
    }
    function isMember(barbershopId) {
      let u = getUserData();
      return isAuth() && u.barbershopId == barbershopId;
    }
    function isOwner(barbershopId) {
      let u = getUserData();
      return isAuth() && u.barbershopId == barbershopId && u.role == 'owner';
    }

    // ── Verifica que una barbería existe y está activa (para booking público)
    function barbershopActiva(barbershopId) {
      return exists(/databases/$(database)/documents/barbershops/$(barbershopId))
          && get(/databases/$(database)/documents/barbershops/$(barbershopId)).data.active == true;
    }

    match /users/{userId} {
      allow read:  if isAuth() && (request.auth.uid == userId || isSuperAdmin());
      allow write: if isAuth() && (request.auth.uid == userId || isSuperAdmin());
    }

    match /barbershops/{barbershopId} {
      allow create: if isAuth();
      // +booking: lectura pública solo para buscar por token (campo horario.bookingToken)
      allow read:   if isSuperAdmin() || isMember(barbershopId) || true;
      allow update, delete: if isSuperAdmin() || isOwner(barbershopId);
    }

    // transactions: la query siempre incluye barbershopId en el where,
    // así Firestore puede verificar el permiso sin necesitar resource.data
    match /transactions/{txId} {
      allow read:   if isSuperAdmin() || isMember(resource.data.barbershopId);
      allow create: if isSuperAdmin() || isMember(request.resource.data.barbershopId);
      allow delete: if isSuperAdmin() || isOwner(resource.data.barbershopId);
    }

    // cash_registers: mismo patrón
    match /cash_registers/{cajaId} {
      allow read:   if isSuperAdmin() || isMember(resource.data.barbershopId);
      allow create: if isSuperAdmin() || isMember(request.resource.data.barbershopId);
      allow update: if isSuperAdmin() || (
                      isMember(resource.data.barbershopId)
                      && request.resource.data.barbershopId == resource.data.barbershopId
                    );
    }

    match /customers/{clienteId} {
      allow read:   if isSuperAdmin() || isMember(resource.data.barbershopId);
      // +booking: cliente sin cuenta puede crearse al agendar cita pública
      allow create: if isSuperAdmin()
                    || isMember(request.resource.data.barbershopId)
                    || (request.resource.data.source == 'booking_link'
                        && barbershopActiva(request.resource.data.barbershopId));
      allow update: if isSuperAdmin() || isMember(resource.data.barbershopId);
      allow delete: if isSuperAdmin() || isOwner(resource.data.barbershopId);
    }

    match /employees/{empId} {
      // +booking: lectura pública para mostrar barberos disponibles
      allow read:   if isSuperAdmin() || isMember(resource.data.barbershopId) || true;
      allow create: if isSuperAdmin() || isOwner(request.resource.data.barbershopId);
      allow update: if isSuperAdmin() || isOwner(resource.data.barbershopId);
      allow delete: if isSuperAdmin();
    }

    match /services/{srvId} {
      // +booking: lectura pública para mostrar servicios disponibles
      allow read:   if isSuperAdmin() || isMember(resource.data.barbershopId) || true;
      allow create: if isSuperAdmin() || isOwner(request.resource.data.barbershopId);
      allow update: if isSuperAdmin() || isOwner(resource.data.barbershopId);
      allow delete: if isSuperAdmin();
    }

    match /appointments/{citaId} {
      // +booking: lectura pública para verificar slots ocupados en la fecha/barbero elegido
      allow read:   if isSuperAdmin() || isMember(resource.data.barbershopId) || true;
      // +booking: cliente sin cuenta puede crear cita desde link público
      allow create: if isSuperAdmin()
                    || isMember(request.resource.data.barbershopId)
                    || (request.resource.data.source == 'booking_link'
                        && barbershopActiva(request.resource.data.barbershopId));
      allow update: if isSuperAdmin() || isMember(resource.data.barbershopId);
      allow delete: if isSuperAdmin() || isOwner(resource.data.barbershopId);
    }

    match /subscriptions/{subId} {
      allow read:  if isSuperAdmin() || isOwner(resource.data.barbershopId);
      allow write: if isSuperAdmin();
    }
  }
}
*/
