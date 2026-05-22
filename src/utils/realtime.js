// FullFade — Gestor de listeners en tiempo real (onSnapshot)
// Centraliza todas las suscripciones para poder limpiarlas fácilmente

const RealtimeManager = {
  _listeners: {},

  // Registrar un listener con una clave identificadora
  register(key, unsubscribeFn) {
    // Si ya existía uno con esa clave, cancelarlo primero
    if (this._listeners[key]) {
      try { this._listeners[key](); } catch(e) {}
    }
    this._listeners[key] = unsubscribeFn;
  },

  // Cancelar un listener específico
  unregister(key) {
    if (this._listeners[key]) {
      try { this._listeners[key](); } catch(e) {}
      delete this._listeners[key];
    }
  },

  // Cancelar todos
  unregisterAll() {
    Object.keys(this._listeners).forEach(k => this.unregister(k));
  }
};
