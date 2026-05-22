// FullFade — Servicio de Barberías (multi-tenant)

const BarbershopService = {

  // Crear barbería al registrarse
  async create(ownerId, data) {
    // Fecha de vencimiento del trial: 14 días desde hoy
    const trialExpires = new Date();
    trialExpires.setDate(trialExpires.getDate() + 14);
    trialExpires.setHours(0, 0, 0, 0); // 00:00 del día 15

    const ref = await db.collection('barbershops').add({
      ownerId,
      name:           data.name,
      address:        data.address  || '',
      phone:          data.phone    || '',
      plan:           'trial',
      planExpiresAt:  trialExpires,
      planActiveAt:   new Date(),
      active:         true,
      createdAt:      firebase.firestore.FieldValue.serverTimestamp()
    });

    // Crear doc de usuario con teléfono del owner incluido
    await db.collection('users').doc(ownerId).set({
      email:        data.email,
      displayName:  data.displayName,
      phone:        data.phone || '',
      barbershopId: ref.id,
      role:         'owner',
      createdAt:    firebase.firestore.FieldValue.serverTimestamp()
    });

    return ref.id;
  },

  // Obtener barbería por ID
  async getById(barbershopId) {
    const doc = await db.collection('barbershops').doc(barbershopId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  // Obtener barbería del usuario actual
  async getMyBarbershop(userId) {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return null;
    const { barbershopId } = userDoc.data();
    return this.getById(barbershopId);
  },

  // Obtener datos del usuario (rol, barbershopId)
  async getUserData(userId) {
    const doc = await db.collection('users').doc(userId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  // Actualizar barbería
  async update(barbershopId, data) {
    await db.collection('barbershops').doc(barbershopId).update({
      ...data,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
};
