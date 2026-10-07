/**
 * Deja una carpeta de la web lista para publicar, igual en GitHub Pages y en Hostinger:
 *  - quita las copias de seguridad de los datos (*.bak, *.tmp), que no hacen falta fuera;
 *  - pone la versión en la caché del service worker (cada despliegue, interfaz nueva entera);
 *  - con la dirección de la web: la imagen y la URL absolutas para la vista previa al
 *    compartir, la URL canónica y el enlace de inicio de la página 404;
 *  - con los datos en data/: la portada para buscadores en index.html (qué es la web, lo
 *    mejor de ahora y las guías) y, con la dirección, sus datos estructurados (JSON-LD);
 *  - con «googleAds» en config/ajustes.json: el aviso de cookies y Google Ads (anuncios.js);
 *  - con --htaccess: el .htaccess para Apache/LiteSpeed (Hostinger): HTTPS, dominio
 *    único, 404, compresión, cabeceras de seguridad y caché.
 *
 * Uso: node scripts/preparar-web.js [--dir site] [--base https://tudominio.es/] [--version abc123] [--htaccess]
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizarGoogleAds, problemasGoogleAds } from '../src/google-ads.js';
import { normalizarDrive, problemasDrive } from '../src/travelpayouts-drive.js';
import { escaparHtml } from '../site/js/formato.js';
import { estructuradosPortada, generarPaginas } from '../src/paginas.js';

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

/**
 * Google Ads con aviso de cookies: la etiqueta que lee anuncios.js y la CSP abierta a Google.
 * Sin `googleAds` válido, quita lo que hubiera (la web vuelve a «sin cookies»). Se puede repetir.
 */
export function ponerGoogleAds(html, googleAds) {
  const ads = normalizarGoogleAds(googleAds);
  let nuevo = html.replace(/\s*<meta name="escapadas-google-ads"[^>]*>/, '');
  nuevo = nuevo.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/, (todo, abre, csp, cierra) => {
    const directivas = csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => d.split(/\s+/));
    for (const [nombre, fuentes] of Object.entries(CSP_GOOGLE_ADS)) {
      let directiva = directivas.find(([n]) => n === nombre);
      if (!directiva && ads) {
        directiva = [nombre, "'self'"];
        const antes = directivas.findIndex(([n]) => n === 'object-src');
        directivas.splice(antes < 0 ? directivas.length : antes, 0, directiva);
      }
      if (!directiva) continue;
      const resto = directiva.slice(1).filter((f) => !fuentes.includes(f));
      directiva.splice(1, Infinity, ...resto, ...(ads ? fuentes : []));
    }
    // El frame-src que se puso para Google, si ya no lleva nada más que 'self'.
    const limpias = directivas.filter((d) => !(d[0] === 'frame-src' && d.length === 2 && d[1] === "'self'" && !ads));
    return `${abre}${limpias.map((d) => d.join(' ')).join('; ')}${cierra}`;
  });
  if (!ads) return nuevo;
  const etiqueta = `<meta name="escapadas-google-ads" content="${ads.id}"${ads.conversion ? ` data-conversion="${ads.conversion}"` : ''}>`;
  return nuevo.replace(/(<meta http-equiv="Content-Security-Policy"[^>]*>)/, `$1\n  ${etiqueta}`);
}

/** Directivas de la CSP que necesita Travelpayouts Drive: su script, sus llamadas y su píxel. */
const CSP_DRIVE = ['script-src', 'connect-src', 'img-src'];

/**
 * Travelpayouts Drive (ver site/js/anuncios.js): la etiqueta con su script, que solo se carga
 * si se aceptan las cookies, y la CSP abierta a sus orígenes. Los orígenes que se añadieron
 * van en la propia etiqueta (data-csp) para poder quitarlos si se desactiva. Se puede repetir.
 */
