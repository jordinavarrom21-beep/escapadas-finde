/**
 * Deja una carpeta de la web lista para publicar, igual en GitHub Pages y en Hostinger:
 *  - quita las copias de seguridad de los datos (*.bak, *.tmp), que no hacen falta fuera;
 *  - pone la versión en la caché del service worker (cada despliegue, interfaz nueva entera);
 *  - con la dirección de la web: la imagen y la URL absolutas para la vista previa al
 *    compartir, la URL canónica y el enlace de inicio de la página 404;
 *  - con --htaccess: el .htaccess para Apache/LiteSpeed (Hostinger): HTTPS, dominio
 *    único, 404, compresión, cabeceras de seguridad y caché.
 *
 * Uso: node scripts/preparar-web.js [--dir site] [--base https://tudominio.es/] [--version abc123] [--htaccess]
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** «--base=x» o «--base x» → {base: 'x'}; «--htaccess» → {htaccess: true}. */
export function leerArgumentos(argv) {
  const opciones = {};
  for (let i = 0; i < argv.length; i++) {
    const [clave, valor] = argv[i].replace(/^--/, '').split('=');
    if (valor !== undefined) opciones[clave] = valor;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) opciones[clave] = argv[++i];
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

/** index.html y 404.html con la dirección absoluta de la web. Se puede repetir sin duplicar nada. */
export function ponerDireccion(html, base, { pagina = 'index' } = {}) {
  if (pagina === '404') return html.replace(/href="[^"]*" data-inicio/, `href="${base}" data-inicio`);
  return html
    .replace(/<meta property="og:image" content="[^"]*og\.png">/, `<meta property="og:image" content="${base}og.png">`)
    .replace(/\s*<meta property="og:url" content="[^"]*">/, '')
    .replace(/\s*<link rel="canonical" href="[^"]*">/, '')
    .replace(/(<meta property="og:image" content="[^"]*">)/, `$1\n  <meta property="og:url" content="${base}">\n  <link rel="canonical" href="${base}">`);
}

/** .htaccess para Apache/LiteSpeed (Hostinger), con el dominio de `base` como el único válido. */
export function htaccess(base) {
  const { host } = new URL(base);
  const sinWww = host.replace(/^www\./, '');
  const conWww = host.startsWith('www.');
  const hostEscapado = host.replace(/\./g, '\\.');
  return `# Escapadas Finde · configuración para Apache / LiteSpeed (Hostinger)
# Generado por scripts/preparar-web.js para ${base}

Options -Indexes
DirectoryIndex index.html
ErrorDocument 404 /404.html
AddDefaultCharset utf-8
AddType application/manifest+json .webmanifest
AddType application/json .json
AddType image/svg+xml .svg

<IfModule mod_rewrite.c>
  RewriteEngine On
  # Siempre HTTPS y siempre ${host} (${conWww ? `${sinWww} → ${host}` : `www.${sinWww} → ${host}`}).
  RewriteCond %{HTTPS} !=on [OR]
  RewriteCond %{HTTP_HOST} !^${hostEscapado}$ [NC]
  RewriteRule ^(.*)$ https://${host}/$1 [R=301,L]
  # Las copias de seguridad de datos nunca se sirven.
  RewriteRule \\.(bak|tmp)$ - [F,L]
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Permissions-Policy "geolocation=(self), camera=(), microphone=(), payment=()"
  Header always set Strict-Transport-Security "max-age=31536000" env=HTTPS

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
export function prepararWeb({ dir = 'site', base = null, version = null, conHtaccess = false } = {}) {
  const hecho = [];
  const quitadas = quitarCopias(dir);
  if (quitadas.length) hecho.push(`quitadas ${quitadas.length} copias de datos`);
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
  if (conHtaccess) {
    if (!base) throw new Error('El .htaccess necesita la dirección de la web (--base)');
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
  const hecho = prepararWeb({ dir: opciones.dir ?? 'site', base, version: opciones.version ?? null, conHtaccess: Boolean(opciones.htaccess) });
  console.log(`Web preparada: ${hecho.join(' · ') || 'nada que hacer'}`);
}
