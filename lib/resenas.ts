// lib/resenas.ts — Práctica 4 (Firestore). Capa de acceso a datos de reseñas.
// Los componentes NO importan firebase/firestore directamente: todo pasa por acá.
import {
  average,
  collection,
  connectFirestoreEmulator,
  count,
  deleteDoc,
  doc,
  getAggregateFromServer,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { firebase, USA_EMULADORES } from "./firebase";

export interface Resena {
  uid: string; // = id del documento
  puntaje: number; // 1..5
  texto: string;
  autor: string;
  creadaEn: Timestamp | null; // null mientras el serverTimestamp está pendiente
  pendiente: boolean; // true mientras el servidor todavía no confirmó la escritura
}

// ── Paso 1 · Inicialización ──────────────────────────────────────────────────
let db: Firestore | null = null;

export function firestore(): Firestore {
  if (db) return db;
  db = getFirestore(firebase().app);
  if (USA_EMULADORES) {
    try {
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    } catch {
      // Ya estaba conectado (pasa con la recarga en caliente de `npm run dev`).
    }
  }
  return db;
}

/** cursos/{cursoId}/resenas — la subcolección de reseñas de un curso. */
const resenasDe = (cursoId: string) => collection(firestore(), "cursos", cursoId, "resenas");

// ── Paso 3 · Escribir ────────────────────────────────────────────────────────
/** Crear o editar MI reseña. El id del documento es mi UID: una reseña por persona y curso. */
export async function guardarResena(cursoId: string, puntaje: number, texto: string, esNueva: boolean): Promise<void> {
  const usuario = firebase().auth.currentUser;
  if (!usuario) throw new Error("Tenés que ingresar para dejar una reseña.");
  const ref = doc(resenasDe(cursoId), usuario.uid);
  const datos = { puntaje, texto, autor: (usuario.displayName ?? "Anónimo").slice(0, 80) };
  if (esNueva) await setDoc(ref, { ...datos, creadaEn: serverTimestamp() });
  else await setDoc(ref, datos, { merge: true }); // sin creadaEn: conserva la fecha original
}

export async function borrarResena(cursoId: string): Promise<void> {
  const usuario = firebase().auth.currentUser;
  if (!usuario) return;
  await deleteDoc(doc(resenasDe(cursoId), usuario.uid));
}

// ── Paso 4 · Tiempo real ─────────────────────────────────────────────────────
/** Últimas 20 reseñas en tiempo real. Devuelve la función para cancelar la suscripción. */
export function escucharResenas(
  cursoId: string,
  alCambiar: (resenas: Resena[]) => void,
  alFallar: (e: Error) => void,
  soloCincoEstrellas = false,
): Unsubscribe {
  const filtros = soloCincoEstrellas ? [where("puntaje", "==", 5)] : [];
  const q = query(resenasDe(cursoId), ...filtros, orderBy("creadaEn", "desc"), limit(20));
  return onSnapshot(
    q,
    { includeMetadataChanges: true }, // avisa también cuando el servidor confirma una escritura pendiente
    (snap) =>
      alCambiar(
        snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: "estimate" });
          return {
            uid: d.id,
            puntaje: data.puntaje,
            texto: data.texto,
            autor: data.autor,
            creadaEn: data.creadaEn ?? null,
            pendiente: d.metadata.hasPendingWrites,
          };
        }),
      ),
    alFallar,
  );
}

// ── Paso 5 · Resumen con agregación ──────────────────────────────────────────
/** Promedio y cantidad calculados por el servidor, sin descargar los documentos. */
export async function resumenDe(cursoId: string): Promise<{ cantidad: number; promedio: number | null }> {
  const snap = await getAggregateFromServer(resenasDe(cursoId), {
    cantidad: count(),
    promedio: average("puntaje"),
  });
  return snap.data();
}
