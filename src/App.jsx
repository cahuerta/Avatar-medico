/**
 * App.jsx
 * Ciclo del avatar: escuchar → preguntar al backend → responder en voz → volver a escuchar.
 *
 * - Al abrir la página hace un ping al backend para despertarlo y precargar materiales.
 * - Cada frase escuchada se envía a POST /avatar/preguntar.
 *
 * Variable de entorno (Vercel):
 *   VITE_API_URL  URL del backend del avatar, sin "/" final.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import useEscucha, { escuchaSoportada } from "./useEscucha.js";
import useVoz, { vozSoportada } from "./useVoz.js";

const SALUDO = "Hola, soy la asistente de Hipokratia. Te escucho.";

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

// Espera larga: si el servidor estaba dormido, puede tardar en despertar
const TIMEOUT_PREGUNTA_MS = 90000;

const FRASE_ERROR_CONEXION = "Tuve un problema para conectarme. Intenta de nuevo en un momento.";

function despertarServidor() {
  if (!API_URL) return;
  fetch(`${API_URL}/ping`).catch(() => {
    // Sin acción: si falla, la primera pregunta volverá a intentarlo
  });
}

async function responder(texto) {
  if (!API_URL) {
    return { respuesta: "Falta configurar la conexión con el servidor.", region: null };
  }
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), TIMEOUT_PREGUNTA_MS);
  try {
    const res = await fetch(`${API_URL}/avatar/preguntar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pregunta: texto }),
      signal: controlador.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const datos = await res.json();
    return { respuesta: datos.respuesta || FRASE_ERROR_CONEXION, region: datos.region || null };
  } catch {
    return { respuesta: FRASE_ERROR_CONEXION, region: null };
  } finally {
    clearTimeout(limite);
  }
}

const ETIQUETA_ESTADO = {
  reposo: "Lista",
  escuchando: "Escuchando…",
  pensando: "Pensando…",
  hablando: "Hablando…",
};

export default function App() {
  const [iniciado, setIniciado] = useState(false);
  const [ocupada, setOcupada] = useState(false); // pensando o hablando
  const [pensando, setPensando] = useState(false);
  const [ultimaPregunta, setUltimaPregunta] = useState("");
  const [ultimaRespuesta, setUltimaRespuesta] = useState("");
  const [ultimaRegion, setUltimaRegion] = useState(null);

  useEffect(() => {
    despertarServidor();
  }, []);

  const ocupadaRef = useRef(false);
  const { hablar, desbloquear, hablando, boca } = useVoz();
  const escuchaRef = useRef(null);

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
      ocupadaRef.current = true;
      setOcupada(true);
      setUltimaPregunta(texto);
      setUltimaRegion(null);

      escuchaRef.current?.pausar();
      setPensando(true);
      const { respuesta, region } = await responder(texto);
      setPensando(false);
      setUltimaRegion(region);

      await decir(respuesta);

      ocupadaRef.current = false;
      setOcupada(false);
    },
    [decir]
  );

  const escucha = useEscucha({ onFrase: alEscucharFrase });
  escuchaRef.current = escucha;

  const comenzar = async () => {
    desbloquear();
    setIniciado(true);
    ocupadaRef.current = true;
    setOcupada(true);
    setUltimaRespuesta(SALUDO);
    await hablar(SALUDO);
    ocupadaRef.current = false;
    setOcupada(false);
    escucha.iniciar(); // pide permiso de micrófono y queda escuchando siempre
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
          <span className="marca__sub">Asistente de voz</span>
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
                  ultimaPregunta || <span className="dialogo__vacio">Habla cuando quieras…</span>
                )}
              </p>
            </div>
            <div className="dialogo__fila dialogo__fila--avatar">
              <span className="dialogo__rotulo">Respuesta</span>
              <p className="dialogo__texto">{ultimaRespuesta}</p>
              {ultimaRegion && <span className="dialogo__region">Región: {ultimaRegion}</span>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
      }
