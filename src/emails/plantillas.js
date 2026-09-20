/**
 * Plantillas de email: HTML con tablas y estilos en línea (compatible con Gmail y
 * apto para móvil) más su versión en texto plano.
 */
import { TEMAS } from '../modelo.js';
import { esChollazo } from '../enriquecer/puntuacion.js';
import { resumenVigilados } from '../vigilados.js';
import { etiquetaDia } from '../util/fechas.js';

const C = {
  fondo: '#f2f4f7', tarjeta: '#ffffff', texto: '#1d2530', suave: '#5d6878', borde: '#e2e6eb',
  acento: '#0b63c4', precio: '#0a7a3a', aviso: '#b54708',
};
const MAX_POR_SECCION = 6;
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
const UNIDADES = { 'i/v': 'ida y vuelta', pp: 'por persona', 'pp/noche': 'por persona y noche', total: 'en total', noche: 'por noche' };
const EMOJI_TEMA = Object.fromEntries(TEMAS.map((t) => [t.id, t.emoji]));
const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** «62,48 € ida y vuelta», o el texto de la web si no hay precio numérico. */
export function precioLegible(oferta) {
  if (oferta.precio == null) return oferta.precioTexto || 'Ver precio';
  const unidad = UNIDADES[oferta.unidad];
  return unidad ? `${euros.format(oferta.precio)} ${unidad}` : euros.format(oferta.precio);
}

function duracionCoche(minutos) {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return horas ? `${horas} h${resto ? ` ${resto} min` : ''}` : `${resto} min`;
}

// Línea de detalle bajo el título: lugar, fechas, coche, temas…
function detalle(oferta) {
  const partes = [];
  if (oferta.vuelo) partes.push(oferta.descripcion);
  else if (oferta.lugar?.nombre) partes.push(oferta.lugar.nombre);
  if (!oferta.vuelo && oferta.fechas.salida) partes.push(etiquetaDia(oferta.fechas.salida));
  if (oferta.noches) partes.push(`${oferta.noches} ${oferta.noches === 1 ? 'noche' : 'noches'}`);
  if (oferta.cocheMin != null) partes.push(`🚗 ${duracionCoche(oferta.cocheMin)}${oferta.cocheEstimado ? ' aprox.' : ''}`);
  const temas = oferta.temas.map((t) => EMOJI_TEMA[t]).filter(Boolean).join('');
  if (temas) partes.push(temas);
  return partes.join(' · ');
}

function distintivos(oferta) {
  const lista = [];
  if (oferta.vuelo?.horarioIdeal) lista.push('horario ideal');
  if (oferta.minimoHistorico) lista.push('mínimo histórico');
  if (oferta.bajada) lista.push(`ha bajado ${euros.format(oferta.bajada)}`);
  if (oferta.etiquetas.includes('error-tarifa')) lista.push('¡error de tarifa!');
  return lista;
}

/** Una fila es una oferta, o una oferta con etiquetas extra: `{oferta, extras: ['ha bajado 5 €']}`. */
const comoFila = (fila) => (fila.oferta ? { extras: [], ...fila } : { oferta: fila, extras: [] });

function filaHtml(fila) {
  const { oferta, extras } = comoFila(fila);
  const marcas = [...extras, ...distintivos(oferta)]
    .map((d) => `<span style="display:inline-block;margin:4px 4px 0 0;padding:2px 8px;border-radius:10px;background:#e8f3ec;color:${C.precio};font-size:12px">${esc(d)}</span>`)
    .join('');
  return `<tr><td style="padding:12px 0;border-bottom:1px solid ${C.borde}">
<a href="${esc(oferta.url)}" style="color:${C.acento};font-weight:600;font-size:16px;text-decoration:none">${esc(oferta.titulo)}</a>
<div style="color:${C.suave};font-size:13px;margin-top:2px">${esc(detalle(oferta))}</div>
<div style="color:${C.precio};font-weight:700;font-size:15px;margin-top:4px">${esc(precioLegible(oferta))}</div>${marcas}
</td></tr>`;
}

function seccionHtml({ titulo, ofertas, vacio, nota = '' }) {
  const cuerpo = ofertas.length
    ? ofertas.map(filaHtml).join('')
    : `<tr><td style="padding:8px 0;color:${C.suave};font-size:14px">${esc(vacio)}</td></tr>`;
  return `<tr><td style="padding:20px 24px 4px"><h2 style="margin:0;font-size:18px;color:${C.texto}">${esc(titulo)}</h2>${
    nota ? `<p style="margin:4px 0 0;color:${C.suave};font-size:13px">${esc(nota)}</p>` : ''}</td></tr>
<tr><td style="padding:0 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${cuerpo}</table></td></tr>`;
}

