// FullFade — Servicio de Autenticación

const AuthService = {

  // Registrar usuario nuevo
  async register(email, password, displayName) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName });
    return cred.user;
  },

  // Iniciar sesión
  async login(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  },

  // Cerrar sesión
  async logout() {
    await auth.signOut();
    window.location.href = '/index.html';
  },

  // Obtener usuario actual
  getCurrentUser() {
    return auth.currentUser;
  },

  // Escuchar cambios de sesión
  onAuthChange(callback) {
    return auth.onAuthStateChanged(callback);
  },

  // Recuperar contraseña
  async resetPassword(email) {
    await auth.sendPasswordResetEmail(email);
  }
};
