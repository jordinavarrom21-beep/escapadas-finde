/**
 * Coste del viaje completo (alojamiento o paquete + cómo llegar) para comparar ofertas de
 * distinta duración y unidad. Separa lo que publica la web de lo que se estima (gasolina,
 * la vuelta de un billete de ida) y dice qué se ha supuesto. Sin datos suficientes no da
 * total: mejor «falta saber cómo llegar» que un número que parezca exacto. Sin DOM.
 */

import { FACTOR_CARRETERA, distanciaKm, tieneCoordenadas } from './geo.js?v=hosting-465dd02d9e68';
import { contar, euros, unDecimal } from './formato.js?v=hosting-465dd02d9e68';

/** Transporte que no es el coche propio. */
const OTRO_TRANSPORTE = ['avion', 'tren', 'bus', 'ferry'];
const NOMBRE_TRANSPORTE = { avion: 'avión', tren: 'tren', bus: 'autobús', ferry: 'ferry' };

const redondear = (n) => Math.round(n * 100) / 100;
const litros = unDecimal;

/** Los billetes (vuelo, tren, bus, ferry) son el propio viaje: su precio es el transporte. */
const esBillete = (o) => o.tipo === 'vuelo' || ['i/v', 'trayecto'].includes(o.unidad);

/**
 * Lo que cuesta lo que vende la oferta (alojamiento, paquete o billetes) para `viajeros` y
 * `noches`, o null si la unidad no permite saberlo.
 */
function parteOferta(o, { viajeros, noches }, supuestos) {
  const p = o.precio;
  const personas = contar(viajeros, 'persona');
  const nochesOferta = o.noches ?? noches;
  if (!o.noches && ['pp/noche', 'noche'].includes(o.unidad)) supuestos.push(`${contar(noches, 'noche')} (la oferta no lo fija)`);
  switch (o.unidad) {
    case 'pp': return [{ concepto: o.tipo === 'paquete' ? 'Paquete' : 'Oferta', eur: p * viajeros, detalle: `${euros(p)} × ${personas}` }];
    case 'pp/noche': return [{ concepto: 'Alojamiento', eur: p * viajeros * nochesOferta, detalle: `${euros(p)} × ${personas} × ${contar(nochesOferta, 'noche')}` }];
    case 'noche': return [{ concepto: 'Alojamiento', eur: p * nochesOferta, detalle: `${euros(p)} × ${contar(nochesOferta, 'noche')} (alojamiento entero)` }];
    case 'total':
      supuestos.push('el total que publica la web: comprueba para cuántas personas es');
      return [{ concepto: o.tipo === 'paquete' ? 'Paquete' : 'Oferta', eur: p, detalle: 'precio total publicado' }];
    case 'i/v': return [{ concepto: 'Billetes de ida y vuelta', eur: p * viajeros, detalle: `${euros(p)} × ${personas}` }];
    case 'trayecto': return [
      { concepto: 'Billetes de ida', eur: p * viajeros, detalle: `${euros(p)} × ${personas}` },
      { concepto: 'Billetes de vuelta', eur: p * viajeros, detalle: 'mismo precio que la ida', estimado: true },
    ];
    default: return null;
  }
}

/** ¿Está el lugar en la zona? Una caja [sur, oeste, norte, este] o un país. */
function enZona(lugar, zona) {
  if (zona.codigoPais) return lugar.codigoPais === zona.codigoPais;
  const [sur, oeste, norte, este] = zona.caja ?? [];
  return tieneCoordenadas(lugar) && lugar.lat >= sur && lugar.lat <= norte && lugar.lon >= oeste && lugar.lon <= este;
}

/** Los peajes (config/peajes.json) que salen de cerca de `salida`: los que pueden estar en tus rutas. */
export const peajesDesde = (peajes, salida) => (Array.isArray(peajes) && tieneCoordenadas(salida)
  ? peajes.filter((p) => distanciaKm(salida, p.desde) <= p.desde.radioKm)
  : []);

/** Los peajes de la ruta habitual hasta la oferta, de los que salen de tu zona. */
export const peajesDe = (o, peajes = []) => (o.lugar ? peajes.filter((p) => p.zonas.some((z) => enZona(o.lugar, z))) : []);

/** Gasolina de ida y vuelta desde la salida, si se va en coche y se sabe la distancia. */
function parteCoche(o, distancia, coche, supuestos) {
  if (!distancia || distancia.minutos == null || !coche?.consumoL100km || !coche?.precioLitro) return null;
  const km = distancia.kmCoche ?? distancia.km * FACTOR_CARRETERA;
  const l = (2 * km * coche.consumoL100km) / 100;
  supuestos.push(`un coche para todos, ${litros(coche.consumoL100km)} l/100 km a ${euros(coche.precioLitro)}/l${distancia.kmCoche == null ? ', distancia por carretera estimada' : ''}; sin aparcamiento`);
  return {
    concepto: 'Gasolina (ida y vuelta)', eur: l * coche.precioLitro, estimado: true,
    detalle: `${Math.round(2 * km)} km · ${litros(l)} l`,
    // La cuenta entera, para quien quiera comprobarla.
    calculo: `${Math.round(2 * km)} km × ${litros(coche.consumoL100km)} l/100 km = ${litros(l)} l × ${euros(coche.precioLitro)}/l`,
  };
}

