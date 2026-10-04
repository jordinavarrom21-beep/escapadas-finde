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
 *  - Comunitat Valenciana: agenda del Institut Valencià de Cultura (dadesobertes.gva.es):
 *    teatro, cine y música con coordenadas.
 *  - Zaragoza: agenda municipal (zaragoza.es, API de datos abiertos), con categorías y sitio.
 *  - Málaga: agenda municipal del año (datosabiertos.malaga.eu, CSV); sin coordenadas, en el
 *    centro de la ciudad.
 *  - Toda España: Ticketmaster Discovery (conciertos, festivales, deporte, teatro) si hay
 *    TICKETMASTER_KEY (gratis: developer.ticketmaster.com).
 */
import { normalizarTexto, textoPlano } from '../util/xml.js';

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
/**
 * Lo que publican las agendas y no es un plan para quien va de escapada: abonos de temporada,
 * entrenamientos y sesiones para profesionales, y funciones o visitas para colegios y escuelas.
 */
const NO_ES_UN_PLAN = new RegExp([
  /^(gran )?(abono|abonos|abonament|abonaments|abonnement)\b/,
  /\bentrenamientos?\b|\bentrenaments?\b/,
  /para profesionales|per a professionals/,
  /para (escuelas|colegios|centros educativos|escolares)|per a (escoles|centres educatius)/,
  /campana escolar|campanya escolar|(funcion|funciones|sesion|sesiones) escolar(es)?\b/,
].map((re) => re.source).join('|'));
export const noEsUnPlan = (nombre) => NO_ES_UN_PLAN.test(normalizarTexto(nombre));

/**
 * Evento propio, o null si le falta lo imprescindible (nombre, fecha y sitio), está cancelado
 * o no es un plan. El nombre, en texto plano (alguna agenda trae entidades como «&#263;»).
 */
