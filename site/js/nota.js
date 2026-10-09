/**
 * Por qué una oferta tiene su nota del chollo, en frases que se pueden comprobar con los
 * datos de la propia oferta. Usa `notaDetalle`, que calcula el escaneo (puntuacion.js):
 * los puntos de cada parte y con cuántas ofertas parecidas se compara el precio. Sin DOM.
 */
import { contar, duracion, euros, nota } from './formato.js';

/** Máximo de cada parte (los pesos de src/enriquecer/puntuacion.js). */
export const MAXIMOS = {
  precio: 45, bajada: 15, descuento: 10, opiniones: 10, novedad: 10, senales: 10, comodidad: 5, fechas: 5, favorito: 10,
};

const GRUPOS = {
  noche: ['escapada parecida', 'escapadas parecidas'],
  'vuelo-iv': ['vuelo de ida y vuelta', 'vuelos de ida y vuelta'],
  vuelo: ['vuelo', 'vuelos'],
  otros: ['oferta del mismo tipo', 'ofertas del mismo tipo'],
};

/** «Más barata que 180 de 206 escapadas parecidas (87 %)». */
function textoPrecio(c) {
  if (!c?.parecidas) return 'Precio: no hay ofertas parecidas con las que compararla';
  const [uno, varios] = GRUPOS[c.grupo] ?? GRUPOS.otros;
  const nombre = c.parecidas === 1 ? uno : varios;
  const pct = Math.round((c.masCaras / c.parecidas) * 100);
  if (pct >= 50) return `Más barata que el ${pct} % de ${c.parecidas} ${nombre}`;
  return `Precio normal: ${c.parecidas - c.masCaras} de ${c.parecidas} ${nombre} son más baratas`;
}

function textoDescuento(o) {
  const pct = o.descuento ?? (o.precioAnterior > o.precio ? Math.round(((o.precioAnterior - o.precio) / o.precioAnterior) * 100) : 0);
  return pct ? `La web la rebaja un ${pct} %${o.precioAnterior > o.precio ? ` (antes ${euros(o.precioAnterior)})` : ''}` : 'Rebajada en la web';
}

function textoSenales(o) {
  const etiquetas = o.etiquetas ?? [];
  const temperatura = Number(etiquetas.find((e) => e.startsWith('temperatura:'))?.slice(12) ?? 0);
  return [
    etiquetas.includes('error-tarifa') && 'publicada como error de tarifa',
    etiquetas.includes('top-chollo') && 'destacada por su propia web',
    temperatura >= 100 && `muy votada en Chollometro (${temperatura}°)`,
  ].filter(Boolean).join(', ').replace(/^./, (l) => l.toUpperCase()) || 'Señales de la comunidad';
}

const TEXTOS = {
  precio: (o, d) => textoPrecio(d.comparacion),
  bajada: (o) => (o.minimoHistorico ? 'Es el precio más bajo que se ha visto' : o.bajada > 0 ? `Ha bajado ${euros(o.bajada)} desde que se sigue` : 'Ha bajado de precio'),
  descuento: textoDescuento,
  opiniones: (o) => (o.valoracion?.nota >= 0
    ? `Los clientes le dan un ${nota(o.valoracion.nota)}${o.valoracion.n ? ` (${contar(o.valoracion.n, 'opinión', 'opiniones')})` : ''}`
    : 'Buenas opiniones'),
  novedad: (o, d, ahora) => {
    const horas = (ahora - Date.parse(o.conocidaDesde ?? o.vistaPrimera)) / 3_600_000;
    return horas <= 24 ? 'Acaba de aparecer (menos de un día)' : 'Nueva: apareció hace menos de 3 días';
  },
  senales: textoSenales,
  comodidad: (o) => (o.vuelo?.horarioIdeal ? 'Horario cómodo: sale por la tarde y vuelve tarde'
    : o.cocheMin != null ? `Cerca: ${duracion(o.cocheMin)} en coche` : 'Fácil de llegar'),
  fechas: (o) => (o.fechas?.puenteId ? 'Cae en un puente' : 'Es para el finde que viene'),
  favorito: () => 'Tiene un tema de los que te gustan',
};

/**
 * Motivos de la nota, de más a menos puntos: `[{clave, texto, puntos, maximo}]`.
 * Vacío si la oferta no trae desglose (datos de antes de este cambio).
 */
export function motivosNota(o, ahora = new Date()) {
  const d = o.notaDetalle;
  if (!d?.partes) return [];
  // El precio sale aunque no sume: «precio normal» también explica la nota.
  const partes = d.comparacion?.parecidas && !('precio' in d.partes) ? { precio: 0, ...d.partes } : d.partes;
  return Object.entries(partes)
    .map(([clave, puntos]) => ({ clave, puntos, maximo: MAXIMOS[clave] ?? puntos, texto: TEXTOS[clave]?.(o, d, ahora) ?? clave }))
    .sort((a, b) => b.puntos - a.puntos);
}

/**
 * El motivo principal en una línea para la tarjeta: el precio si destaca y, si no, lo que
 * más puntos da. Con desglose y sin nada que destacar, lo dice.
 */
export function motivoPrincipal(o, ahora = new Date(), { corto = false } = {}) {
  const d = o.notaDetalle;
  if (!d) return null;
  if (d.evitada) return 'Al fondo: es de algo que pides evitar';
  const motivos = motivosNota(o, ahora);
  if (!motivos.some((m) => m.puntos > 0)) return motivos[0]?.texto ?? 'Sin nada que la haga destacar';
  const precio = motivos.find((m) => m.clave === 'precio');
  const [primero] = precio && precio.puntos >= MAXIMOS.precio / 2 ? [precio] : motivos;
  const segundo = motivos.find((m) => m !== primero && m.puntos >= 3);
  return segundo && !corto ? `${primero.texto} · ${segundo.texto.replace(/^./, (l) => l.toLowerCase())}` : primero.texto;
}
