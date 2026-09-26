/**
 * App.jsx — Avatar Hipokratia para personas
 *
 * Flujo:
 * 1. Conversación por voz: la persona cuenta qué le pasa y la médica responde de forma
 *    informativa con evidencia científica (EvidenciaMed, vía el backend del avatar).
 * 2. "Proponer examen": formulario con datos (zona y lado precargados de la conversación).
 * 3. Propuesta (ASISTENCIA-ICA): diagnóstico presuntivo y exámenes, dichos en voz alta.
 * 4. Si incluye resonancia: checklist de seguridad.
 * 5. Descarga de la orden firmada (ASISTENCIA-ICA también la envía por correo).
 *
 * Variable de entorno (Vercel):
 *   VITE_API_URL  URL del backend del avatar, sin "/" final.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import ChecklistResonancia from "./ChecklistResonancia.jsx";
import FormularioPaciente from "./FormularioPaciente.jsx";
import useEscucha, { escuchaSoportada } from "./useEscucha.js";
import useVoz, { vozSoportada } from "./useVoz.js";

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const SALUDO = "Hola, soy la asistente de Hipokratia. Cuéntame qué te pasa y reviso la evidencia científica por ti.";
const AVISO_BUSQUEDA = "Voy a revisar la evidencia científica, dame un momento.";
const FRASE_ERROR_CONEXION = "Tuve un problema para conectarme. Intenta de nuevo en un momento.";

// Tiempos largos: EvidenciaMed analiza varios papers, y los servidores pueden estar despertando
const TIMEOUT_CONSULTA_MS = 200000;
const TIMEOUT_PROPUESTA_MS = 150000;
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

async function llamarApi(ruta, { metodo = "POST", cuerpo, timeout = 60000, binario = false } = {}) {
  if (!API_URL) throw new Error("Falta configurar la conexión con el servidor.");
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), timeout);
  try {
    const res = await fetch(`${API_URL}${ruta}`, {
      method: metodo,
      headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: controlador.signal,
    });
    if (!res.ok) {
      let detalle = "";
      try {
        detalle = (await res.json()).detail || "";
      } catch {
        // sin detalle
      }
      throw new Error(typeof detalle === "string" && detalle ? detalle : `Error ${res.status}`);
    }
    return binario ? await res.blob() : await res.json();
  } finally {
    clearTimeout(limite);
  }
}

/* ---------------- Texto de evidencia (formato simple de títulos y viñetas) ---------------- */
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
  const [fase, setFase] = useState("conversacion"); // conversacion | formulario | resonancia | lista
  const [ocupada, setOcupada] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [ultimaPregunta, setUltimaPregunta] = useState("");
  const [ultimaRespuesta, setUltimaRespuesta] = useState("");
  const [evidencia, setEvidencia] = useState(null); // { texto, papers }
  const [contextoZona, setContextoZona] = useState({ zona: null, lado: null });
  const [puedeProponer, setPuedeProponer] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [propuesta, setPropuesta] = useState(null);
  const [error, setError] = useState("");
  const [descargando, setDescargando] = useState(false);
  const [ordenUrl, setOrdenUrl] = useState("");

  const ocupadaRef = useRef(false);
  const faseRef = useRef("conversacion");
  const frasesRef = useRef([]); // todo lo que la persona ha dicho en esta consulta
  const escuchaRef = useRef(null);
  const { hablar, callar, desbloquear, hablando, boca } = useVoz();

  useEffect(() => {
    despertarServidor();
  }, []);

  useEffect(() => {
    faseRef.current = fase;
  }, [fase]);

  useEffect(
    () => () => {
      if (ordenUrl) URL.revokeObjectURL(ordenUrl);
    },
    [ordenUrl]
  );

  const marcarOcupada = (valor) => {
    ocupadaRef.current = valor;
    setOcupada(valor);
  };

  const cambiarFase = (nueva) => {
    faseRef.current = nueva;
    setFase(nueva);
  };

  // Habla sin escucharse a sí misma; solo vuelve a escuchar si sigue en conversación
  const decir = useCallback(
    async (texto) => {
      escuchaRef.current?.pausar();
      setUltimaRespuesta(texto);
      await hablar(texto);
      if (faseRef.current === "conversacion") escuchaRef.current?.reanudar();
    },
    [hablar]
  );

  /* ---------- 1. Conversación ---------- */
  const alEscucharFrase = useCallback(
    async (texto) => {
      if (ocupadaRef.current || faseRef.current !== "conversacion") return;
      marcarOcupada(true);
      setUltimaPregunta(texto);
      setError("");
      escuchaRef.current?.pausar();
      frasesRef.current = [...frasesRef.current, texto];

      setUltimaRespuesta(AVISO_BUSQUEDA);
      await hablar(AVISO_BUSQUEDA);

      setPensando(true);
      let voz = FRASE_ERROR_CONEXION;
      try {
        const contexto = frasesRef.current.slice(-MAX_FRASES_CONTEXTO).join(". ");
        const r = await llamarApi("/paciente/consultar", {
          cuerpo: { consulta: contexto },
          timeout: TIMEOUT_CONSULTA_MS,
        });
        voz = r.voz || FRASE_ERROR_CONEXION;
        if (r.texto) setEvidencia({ texto: r.texto, papers: r.papers || [] });
        if (r.zona || r.lado) {
          setContextoZona((prev) => ({ zona: r.zona || prev.zona, lado: r.lado || prev.lado }));
        }
        if (r.tipo !== "no_entendida") setPuedeProponer(true);
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

  /* ---------- 2. Formulario ---------- */
  const abrirFormulario = () => {
    callar();
    escucha.pausar();
    setError("");
    cambiarFase("formulario");
  };

  const volverAConversar = () => {
    setError("");
    cambiarFase("conversacion");
    escucha.reanudar();
  };

  /* ---------- 3. Propuesta de examen ---------- */
  const enviarFormulario = async (datos) => {
    setEnviando(true);
    setError("");
    setPensando(true);
    try {
      const r = await llamarApi("/paciente/proponer-examen", {
        cuerpo: { consulta: frasesRef.current.join(". "), ...datos },
        timeout: TIMEOUT_PROPUESTA_MS,
      });
      setPropuesta({ ...r, conCorreo: Boolean(datos.email) });
      setPensando(false);
      cambiarFase(r.requiereRM ? "resonancia" : "lista");
      await decir(r.voz);
    } catch (e) {
      setPensando(false);
      setError(e.message || FRASE_ERROR_CONEXION);
      await decir("No pude preparar la propuesta de examen. Revisa los datos e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  /* ---------- 4. Resonancia ---------- */
  const guardarResonancia = async (checklist, resumen) => {
    setEnviando(true);
    setError("");
    try {
      const r = await llamarApi("/paciente/resonancia", {
        cuerpo: { idPago: propuesta.idPago, checklist, resumen },
      });
      cambiarFase("lista");
      await decir(r.voz);
    } catch (e) {
      setError(e.message || FRASE_ERROR_CONEXION);
    } finally {
      setEnviando(false);
    }
  };

  /* ---------- 5. Orden ---------- */
  const descargarOrden = async () => {
    // Se pide una sola vez: cada solicitud hace que ASISTENCIA-ICA reenvíe el correo
    let url = ordenUrl;
    if (!url) {
      setDescargando(true);
      setError("");
      try {
        const pdf = await llamarApi(`/paciente/orden/${propuesta.idPago}`, {
          metodo: "GET",
          binario: true,
          timeout: TIMEOUT_PROPUESTA_MS,
        });
        url = URL.createObjectURL(pdf);
        setOrdenUrl(url);
      } catch (e) {
        setError(e.message || "No se pudo descargar la orden.");
        return;
      } finally {
        setDescargando(false);
      }
    }
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = "orden_examen.pdf";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  };

  const nuevaConsulta = () => {
    callar();
    frasesRef.current = [];
    setUltimaPregunta("");
    setUltimaRespuesta("");
    setEvidencia(null);
    setContextoZona({ zona: null, lado: null });
    setPuedeProponer(false);
    setPropuesta(null);
    setError("");
    setOrdenUrl("");
    cambiarFase("conversacion");
    escucha.reanudar();
  };

  /* ---------- Estado visual ---------- */
  let estado = "reposo";
  if (pensando) estado = "pensando";
  else if (hablando) estado = "hablando";
  else if (iniciado && fase === "conversacion" && escucha.escuchando && !ocupada) estado = "escuchando";

  const soportado = escuchaSoportada && vozSoportada;
  const enConversacion = fase === "conversacion";

  return (
    <div className="app">
      <header className="cabecera">
        <img src="/logo-hipokratia.jpg" alt="Hipokratia" className="cabecera__logo" />
        <div className="cabecera__marca">
          <span className="marca__nombre">
            HYPOKRAT<span className="marca__ia">IA</span>
          </span>
          <span className="marca__sub">Asistente traumatológica</span>
        </div>
      </header>

      <main className="escenario">
        <div className={`escenario__avatar ${enConversacion ? "" : "escenario__avatar--chico"}`}>
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
        {error && <p className="aviso">{error}</p>}

        {iniciado && (
          <section className="dialogo" aria-live="polite">
            <div className="dialogo__fila dialogo__fila--usuario">
              <span className="dialogo__rotulo">Escuché</span>
              <p className="dialogo__texto">
                {enConversacion && escucha.parcial ? (
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

        {iniciado && enConversacion && evidencia && (
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

        {iniciado && enConversacion && puedeProponer && !ocupada && (
          <button type="button" className="boton boton--primario boton--grande" onClick={abrirFormulario}>
            Proponer examen
          </button>
        )}

        {fase === "formulario" && (
          <FormularioPaciente
            inicial={contextoZona}
            enviando={enviando}
            onEnviar={enviarFormulario}
            onCancelar={volverAConversar}
          />
        )}

        {propuesta && (fase === "resonancia" || fase === "lista") && (
          <section className="tarjeta propuesta">
            <h2 className="tarjeta__titulo">Propuesta de examen</h2>
            {propuesta.diagnosticos.length > 0 && (
              <>
                <span className="dialogo__rotulo">Diagnóstico presuntivo</span>
                <ul>
                  {propuesta.diagnosticos.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </>
            )}
            {propuesta.explicacion && <p className="tarjeta__texto">{propuesta.explicacion}</p>}
            <span className="dialogo__rotulo">Exámenes</span>
            <ul>
              {propuesta.examenes.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <p className="propuesta__nota">Esto no reemplaza la evaluación presencial con un especialista.</p>
          </section>
        )}

        {fase === "resonancia" && <ChecklistResonancia enviando={enviando} onGuardar={guardarResonancia} />}

        {fase === "lista" && (
          <div className="acciones acciones--centro">
            <button
              type="button"
              className="boton boton--primario boton--grande"
              onClick={descargarOrden}
              disabled={descargando}
            >
              {descargando ? "Generando orden…" : "Descargar orden"}
            </button>
            <button type="button" className="boton boton--secundario" onClick={nuevaConsulta}>
              Nueva consulta
            </button>
          </div>
        )}

        {fase === "lista" && propuesta?.conCorreo && ordenUrl && (
          <p className="tarjeta__texto">También te enviamos la orden por correo.</p>
        )}
      </main>
    </div>
  );
}
