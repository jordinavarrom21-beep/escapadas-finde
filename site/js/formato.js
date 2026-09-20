/**
 * Formato de precios, duraciones, textos y HTML seguro. Sin DOM: se usa también
 * desde los tests de Node.
 */

const EUROS_ENTEROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const EUROS_DECIMALES = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

export const ETIQUETAS_UNIDAD = {
  pp: 'por persona',
  'pp/noche': 'por persona y noche',
  total: 'en total',
  'i/v': 'ida y vuelta',
  noche: 'por noche',
};

export const ETIQUETAS_REGIMEN = {
  'solo-alojamiento': 'Solo alojamiento',
  desayuno: 'Desayuno',
  'media-pension': 'Media pensión',
  'pension-completa': 'Pensión completa',
  'todo-incluido': 'Todo incluido',
};

export const ETIQUETAS_TRANSPORTE = { avion: '✈️ Avión', coche: '🚗 Coche', tren: '🚆 Tren', bus: '🚌 Autobús', ferry: '⛴️ Ferry' };

export const ETIQUETAS_TIPO = { vuelo: 'Vuelo', escapada: 'Escapada', hotel: 'Hotel', paquete: 'Paquete' };

/** 59 → «59 €» · 19.98 → «19,98 €» · null → «—». */
export function euros(valor) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '—';
  return (Number.isInteger(valor) ? EUROS_ENTEROS : EUROS_DECIMALES).format(valor);
}

/** 45 → «45 min» · 105 → «1 h 45 min» · 120 → «2 h». */
export function duracion(minutos) {
  if (typeof minutos !== 'number' || !Number.isFinite(minutos)) return '';
  const total = Math.max(0, Math.round(minutos));
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (!horas) return `${resto} min`;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

/** Tiempo que falta, redondeado hacia arriba al minuto: «2 d 5 h», «5 h 12 min», «8 min». */
export function cuentaAtras(ms) {
  const minutos = Math.max(0, Math.ceil(ms / 60_000));
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const resto = minutos % 60;
  if (dias) return `${dias} d ${horas} h`;
  if (horas) return `${horas} h ${resto} min`;
  return `${resto} min`;
}

/** «hace 5 min», «hace 3 h», «hace 2 días». */
export function haceCuanto(iso, ahora = new Date()) {
  const minutos = Math.round((ahora.getTime() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutos)) return '';
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

/** Texto seguro para insertar en HTML (contenido y atributos entre comillas). */
export function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** La URL si es http(s); si no, null (evita enlaces «javascript:» en datos externos). */
export function urlSegura(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

/** Sin tildes y en minúsculas, para buscar. */
export function normalizar(texto = '') {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Plural sencillo: (1, 'vuelo') → «1 vuelo» · (3, 'vuelo') → «3 vuelos». */
export function contar(n, singular, plural = `${singular}s`) {
  return `${n.toLocaleString('es-ES')} ${n === 1 ? singular : plural}`;
}

/**
 * Puntos «x,y» de una polilínea SVG para la serie de precios `[[día, precio], ...]`
 * dentro de un rectángulo `ancho × alto`. Cadena vacía si hay menos de dos puntos.
 */
export function puntosMinigrafica(serie, ancho = 96, alto = 28, margen = 2) {
  if (!Array.isArray(serie) || serie.length < 2) return '';
  const precios = serie.map(([, precio]) => precio);
  const minimo = Math.min(...precios);
  const maximo = Math.max(...precios);
  const paso = (ancho - 2 * margen) / (precios.length - 1);
  const redondear = (n) => Math.round(n * 10) / 10;
  return precios
    .map((precio, i) => {
      const y = maximo === minimo ? alto / 2 : margen + ((maximo - precio) / (maximo - minimo)) * (alto - 2 * margen);
      return `${redondear(margen + i * paso)},${redondear(y)}`;
    })
    .join(' ');
}
