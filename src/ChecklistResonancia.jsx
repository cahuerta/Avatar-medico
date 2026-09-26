/**
 * ChecklistResonancia.jsx
 * Checklist de seguridad para resonancia: mismas preguntas y claves que
 * FormularioResonancia de ASISTENCIA-ICA, para que el backend las guarde igual.
 *
 * Props:
 * - enviando: bool
 * - onGuardar(checklist, resumenTexto)
 */
import { useMemo, useState } from "react";

const ITEMS = [
  { key: "marcapasos", label: "¿Tiene marcapasos o desfibrilador implantado (DAI)?", resumen: "Marcapasos/DAI" },
  { key: "coclear_o_neuro", label: "¿Tiene implante coclear o neuroestimulador?", resumen: "Implante coclear/neuroestimulador" },
  { key: "clips_aneurisma", label: "¿Tiene clips de aneurisma cerebral?", resumen: "Clips de aneurisma" },
  { key: "valvula_cardiaca_metal", label: "¿Tiene válvula cardíaca u otro implante metálico intracraneal?", resumen: "Implante metálico intracraneal" },
  { key: "fragmentos_metalicos", label: "¿Tiene fragmentos metálicos/balas (en ojos o cuerpo)?", resumen: "Fragmentos metálicos/balas" },
  { key: "protesis_placas_tornillos", label: "¿Tiene prótesis, placas o tornillos metálicos?", resumen: "Prótesis/placas/tornillos" },
  { key: "cirugia_reciente_3m", label: "¿Cirugía reciente (< 3 meses) con implante?", resumen: "Cirugía reciente (<3m) con implante" },
  { key: "embarazo", label: "¿Embarazo o sospecha de embarazo?", resumen: "Embarazo o sospecha" },
  { key: "claustrofobia", label: "¿Claustrofobia importante?", resumen: "Claustrofobia importante" },
  { key: "peso_mayor_150", label: "¿Peso mayor a 150 kg (límite equipo)?", resumen: "Peso > 150 kg" },
  { key: "no_permanece_inmovil", label: "¿Dificultad para permanecer inmóvil 20–30 min?", resumen: "Dificultad para inmovilidad" },
  { key: "tatuajes_recientes", label: "¿Tatuajes o maquillaje permanente hechos hace < 6 semanas?", resumen: "Tatuajes/PMU < 6 semanas" },
  { key: "piercings_no_removibles", label: "¿Piercings que no puede retirar?", resumen: "Piercings no removibles" },
  { key: "bomba_insulina_u_otro", label: "¿Usa bomba de insulina u otro dispositivo externo?", resumen: "Dispositivo externo activo" },
  { key: "requiere_contraste", label: "¿Este examen requiere contraste (gadolinio)?", resumen: "Requiere contraste" },
  { key: "erc_o_egfr_bajo", label: "¿Insuficiencia renal conocida o eGFR < 30?", resumen: "Insuficiencia renal / eGFR < 30" },
  { key: "alergia_gadolinio", label: "¿Alergia previa a gadolinio?", resumen: "Alergia a gadolinio" },
  { key: "reaccion_contrastes", label: "¿Reacción alérgica grave previa a otros contrastes?", resumen: "Reacción a contrastes previos" },
  { key: "requiere_sedacion", label: "¿Requiere sedación para poder realizar el examen?", resumen: "Requiere sedación" },
  { key: "ayuno_6h", label: "¿Ha cumplido ayuno de 6 horas? (si habrá sedación)", resumen: "Ayuno 6h (si sedación)" },
];

const estadoInicial = () => ITEMS.reduce((acc, it) => ({ ...acc, [it.key]: null }), { observaciones: "" });

// Mismo formato de resumen que usa ASISTENCIA-ICA
function construirResumen(form) {
  const marcadas = ITEMS.filter((it) => form[it.key] === true).map((it) => `• ${it.resumen}`);
  const partes = [marcadas.length ? marcadas.join("\n") : "• Sin alertas marcadas en checklist."];
  const obs = (form.observaciones || "").trim();
  if (obs) partes.push(`Observaciones: ${obs}`);
  return partes.join("\n");
}

export default function ChecklistResonancia({ enviando = false, onGuardar }) {
  const [form, setForm] = useState(estadoInicial);
  const [intentoGuardar, setIntentoGuardar] = useState(false);

  const faltantes = useMemo(() => ITEMS.filter((it) => form[it.key] === null).length, [form]);

  const responder = (key, valor) => setForm((f) => ({ ...f, [key]: valor }));
  const todoNo = () => setForm((f) => ({ ...f, ...ITEMS.reduce((acc, it) => ({ ...acc, [it.key]: false }), {}) }));

  const guardar = () => {
    setIntentoGuardar(true);
    if (faltantes || enviando) return;
    onGuardar?.(form, construirResumen(form));
  };

  return (
    <section className="tarjeta checklist">
      <h2 className="tarjeta__titulo">Seguridad para resonancia</h2>
      <p className="tarjeta__texto">Responde Sí o No a cada pregunta antes de emitir la orden.</p>

      <button type="button" className="boton boton--secundario checklist__todo-no" onClick={todoNo}>
        Responder todo “No”
      </button>

      <ul className="checklist__lista">
        {ITEMS.map((it) => (
          <li
            key={it.key}
            className={`checklist__item ${intentoGuardar && form[it.key] === null ? "checklist__item--falta" : ""}`}
          >
            <span className="checklist__pregunta">{it.label}</span>
            <div className="checklist__opciones" role="group" aria-label={it.label}>
              <button
                type="button"
                className={`opcion ${form[it.key] === true ? "opcion--si" : ""}`}
                onClick={() => responder(it.key, true)}
              >
                Sí
              </button>
              <button
                type="button"
                className={`opcion ${form[it.key] === false ? "opcion--no" : ""}`}
                onClick={() => responder(it.key, false)}
              >
                No
              </button>
            </div>
          </li>
        ))}
      </ul>

      <label className="campo">
        <span>Observaciones</span>
        <textarea
          rows={2}
          value={form.observaciones}
          onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
          placeholder="Opcional"
        />
      </label>

      {intentoGuardar && faltantes > 0 && (
        <p className="campo__error">Faltan {faltantes} preguntas por responder.</p>
      )}

      <div className="acciones">
        <button type="button" className="boton boton--primario" onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar y continuar"}
        </button>
      </div>
    </section>
  );
}
