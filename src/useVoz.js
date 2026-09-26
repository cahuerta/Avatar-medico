/**
 * useVoz.js
 * Voz del navegador (speechSynthesis) + apertura de boca para el avatar.
 *
 * - hablar(texto): devuelve una Promise que se resuelve al terminar de hablar.
 * - boca: número 0..1 con la apertura actual de la boca.
 *
 * La boca se abre en cada palabra (evento "boundary") y se cierra suavemente.
 * Si el navegador no emite eventos de palabra (algunos Android), se usa una
 * oscilación de respaldo mientras dura el habla.
 *
 * Cuando se conecte la voz en la nube, solo se reemplaza este archivo: la boca
 * pasará a leer el volumen real del audio, y el resto de la app no cambia.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const PREFERENCIA_IDIOMA = ["es-CL", "es-419", "es-US", "es-MX", "es-AR", "es-ES", "es"];
const PISTAS_VOZ_FEMENINA = [
  "paulina", "francisca", "mónica", "monica", "helena", "sabina", "laura",
  "lucia", "lucía", "elvira", "dalia", "camila", "female", "mujer",
];

function elegirVoz(voces) {
  const espanol = voces.filter((v) => v.lang && v.lang.toLowerCase().startsWith("es"));
  if (!espanol.length) return null;

  const puntaje = (v) => {
    const idx = PREFERENCIA_IDIOMA.findIndex((p) => v.lang.toLowerCase().startsWith(p.toLowerCase()));
    let p = idx === -1 ? 0 : (PREFERENCIA_IDIOMA.length - idx) * 10;
    const nombre = v.name.toLowerCase();
    if (PISTAS_VOZ_FEMENINA.some((f) => nombre.includes(f))) p += 25;
    if (nombre.includes("google") || nombre.includes("natural") || nombre.includes("online")) p += 8;
    return p;
  };

  return [...espanol].sort((a, b) => puntaje(b) - puntaje(a))[0];
}

export const vozSoportada = typeof window !== "undefined" && "speechSynthesis" in window;

export default function useVoz() {
  const [hablando, setHablando] = useState(false);
  const [boca, setBoca] = useState(0);

  const vozRef = useRef(null);
  const nivelRef = useRef(0);
  const ultimoLimiteRef = useRef(0);
  const hablandoRef = useRef(false);
  const rafRef = useRef(null);

  // Cargar voces (en Chrome llegan de forma asíncrona)
  useEffect(() => {
    if (!vozSoportada) return undefined;
    const cargar = () => {
      vozRef.current = elegirVoz(window.speechSynthesis.getVoices());
    };
    cargar();
    window.speechSynthesis.addEventListener("voiceschanged", cargar);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", cargar);
  }, []);

  // Animación de la boca
  useEffect(() => {
    const tick = (t) => {
      if (hablandoRef.current) {
        const sinEventos = t - ultimoLimiteRef.current > 450;
        if (sinEventos) {
          // Respaldo: oscilación irregular mientras habla
          const osc = 0.35 + 0.35 * Math.abs(Math.sin(t / 95)) * (0.6 + 0.4 * Math.sin(t / 37));
          nivelRef.current = Math.max(nivelRef.current * 0.8, osc);
        } else {
          nivelRef.current *= 0.86;
        }
      } else {
        nivelRef.current *= 0.7;
      }
      const redondeado = Math.round(nivelRef.current * 20) / 20;
      setBoca((prev) => (prev === redondeado ? prev : redondeado));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const hablar = useCallback((texto) => {
    return new Promise((resolve) => {
      if (!vozSoportada || !texto) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(texto);
      if (!vozRef.current) vozRef.current = elegirVoz(window.speechSynthesis.getVoices());
      if (vozRef.current) {
        u.voice = vozRef.current;
        u.lang = vozRef.current.lang;
      } else {
        u.lang = "es-CL";
      }
      u.rate = 1;
      u.pitch = 1.05;

      const terminar = () => {
        hablandoRef.current = false;
        setHablando(false);
        resolve();
      };

      u.onstart = () => {
        hablandoRef.current = true;
        ultimoLimiteRef.current = 0;
        setHablando(true);
      };
      u.onboundary = (e) => {
        if (e.name && e.name !== "word") return;
        ultimoLimiteRef.current = performance.now();
        nivelRef.current = 0.75 + Math.random() * 0.25;
      };
      u.onend = terminar;
      u.onerror = terminar;

      window.speechSynthesis.speak(u);
    });
  }, []);

  const callar = useCallback(() => {
    if (vozSoportada) window.speechSynthesis.cancel();
    hablandoRef.current = false;
    setHablando(false);
  }, []);

  // "Desbloquea" la voz en navegadores que exigen un toque previo
  const desbloquear = useCallback(() => {
    if (!vozSoportada) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }, []);

  return { hablar, callar, desbloquear, hablando, boca };
}
