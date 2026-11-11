"use client";
// app/components/ResenasCurso.tsx — Práctica 4. Formulario + lista en tiempo real + resumen.

import { useEffect, useState, type FormEvent } from "react";
import { borrarResena, escucharResenas, guardarResena, resumenDe, type Resena } from "@/lib/resenas";

export default function ResenasCurso({ cursoId, uid }: { cursoId: string; uid: string | null }) {
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [resumen, setResumen] = useState<{ cantidad: number; promedio: number | null } | null>(null);
  const [soloCinco, setSoloCinco] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suscripción en tiempo real: React llama a la función que devuelve escucharResenas
  // (el "unsubscribe") al desmontar el componente o al cambiar de curso o de filtro.
  useEffect(() => {
    return escucharResenas(cursoId, setResenas, (e) => setError(e.message), soloCinco);
  }, [cursoId, soloCinco]);

  // La agregación NO es en tiempo real: la volvemos a pedir cuando cambian las reseñas
  // confirmadas por el servidor (cantidad o puntajes).
  const firma = resenas
    .filter((r) => !r.pendiente)
    .map((r) => `${r.uid}:${r.puntaje}`)
    .join("|");
  useEffect(() => {
    resumenDe(cursoId).then(setResumen).catch((e: Error) => setError(e.message));
  }, [cursoId, firma]);

  const mia = resenas.find((r) => r.uid === uid);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await guardarResena(cursoId, Number(f.get("puntaje")), String(f.get("texto")), !mia);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onBorrar() {
    try {
      await borrarResena(cursoId);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="resenas">
      <h3>
        Reseñas {resumen && resumen.cantidad > 0 && `· ★ ${resumen.promedio?.toFixed(1)} (${resumen.cantidad})`}
      </h3>

      <label className="resenas__filtro">
        <input type="checkbox" checked={soloCinco} onChange={(e) => setSoloCinco(e.target.checked)} /> Solo 5 estrellas
      </label>

      {!uid && <p className="hint">Ingresá para dejar tu reseña.</p>}

      {/* Con el filtro activo tu reseña podría no estar en la lista, y el formulario
          creería que es nueva: por eso solo se muestra sin filtro. */}
      {uid && !soloCinco && (
        <form onSubmit={onSubmit} key={mia ? "editar" : "nueva"}>
          <select name="puntaje" defaultValue={mia?.puntaje ?? 5} aria-label="Puntaje">
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>
          <textarea name="texto" maxLength={500} defaultValue={mia?.texto ?? ""} required placeholder="¿Qué te pareció el curso?" />
          <div className="resenas__botones">
            <button type="submit" className="button button--small">
              {mia ? "Actualizar mi reseña" : "Publicar"}
            </button>
            {mia && (
              <button type="button" className="button button--small button--ghost" onClick={onBorrar}>
                Borrar
              </button>
            )}
          </div>
        </form>
      )}

      {error && (
        <p className="alerta alerta--error" role="alert">
          {error}
        </p>
      )}

      {resenas.length === 0 ? (
        <p className="hint">Todavía no hay reseñas.</p>
      ) : (
        <ul className="resenas__lista">
          {resenas.map((r) => (
            <li key={r.uid}>
              <strong className="resenas__estrellas">{"★".repeat(r.puntaje)}</strong> {r.texto} — <em>{r.autor}</em>
              {r.pendiente && <small className="hint"> (enviando…)</small>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
