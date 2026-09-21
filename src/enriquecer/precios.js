/**
 * Red de seguridad para precios imposibles. Algunas webs publican un «desde 2 €»
 * que en realidad es otro número de la página (personas, plazas, valoración…).
 * Un precio así arruina la comparación: se cuela como chollazo y hunde la mediana
 * de su grupo. Cuando no es creíble se deja en `null` (el texto original se
 * conserva en `precioTexto`) y se marca con la etiqueta «precio-dudoso».
 */

export const ETIQUETA_DUDOSO = 'precio-dudoso';

/** Mínimos por debajo de los cuales el precio no es creíble, en euros. */
const MINIMOS = {
  // Una actividad puede ser gratis de verdad (free tours) y una entrada valer 2 €.
  actividad: 0,
  vuelo: 5,
  hotel: 15,
  escapada: 10,
  paquete: 15,
  crucero: 30,
};
/** Por persona y noche: por debajo de esto no hay alojamiento real. */
const MINIMO_POR_NOCHE = 8;
/** Un billete suelto de bus, tren o ferry sí puede costar 7 €: solo se descarta si es absurdo. */
const MINIMO_BILLETE = 1;
const TRANSPORTES_BARATOS = ["bus", "tren", "ferry"];

const esBillete = (oferta) => TRANSPORTES_BARATOS.includes(oferta.transporte) && !oferta.noches;

const esPrecio = (valor) => typeof valor === 'number' && Number.isFinite(valor);

/** Motivo por el que el precio no es creíble, o null si lo es. */
export function precioDudoso(oferta) {
  const { precio, tipo, precioNoche } = oferta;
  if (!esPrecio(precio)) return null;
  if (precio < 0) return `precio negativo (${precio} €)`;
  const minimo = esBillete(oferta) ? MINIMO_BILLETE : MINIMOS[tipo] ?? 0;
  if (precio < minimo) return `${precio} € es demasiado poco para ${esBillete(oferta) ? "un billete" : tipo}`;
  if (esPrecio(precioNoche) && precioNoche > 0 && precioNoche < MINIMO_POR_NOCHE) {
    return `${precioNoche.toFixed(0)} € por persona y noche no es creíble`;
  }
  return null;
}

/**
 * Deja en `null` los precios que no son creíbles y los marca. Devuelve cuántos.
 * Se ejecuta después de calcular `precioNoche` y antes de comparar precios.
 */
export function revisarPrecios(ofertas, log = () => {}) {
  let dudosos = 0;
  for (const oferta of ofertas) {
    const motivo = precioDudoso(oferta);
    if (!motivo) continue;
    log(`${oferta.fuente}: ${motivo} en «${oferta.titulo.slice(0, 50)}»; se ignora el precio`);
    oferta.precio = null;
    oferta.precioNoche = null;
    oferta.chollazo = false;
    if (!oferta.etiquetas.includes(ETIQUETA_DUDOSO)) oferta.etiquetas.push(ETIQUETA_DUDOSO);
    dudosos += 1;
  }
  return dudosos;
}
