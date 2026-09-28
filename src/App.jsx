/**
 * App.jsx — Avatar Hipokratia informativo para personas
 *
 * La persona cuenta por voz qué le pasa y la médica responde con la mejor evidencia
 * científica disponible (EvidenciaMed, vía el backend del avatar). Solo informativo:
 * no emite órdenes ni diagnósticos.
 *
 * Variable de entorno (Vercel):
 *   VITE_API_URL  URL del backend del avatar, sin "/" final.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import useEscucha, { escuchaSoportada } from "./useEscucha.js";
import useVoz, { vozSoportada } from "./useVoz.js";

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const SALUDO = "Hola, soy la asistente de Hipokratia. Cuéntame qué te pasa y reviso la mejor evidencia científica por ti.";
const AVISO_BUSQUEDA = "Voy a revisar la evidencia científica, dame un momento.";
const FRASE_ERROR_CONEXION = "Tuve un problema para conectarme. Intenta de nuevo en un momento.";

// EvidenciaMed analiza varios papers y los servidores pueden estar despertando
const TIMEOUT_CONSULTA_MS = 200000;
const MAX_FRASES_CONTEXTO = 3;

const ETIQUETA_ESTADO = {
  reposo: "Lista",
  escuchando: "Escuchando…",
  pensando: "Pensando…",
  hablando: "Hablando…",
};

/* ---------------- Conexión con el backend ---------------- */
function despertarServidor() {
  if (!API_URL) return;
  fetch(`${API_URL}/ping`).catch(() => {
    // Sin acción: si falla, la primera consulta volverá a intentarlo
  });
}

