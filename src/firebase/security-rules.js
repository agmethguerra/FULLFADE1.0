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
    function userDoc() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid));
    }
    function isSuperAdmin() {
      return isAuth() && userDoc().data.role == 'superadmin';
    }
    function isMember(barbershopId) {
      return isAuth()
        && userDoc().exists()
        && userDoc().data.barbershopId == barbershopId;
    }
    function isOwner(barbershopId) {
      return isMember(barbershopId)
        && userDoc().data.role == 'owner';
    }

    // Usuarios — superadmin puede leer todos
    match /users/{userId} {
      allow read:  if isAuth() && (request.auth.uid == userId || isSuperAdmin());
      allow write: if isAuth() && (request.auth.uid == userId || isSuperAdmin());
    }

    // Barberías — superadmin tiene acceso total
    match /barbershops/{barbershopId} {
      allow create: if isAuth();
      allow read:   if isMember(barbershopId) || isSuperAdmin();
      allow update, delete: if isOwner(barbershopId) || isSuperAdmin();
    }

    // Transacciones
    match /transactions/{txId} {
      allow read:   if isMember(resource.data.barbershopId) || isSuperAdmin();
      allow create: if isMember(request.resource.data.barbershopId);
      allow delete: if isOwner(resource.data.barbershopId) || isSuperAdmin();
    }

    // Caja
    match /cash_registers/{cajaId} {
      allow read:   if isMember(resource.data.barbershopId) || isSuperAdmin();
      allow create: if isMember(request.resource.data.barbershopId);
      allow update: if isMember(resource.data.barbershopId)
                    && request.resource.data.barbershopId == resource.data.barbershopId;
    }

    // Clientes
    match /customers/{clienteId} {
      allow read:   if isMember(resource.data.barbershopId) || isSuperAdmin();
      allow create: if isMember(request.resource.data.barbershopId);
      allow update: if isMember(resource.data.barbershopId);
      allow delete: if isOwner(resource.data.barbershopId) || isSuperAdmin();
    }

    // Empleados
    match /employees/{empId} {
      allow read:   if isMember(resource.data.barbershopId) || isSuperAdmin();
      allow create: if isOwner(request.resource.data.barbershopId);
      allow update: if isOwner(resource.data.barbershopId);
      allow delete: if isSuperAdmin();
    }

    // Servicios
    match /services/{srvId} {
      allow read:   if isMember(resource.data.barbershopId) || isSuperAdmin();
      allow create: if isOwner(request.resource.data.barbershopId);
      allow update: if isOwner(resource.data.barbershopId);
      allow delete: if isSuperAdmin();
    }

    // Citas
    match /appointments/{citaId} {
      allow read:   if isMember(resource.data.barbershopId) || isSuperAdmin();
      allow create: if isMember(request.resource.data.barbershopId);
      allow update: if isMember(resource.data.barbershopId);
      allow delete: if isOwner(resource.data.barbershopId) || isSuperAdmin();
    }

    // Suscripciones
    match /subscriptions/{subId} {
      allow read:  if isOwner(resource.data.barbershopId) || isSuperAdmin();
      allow write: if isSuperAdmin();
    }
  }
}
*/
