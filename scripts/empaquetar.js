/**
 * Zip de la web lista para subir a un hosting propio (Hostinger u otro Apache/LiteSpeed):
 * la web con los datos de site/data/, las páginas para buscadores, el .htaccess y una
 * guía de instalación. Con --dominio, además la dirección canónica, el sitemap y un solo
 * dominio (con o sin www); sin él, vale para cualquier dominio.
 *
 * Uso:
 *   npm run datos:publicados                 (si no hay datos en site/data/: los de la web publicada)
 *   npm run empaquetar -- --dominio tudominio.es
 *
 * Resultado: dist/escapadas-finde-web/ y dist/escapadas-finde-web.zip
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { CARPETAS, generarPaginas } from '../src/paginas.js';
import { googleAdsDeAjustes, leerArgumentos, normalizarBase, ponerDireccion, prepararWeb, quitarDireccion } from './preparar-web.js';
import { basePages } from './datos-publicados.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOMBRE = 'escapadas-finde-web';

/** Datos del panel con los detalles de las fichas dentro (las páginas para buscadores los usan enteros). */
function leerDatos(sitio) {
  const datos = JSON.parse(readFileSync(path.join(sitio, 'data', 'ofertas.json'), 'utf8'));
  const rutaDetalles = path.join(sitio, 'data', 'detalles.json');
  if (existsSync(rutaDetalles)) {
    const detalles = JSON.parse(readFileSync(rutaDetalles, 'utf8'));
    for (const oferta of datos.ofertas) Object.assign(oferta, detalles[oferta.id] ?? {});
  }
  return datos;
}

export function instrucciones({ base, generado, datos = null }) {
  return `ESCAPADAS FINDE · WEB LISTA PARA TU HOSTING
Datos del ${generado}${base ? ` · preparada para ${base}` : ' · vale para cualquier dominio'}

1. En hPanel de Hostinger: Sitios web → Administrar → Archivos → Administrador de archivos.
2. Entra en public_html y borra lo que haya (default.php o la página de «próximamente»).
3. Sube este zip a public_html, púlsalo con el botón derecho → Extraer, y extrae aquí mismo
   (deben quedar index.html, .htaccess, css/, js/… directamente en public_html).
4. Seguridad → SSL: comprueba que el certificado gratuito está instalado y activo. El .htaccess
   manda todo a https://, así que sin certificado la web no abre.
5. Abre tu dominio. Si ves la página antigua, vacía la caché: Rendimiento → Caché → Vaciar.

${datos
    ? `Las ofertas se actualizan solas: la web las lee de ${datos} (se renueva en cada
escaneo, cada 15 min). Si esa web no responde, usa la copia de los datos que va en el zip.
Las páginas para buscadores (escapadas/, vuelos/, actividades/) sí son las del zip:
vuelve a subir un zip nuevo de vez en cuando, o activa la subida por FTP (LEEME.md).`
    : `IMPORTANTE: los datos de este zip no se actualizan solos. Para tenerlos al día, activa la
subida automática por FTP desde GitHub (LEEME.md → «Tu dominio»).`}
`;
}

/** La web de GitHub Pages de este repositorio (de donde leer los datos del momento), o null. */
function paginasDelRepositorio() {
  if (process.env.GITHUB_REPOSITORY) return basePages(`github.com/${process.env.GITHUB_REPOSITORY}`);
  try {
    return basePages(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: RAIZ, encoding: 'utf8' }).trim());
  } catch {
    return null;
  }
}

export function empaquetar({ dominio = null, salida = path.join(RAIZ, 'dist'), datos = paginasDelRepositorio(), conZip = true } = {}) {
  const base = dominio ? normalizarBase(dominio) : null;
  if (dominio && !base) throw new Error(`«${dominio}» no es un dominio válido`);
  const sitio = path.join(RAIZ, 'site');
  if (!existsSync(path.join(sitio, 'data', 'ofertas.json'))) {
    throw new Error('No hay datos en site/data/: bájalos de la web publicada con «npm run datos:publicados» o escanea con «npm run escanear»');
  }
  const destino = path.join(salida, NOMBRE);
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(salida, { recursive: true });
  cpSync(sitio, destino, { recursive: true, filter: (origen) => !/\.(bak|tmp)$/.test(origen) });

  // Páginas para buscadores, sitemap y robots.txt con la dirección de este dominio.
  for (const carpeta of CARPETAS) rmSync(path.join(destino, carpeta), { recursive: true, force: true });
  for (const archivo of ['sitemap.xml', 'robots.txt']) rmSync(path.join(destino, archivo), { force: true });
  const datosPanel = leerDatos(sitio);
  const { archivos } = generarPaginas(datosPanel, { base });
  for (const { ruta, contenido } of archivos) {
    const archivo = path.join(destino, ruta);
    mkdirSync(path.dirname(archivo), { recursive: true });
    writeFileSync(archivo, contenido);
  }

  // En GitHub Actions, la del commit (la misma que Pages): la interfaz se renueva solo si cambia.
  const version = process.env.GITHUB_SHA ? `hosting-${process.env.GITHUB_SHA.slice(0, 12)}` : `zip-${datosPanel.generado.replace(/\D/g, '').slice(0, 12)}`;
  const hecho = prepararWeb({ dir: destino, base, version, conHtaccess: true, datos, googleAds: googleAdsDeAjustes() });
  // Sin dominio: nada de direcciones de otra web (la de GitHub Pages, si site/ ya venía
  // preparada) y el enlace de la 404 a la raíz (la 404 se sirve en cualquier ruta).
  if (!base) {
    const indice = path.join(destino, 'index.html');
    writeFileSync(indice, quitarDireccion(readFileSync(indice, 'utf8')));
    const error404 = path.join(destino, '404.html');
    writeFileSync(error404, ponerDireccion(readFileSync(error404, 'utf8'), '/', { pagina: '404' }));
  }
  writeFileSync(path.join(destino, 'LEEME-HOSTINGER.txt'), instrucciones({ base, generado: datosPanel.generado, datos }));

  if (!conZip) return { destino, zip: null, paginas: archivos.length, hecho };
  const zip = path.join(salida, `${NOMBRE}.zip`);
  rmSync(zip, { force: true });
  execFileSync('zip', ['-r', '-q', '-X', zip, '.'], { cwd: destino });
  return { destino, zip, paginas: archivos.length, hecho };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opciones = leerArgumentos(process.argv.slice(2));
  try {
    // --sin-datos-remotos: la web usa solo la copia de los datos del zip (no se actualiza sola).
    const datos = opciones['sin-datos-remotos'] ? null : normalizarBase(opciones.datos) ?? undefined;
    // --sin-zip: solo la carpeta (para publicarla en la rama «web-hosting»).
    const { zip, destino, paginas, hecho } = empaquetar({
      dominio: opciones.dominio || null, salida: opciones.salida ? path.resolve(opciones.salida) : undefined, datos, conZip: !opciones['sin-zip'],
    });
    console.log(`Listo: ${path.relative(RAIZ, zip ?? destino)} (${paginas} páginas para buscadores · ${hecho.join(' · ')})`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
