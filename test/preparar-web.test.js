import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { htaccess, leerArgumentos, normalizarBase, ponerDireccion, ponerPortada, prepararWeb } from '../scripts/preparar-web.js';

const SITE = new URL('../site/', import.meta.url);

describe('preparar la web para publicar (GitHub Pages y Hostinger)', () => {
  it('direcciones: con o sin https, con o sin barra final', () => {
    assert.equal(normalizarBase('midominio.es'), 'https://midominio.es/');
    assert.equal(normalizarBase('https://www.midominio.es'), 'https://www.midominio.es/');
    assert.equal(normalizarBase('https://usuario.github.io/escapadas-finde'), 'https://usuario.github.io/escapadas-finde/');
    assert.equal(normalizarBase('no es una url'), null);
    assert.deepEqual(leerArgumentos(['--base', 'x.es', '--htaccess', '--version=1']), { base: 'x.es', htaccess: true, version: '1' });
  });

  it('vista previa y canónica con la dirección absoluta; se puede repetir sin duplicar', () => {
    const html = readFileSync(new URL('index.html', SITE), 'utf8');
    const una = ponerDireccion(html, 'https://midominio.es/');
    const dos = ponerDireccion(una, 'https://midominio.es/');
    assert.equal(una, dos);
    assert.match(una, /<meta property="og:image" content="https:\/\/midominio\.es\/og\.png">\n {2}<meta property="og:url" content="https:\/\/midominio\.es\/">\n {2}<link rel="canonical" href="https:\/\/midominio\.es\/">/);
    assert.match(ponerDireccion(readFileSync(new URL('404.html', SITE), 'utf8'), 'https://midominio.es/', { pagina: '404' }), /href="https:\/\/midominio\.es\/" data-inicio/);
  });

  it('.htaccess: HTTPS y un solo dominio, 404, sin copias de datos, caché y cabeceras', () => {
    const texto = htaccess('https://www.midominio.es/');
    assert.match(texto, /RewriteCond %\{HTTP_HOST\} !\^www\\\.midominio\\\.es\$ \[NC\]\n {2}RewriteRule \^ https:\/\/www\.midominio\.es%\{REQUEST_URI\} \[R=301,L\]/);
    assert.match(texto, /RewriteCond %\{HTTPS\} !=on\n {2}RewriteCond %\{HTTP:X-Forwarded-Proto\} !=https\n/, 'sin bucle detrás de un CDN');
    assert.match(texto, /ErrorDocument 404 \/404\.html/);
    assert.match(texto, /RewriteRule \\\.\(bak\|tmp\)\$ - \[F,L\]/);
    assert.match(texto, /X-Content-Type-Options "nosniff"/);
    assert.match(texto, /sw\\\.js\|\\\.json/);
    assert.match(texto, /<FilesMatch "\(\\\.json\|\^LEEME-HOSTINGER\\\.txt\)\$">\n {4}Header set X-Robots-Tag "noindex"/, 'los datos en bruto no salen en los buscadores');
  });

  it('portada para buscadores y JSON-LD de la web en el <head>; se puede repetir sin duplicar', () => {
    const html = readFileSync(new URL('index.html', SITE), 'utf8');
    const bloque = '<div class="portada-estatica">\n<h1>Hola</h1>\n</div>';
    const una = ponerPortada(html, bloque, 'https://midominio.es/');
    assert.equal(ponerPortada(una, bloque, 'https://midominio.es/'), una);
    assert.equal((una.match(/class="portada-estatica"/g) ?? []).length, 1);
    const [cabeza, cuerpo] = una.split('</head>');
    assert.match(cabeza, /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@graph":\[\{"@type":"WebSite","@id":"https:\/\/midominio\.es\/#web"/);
    assert.match(cuerpo, /<main id="principal"[^>]*>[^]*<div class="portada-estatica">[^]*<p class="cargando"/);
    // Sin dirección (zip para cualquier dominio): el bloque sí, el JSON-LD no.
    const sinBase = ponerPortada(una, bloque, null);
    assert.doesNotMatch(sinBase, /application\/ld\+json/);
    assert.match(sinBase, /class="portada-estatica"/);
  });

  it('en una copia de la web: quita las copias de datos, versiona la caché y escribe el .htaccess', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'web-'));
    for (const archivo of ['index.html', '404.html', 'sw.js']) cpSync(new URL(archivo, SITE), path.join(dir, archivo));
    mkdirSync(path.join(dir, 'data'));
    writeFileSync(path.join(dir, 'data', 'ofertas.json'), '{}');
    writeFileSync(path.join(dir, 'data', 'ofertas.json.bak'), '{}');
    const hecho = prepararWeb({ dir, base: 'https://midominio.es/', version: 'abc123', conHtaccess: true });
    assert.ok(!existsSync(path.join(dir, 'data', 'ofertas.json.bak')));
    assert.ok(existsSync(path.join(dir, 'data', 'ofertas.json')));
    assert.match(readFileSync(path.join(dir, 'sw.js'), 'utf8'), /'escapadas-interfaz-abc123'/);
    assert.ok(existsSync(path.join(dir, '.htaccess')));
    assert.ok(hecho.includes('.htaccess'));
  });
});

describe('.htaccess sin dominio (zip para cualquier dominio)', () => {
  it('fuerza HTTPS con el dominio con el que se entra y no fija ninguno', () => {
    const texto = htaccess(null);
    assert.match(texto, /RewriteRule \^ https:\/\/%\{HTTP_HOST\}%\{REQUEST_URI\} \[R=301,L\]/);
    assert.doesNotMatch(texto, /RewriteCond %\{HTTP_HOST\}/);
  });
});

describe('datos remotos (hosting propio que lee las ofertas de GitHub Pages)', () => {
  it('pone la etiqueta y abre esa conexión en la CSP, sin duplicar', async () => {
    const { ponerDatosRemotos } = await import('../scripts/preparar-web.js');
    const html = readFileSync(new URL('index.html', SITE), 'utf8');
    const una = ponerDatosRemotos(html, 'https://usuario.github.io/escapadas-finde/');
    assert.equal(ponerDatosRemotos(una, 'https://usuario.github.io/escapadas-finde/'), una);
    assert.match(una, /<meta name="escapadas-datos" content="https:\/\/usuario\.github\.io\/escapadas-finde\/">/);
    assert.match(una, /connect-src 'self' https:\/\/usuario\.github\.io https:\/\/photon\.komoot\.io/);
    assert.equal((una.match(/<link rel="preconnect" href="https:\/\/usuario\.github\.io" crossorigin data-datos>/g) ?? []).length, 1, 'la conexión a los datos se abre antes');
  });
});

describe('web para un hosting sin dominio fijo', () => {
  it('quita la dirección de otra web y acepta un --dominio vacío', async () => {
    const { quitarDireccion } = await import('../scripts/preparar-web.js');
    const conDireccion = ponerDireccion(readFileSync(new URL('index.html', SITE), 'utf8'), 'https://usuario.github.io/escapadas-finde/');
    const limpia = quitarDireccion(conDireccion);
    assert.doesNotMatch(limpia, /og:url|rel="canonical"|usuario\.github\.io/);
    assert.match(limpia, /<meta property="og:image" content="og\.png">/);
    assert.deepEqual(leerArgumentos(['--sin-zip', '--dominio', '']), { 'sin-zip': true, dominio: '' });
    assert.match(htaccess(null), /RewriteRule \(\^\|\/\)\\\.git\(\/\|\$\) - \[F,L\]/, '.git nunca se sirve');
  });
});