function envolver({ titulo, intro, secciones, panelUrl, avisos = [] }) {
  const listaAvisos = avisos.length
    ? `<tr><td style="padding:16px 24px 0"><ul style="margin:0;padding-left:18px;color:${C.aviso};font-size:14px">${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></td></tr>`
    : '';
  const boton = panelUrl
    ? `<tr><td style="padding:24px" align="center"><a href="${esc(panelUrl)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${C.acento};color:#ffffff;font-weight:600;text-decoration:none">Abrir el panel</a></td></tr>`
    : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:${C.fondo};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.fondo}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:${C.tarjeta};border-radius:12px;border:1px solid ${C.borde}">
<tr><td style="padding:24px 24px 0"><div style="font-size:13px;color:${C.suave}">🧳 Escapadas Finde</div>
<h1 style="margin:6px 0 0;font-size:22px;color:${C.texto}">${esc(titulo)}</h1>
${intro ? `<p style="margin:8px 0 0;color:${C.suave};font-size:14px">${esc(intro)}</p>` : ''}</td></tr>
${listaAvisos}
${secciones.map(seccionHtml).join('\n')}
${boton}
<tr><td style="padding:16px 24px;border-top:1px solid ${C.borde};color:${C.suave};font-size:12px" align="center">Escapadas Finde · vigilando 24/7</td></tr>
</table></td></tr></table></body></html>`;
}

function textoPlano({ titulo, intro, secciones, panelUrl }) {
  const lineas = [titulo, intro ?? '', ''];
  for (const { titulo: t, ofertas, vacio, nota } of secciones) {
    lineas.push(`== ${t} ==`);
    if (nota) lineas.push(nota);
    if (!ofertas.length) lineas.push(vacio);
    for (const fila of ofertas) {
      const { oferta: o, extras } = comoFila(fila);
      lineas.push(`- ${o.titulo} — ${precioLegible(o)}${extras.length ? ` · ${extras.join(' · ')}` : ''}`, `  ${detalle(o)}`, `  ${o.url}`);
    }
    lineas.push('');
  }
  if (panelUrl) lineas.push(`Panel: ${panelUrl}`);
  lineas.push('Escapadas Finde · vigilando 24/7');
  return lineas.filter((l, i, todas) => l !== '' || todas[i - 1] !== '').join('\n');
}

const construir = (contenido) => ({ asunto: contenido.asunto, html: envolver(contenido), texto: textoPlano(contenido) });
const mejores = (ofertas, criterio = (a, b) => b.puntuacion - a.puntuacion) => [...ofertas].sort(criterio).slice(0, MAX_POR_SECCION);
const porPrecio = (a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity);

/**
 * Sección «⭐ Tus vigilados»: por cada criterio activo, cuántas ofertas cumple y
 * la mejor de todas con su precio. Sin vigilados, no sale la sección.
 */
function seccionVigilados(ofertas, vigilados) {
  const resumen = resumenVigilados(ofertas, vigilados);
  if (!resumen.length) return [];
  const conCoincidencias = resumen.filter((r) => r.total);
  const sinCoincidencias = resumen.filter((r) => !r.total).map((r) => r.criterio.nombre);
  const mostrados = conCoincidencias.slice(0, MAX_POR_SECCION);
  const notas = [
    mostrados.length < conCoincidencias.length && `Y ${conCoincidencias.length - mostrados.length} vigilados más con coincidencias, en el panel.`,
    sinCoincidencias.length && `Sin coincidencias ahora mismo: ${sinCoincidencias.join(', ')}.`,
  ].filter(Boolean);
  return [{
    titulo: '⭐ Tus vigilados',
    nota: notas.join(' '),
    ofertas: mostrados.map(({ criterio, total, mejor }) => ({
      oferta: mejor,
      extras: [`⭐ ${criterio.nombre}`, `${total} ${total === 1 ? 'coincidencia' : 'coincidencias'}`],
    })),
    vacio: 'Ninguno de tus vigilados tiene coincidencias ahora mismo.',
  }];
}

/** Resumen del viernes: tus vigilados, vuelos del finde, próximo puente, escapadas y chollazos. */
export function resumenSemanal({ ofertas, findes, puentes, ajustes, vigilados = [], panelUrl, ahora = new Date() }) {
  const [finde, siguiente] = findes;
  const idsFindes = [finde?.id, siguiente?.id].filter(Boolean);
  const vuelosConFecha = ofertas.filter((o) => o.vuelo && idsFindes.includes(o.fechas.findeId));
  const vuelos = vuelosConFecha.length
    ? mejores(vuelosConFecha, porPrecio)
    : mejores(ofertas.filter((o) => o.tipo === 'vuelo'));
  const puente = puentes.find((p) => p.hasta >= (finde?.viernes ?? ''));
  const escapadas = mejores(ofertas.filter((o) => o.tipo !== 'vuelo'));
  const chollazos = mejores(ofertas.filter((o) =>
    esChollazo(o, ajustes) && o.vistaPrimera && ahora - Date.parse(o.vistaPrimera) <= SEMANA_MS));
  const secciones = [
    ...seccionVigilados(ofertas, vigilados),
    { titulo: vuelosConFecha.length ? '✈️ Vuelos para este finde y el siguiente' : '✈️ Chollos de vuelos', ofertas: vuelos, vacio: 'Hoy no hay vuelos destacados.' },
    ...(puente ? [{
      titulo: `🗓️ Puente de ${puente.nombre} · ${puente.etiqueta}`,
      ofertas: mejores(ofertas.filter((o) => o.fechas.puenteId === puente.id)),
      vacio: 'Todavía no hay ofertas con fechas para este puente: echa un vistazo al panel.',
    }] : []),
    { titulo: '🏨 Las mejores escapadas', ofertas: escapadas, vacio: 'No hay escapadas nuevas.' },
    { titulo: '🔥 Chollazos de la semana', ofertas: chollazos, vacio: 'Esta semana no ha habido chollazos.' },
  ];
  const desde = vuelos.find((o) => o.precio != null)?.precio;
  return construir({
    asunto: `Tu finde ${finde?.etiqueta ?? ''}: ${desde != null ? `vuelos desde ${euros.format(desde)} y ` : ''}${escapadas.length} ${escapadas.length === 1 ? 'escapada' : 'escapadas'}`,
    titulo: `Tu finde ${finde?.etiqueta ?? ''}`,
    intro: 'Lo mejor que he encontrado esta semana para escaparte.',
    secciones,
    panelUrl,
  });
}

/** Alerta inmediata con los chollazos nuevos. */
export function alertaChollazos({ ofertas, panelUrl }) {
  const [primera] = ofertas;
  return construir({
    asunto: `🔥 ${ofertas.length === 1 ? 'Chollazo' : `${ofertas.length} chollazos`}: ${primera.titulo} (${precioLegible(primera)})`,
    titulo: ofertas.length === 1 ? 'Ha aparecido un chollazo' : `Han aparecido ${ofertas.length} chollazos`,
    intro: 'Ofertas excepcionales detectadas ahora mismo. Suelen durar poco.',
    secciones: [{ titulo: '🔥 Chollazos', ofertas: mejores(ofertas), vacio: '' }],
    panelUrl,
  });
}

/** «ha bajado 5,00 € (−20 %) desde el último aviso», o que es la primera vez. */
function textoBajada(oferta, anterior) {
  if (anterior == null) return 'primer aviso de este vigilado';
  const bajada = anterior - oferta.precio;
  const porcentaje = anterior > 0 ? ` (−${Math.round((bajada / anterior) * 100)} %)` : '';
  return `ha bajado ${euros.format(bajada)}${porcentaje} desde el último aviso (${euros.format(anterior)})`;
}

/**
 * Alerta de ofertas que cumplen un criterio vigilado y han bajado de precio.
 * @param {{coincidencias: {criterio: Object, oferta: Object, anterior: number|null}[], panelUrl: string}} datos
 */
export function alertaVigilados({ coincidencias, panelUrl }) {
  const porCriterio = new Map();
  for (const coincidencia of coincidencias) {
    const { nombre } = coincidencia.criterio;
    if (!porCriterio.has(nombre)) porCriterio.set(nombre, []);
    porCriterio.get(nombre).push(coincidencia);
  }
  const nombres = [...porCriterio.keys()];
  const secciones = nombres.map((nombre) => {
    const lista = porCriterio.get(nombre);
    const { precioMax } = lista[0].criterio;
    return {
      titulo: `⭐ ${nombre}`,
      nota: precioMax != null ? `Tu precio objetivo: ${euros.format(precioMax)}.` : '',
      ofertas: mejores(lista, (a, b) => porPrecio(a.oferta, b.oferta))
        .map(({ oferta, anterior = null }) => ({ oferta, extras: [textoBajada(oferta, anterior)] })),
      vacio: '',
    };
  });
  return construir({
    asunto: `⭐ Bajada en tus vigilados: ${nombres.join(', ')}`,
    titulo: 'Novedades en lo que vigilas',
    intro: 'Estas ofertas cumplen tus criterios y están por debajo del último precio que te avisé.',
    secciones,
    panelUrl,
  });
}

/** Aviso de fuentes que llevan tiempo fallando. */
export function alertaFuentes({ fuentes, panelUrl, ahora = new Date() }) {
  const horas = (iso) => Math.round((ahora - Date.parse(iso)) / 3_600_000);
  const lineas = fuentes.map((f) => `${f.nombre}: falla desde hace ${horas(f.desdeError)} h (${f.error})`);
  const html = envolver({
    titulo: 'Hay fuentes que no funcionan',
    intro: 'Las demás siguen vigilando con normalidad. Si una web ha cambiado, habrá que ajustar su lector.',
    secciones: [],
    avisos: lineas,
    panelUrl,
  });
  return {
    asunto: `⚠️ ${fuentes.length === 1 ? `${fuentes[0].nombre} no funciona` : `${fuentes.length} fuentes no funcionan`}`,
    html,
    texto: ['Hay fuentes que no funcionan:', ...lineas.map((l) => `- ${l}`), panelUrl ? `Panel: ${panelUrl}` : ''].join('\n'),
  };
}
