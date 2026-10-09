/**
 * Deja una carpeta de la web lista para publicar, igual en GitHub Pages y en Hostinger:
 *  - quita las copias de seguridad de los datos (*.bak, *.tmp), que no hacen falta fuera;
 *  - pone la versión en la caché del service worker (cada despliegue, interfaz nueva entera) y
 *    en las direcciones de los módulos y los estilos («js/app.js?v=…»): ninguna caché (la del
 *    navegador, la del hosting o su CDN) puede mezclar archivos de dos publicaciones;
 *  - con la dirección de la web: la imagen y la URL absolutas para la vista previa al
 *    compartir, la URL canónica y el enlace de inicio de la página 404;
 *  - con los datos en data/: la portada para buscadores en index.html (qué es la web, lo
 *    mejor de ahora y las guías) y, con la dirección, sus datos estructurados (JSON-LD);
 *  - con «googleAds» en config/ajustes.json: el aviso de cookies y Google Ads (anuncios.js);
 *  - con «travelpayoutsDrive»: Travelpayouts Drive en el mismo aviso (solo con permiso), en
 *    index.html y en las guías para buscadores;
 *  - con «googleAnalytics»: Google Analytics 4 en el mismo aviso (solo con permiso), también
 *    en la portada y en las guías;
 *  - con --htaccess: el .htaccess para Apache/LiteSpeed (Hostinger): HTTPS, dominio
 *    único, 404, compresión, cabeceras de seguridad y caché.
 *
 * Uso: node scripts/preparar-web.js [--dir site] [--base https://tudominio.es/] [--version abc123] [--htaccess]
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizarDrive, problemasDrive } from '../src/drive.js';
import { AVISO_DRIVE } from '../site/js/formato.js';
import { normalizarGoogleAds, problemasGoogleAds } from '../src/google-ads.js';
import { normalizarGoogleAnalytics, problemasGoogleAnalytics } from '../src/google-analytics.js';
import { CARPETAS, estructuradosPortada, generarPaginas } from '../src/paginas.js';

/** «--base=x» o «--base x» → {base: 'x'}; «--htaccess» → {htaccess: true}. */
export function leerArgumentos(argv) {
  const opciones = {};
  for (let i = 0; i < argv.length; i++) {
    const [clave, valor] = argv[i].replace(/^--/, '').split('=');
    if (valor !== undefined) opciones[clave] = valor;
    // Un valor vacío («--dominio ""») también es un valor: el de una variable sin definir.
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) opciones[clave] = argv[++i];
    else opciones[clave] = true;
  }
  return opciones;
}

/** 'tudominio.es' o 'https://tudominio.es' → 'https://tudominio.es/' (null si no es una URL). */
export function normalizarBase(base) {
  if (!base || base === true) return null;
  const conEsquema = /^https?:\/\//.test(base) ? base : `https://${base}`;
  try {
    const url = new URL(conEsquema);
    return `${url.origin}${url.pathname.replace(/\/?$/, '/')}`;
  } catch {
    return null;
  }
}

/**
 * Lo que se publica no lleva tus criterios de avisos por email (config/vigilados.json): son
 * tuyos y la web es pública. La rama «datos» sí los guarda enteros.
 */
function sinVigilados(dir) {
  const ruta = path.join(dir, 'data', 'vigilados.json');
  if (!existsSync(ruta)) return false;
  writeFileSync(ruta, `${JSON.stringify({ vigilados: [], privados: true })}\n`);
  return true;
}

function quitarCopias(dir) {
  const datos = path.join(dir, 'data');
  if (!existsSync(datos)) return [];
  const sobran = readdirSync(datos).filter((nombre) => /\.(bak|tmp)$/.test(nombre));
  for (const nombre of sobran) rmSync(path.join(datos, nombre));
  return sobran;
}

