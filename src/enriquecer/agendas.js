/**
 * Agendas de eventos (conciertos, fiestas, ferias, teatro, actividades para niños…) por
 * zona. Cada proveedor descarga lo de los próximos días de su zona y lo devuelve con el
 * mismo formato: {nombre, desde, hasta, lat, lon, url, municipio, tipo, precio}.
 * eventos.js reparte después a cada oferta lo que pasa cerca esos días.
 *
 * Fuentes (todas públicas; Ticketmaster solo con clave):
 *  - Cataluña: «Agenda cultural de Catalunya» (Dades Obertes, Socrata) — ver eventos.js.
 *  - Euskadi: Kulturklik (api.euskadi.eus), con tipos (concierto, fiestas, feria…).
 *  - Castilla y León: agenda cultural geolocalizada (Opendatasoft de la Junta).
 *  - Madrid: agenda municipal de los próximos 100 días (datos.madrid.es).
 *  - Toda España: Ticketmaster Discovery (conciertos, festivales, deporte, teatro) si hay
 *    TICKETMASTER_KEY (gratis: developer.ticketmaster.com).
 */
import { normalizarTexto } from '../util/xml.js';

/** Tipos de evento que entiende el panel, con cómo se reconocen en el nombre si la fuente no lo dice. */
export const TIPOS_EVENTO = ['musica', 'fiestas', 'festivales', 'ferias', 'escena', 'familia', 'exposiciones', 'cine', 'deporte', 'otros'];
const PISTAS_TIPO = [
  ['festivales', /\bfestival|jaialdi/],
  ['fiestas', /\bfiesta|\bfesta\b|\bfestes\b|verbena|romeria|aplec|carnaval|moros y cristianos|\bjaiak?\b|san fermin|patronales/],
  ['ferias', /\bferia|\bfira\b|\bfires\b|mercado|mercat\b|mercats\b|mercadillo|medieval|azoka/],
  ['musica', /concierto|concert|musica|\bjazz|\brock|\bpop\b|coral|orquesta|orquestra|flamenco|recital|kontzertu|\bdj\b/],
  ['familia', /infantil|\bninos|familia|familiar|cuentacuentos|titeres|titelles|\bhaur/],
  ['escena', /teatro|teatre|danza|dansa|monologo|espectacul|espectacle|circo|circ\b|opera|zarzuela|antzerki|dantza|humor/],
  ['exposiciones', /exposicion|exposicio|muestra|erakusketa|arts-visuals/],
  ['cine', /\bcine|cinema|pelicula|proyeccion|film|zinema/],
  ['deporte', /carrera|marat|partido|futbol|baloncesto|ciclis|trail|deporte/],
];

/** El tipo de un evento a partir de lo que dice su fuente (o su nombre si no dice nada útil). */
export function tipoEvento(...textos) {
  const t = normalizarTexto(textos.filter(Boolean).join(' '));
  return PISTAS_TIPO.find(([, re]) => re.test(t))?.[0] ?? 'otros';
}