export function evento({ nombre, desde, hasta, lat, lon, ...resto }) {
  const [la, lo] = [numero(lat), numero(lon)];
  const inicio = dia(desde);
  const limpio = textoPlano(nombre ?? '');
  if (!limpio || cancelado(limpio) || noEsUnPlan(limpio) || !inicio || !Number.isFinite(la) || !Number.isFinite(lo)) return null;
  const fin = dia(hasta);
  return { nombre: limpio, desde: inicio, hasta: fin && fin >= inicio ? fin : inicio, lat: la, lon: lo, url: null, municipio: null, tipo: 'otros', precio: null, ...resto };
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

// ── Comunitat Valenciana (Institut Valencià de Cultura) ─────────────────────

const URL_GVA = 'https://dadesobertes.gva.es/dataset/25cc4d21-e1dd-4d05-b057-dbcc44d4338c/resource/15084e00-c416-4b4d-b229-7a06f4bf07b0/download/lista-de-actividades-culturales-programadas-por-el-ivc.json';
const TIPOS_GVA = { 'Artes escénicas': 'escena', pelicula: 'cine', 'Audiovisuales y Cinematografía': 'cine', 'Música y cultura popular valenciana': 'musica' };
/** «12/01/2026» → «2026-01-12». */
const diaEspanol = (v) => (typeof v === 'string' && /^\d{2}\/\d{2}\/\d{4}/.test(v.trim()) ? `${v.trim().slice(6, 10)}-${v.trim().slice(3, 5)}-${v.trim().slice(0, 2)}` : null);

export const valenciana = {
  id: 'valenciana',
  // 2: sin abonos ni entrenamientos para profesionales (ver `noEsUnPlan`).
  version: 2,
  nombre: 'Agenda del Institut Valencià de Cultura',
  zona: enCaja({ latMin: 37.8, latMax: 40.8, lonMin: -1.6, lonMax: 0.6 }),
  async descargar(ctx, desde, hasta) {
    const r = await ctx.http.json(URL_GVA);
    if (!Array.isArray(r?.data)) throw new Error('respuesta inesperada de dadesobertes.gva.es');
    // Cada campo viene en su propio objeto, uno detrás de otro: un evento empieza en «titulo_evento».
    const registros = [];
    for (const campo of r.data) {
      if (!campo || typeof campo !== 'object') continue;
      if ('titulo_evento' in campo) registros.push({});
      if (registros.length) Object.assign(registros.at(-1), campo);
    }
    return registros.map((g) => evento({
      nombre: g.titulo_evento, desde: diaEspanol(g.fecha_inicio), hasta: diaEspanol(g.fecha_fin), lat: g.latitud, lon: g.longitud,
      municipio: g.municipio?.trim() || null, url: url(g.web), precio: g.precio?.trim() || null,
      tipo: TIPOS_GVA[g.tipo_evento] ?? tipoEvento(g.titulo_evento, g.tipo_evento),
    })).filter((e) => e && e.hasta >= desde && e.desde <= hasta);
  },
};

// ── Zaragoza (API de datos abiertos del Ayuntamiento) ───────────────────────

const URL_ZARAGOZA = 'https://www.zaragoza.es/sede/servicio/cultura/evento/list.json';
const TIPOS_ZARAGOZA = {
  Música: 'musica', 'Teatro y Artes Escénicas': 'escena', Cine: 'cine', 'Imagen y sonido': 'cine', 'Ferias y Fiestas': 'fiestas',
  Exposiciones: 'exposiciones', 'Artes plásticas': 'exposiciones', Deporte: 'deporte', 'Ocio y Juegos': 'familia',
  'Actividades vacacionales': 'familia', Gastronomía: 'ferias',
};
/** Cursos, formación y empleo no son un plan para una escapada. */
const NO_SON_PLANES_ZARAGOZA = new Set(['Formación', 'Cursos y Talleres', 'Empleo y Empresa', 'Idiomas', 'Desarrollo personal']);
const FILAS_ZARAGOZA = 200;
const MAX_PAGINAS_ZARAGOZA = 12;

export const zaragoza = {
  id: 'zaragoza',
  nombre: 'Agenda de Zaragoza',
  zona: enCaja({ latMin: 41.3, latMax: 42.0, lonMin: -1.4, lonMax: -0.4 }),
  async descargar(ctx, desde, hasta) {
    const eventos = [];
    for (let pagina = 0; pagina < MAX_PAGINAS_ZARAGOZA; pagina += 1) {
      if (pagina) await ctx.http.esperar(1000);
      const p = new URLSearchParams({
        rows: String(FILAS_ZARAGOZA), start: String(pagina * FILAS_ZARAGOZA), srsname: 'wgs84',
        q: `startDate=le=${hasta}T23:59:59Z;endDate=ge=${desde}T00:00:00Z`,
      });
      const r = await ctx.http.json(`${URL_ZARAGOZA}?${p}`);
      if (!Array.isArray(r?.result)) throw new Error('respuesta inesperada de zaragoza.es');
      for (const it of r.result) {
        const categorias = (it.category ?? []).map((c) => c.title);
        if (categorias.length && categorias.every((c) => NO_SON_PLANES_ZARAGOZA.has(c))) continue;
        const sitio = (it.subEvent ?? []).map((s) => s.location).find((l) => l?.geometry?.coordinates?.length === 2);
        const [lon, lat] = sitio?.geometry.coordinates ?? [];
        const euros = it.price?.[0]?.hasCurrencyValue;
        const e = evento({
          nombre: it.title, desde: it.startDate, hasta: it.endDate, lat, lon,
          municipio: sitio?.addressLocality ?? 'Zaragoza', url: url(it.alt, it.id ? `https://www.zaragoza.es/sede/servicio/cultura/evento/${it.id}` : null),
          tipo: categorias.map((c) => TIPOS_ZARAGOZA[c]).find(Boolean) ?? tipoEvento(it.title, ...categorias),
          precio: euros === 0 ? 'Gratis' : euros > 0 ? `${euros} €` : null,
        });
        if (e) eventos.push(e);
      }
      if ((pagina + 1) * FILAS_ZARAGOZA >= (r.totalCount ?? 0)) break;
    }
    return eventos;
  },
};

// ── Málaga (agenda municipal en CSV) ────────────────────────────────────────

const URL_MALAGA = (anio) => `https://datosabiertos.malaga.eu/recursos/cultura/agenda/${anio}.csv`;
/** Centro de Málaga: la agenda municipal no trae coordenadas, solo el distrito o el sitio. */
const CENTRO_MALAGA = { lat: 36.7202, lon: -4.4203 };
const TIPOS_MALAGA = {
  Espectaculos: 'escena', Música: 'musica', 'Fiestas populares': 'fiestas', Deportes: 'deporte', 'Ferias, Exposiciones y Museos': 'exposiciones',
};
const NO_SON_PLANES_MALAGA = new Set(['Cursos y talleres']);

/** Filas de un CSV (comillas dobles, comas y saltos de línea dentro de los campos). */
export function leerCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i += 1; } else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; } else if (c === '\n') { fila.push(campo.replace(/\r$/, '')); filas.push(fila); fila = []; campo = ''; } else campo += c;
  }
  if (campo || fila.length) filas.push([...fila, campo]);
  const [cabecera = [], ...resto] = filas;
  return resto.filter((f) => f.length >= cabecera.length).map((f) => Object.fromEntries(cabecera.map((k, i) => [k, f[i]])));
}

