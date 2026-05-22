// FullFade — Firebase Config
// Reemplaza estos valores con los de tu proyecto en Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyBZqNC93ypdZe1Vps8nuqZSPqepk_gapuU",
    authDomain: "fullfade-dfe22.firebaseapp.com",
    databaseURL: "https://fullfade-dfe22-default-rtdb.firebaseio.com",
    projectId: "fullfade-dfe22",
    storageBucket: "fullfade-dfe22.firebasestorage.app",
    messagingSenderId: "220817229959",
    appId: "1:220817229959:web:5f47ec73932faa1d7ed022"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Exportar servicios globales
const auth = firebase.auth();
const db = firebase.firestore();

// Configurar persistencia local (mantiene sesión al recargar)
// Envuelto en async IIFE para evitar unhandled promise rejection
(async () => {
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch (e) {
    console.warn('No se pudo configurar persistencia:', e.message);
  }
})();