function versionar(dir, version) {
  const ruta = path.join(dir, 'sw.js');
  const texto = readFileSync(ruta, 'utf8');
  const nuevo = texto.replace(/escapadas-interfaz-[\w.-]+'/, `escapadas-interfaz-${version}'`);
  if (!nuevo.includes(`'escapadas-interfaz-${version}'`)) throw new Error('No se encuentra la versión de la caché en sw.js');
  writeFileSync(ruta, nuevo);
}

/** «js/x.js» y «css/estilos.css» en un atributo (con «../» delante en las guías). */
const REFERENCIA_HTML = /((?:src|href)="(?:\.\.\/)*(?:js\/[\w-]+\.js|css\/estilos\.css))(?:\?v=[\w.-]+)?"/g;
/** «from './x.js'» e «import './x.js'» entre módulos. */
const IMPORTACION = /((?:\bfrom|\bimport)\s*['"]\.\/[\w-]+\.js)(?:\?v=[\w.-]+)?(['"])/g;
/** La lista de la interfaz del service worker. */
const EN_SERVICE_WORKER = /'((?:js\/[\w-]+\.js|css\/estilos\.css))(?:\?v=[\w.-]+)?'/g;

/**
 * Los módulos y los estilos con «?v=<versión>» en index.html, 404.html, las guías, las
 * importaciones entre módulos y la lista del service worker. Sin esto, tras publicar, una
 * caché (del navegador, del hosting o de su CDN) podía dar un módulo de la versión anterior
 * junto a los nuevos y el panel no arrancaba («does not provide an export named…»), y el
 * service worker guardaba esa mezcla. Se puede repetir (cambia la versión, no la duplica).
 */
export function versionarReferencias(dir, version) {
  const v = encodeURIComponent(version);
  const cambiar = (ruta, patron, reemplazo) => {
    if (!existsSync(ruta)) return 0;
    const texto = readFileSync(ruta, 'utf8');
    const nuevo = texto.replace(patron, reemplazo);
    if (nuevo !== texto) writeFileSync(ruta, nuevo);
    return 1;
  };
  let archivos = 0;
  for (const ruta of [path.join(dir, 'index.html'), path.join(dir, '404.html'), ...guias(dir)]) archivos += cambiar(ruta, REFERENCIA_HTML, `$1?v=${v}"`);
  const js = path.join(dir, 'js');
  if (existsSync(js)) for (const nombre of readdirSync(js).filter((n) => n.endsWith('.js'))) archivos += cambiar(path.join(js, nombre), IMPORTACION, `$1?v=${v}$2`);
  archivos += cambiar(path.join(dir, 'sw.js'), EN_SERVICE_WORKER, `'$1?v=${v}'`);
  return archivos;
}

/** Quita la dirección absoluta (vista previa y canónica): para una web sin dominio fijo. */
export function quitarDireccion(html) {
  return html
    .replace(/<meta property="og:image" content="[^"]*og\.png">/, '<meta property="og:image" content="og.png">')
    .replace(/\s*<meta property="og:url" content="[^"]*">/, '')
    .replace(/\s*<link rel="canonical" href="[^"]*">/, '');
}

/** index.html y 404.html con la dirección absoluta de la web. Se puede repetir sin duplicar nada. */
export function ponerDireccion(html, base, { pagina = 'index' } = {}) {
  if (pagina === '404') return html.replace(/href="[^"]*" data-inicio/, `href="${base}" data-inicio`);
  return html
    .replace(/<meta property="og:image" content="[^"]*og\.png">/, `<meta property="og:image" content="${base}og.png">`)
    .replace(/\s*<meta property="og:url" content="[^"]*">/, '')
    .replace(/\s*<link rel="canonical" href="[^"]*">/, '')
    .replace(/(<meta property="og:image" content="[^"]*">)/, `$1\n  <meta property="og:url" content="${base}">\n  <link rel="canonical" href="${base}">`);
}

/**
 * Datos remotos: la web lee las ofertas de `datos` (la de GitHub Pages, que se renueva cada
 * escaneo) en vez de su copia. Pone la etiqueta que lee app.js y abre esa conexión en la CSP.
 * Se puede repetir sin duplicar nada.
 */
export function ponerDatosRemotos(html, datos) {
  const { origin } = new URL(datos);
  const sinEtiqueta = html
    .replace(/\s*<meta name="escapadas-datos" content="[^"]*">/, '')
    .replace(/\s*<link rel="preconnect" href="[^"]*" crossorigin data-datos>/, '');
  // «preconnect»: la conexión a esa web se abre mientras se baja el resto, no al pedir los datos.
  const conEtiqueta = sinEtiqueta.replace(/(<meta http-equiv="Content-Security-Policy"[^>]*>)/, `$1\n  <meta name="escapadas-datos" content="${datos}">\n  <link rel="preconnect" href="${origin}" crossorigin data-datos>`);
  return conEtiqueta.replace(/connect-src 'self'([^;"]*)/, (todo, resto) => (resto.includes(origin) ? todo : `connect-src 'self' ${origin}${resto}`));
}

/**
 * Lo que necesita Google Ads (ver site/js/anuncios.js) en la CSP: su script, sus llamadas
 * y el iframe de las conversiones. Lista de Google: developers.google.com/tag-platform/security/guides/csp
 * Google usa también el dominio de cada país (google.<país>): van los de quien nos visita.
 * Estos orígenes son solo de Google Ads: sin ID se quitan todos.
 */
const GOOGLE_PAISES = ['es', 'ad', 'fr', 'pt', 'it', 'de', 'co.uk', 'nl', 'be', 'ch'].map((tld) => `https://www.google.${tld}`);
const CSP_GOOGLE_ADS = {
  'script-src': ['https://www.googletagmanager.com', 'https://www.googleadservices.com', 'https://googleads.g.doubleclick.net', 'https://www.google.com'],
  'connect-src': ['https://www.googletagmanager.com', 'https://www.google.com', ...GOOGLE_PAISES, 'https://googleads.g.doubleclick.net', 'https://www.googleadservices.com', 'https://pagead2.googlesyndication.com'],
  'frame-src': ['https://td.doubleclick.net', 'https://bid.g.doubleclick.net', 'https://www.googletagmanager.com'],
};

const META_CSP = /(<meta http-equiv="Content-Security-Policy"[^>]*>)/;

/**
 * Abre (activo) o cierra la CSP a unos orígenes: `{directiva: [orígenes]}`. Abriendo, una
 * directiva que no está se crea con 'self' (antes de object-src); cerrando, se quitan esos
 * orígenes y las directivas de `vaciables` que se queden solo con 'self'. Se puede repetir.
 */
function ajustarCsp(html, fuentesPorDirectiva, activo, { vaciables = [] } = {}) {
  return html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/, (todo, abre, csp, cierra) => {
    const directivas = csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => d.split(/\s+/));
    for (const [nombre, fuentes] of Object.entries(fuentesPorDirectiva)) {
      let directiva = directivas.find(([n]) => n === nombre);
      if (!directiva && activo) {
        directiva = [nombre, "'self'"];
        const antes = directivas.findIndex(([n]) => n === 'object-src');
        directivas.splice(antes < 0 ? directivas.length : antes, 0, directiva);
      }
      if (!directiva) continue;
      const resto = directiva.slice(1).filter((f) => !fuentes.includes(f));
      directiva.splice(1, Infinity, ...resto, ...(activo ? fuentes : []));
    }
    const limpias = directivas.filter((d) => !(vaciables.includes(d[0]) && d.length === 2 && d[1] === "'self'" && !activo));
    return `${abre}${limpias.map((d) => d.join(' ')).join('; ')}${cierra}`;
  });
}

/**
 * Google Ads con aviso de cookies: la etiqueta que lee anuncios.js y la CSP abierta a Google.
 * Sin `googleAds` válido, quita lo que hubiera (la web vuelve a «sin cookies»). Se puede repetir.
 */
export function ponerGoogleAds(html, googleAds) {
  const ads = normalizarGoogleAds(googleAds);
  // El frame-src que se puso para Google, si ya no lleva nada más que 'self'.
  const nuevo = ajustarCsp(html.replace(/\s*<meta name="escapadas-google-ads"[^>]*>/, ''), CSP_GOOGLE_ADS, Boolean(ads), { vaciables: ['frame-src'] });
  if (!ads) return nuevo;
  const etiqueta = `<meta name="escapadas-google-ads" content="${ads.id}"${ads.conversion ? ` data-conversion="${ads.conversion}"` : ''}>`;
  return nuevo.replace(META_CSP, `$1\n  ${etiqueta}`);
}

/**
 * Lo que necesita Travelpayouts Drive en la CSP. Su script (el de `travelpayoutsDrive`) carga
 * el resto de su código del mismo sitio y le pide allí su configuración y qué enlaces cambiar;
 * mn-tz.com y emrld.cc son sus comprobaciones de bloqueadores (están en su código) y
 * www.travelpayouts.com/check_auth mira si quien visita es el dueño de la cuenta (para su
 * editor visual). Los enlaces que cambia llevan a sus dominios de redirección: es navegar, no
 * hace falta abrir nada. Comprobado en escapadasfinde.com con Drive activo. Si un día pide
 * otro dominio, la consola del navegador lo dice («Refused to connect…»).
 */
const DRIVE_CONEXIONES = ['https://mn-tz.com', 'https://emrld.cc', 'https://www.travelpayouts.com'];
/** Su script, sus estilos (los precarga del mismo sitio: sin style-src, «Unable to preload CSS») y sus llamadas. */
export function cspDrive(url) {
  const { origin } = new URL(url);
  return { 'script-src': [origin], 'style-src': [origin], 'connect-src': [origin, ...DRIVE_CONEXIONES] };
}

/**
 * Travelpayouts Drive en index.html: la etiqueta que lee anuncios.js (lo carga solo si el
 * visitante acepta las cookies) y la CSP abierta a Drive. Sin `drive` válido, quita lo que
 * hubiera. Se puede repetir sin duplicar nada.
 */
export function ponerDrive(html, drive) {
  const url = normalizarDrive(drive);
  const anterior = html.match(/<meta name="escapadas-drive" content="([^"]*)">/)?.[1];
  let nuevo = html.replace(/\s*<meta name="escapadas-drive"[^>]*>/, '');
  if (normalizarDrive(anterior)) nuevo = ajustarCsp(nuevo, cspDrive(anterior), false);
  if (!url) return nuevo;
  nuevo = ajustarCsp(nuevo, cspDrive(url), true);
  return nuevo.replace(META_CSP, `$1\n  <meta name="escapadas-drive" content="${url}">`);
}

/**
 * Drive en una guía para buscadores (src/paginas.js, sin JavaScript de serie): la CSP deja
 * cargar anuncios.js (el aviso de cookies) y Drive, la etiqueta, el script y «Cookies» en el
 * pie para cambiar de opinión. Las guías se generan de nuevo en cada escaneo; aquí solo se
 * añade (y se puede repetir sin duplicar nada).
 */
export function ponerDriveGuia(html, drive) {
  const url = normalizarDrive(drive);
  if (!url || html.includes('<meta name="escapadas-drive"')) return html;
  // La guía enlaza sus estilos con la ruta relativa a la raíz: la misma vale para js/.
  const raiz = html.match(/<link rel="stylesheet" href="([^"]*)css\/estilos\.css">/)?.[1];
  if (raiz == null) return html;
  // Sus previsualizaciones llevan sus propios estilos (en shadow DOM), como en la portada.
  const csp = cspDrive(url);
  const conDrive = ajustarCsp(conAvisoCookies(html, raiz), { ...csp, 'style-src': [...csp['style-src'], "'unsafe-inline'"] }, true)
    .replace(META_CSP, `$1\n<meta name="escapadas-drive" content="${url}">`);
  // El mismo aviso que el pie del panel (app.js): con Drive, tras aceptar, hay enlaces de afiliado.
  return conDrive.replace(PIE_GUIA, (todo, antes, cierre) => `${antes} ${AVISO_DRIVE} No cambia tu precio ni el orden de las ofertas.${cierre}`);
}

/** El último párrafo del pie de una guía (src/paginas.js). */
const PIE_GUIA = /(<footer class="pie[^>]*>[^]*?)(<\/p>\s*<\/footer>)/;

/**
 * Lo que comparten Drive y Google Analytics en una guía: la CSP deja cargar scripts propios,
 * anuncios.js (el aviso de cookies) y «Cookies» en el pie para cambiar de opinión. Una sola
 * vez aunque estén los dos.
 */
function conAvisoCookies(html, raiz) {
  if (html.includes('js/anuncios.js')) return html;
  return html
    .replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*?)script-src 'none'/, "$1script-src 'self'")
    .replace('</head>', `<script src="${raiz}js/anuncios.js" defer></script>\n</head>`)
    .replace(PIE_GUIA, (todo, antes, cierre) => `${antes} · <a href="#" data-abrir-cookies>Cookies</a>.${cierre}`);
}