const enCaja = (c) => ({ lat, lon }) => lat >= c.latMin && lat <= c.latMax && lon >= c.lonMin && lon <= c.lonMax;
const numero = (v) => (v === '' || v == null ? NaN : Number(v));
const dia = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const url = (...candidatas) => candidatas.map((u) => (typeof u === 'string' ? u.trim() : '')).find((u) => /^https?:\/\//.test(u)) ?? null;
const cancelado = (nombre) => /^\s*\(?\s*(cancelad|suspendid|aplazad|bertan behera)/i.test(nombre ?? '');

/** Evento propio, o null si le falta lo imprescindible (nombre, fecha y sitio) o está cancelado. */
export function evento({ nombre, desde, hasta, lat, lon, ...resto }) {
  const [la, lo] = [numero(lat), numero(lon)];
  const inicio = dia(desde);
  if (!nombre?.trim() || cancelado(nombre) || !inicio || !Number.isFinite(la) || !Number.isFinite(lo)) return null;
  const fin = dia(hasta);
  return { nombre: nombre.trim().replace(/\s+/g, ' '), desde: inicio, hasta: fin && fin >= inicio ? fin : inicio, lat: la, lon: lo, url: null, municipio: null, tipo: 'otros', precio: null, ...resto };
}

// ── Euskadi (Kulturklik) ─────────────────────────────────────────────────────

const TIPOS_EUSKADI = {
  Concierto: 'musica', Teatro: 'escena', Danza: 'escena', Bertsolarismo: 'escena', Exposición: 'exposiciones',
  Feria: 'ferias', 'Cine y audiovisuales': 'cine', Festival: 'festivales', 'Actividad Infantil': 'familia', Fiestas: 'fiestas',
};
const MAX_PAGINAS_EUSKADI = 30;

export const euskadi = {
  id: 'euskadi',
  nombre: 'Kulturklik (Euskadi)',
  zona: enCaja({ latMin: 42.4, latMax: 43.5, lonMin: -3.5, lonMax: -1.0 }), // con Navarra, que también sale en Kulturklik
  /** Viene por orden de fecha: se pide página a página hasta pasar `hasta`. */
  async descargar(ctx, desde, hasta) {
    const eventos = [];
    for (let pagina = 1; pagina <= MAX_PAGINAS_EUSKADI; pagina += 1) {
      if (pagina > 1) await ctx.http.esperar(1000);
      const r = await ctx.http.json(`https://api.euskadi.eus/culture/events/v1.0/events/upcoming?_elements=200&_page=${pagina}`);
      if (!Array.isArray(r?.items)) throw new Error('respuesta inesperada de Kulturklik');
      for (const it of r.items) {
        const e = evento({
          nombre: it.nameEs, desde: it.startDate, hasta: it.endDate, lat: it.municipalityLatitude, lon: it.municipalityLongitude,
          municipio: it.municipalityEs ?? null, url: url(it.urlEventEs, it.sourceUrlEs, it.purchaseUrlEs),
          tipo: TIPOS_EUSKADI[it.typeEs] ?? tipoEvento(it.nameEs, it.typeEs), precio: it.priceEs?.trim() || null,
        });
        if (e && e.hasta >= desde && e.desde <= hasta) eventos.push(e);
      }
      const ultimo = dia(r.items.at(-1)?.startDate);
      if (pagina >= (r.totalPages ?? 1) || !ultimo || ultimo > hasta) break;
    }
    return eventos;
  },
};

// ── Castilla y León (Opendatasoft) ───────────────────────────────────────────

const RECURSO_JCYL = 'https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/eventos-de-la-agenda-cultural-categorizados-y-geolocalizados/records';
const MAX_JCYL = 2000;

export const castillaLeon = {
  id: 'castilla-leon',
  nombre: 'Agenda cultural de Castilla y León',
  zona: enCaja({ latMin: 40.05, latMax: 43.25, lonMin: -7.1, lonMax: -1.75 }),
  async descargar(ctx, desde, hasta) {
    const eventos = [];
    for (let offset = 0; offset < MAX_JCYL; offset += 100) {
      if (offset) await ctx.http.esperar(500);
      const p = new URLSearchParams({
        where: `fecha_inicio <= date'${hasta}' AND (fecha_fin >= date'${desde}' OR (fecha_fin IS NULL AND fecha_inicio >= date'${desde}'))`,
        order_by: 'fecha_inicio', limit: '100', offset: String(offset),
      });
      const r = await ctx.http.json(`${RECURSO_JCYL}?${p}`);
      if (!Array.isArray(r?.results)) throw new Error('respuesta inesperada del portal de Castilla y León');
      for (const f of r.results) {
        const e = evento({
          nombre: f.titulo?.replace(/^['"«]|['"»]$/g, ''), desde: f.fecha_inicio, hasta: f.fecha_fin, lat: f.latitud ?? f.posicion?.lat, lon: f.longitud ?? f.posicion?.lon,
          municipio: f.nombre_localidad ?? null, url: url(f.enlace_contenido),
          tipo: tipoEvento(f.categoria, f.tematica, f.destinatarios?.includes('infantil') ? 'infantil' : '', f.titulo), precio: f.precio || null,
        });
        if (e) eventos.push(e);
      }
      if (r.results.length < 100 || offset + 100 >= (r.total_count ?? 0)) break;
    }
    return eventos;
  },
};

// ── Madrid (datos.madrid.es) ─────────────────────────────────────────────────

const TIPOS_MADRID = {
  Musica: 'musica', TeatroPerformance: 'escena', DanzaBaile: 'escena', Exposiciones: 'exposiciones', CineActividadesAudiovisuales: 'cine',
  CuentacuentosTiteresMarionetas: 'familia', ActividadesCalleArteUrbano: 'fiestas', FiestasPopulares: 'fiestas', Fiestas: 'fiestas',
  Circo: 'escena', ComemoracionesHomenajes: 'otros', DeportesActividadesDeportivas: 'deporte',
};

export const madrid = {
  id: 'madrid',
  nombre: 'Agenda de Madrid',
  zona: enCaja({ latMin: 39.85, latMax: 41.2, lonMin: -4.6, lonMax: -3.0 }),
  async descargar(ctx, desde, hasta) {
    const r = await ctx.http.json('https://datos.madrid.es/egob/catalogo/206974-0-agenda-eventos-culturales-100.json');
    if (!Array.isArray(r?.['@graph'])) throw new Error('respuesta inesperada de datos.madrid.es');
    return r['@graph'].map((it) => {
      const tipoMadrid = String(it['@type'] ?? '').split('/').pop();
      return evento({
        nombre: it.title, desde: it.dtstart, hasta: it.dtend, lat: it.location?.latitude, lon: it.location?.longitude,
        municipio: 'Madrid', url: url(it.link), precio: it.free === 1 ? 'Gratis' : (it.price || null),
        tipo: TIPOS_MADRID[tipoMadrid] ?? tipoEvento(it.title, tipoMadrid, it.audience),
      });
    }).filter((e) => e && e.hasta >= desde && e.desde <= hasta);
  },
};

// ── Toda España: Ticketmaster (con clave) ────────────────────────────────────

const TIPOS_TM = { Music: 'musica', 'Arts & Theatre': 'escena', Family: 'familia', Sports: 'deporte', Film: 'cine' };
/** La API no deja pasar de 1.000 resultados por búsqueda (5 páginas de 200). */
const PAGINAS_TM = 5;

export const ticketmaster = {
  id: 'ticketmaster',
  // 2: solo eventos de Ticketmaster (antes entraban los de Universe, entradas diarias a monumentos).
  version: 2,
  nombre: 'Ticketmaster',
  zona: () => true,
  activo: (ctx) => Boolean(ctx.env?.TICKETMASTER_KEY),
  async descargar(ctx, desde, hasta) {
    const eventos = [];
    for (let pagina = 0; pagina < PAGINAS_TM; pagina += 1) {
      if (pagina) await ctx.http.esperar(300);
      const p = new URLSearchParams({
        // Solo Ticketmaster: Universe trae entradas diarias a catedrales y museos (no son eventos)
        // y se comían casi todo el cupo de 1.000 resultados.
        apikey: ctx.env.TICKETMASTER_KEY, countryCode: 'ES', source: 'ticketmaster', locale: '*', size: '200', page: String(pagina), sort: 'date,asc',
        startDateTime: `${desde}T00:00:00Z`, endDateTime: `${hasta}T23:59:59Z`,
      });
      const r = await ctx.http.json(`https://app.ticketmaster.com/discovery/v2/events.json?${p}`);
      const lista = r?._embedded?.events ?? [];
      for (const ev of lista) {
        const sitio = ev._embedded?.venues?.[0];
        const segmento = ev.classifications?.[0]?.segment?.name;
        const genero = ev.classifications?.[0]?.genre?.name;
        const precio = ev.priceRanges?.[0];
        const e = evento({
          nombre: ev.name, desde: ev.dates?.start?.localDate, hasta: ev.dates?.end?.localDate, lat: sitio?.location?.latitude, lon: sitio?.location?.longitude,
          municipio: sitio?.city?.name ?? null, url: url(ev.url),
          tipo: /festival/i.test(`${ev.name} ${genero}`) ? 'festivales' : TIPOS_TM[segmento] ?? tipoEvento(ev.name, genero),
          precio: precio?.min ? `desde ${Math.round(precio.min)} €` : null,
        });
        if (e) eventos.push(e);
      }
      if (!r?.page || pagina + 1 >= r.page.totalPages) break;
    }
    return eventos;
  },
};

/** Los proveedores además del de Cataluña (que vive en eventos.js por compatibilidad). */
export const PROVEEDORES = [euskadi, castillaLeon, madrid, ticketmaster];