export const malaga = {
  id: 'malaga',
  // 2: sin visitas para escuelas y con los nombres en texto plano.
  version: 2,
  nombre: 'Agenda de Málaga',
  zona: enCaja({ latMin: 36.5, latMax: 36.95, lonMin: -4.85, lonMax: -4.1 }),
  async descargar(ctx, desde, hasta) {
    const eventos = [];
    for (const anio of [...new Set([desde.slice(0, 4), hasta.slice(0, 4)])]) {
      let texto;
      try {
        texto = await ctx.http.texto(URL_MALAGA(anio));
      } catch (error) {
        // La del año que viene aún puede no existir: con la de este basta.
        if (anio !== desde.slice(0, 4) && error.estado === 404) continue;
        throw error;
      }
      for (const f of leerCsv(texto)) {
        if (NO_SON_PLANES_MALAGA.has(f.CATEGORIA)) continue;
        const web = f.DIRECCION_WEB?.trim();
        const e = evento({
          nombre: f.NOMBRE, desde: diaEspanol(f.F_INICIO), hasta: diaEspanol(f.F_FIN), ...CENTRO_MALAGA, municipio: 'Málaga',
          url: url(web && !/^https?:/.test(web) ? `https://${web}` : web),
          tipo: TIPOS_MALAGA[f.CATEGORIA] ?? tipoEvento(f.NOMBRE, f.CATEGORIA, f.ESPECIALIDAD),
          precio: /gratu/i.test(f.PRECIO ?? '') ? 'Gratis' : null,
        });
        if (e && e.hasta >= desde && e.desde <= hasta) eventos.push(e);
      }
    }
    return eventos;
  },
};

// ── Toda España: Ticketmaster (con clave) ────────────────────────────────────

const TIPOS_TM = { Music: 'musica', 'Arts & Theatre': 'escena', Family: 'familia', Sports: 'deporte', Film: 'cine' };
/** La API no deja pasar de 1.000 resultados por búsqueda (5 páginas de 200). */
const PAGINAS_TM = 5;
/**
 * Una búsqueda por categoría: las entradas diarias a monumentos de Universe («Miscellaneous»)
 * se comían el cupo de 1.000 de una búsqueda única y dejaban fuera casi todos los conciertos.
 */
const SEGMENTOS_TM = Object.keys(TIPOS_TM);

export const ticketmaster = {
  id: 'ticketmaster',
  // 4: una búsqueda por categoría (antes una sola, y Universe se comía el cupo de 1.000).
  version: 4,
  nombre: 'Ticketmaster',
  zona: () => true,
  activo: (ctx) => Boolean(ctx.env?.TICKETMASTER_KEY),
  async descargar(ctx, desde, hasta) {
    const eventos = [];
    let peticiones = 0;
    for (const segmentName of SEGMENTOS_TM) for (let pagina = 0; pagina < PAGINAS_TM; pagina += 1) {
      if (peticiones) await ctx.http.esperar(300);
      peticiones += 1;
      const p = new URLSearchParams({
        apikey: ctx.env.TICKETMASTER_KEY, countryCode: 'ES', segmentName, locale: '*', size: '200', page: String(pagina), sort: 'date,asc',
        startDateTime: `${desde}T00:00:00Z`, endDateTime: `${hasta}T23:59:59Z`,
      });
      const r = await ctx.http.json(`https://app.ticketmaster.com/discovery/v2/events.json?${p}`);
      const lista = r?._embedded?.events ?? [];
      for (const ev of lista) {
        // Universe (plataforma de Ticketmaster) trae entradas diarias a catedrales y museos: no son eventos.
        if (/universe\.com/i.test(ev.url ?? '')) continue;
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
export const PROVEEDORES = [euskadi, castillaLeon, madrid, valenciana, zaragoza, malaga, ticketmaster];
