/**
 * Configuración web de tu proyecto Firebase.
 * Consola de Firebase → ⚙ Configuración del proyecto → General → Tus apps → App web → SDK setup and configuration
 *
 * Estos valores NO son secretos: viajan en el bundle de JavaScript y cualquiera puede verlos.
 * La seguridad no depende de esconderlos, sino de Auth + las reglas @auth de SQL Connect
 * (y, más adelante, App Check).
 *
 * Mientras desarrollás con `npm run dev`, la app usa los emuladores locales y no importa
 * si estos valores son reales. Para producción tenés que completarlos.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyAyYOhPBWiA1pqQGoskOW7L5Uf7j0BMsE4",
  authDomain: "practica-firebase-a1181.firebaseapp.com",
  projectId: "practica-firebase-a1181",
  storageBucket: "practica-firebase-a1181.firebasestorage.app",
  messagingSenderId: "448480350996",
  appId: "1:448480350996:web:6a1806be7015ba5a986801",
};

/** Debe coincidir con dataconnect/dataconnect.yaml y dataconnect/cursos/connector.yaml */
export const sqlConnectConfig = {
  location: "us-east4",
  service: "catalogo",
  connector: "cursos",
};
