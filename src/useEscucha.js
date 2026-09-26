/**
 * useEscucha.js
 * Reconocimiento de voz continuo del navegador (Web Speech API), español de Chile.
 *
 * - iniciar(): arranca la escucha (debe llamarse tras un toque del usuario).
 * - pausar():  detiene la escucha (se usa mientras el avatar habla, para que no se oiga a sí mismo).
 * - reanudar(): vuelve a escuchar.
 * - onFrase(texto): callback que recibe cada frase final reconocida.
 *
 * El navegador corta la escucha continua cada cierto tiempo; aquí se reinicia sola
 * mientras esté activa y no pausada.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const SpeechRecognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export const escuchaSoportada = Boolean(SpeechRecognition);

export default function useEscucha({ onFrase, idioma = "es-CL" } = {}) {
  const [escuchando, setEscuchando] = useState(false);
  const [parcial, setParcial] = useState("");
  const [error, setError] = useState(null);

  const recRef = useRef(null);
  const activaRef = useRef(false); // el usuario inició la sesión
  const pausadaRef = useRef(false); // pausada mientras el avatar habla
  const onFraseRef = useRef(onFrase);
  const reinicioRef = useRef(null);

  useEffect(() => {
    onFraseRef.current = onFrase;
  }, [onFrase]);

  const arrancar = useCallback(() => {
    const rec = recRef.current;
    if (!rec || !activaRef.current || pausadaRef.current) return;
    try {
      rec.start();
    } catch {
      // "already started": se ignora
    }
  }, []);

  useEffect(() => {
    if (!SpeechRecognition) return undefined;

    const rec = new SpeechRecognition();
    rec.lang = idioma;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => setEscuchando(true);

    rec.onresult = (evento) => {
      let textoParcial = "";
      for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
        const resultado = evento.results[i];
        const texto = resultado[0].transcript.trim();
        if (resultado.isFinal) {
          setParcial("");
          if (texto && !pausadaRef.current && onFraseRef.current) {
            onFraseRef.current(texto);
          }
        } else {
          textoParcial += `${texto} `;
        }
      }
      if (textoParcial) setParcial(textoParcial.trim());
    };

    rec.onerror = (evento) => {
      if (evento.error === "not-allowed" || evento.error === "service-not-allowed") {
        activaRef.current = false;
        setError("Permiso de micrófono denegado. Actívalo en el navegador y recarga la página.");
      } else if (evento.error === "audio-capture") {
        setError("No se encontró un micrófono.");
      }
      // "no-speech", "aborted", "network": se ignoran y se reintenta en onend
    };

    rec.onend = () => {
      setEscuchando(false);
      if (activaRef.current && !pausadaRef.current) {
        clearTimeout(reinicioRef.current);
        reinicioRef.current = setTimeout(arrancar, 250);
      }
    };

    recRef.current = rec;

    return () => {
      activaRef.current = false;
      clearTimeout(reinicioRef.current);
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        // sin acción
      }
      recRef.current = null;
    };
  }, [idioma, arrancar]);

  const iniciar = useCallback(() => {
    setError(null);
    activaRef.current = true;
    pausadaRef.current = false;
    arrancar();
  }, [arrancar]);

  const pausar = useCallback(() => {
    pausadaRef.current = true;
    clearTimeout(reinicioRef.current);
    setParcial("");
    try {
      recRef.current?.abort();
    } catch {
      // sin acción
    }
  }, []);

  const reanudar = useCallback(() => {
    pausadaRef.current = false;
    clearTimeout(reinicioRef.current);
    reinicioRef.current = setTimeout(arrancar, 300);
  }, [arrancar]);

  return { escuchando, parcial, error, iniciar, pausar, reanudar };
}
