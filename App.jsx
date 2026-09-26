/**
 * App.jsx
 * Ciclo del avatar: escuchar → entender → repetir lo escuchado → volver a escuchar.
 *
 * Etapa 1 (solo frontend): la médica repite lo que entendió.
 * Etapa 2: en `responder()` se reemplaza el eco por la llamada al backend.
 */
import { useCallback, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import useEscucha, { escuchaSoportada } from "./useEscucha.js";
import useVoz, { vozSoportada } from "./useVoz.js";

const SALUDO = "Hola, soy la asistente de Hipokratia. Te escucho.";

// Punto de conexión futura con el backend. Hoy: eco.
async function responder(texto) {
  return `Entendí: ${texto}`;
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

      escuchaRef.current?.pausar();
      setPensando(true);
      const respuesta = await responder(texto);
      setPensando(false);

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
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