export function ponerDrive(html, travelpayoutsDrive) {
  const drive = normalizarDrive(travelpayoutsDrive);
  // data-csp apunta cada origen añadido con su directiva («connect-src=https://…»): uno que la
  // CSP ya traía en esa directiva (p. ej. photon.komoot.io en connect-src) no se apunta ni se quita.
  const anterior = (/<meta name="escapadas-drive"[^>]*data-csp="([^"]*)"[^>]*>/.exec(html)?.[1] ?? '').split(' ').filter(Boolean);
  let nuevo = html.replace(/\s*<meta name="escapadas-drive"[^>]*>/, '');
  const anadidos = [];
  nuevo = nuevo.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/, (todo, abre, csp, cierra) => {
    const directivas = csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => d.split(/\s+/));
    for (const directiva of directivas) {
      const [nombre] = directiva;
      if (!CSP_DRIVE.includes(nombre)) continue;
      const resto = directiva.slice(1).filter((f) => !anterior.includes(`${nombre}=${f}`));
      // Con «https:» en la directiva (img-src) ya vale cualquier origen https.
      const nuevos = drive && !resto.includes('https:') ? drive.origenes.filter((o) => !resto.includes(o)) : [];
      anadidos.push(...nuevos.map((o) => `${nombre}=${o}`));
      directiva.splice(1, Infinity, ...resto, ...nuevos);
    }
    return `${abre}${directivas.map((d) => d.join(' ')).join('; ')}${cierra}`;
  });
  if (!drive) return nuevo;
  const etiqueta = `<meta name="escapadas-drive" content="${escaparHtml(new URL(drive.script).href)}" data-csp="${escaparHtml(anadidos.join(' '))}">`;
  return nuevo.replace(/(<meta http-equiv="Content-Security-Policy"[^>]*>)/, `$1\n  ${etiqueta}`);
}

/** «travelpayoutsDrive» de config/ajustes.json: null si no está o vacío; error claro si está mal. */
export function driveDeAjustes(ruta = fileURLToPath(new URL('../config/ajustes.json', import.meta.url))) {
  if (!existsSync(ruta)) return null;
  const { travelpayoutsDrive } = JSON.parse(readFileSync(ruta, 'utf8'));
  const problemas = problemasDrive(travelpayoutsDrive);
  if (problemas.length) throw new Error(problemas.join('; '));
  return normalizarDrive(travelpayoutsDrive) ? travelpayoutsDrive : null;
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

/** Cambia lo que hay entre «<!-- marca: … -->» y «<!-- /marca -->» (se puede repetir). */
function entreMarcas(html, marca, contenido) {
  const patron = new RegExp(`(<!-- ${marca}[:\\s][^]*?-->)[^]*?(\\s*<!-- /${marca} -->)`);
  return html.replace(patron, (todo, abre, cierra) => `${abre}\n${contenido}${cierra}`);
}

/**
 * La portada para quien no ejecuta el panel (bloque de src/paginas.js) y, con la dirección,
 * los datos estructurados de la web en el <head>. Se puede repetir sin duplicar nada.
 */
export function ponerPortada(html, bloque, base = null) {
  return entreMarcas(entreMarcas(html, 'portada-estatica', bloque), 'datos-estructurados', base ? `  ${estructuradosPortada(base)}` : '');
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
  # Estilos y código: el service worker los renueva en cada versión; aquí, poco rato.
  <FilesMatch "\\.(css|js)$">
    Header set Cache-Control "public, max-age=3600"
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
export function prepararWeb({ dir = 'site', base = null, version = null, conHtaccess = false, datos = null, googleAds = null, travelpayoutsDrive = null } = {}) {
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
    const drive = normalizarDrive(travelpayoutsDrive);
    writeFileSync(indiceAds, ponerDrive(readFileSync(indiceAds, 'utf8'), drive && travelpayoutsDrive));
    if (drive) hecho.push(`Travelpayouts Drive (${drive.origenes.join(', ')})`);
  }
  const rutaOfertas = path.join(dir, 'data', 'ofertas.json');
  const datosPanel = existsSync(rutaOfertas) ? JSON.parse(readFileSync(rutaOfertas, 'utf8')) : null;
  if (datosPanel?.origen && Array.isArray(datosPanel.ofertas)) {
    const { portada } = generarPaginas(datosPanel, { base });
    const indice = path.join(dir, 'index.html');
    writeFileSync(indice, ponerPortada(readFileSync(indice, 'utf8'), portada, base));
    hecho.push('portada para buscadores');
  }
  if (conHtaccess) {
    writeFileSync(path.join(dir, '.htaccess'), htaccess(base));
    hecho.push('.htaccess');
  }
  return hecho;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opciones = leerArgumentos(process.argv.slice(2));
  const base = normalizarBase(opciones.base);
  if (opciones.base && !base) {
    console.error(`«${opciones.base}» no es una dirección válida`);
    process.exit(2);
  }
  const hecho = prepararWeb({ dir: opciones.dir ?? 'site', base, version: opciones.version ?? null, conHtaccess: Boolean(opciones.htaccess), googleAds: googleAdsDeAjustes(), travelpayoutsDrive: driveDeAjustes() });
  console.log(`Web preparada: ${hecho.join(' · ') || 'nada que hacer'}`);
}