/**
 * @param {object} o oferta
 * @param {{viajeros: number, noches: number, distancia?: object, coche?: {consumoL100km: number, precioLitro: number}}} ctx
 * @returns {{partes: object[], total: number|null, porPersona: number|null, porPersonaNoche: number|null, estimado: number, falta: string[], supuestos: string[], viajeros: number, noches: number|null}}
 */
export function costeViaje(o, { viajeros = 2, noches = 2, distancia = null, coche = null, peajes = [] } = {}) {
  const supuestos = [];
  const falta = [];
  // Lo que se sabe que falta sumar pero no impide dar un total («+ peaje del Túnel del Cadí»).
  const aviso = [];
  const resultado = (partes) => {
    const total = falta.length ? null : redondear(partes.reduce((suma, p) => suma + p.eur, 0));
    // Las noches supuestas solo cuentan si el precio es por noche; si no, no se sabe.
    const nochesViaje = esBillete(o) ? null : o.noches ?? (['pp/noche', 'noche'].includes(o.unidad) ? noches : null);
    const porPersona = total == null ? null : redondear(total / viajeros);
    return {
      partes: partes.map((p) => ({ estimado: false, ...p, eur: redondear(p.eur) })),
      total,
      porPersona,
      // La misma base para todas: un paquete de 1 noche no gana a una casa de 2 por ser más corto.
      porPersonaNoche: porPersona != null && nochesViaje > 0 ? redondear(porPersona / nochesViaje) : null,
      estimado: redondear(partes.filter((p) => p.estimado).reduce((suma, p) => suma + p.eur, 0)),
      falta, supuestos, aviso, viajeros,
      noches: nochesViaje,
    };
  };
  if (typeof o.precio !== 'number' || o.precio <= 0) {
    falta.push(o.precio === 0 ? 'es gratis: no hay nada que sumar' : 'el precio');
    return resultado([]);
  }
  const partes = parteOferta(o, { viajeros, noches }, supuestos);
  if (!partes) {
    falta.push('si el precio es por persona, por noche o total');
    return resultado([]);
  }
  if (o.tipo === 'actividad') {
    falta.push('cómo llegar (es una actividad suelta)');
    return resultado(partes);
  }
  // Sale de otra ciudad («Desde Madrid del 13 al 15»): sumarle tu gasolina o tus vuelos no tiene sentido.
  if (o.otraSalida) {
    falta.push(`cómo llegar a ${o.otraSalida}, que es desde donde sale`);
    return resultado(partes);
  }
  if (esBillete(o)) {
    // El billete lleva hasta allí, pero no incluye dónde dormir.
    if (o.tipo === 'vuelo' || o.tipo === 'escapada') falta.push('el alojamiento');
    return resultado(partes);
  }
  if (OTRO_TRANSPORTE.includes(o.transporte)) {
    // Un paquete con avión o ferry lo incluye; una escapada «en tren» no dice cuánto cuesta el billete.
    if (o.tipo === 'paquete') {
      supuestos.push(`el ${NOMBRE_TRANSPORTE[o.transporte]} va incluido en el paquete`);
      return resultado(partes);
    }
    falta.push(`el precio del ${NOMBRE_TRANSPORTE[o.transporte]}`);
    return resultado(partes);
  }
  const gasolina = parteCoche(o, distancia, coche, supuestos);
  if (!gasolina) {
    falta.push('cómo llegar (no hay ruta en coche calculada)');
    return resultado(partes);
  }
  // Peajes de la ruta habitual: con importe, se suman (ida y vuelta); sin él, se nombran.
  const deLaRuta = peajesDe(o, peajes);
  const conImporte = deLaRuta.filter((p) => p.importe > 0);
  const sinImporte = deLaRuta.filter((p) => !(p.importe > 0));
  const partesPeaje = conImporte.map((p) => ({
    concepto: `Peaje ${p.nombre} (ida y vuelta)`, eur: 2 * p.importe, estimado: true, detalle: `${euros(p.importe)} × 2`,
  }));
  if (sinImporte.length) aviso.push(...sinImporte.map((p) => `+ peaje del ${p.nombre} si vas por él (no incluido)`));
  if (!deLaRuta.length) supuestos.push('sin peajes');
  supuestos.push('sin actividades ni comidas que no incluya la oferta');
  return resultado([...partes, gasolina, ...partesPeaje]);
}

/** «≈ 312 € para 2 personas · 156 €/persona» para la tarjeta, o '' si no hay total. */
export function resumenCoste(c) {
  if (c.total == null) return '';
  return `${c.estimado ? '≈ ' : ''}${euros(Math.round(c.total))} en total para ${contar(c.viajeros, 'persona')}${c.viajeros > 1 ? ` · ${euros(Math.round(c.porPersona))}/persona` : ''}`;
}