async function consultar(consulta) {
  if (!API_URL) throw new Error("Falta configurar la conexión con el servidor.");
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), TIMEOUT_CONSULTA_MS);
  try {
    const res = await fetch(`${API_URL}/paciente/consultar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consulta }),
      signal: controlador.signal,
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(limite);
  }
}

/* ---------------- Texto de evidencia (títulos y viñetas simples) ---------------- */
function TextoEvidencia({ texto }) {
  const bloques = [];
  let lista = [];
  const cerrarLista = () => {
    if (lista.length) {
      const items = lista;
      bloques.push(
        <ul key={`ul-${bloques.length}`}>
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
      lista = [];
    }
  };
  texto.split("\n").forEach((linea) => {
    const limpia = linea.replace(/\*\*/g, "").trim();
    if (!limpia) {
      cerrarLista();
    } else if (/^#{1,6}\s/.test(limpia)) {
      cerrarLista();
      bloques.push(<h3 key={`h-${bloques.length}`}>{limpia.replace(/^#{1,6}\s*/, "")}</h3>);
    } else if (/^[-•*]\s/.test(limpia)) {
      lista.push(limpia.replace(/^[-•*]\s*/, ""));
    } else {
      cerrarLista();
      bloques.push(<p key={`p-${bloques.length}`}>{limpia}</p>);
    }
  });
  cerrarLista();
  return <div className="evidencia">{bloques}</div>;
}

/* ---------------- App ---------------- */
export default function App() {
  const [iniciado, setIniciado] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [ultimaPregunta, setUltimaPregunta] = useState("");
  const [ultimaRespuesta, setUltimaRespuesta] = useState("");
  const [evidencia, setEvidencia] = useState(null); // { texto, papers }

  const ocupadaRef = useRef(false);
  const frasesRef = useRef([]); // lo que la persona ha dicho en esta conversación
  const escuchaRef = useRef(null);
  const { hablar, callar, desbloquear, hablando, boca } = useVoz();

  useEffect(() => {
    despertarServidor();
  }, []);

  const marcarOcupada = (valor) => {
    ocupadaRef.current = valor;
    setOcupada(valor);
  };

  // Habla sin escucharse a sí misma y luego vuelve a escuchar
  const decir = useCallback(
    async (texto) => {
      escuchaRef.current?.pausar();
      setUltimaRespuesta(texto);
      await hablar(texto);
      escuchaRef.current?.reanudar();
    },
    [hablar]
  );

  const alEscucharFrase = useCallback(
    async (texto) => {
      if (ocupadaRef.current) return;
      marcarOcupada(true);
      setUltimaPregunta(texto);
      escuchaRef.current?.pausar();
      frasesRef.current = [...frasesRef.current, texto];

      setUltimaRespuesta(AVISO_BUSQUEDA);
      await hablar(AVISO_BUSQUEDA);

      setPensando(true);
      let voz = FRASE_ERROR_CONEXION;
      try {
        const contexto = frasesRef.current.slice(-MAX_FRASES_CONTEXTO).join(". ");
        const r = await consultar(contexto);
        voz = r.voz || FRASE_ERROR_CONEXION;
        if (r.texto) setEvidencia({ texto: r.texto, papers: r.papers || [] });
      } catch {
        voz = FRASE_ERROR_CONEXION;
      }
      setPensando(false);

      await decir(voz);
      marcarOcupada(false);
    },
    [decir, hablar]
  );

  const escucha = useEscucha({ onFrase: alEscucharFrase });
  escuchaRef.current = escucha;

  const comenzar = async () => {
    desbloquear();
    setIniciado(true);
    marcarOcupada(true);
    setUltimaRespuesta(SALUDO);
    await hablar(SALUDO);
    marcarOcupada(false);
    escucha.iniciar(); // pide permiso de micrófono y queda escuchando
  };

  const nuevaConversacion = () => {
    callar();
    frasesRef.current = [];
    setUltimaPregunta("");
    setUltimaRespuesta("");
    setEvidencia(null);
    marcarOcupada(false);
    escucha.reanudar();
  };

  let estado = "reposo";
  if (pensando) estado = "pensando";
  else if (hablando) estado = "hablando";
  else if (iniciado && escucha.escuchando && !ocupada) estado = "escuchando";

  const soportado = escuchaSoportada && vozSoportada;

  return (
    <div className="app">
      <header className="cabecera">
        <img src="/logo-hipokratia.jpg" alt="Hipokratia" className="cabecera__logo" />
        <div className="cabecera__marca">
          <span className="marca__nombre">
            HYPOKRAT<span className="marca__ia">IA</span>
          </span>
          <span className="marca__sub">Asistente informativa</span>
        </div>
      </header>

      <main className="escenario">
        <div className="escenario__avatar">
          <Avatar estado={estado} boca={boca} />
        </div>

        {iniciado && (
          <div className={`estado estado--${estado}`}>
            <span className="estado__punto" />
            {ETIQUETA_ESTADO[estado]}
          </div>
        )}

        {!soportado && (
          <p className="aviso">
            Este navegador no permite reconocimiento de voz. Usa Google Chrome o Microsoft Edge.
          </p>
        )}

        {soportado && !iniciado && (
          <button type="button" className="boton-comenzar" onClick={comenzar}>
            Comenzar
          </button>
        )}

        {escucha.error && <p className="aviso">{escucha.error}</p>}

        {iniciado && (
          <section className="dialogo" aria-live="polite">
            <div className="dialogo__fila dialogo__fila--usuario">
              <span className="dialogo__rotulo">Escuché</span>
              <p className="dialogo__texto">
                {escucha.parcial ? (
                  <span className="dialogo__parcial">{escucha.parcial}</span>
                ) : (
                  ultimaPregunta || <span className="dialogo__vacio">Cuéntame qué te pasa…</span>
                )}
              </p>
            </div>
            <div className="dialogo__fila dialogo__fila--avatar">
              <span className="dialogo__rotulo">Respuesta</span>
              <p className="dialogo__texto">{ultimaRespuesta}</p>
            </div>
          </section>
        )}

        {iniciado && evidencia && (
          <details className="tarjeta tarjeta--plegable">
            <summary>Ver respuesta completa con la evidencia</summary>
            <TextoEvidencia texto={evidencia.texto} />
            {evidencia.papers.length > 0 && (
              <div className="evidencia__fuentes">
                <span className="dialogo__rotulo">Estudios revisados</span>
                <ul>
                  {evidencia.papers.map((p, i) => (
                    <li key={p.doi || i}>
                      {p.titulo}
                      {p.nivel_evidencia_oxford ? ` — Nivel ${p.nivel_evidencia_oxford}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </details>
        )}

        {iniciado && frasesRef.current.length > 0 && !ocupada && (
          <button type="button" className="boton boton--secundario" onClick={nuevaConversacion}>
            Nueva conversación
          </button>
        )}
      </main>
    </div>
  );
                      }
