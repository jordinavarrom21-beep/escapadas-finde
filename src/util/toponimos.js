/**
 * Mayúsculas de los topónimos como se escriben: «Vall D'aran» → «Vall d'Aran», «Sant Julià De
 * Ramis» → «Sant Julià de Ramis», «L'escala» → «L'Escala». Las partículas (de, del, la, d',
 * l', i…) en minúscula salvo al principio, y lo que va tras el apóstrofo, en mayúscula.
 */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'les', 'el', 'els', 'los', 'i', 'y', 'sa', 'ses', 'en', 'al']);
const ELIDIDAS = new Set(['d', 'l', 's']);

const mayuscula = (palabra) => palabra.charAt(0).toLocaleUpperCase('es') + palabra.slice(1);

export function formatearToponimo(nombre) {
  if (typeof nombre !== 'string' || !nombre.trim()) return nombre ?? null;
  // Solo se toca lo que viene con las partículas en mayúscula o todo en mayúsculas o minúsculas.
  return nombre.trim().split(/\s+/).map((palabra, i) => {
    const [antes, despues] = palabra.split(/['’]/);
    if (despues !== undefined && ELIDIDAS.has(antes.toLowerCase())) {
      return `${i === 0 ? antes.toUpperCase() : antes.toLowerCase()}'${mayuscula(despues.toLocaleLowerCase('es'))}`;
    }
    const minuscula = palabra.toLocaleLowerCase('es');
    if (i > 0 && PARTICULAS.has(minuscula)) return minuscula;
    // «MEDINYÀ» o «medinyà» → «Medinyà»; «Castell-Platja», intacto.
    return palabra === palabra.toLocaleUpperCase('es') || palabra === minuscula ? mayuscula(minuscula) : palabra;
  }).join(' ');
}
