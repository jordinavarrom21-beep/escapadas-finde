/**
 * Lectura de precios escritos a la española («1.299,50 €») o a la inglesa («€1,299»).
 */

/**
 * Convierte un texto de precio en número de euros.
 * "24,71€" → 24.71 · "1.053,49€" → 1053.49 · "122.00 EUR" → 122 · "€1,299" → 1299 · "GRATIS" → 0
 * @param {string|number|null|undefined} texto
 * @returns {number|null}
 */
export function parsearPrecio(texto) {
  if (texto == null) return null;
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  const limpio = String(texto).trim();
  if (/^(gratis|free)$/i.test(limpio)) return 0;
  const coincidencia = limpio.match(/\d[\d.,\s]*/);
  if (!coincidencia) return null;

  let numero = coincidencia[0].replace(/\s/g, '').replace(/[.,]+$/, '');
  const ultimoPunto = numero.lastIndexOf('.');
  const ultimaComa = numero.lastIndexOf(',');
  if (ultimoPunto > -1 && ultimaComa > -1) {
    // Con ambos separadores, el que va detrás es el decimal.
    numero = ultimaComa > ultimoPunto
      ? numero.replace(/\./g, '').replace(',', '.')
      : numero.replace(/,/g, '');
  } else if (ultimaComa > -1) {
    numero = /^\d{1,3}(,\d{3})+$/.test(numero) ? numero.replace(/,/g, '') : numero.replace(',', '.');
  } else if (ultimoPunto > -1 && /^\d{1,3}(\.\d{3})+$/.test(numero)) {
    numero = numero.replace(/\./g, '');
  }
  const valor = Number.parseFloat(numero);
  return Number.isFinite(valor) ? valor : null;
}

const IMPORTE = /(?:€\s?(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s?(?:€|eur(?:os)?\b))/gi;

/**
 * Todas las cantidades en euros que aparecen en un texto, en orden.
 * @returns {{valor: number, indice: number, fragmento: string}[]}
 */
export function extraerPrecios(texto = '') {
  return [...String(texto).matchAll(IMPORTE)]
    .map((m) => ({ valor: parsearPrecio(m[1] ?? m[2]), indice: m.index, fragmento: m[0] }))
    .filter((p) => p.valor != null);
}

/** Primera cantidad en euros de un texto, o null. */
export function extraerPrecio(texto = '') {
  return extraerPrecios(texto)[0]?.valor ?? null;
}