/**
 * Lo que necesita Google Analytics 4 en la CSP (developers.google.com/tag-platform/security/guides/csp):
 * gtag.js y los envíos de las visitas, que van a servidores de cada región
 * (region1.google-analytics.com…), de ahí los comodines. Sus píxeles ya caben en img-src
 * («https:»). Sin Google Signals (desactivado en la propiedad), no hace falta nada más. No
 * coincide con ningún origen de Google Ads: quitar uno no toca al otro.
 */
const CSP_GOOGLE_ANALYTICS = {
  'script-src': ['https://*.googletagmanager.com'],
  'connect-src': ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'],
};

/**
 * Google Analytics 4 en index.html: la etiqueta que lee anuncios.js (lo carga solo si el
 * visitante acepta la medición) y la CSP abierta a Analytics. Sin ID válido, quita lo que
 * hubiera. Se puede repetir sin duplicar nada.
 */
export function ponerGoogleAnalytics(html, googleAnalytics) {
  const ga = normalizarGoogleAnalytics(googleAnalytics);
  const nuevo = ajustarCsp(html.replace(/\s*<meta name="escapadas-google-analytics"[^>]*>/, ''), CSP_GOOGLE_ANALYTICS, Boolean(ga));
  if (!ga) return nuevo;
  return nuevo.replace(META_CSP, `$1\n  <meta name="escapadas-google-analytics" content="${ga}">`);
}

