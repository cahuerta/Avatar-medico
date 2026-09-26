/**
 * rut.js
 * Utilidades de RUT chileno (misma lógica que el frontend de ASISTENCIA-ICA).
 */

export function limpiarRut(str = "") {
  return String(str).replace(/[^0-9kK]/g, "").toUpperCase();
}

function partirRut(valor) {
  const s = limpiarRut(valor);
  if (s.length <= 1) return { cuerpo: s, dv: undefined };
  return { cuerpo: s.slice(0, -1), dv: s.slice(-1) };
}

export function calcularDV(cuerpo = "") {
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i -= 1) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

export function formatearRut(valor = "") {
  const { cuerpo, dv } = partirRut(valor);
  if (!cuerpo) return "";
  const cuerpoFmt = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dv ? `${cuerpoFmt}-${dv}` : cuerpoFmt;
}

export function validarRut(valor = "") {
  const s = limpiarRut(valor);
  if (s.length < 2) return { valido: false, motivo: "RUT incompleto" };
  const { cuerpo, dv } = partirRut(s);
  if (!/^\d{1,8}$/.test(cuerpo)) return { valido: false, motivo: "RUT inválido" };
  const dvOk = calcularDV(cuerpo);
  return dv === dvOk
    ? { valido: true, motivo: "" }
    : { valido: false, motivo: `Dígito verificador incorrecto, debería ser ${dvOk}` };
}
