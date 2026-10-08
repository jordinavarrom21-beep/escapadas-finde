/**
 * Coste del viaje completo (alojamiento o paquete + cómo llegar) para comparar ofertas de
 * distinta duración y unidad. Separa lo que publica la web de lo que se estima (gasolina,
 * la vuelta de un billete de ida) y dice qué se ha supuesto. Sin datos suficientes no da
 * total: mejor «falta saber cómo llegar» que un número que parezca exacto. Sin DOM.
 */

import { FACTOR_CARRETERA } from './geo.js';
import { contar, euros, unDecimal } from './formato.js';

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

/** Gasolina de ida y vuelta desde la salida, si se va en coche y se sabe la distancia. */
function parteCoche(o, distancia, coche, supuestos) {
  if (!distancia || distancia.minutos == null || !coche?.consumoL100km || !coche?.precioLitro) return null;
  const km = distancia.kmCoche ?? distancia.km * FACTOR_CARRETERA;
  const l = (2 * km * coche.consumoL100km) / 100;
  supuestos.push(`un coche para todos, ${litros(coche.consumoL100km)} l/100 km a ${euros(coche.precioLitro)}/l${distancia.kmCoche == null ? ', distancia por carretera estimada' : ''}; sin peajes ni aparcamiento`);
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
 * @returns {{partes: object[], total: number|null, porPersona: number|null, estimado: number, falta: string[], supuestos: string[], viajeros: number, noches: number|null}}
 */
export function costeViaje(o, { viajeros = 2, noches = 2, distancia = null, coche = null } = {}) {
  const supuestos = [];
  const falta = [];
  const resultado = (partes) => {
    const total = falta.length ? null : redondear(partes.reduce((suma, p) => suma + p.eur, 0));
    return {
      partes: partes.map((p) => ({ estimado: false, ...p, eur: redondear(p.eur) })),
      total,
      porPersona: total == null ? null : redondear(total / viajeros),
      estimado: redondear(partes.filter((p) => p.estimado).reduce((suma, p) => suma + p.eur, 0)),
      falta, supuestos, viajeros,
      // Las noches supuestas solo cuentan si el precio es por noche; si no, no se sabe.
      noches: esBillete(o) ? null : o.noches ?? (['pp/noche', 'noche'].includes(o.unidad) ? noches : null),
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
  supuestos.push('sin actividades ni comidas que no incluya la oferta');
  return resultado([...partes, gasolina]);
}

/** «≈ 312 € para 2 personas · 156 €/persona» para la tarjeta, o '' si no hay total. */
export function resumenCoste(c) {
  if (c.total == null) return '';
  return `${c.estimado ? '≈ ' : ''}${euros(Math.round(c.total))} en total para ${contar(c.viajeros, 'persona')}${c.viajeros > 1 ? ` · ${euros(Math.round(c.porPersona))}/persona` : ''}`;
}