/** Google Analytics en una guía para buscadores, como Drive (ver ponerDriveGuia). */
export function ponerAnaliticaGuia(html, googleAnalytics) {
  const ga = normalizarGoogleAnalytics(googleAnalytics);
  if (!ga || html.includes('<meta name="escapadas-google-analytics"')) return html;
  const raiz = html.match(/<link rel="stylesheet" href="([^"]*)css\/estilos\.css">/)?.[1];
  if (raiz == null) return html;
  return ajustarCsp(conAvisoCookies(html, raiz), CSP_GOOGLE_ANALYTICS, true)
    .replace(META_CSP, `$1\n<meta name="escapadas-google-analytics" content="${ga}">`);
}

/** Las guías para buscadores que haya en `dir` (escapadas/, vuelos/, actividades/). */
function guias(dir) {
  const encontradas = [];
  const recorrer = (carpeta) => {
    for (const nombre of readdirSync(carpeta)) {
      const ruta = path.join(carpeta, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (nombre.endsWith('.html')) encontradas.push(ruta);
    }
  };
  for (const carpeta of CARPETAS) if (existsSync(path.join(dir, carpeta))) recorrer(path.join(dir, carpeta));
  return encontradas;
}

/**
 * «googleAds» de config/ajustes.json: null si no está o el ID está vacío. Si está mal escrito,
 * error (mejor que publicar sin medir y no enterarse).
 */
export function googleAdsDeAjustes(ruta = fileURLToPath(new URL('../config/ajustes.json', import.meta.url))) {
  if (!existsSync(ruta)) return null;
  const { googleAds } = JSON.parse(readFileSync(ruta, 'utf8'));
  const problemas = problemasGoogleAds(googleAds);
  if (problemas.length) throw new Error(`config/ajustes.json: ${problemas.join('; ')}`);
  return normalizarGoogleAds(googleAds);
}

/**
 * «googleAnalytics» de config/ajustes.json: null si no está o está vacío. Si está mal escrito,
 * error (mejor que publicar sin medir y no enterarse).
 */
export function googleAnalyticsDeAjustes(ruta = fileURLToPath(new URL('../config/ajustes.json', import.meta.url))) {
  if (!existsSync(ruta)) return null;
  const { googleAnalytics } = JSON.parse(readFileSync(ruta, 'utf8'));
  const problemas = problemasGoogleAnalytics(googleAnalytics);
  if (problemas.length) throw new Error(`config/ajustes.json: ${problemas.join('; ')}`);
  return normalizarGoogleAnalytics(googleAnalytics);
}

/**
 * «travelpayoutsDrive» de config/ajustes.json: null si no está o está vacío. Si está mal
 * escrito, error (mejor que publicar sin Drive y no enterarse).
 */
export function driveDeAjustes(ruta = fileURLToPath(new URL('../config/ajustes.json', import.meta.url))) {
  if (!existsSync(ruta)) return null;
  const { travelpayoutsDrive } = JSON.parse(readFileSync(ruta, 'utf8'));
  const problemas = problemasDrive(travelpayoutsDrive);
  if (problemas.length) throw new Error(`config/ajustes.json: ${problemas.join('; ')}`);
  return normalizarDrive(travelpayoutsDrive);
}

/** Cambia lo que hay entre «<!-- marca: … -->» y «<!-- /marca -->» (se puede repetir). */
function entreMarcas(html, marca, contenido) {
  const patron = new RegExp(`(<!-- ${marca}[:\\s][^]*?-->)[^]*?(\\s*<!-- /${marca} -->)`);
  return html.replace(patron, (todo, abre, cierra) => `${abre}\n${contenido}${cierra}`);
}

/**
 * La portada para quien no ejecuta el panel (bloque de src/paginas.js) y, con la dirección,
 * los datos estructurados de la web en el <head>. Se puede repetir sin duplicar nada.
 */
export function ponerPortada(html, bloque, base = null, destacadas = []) {
  return entreMarcas(entreMarcas(html, 'portada-estatica', bloque), 'datos-estructurados', base ? `  ${estructuradosPortada(base, destacadas)}` : '');
}

/**
 * .htaccess para Apache/LiteSpeed (Hostinger). Con `base`, ese dominio es el único válido
 * (con o sin www, el que diga); sin ella, vale cualquier dominio y solo se fuerza HTTPS.
 */
export function htaccess(base = null) {
  const host = base ? new URL(base).host : null;
  const hostEscapado = host?.replace(/\./g, '\\.');
  const destino = host ?? '%{HTTP_HOST}';
  const unDominio = host
    ? `  # Siempre ${host} (${host.startsWith('www.') ? `${host.slice(4)} → ${host}` : `www.${host} → ${host}`}).
  RewriteCond %{HTTP_HOST} !^${hostEscapado}$ [NC]
  RewriteRule ^ https://${host}%{REQUEST_URI} [R=301,L]
`
    : '';
  return `# Escapadas Finde · configuración para Apache / LiteSpeed (Hostinger)
# Generado por scripts/preparar-web.js${base ? ` para ${base}` : ' (vale para cualquier dominio)'}

Options -Indexes
DirectoryIndex index.html
ErrorDocument 404 /404.html
AddDefaultCharset utf-8
AddType application/manifest+json .webmanifest
AddType application/json .json
AddType image/svg+xml .svg

<IfModule mod_rewrite.c>
  RewriteEngine On
  # Siempre HTTPS.
  # Detrás de un CDN o proxy, HTTPS llega en X-Forwarded-Proto: se miran los dos (sin bucles).
  RewriteCond %{HTTPS} !=on
  RewriteCond %{HTTP:X-Forwarded-Proto} !=https
  RewriteRule ^ https://${destino}%{REQUEST_URI} [R=301,L]
${unDominio}  # Las copias de seguridad de datos y la carpeta .git (despliegue desde Git) nunca se sirven.
  RewriteRule \\.(bak|tmp)$ - [F,L]
  # Las instrucciones de instalación del zip no son para los visitantes.
  RewriteRule ^LEEME-HOSTINGER\\.txt$ - [F,L]
  RewriteRule (^|/)\\.git(/|$) - [F,L]
  # Las guías salen y entran con las ofertas de cada día (src/paginas.js): la que hoy no tiene
  # suficientes no se publica. Quien llegue a ella (un buscador, un enlace guardado) va a la
  # lista de escapadas o a la portada en vez de a «esta página no existe». Temporal (302):
  # la guía vuelve en cuanto vuelve a haber ofertas.
  # La lista de escapadas también es una guía: si hoy tampoco está, a la portada.
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{DOCUMENT_ROOT}/escapadas/index.html -f
  RewriteRule ^escapadas/[^/]+/?$ /escapadas/ [R=302,L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^(escapadas|vuelos|actividades)(/.*)?$ / [R=302,L]
  # Iconos que el iPhone pide por su cuenta aunque la página diga otro: el mismo de siempre.
  RewriteRule ^apple-touch-icon-(precomposed|[0-9]+x[0-9]+(-precomposed)?)\\.png$ apple-touch-icon.png [L]
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Permissions-Policy "geolocation=(self), camera=(), microphone=(), payment=()"
  # Siempre (no solo con env=HTTPS): detrás del CDN de Hostinger la petición puede llegar al
  # servidor sin HTTPS y la cabecera no salía nunca. Por HTTP el navegador la ignora, así que
  # enviarla siempre no tiene riesgo.
  Header always set Strict-Transport-Security "max-age=31536000"

  # Los datos en bruto y las instrucciones se pueden leer (el panel los necesita para
  # pintarse, también cuando lo pinta un buscador), pero no salen en los resultados.
  <FilesMatch "(\\.json|^LEEME-HOSTINGER\\.txt)$">
    Header set X-Robots-Tag "noindex"
  </FilesMatch>

  # La página, el service worker y los datos se comprueban siempre (cambian cada 15 min).
  <FilesMatch "(\\.html|sw\\.js|\\.json|\\.xml|\\.txt|\\.webmanifest)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  # Estilos y código: se comprueban siempre (si no han cambiado, la respuesta es un «304» de
  # unos bytes). Con una hora de caché, justo después de publicar el navegador o la CDN podían
  # mezclar módulos viejos y nuevos y el panel no arrancaba. Las visitas repetidas los sacan
  # igual de rápido del service worker, que los renueva enteros en cada versión.
  <FilesMatch "\\.(css|js)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  <FilesMatch "^sw\\.js$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  # Imágenes y fuentes: no cambian de nombre sin cambiar de contenido.
  <FilesMatch "\\.(png|jpe?g|webp|svg|ico|woff2?)$">
    Header set Cache-Control "public, max-age=2592000"
  </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/plain text/xml application/javascript text/javascript application/json application/manifest+json image/svg+xml application/xml
</IfModule>
`;
}

/** Aplica todo a `dir`. Devuelve lo que ha hecho, para el registro. */
export function prepararWeb({ dir = 'site', base = null, version = null, conHtaccess = false, datos = null, googleAds = null, drive = null, googleAnalytics = null } = {}) {
  const hecho = [];
  const quitadas = quitarCopias(dir);
  if (quitadas.length) hecho.push(`quitadas ${quitadas.length} copias de datos`);
  if (sinVigilados(dir)) hecho.push('avisos por email sin publicar');
  if (version) {
    versionar(dir, version);
    hecho.push(`caché versión ${version}`);
  }
  if (base) {
    const indice = path.join(dir, 'index.html');
    writeFileSync(indice, ponerDireccion(readFileSync(indice, 'utf8'), base));
    const error404 = path.join(dir, '404.html');
    if (existsSync(error404)) writeFileSync(error404, ponerDireccion(readFileSync(error404, 'utf8'), base, { pagina: '404' }));
    hecho.push(`dirección ${base}`);
  }
  if (datos) {
    const indice = path.join(dir, 'index.html');
    writeFileSync(indice, ponerDatosRemotos(readFileSync(indice, 'utf8'), datos));
    hecho.push(`datos de ${datos}`);
  }
  // Siempre: sin ID también quita lo que hubiera de un despliegue anterior en la misma carpeta.
  const indiceAds = path.join(dir, 'index.html');
  if (existsSync(indiceAds)) {
    const ads = normalizarGoogleAds(googleAds);
    writeFileSync(indiceAds, ponerGoogleAds(readFileSync(indiceAds, 'utf8'), ads));
    if (ads) hecho.push(`Google Ads ${ads.id} ${ads.conversion ? 'con conversión' : 'SIN conversión (falta googleAds.conversion)'}`);
    // Igual que Google Ads: sin dirección quita lo que hubiera.
    const urlDrive = normalizarDrive(drive);
    writeFileSync(indiceAds, ponerDrive(readFileSync(indiceAds, 'utf8'), urlDrive));
    if (urlDrive) {
      const enGuias = guias(dir);
      for (const ruta of enGuias) writeFileSync(ruta, ponerDriveGuia(readFileSync(ruta, 'utf8'), urlDrive));
      hecho.push(`Travelpayouts Drive con permiso (portada y ${enGuias.length} guías)`);
    }
    // Y Google Analytics, igual.
    const ga = normalizarGoogleAnalytics(googleAnalytics);
    writeFileSync(indiceAds, ponerGoogleAnalytics(readFileSync(indiceAds, 'utf8'), ga));
    if (ga) {
      const enGuias = guias(dir);
      for (const ruta of enGuias) writeFileSync(ruta, ponerAnaliticaGuia(readFileSync(ruta, 'utf8'), ga));
      hecho.push(`Google Analytics ${ga} con permiso (portada y ${enGuias.length} guías)`);
    }
  }
  const rutaOfertas = path.join(dir, 'data', 'ofertas.json');
  const datosPanel = existsSync(rutaOfertas) ? JSON.parse(readFileSync(rutaOfertas, 'utf8')) : null;
  if (datosPanel?.origen && Array.isArray(datosPanel.ofertas)) {
    const { portada, destacadas } = generarPaginas(datosPanel, { base });
    const indice = path.join(dir, 'index.html');
    writeFileSync(indice, ponerPortada(readFileSync(indice, 'utf8'), portada, base, destacadas));
    hecho.push('portada para buscadores');
  }
  if (conHtaccess) {
    writeFileSync(path.join(dir, '.htaccess'), htaccess(base));
    hecho.push('.htaccess');
  }
  // Al final: también las guías y los scripts que se acaban de añadir (Drive, Analytics).
  if (version) hecho.push(`direcciones con ?v=${version} (${versionarReferencias(dir, version)} archivos)`);
  return hecho;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opciones = leerArgumentos(process.argv.slice(2));
  const base = normalizarBase(opciones.base);
  if (opciones.base && !base) {
    console.error(`«${opciones.base}» no es una dirección válida`);
    process.exit(2);
  }
  const hecho = prepararWeb({ dir: opciones.dir ?? 'site', base, version: opciones.version ?? null, conHtaccess: Boolean(opciones.htaccess), googleAds: googleAdsDeAjustes(), drive: driveDeAjustes(), googleAnalytics: googleAnalyticsDeAjustes() });
  console.log(`Web preparada: ${hecho.join(' · ') || 'nada que hacer'}`);
}
