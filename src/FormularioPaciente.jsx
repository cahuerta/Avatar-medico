/**
 * FormularioPaciente.jsx
 * Datos para la orden de examen (mismos campos y valores que ASISTENCIA-ICA).
 * Zona y lado llegan precargados desde la conversación y se pueden editar.
 *
 * Props:
 * - inicial:   { zona, lado }
 * - enviando:  bool
 * - onEnviar(datos)
 * - onCancelar()
 */
import { useState } from "react";
import { formatearRut, validarRut } from "./rut.js";

const ZONAS = [
  "Rodilla", "Cadera", "Columna lumbar", "Columna cervical", "Columna dorsal",
  "Hombro", "Codo", "Mano", "Tobillo",
];
const ZONAS_SIN_LADO = ["Columna lumbar", "Columna cervical", "Columna dorsal"];

export default function FormularioPaciente({ inicial = {}, enviando = false, onEnviar, onCancelar }) {
  const [datos, setDatos] = useState({
    nombre: "",
    rut: "",
    edad: "",
    genero: "",
    dolor: inicial.zona || "",
    lado: inicial.lado || "",
    email: "",
  });
  const [errores, setErrores] = useState({});

  const sinLado = ZONAS_SIN_LADO.includes(datos.dolor);

  const cambiar = (campo, valor) => {
    setDatos((prev) => ({ ...prev, [campo]: valor }));
    setErrores((prev) => ({ ...prev, [campo]: undefined }));
  };

  const validar = () => {
    const e = {};
    if (datos.nombre.trim().length < 2) e.nombre = "Ingresa tu nombre completo";
    const rut = validarRut(datos.rut);
    if (!rut.valido) e.rut = rut.motivo;
    const edad = Number(datos.edad);
    if (!Number.isInteger(edad) || edad < 0 || edad > 120) e.edad = "Edad inválida";
    if (!datos.genero) e.genero = "Selecciona una opción";
    if (!datos.dolor) e.dolor = "Selecciona la zona";
    if (!sinLado && !datos.lado) e.lado = "Selecciona el lado";
    if (datos.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.email.trim())) {
      e.email = "Correo inválido";
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const enviar = (evento) => {
    evento.preventDefault();
    if (enviando || !validar()) return;
    onEnviar?.({
      nombre: datos.nombre.trim(),
      rut: formatearRut(datos.rut),
      edad: Number(datos.edad),
      genero: datos.genero,
      dolor: datos.dolor,
      lado: sinLado ? null : datos.lado,
      email: datos.email.trim() || null,
    });
  };

  return (
    <form className="tarjeta formulario" onSubmit={enviar} noValidate>
      <h2 className="tarjeta__titulo">Datos para tu orden</h2>

      <label className="campo">
        <span>Nombre completo</span>
        <input value={datos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} autoComplete="name" />
        {errores.nombre && <small className="campo__error">{errores.nombre}</small>}
      </label>

      <label className="campo">
        <span>RUT</span>
        <input
          value={datos.rut}
          onChange={(e) => cambiar("rut", e.target.value)}
          onBlur={() => datos.rut && cambiar("rut", formatearRut(datos.rut))}
          placeholder="12.345.678-9"
          inputMode="text"
        />
        {errores.rut && <small className="campo__error">{errores.rut}</small>}
      </label>

      <div className="formulario__fila">
        <label className="campo">
          <span>Edad</span>
          <input
            value={datos.edad}
            onChange={(e) => cambiar("edad", e.target.value.replace(/\D/g, "").slice(0, 3))}
            inputMode="numeric"
          />
          {errores.edad && <small className="campo__error">{errores.edad}</small>}
        </label>

        <label className="campo">
          <span>Sexo</span>
          <select value={datos.genero} onChange={(e) => cambiar("genero", e.target.value)}>
            <option value="">Seleccione…</option>
            <option value="Masculino">Masculino</option>
            <option value="Femenino">Femenino</option>
          </select>
          {errores.genero && <small className="campo__error">{errores.genero}</small>}
        </label>
      </div>

      <div className="formulario__fila">
        <label className="campo">
          <span>Zona</span>
          <select value={datos.dolor} onChange={(e) => cambiar("dolor", e.target.value)}>
            <option value="">Seleccione…</option>
            {ZONAS.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
          {errores.dolor && <small className="campo__error">{errores.dolor}</small>}
        </label>

        <label className="campo">
          <span>Lado</span>
          <select value={sinLado ? "" : datos.lado} onChange={(e) => cambiar("lado", e.target.value)} disabled={sinLado}>
            {sinLado ? (
              <option value="">No aplica</option>
            ) : (
              <>
                <option value="">Seleccione…</option>
                <option value="Derecha">Derecha</option>
                <option value="Izquierda">Izquierda</option>
              </>
            )}
          </select>
          {errores.lado && <small className="campo__error">{errores.lado}</small>}
        </label>
      </div>

      <label className="campo">
        <span>Correo (para recibir la orden)</span>
        <input
          type="email"
          value={datos.email}
          onChange={(e) => cambiar("email", e.target.value)}
          placeholder="Opcional"
          autoComplete="email"
        />
        {errores.email && <small className="campo__error">{errores.email}</small>}
      </label>

      <div className="acciones">
        <button type="button" className="boton boton--secundario" onClick={onCancelar} disabled={enviando}>
          Volver
        </button>
        <button type="submit" className="boton boton--primario" disabled={enviando}>
          {enviando ? "Preparando…" : "Proponer examen"}
        </button>
      </div>
    </form>
  );
}
