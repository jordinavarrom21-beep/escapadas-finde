import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { htaccess, leerArgumentos, normalizarBase, ponerDireccion, prepararWeb } from '../scripts/preparar-web.js';

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
    assert.match(texto, /RewriteCond %\{HTTP_HOST\} !\^www\\\.midominio\\\.es\$ \[NC\]\n {2}RewriteRule \^\(\.\*\)\$ https:\/\/www\.midominio\.es\/\$1 \[R=301,L\]/);
    assert.match(texto, /ErrorDocument 404 \/404\.html/);
    assert.match(texto, /RewriteRule \\\.\(bak\|tmp\)\$ - \[F,L\]/);
    assert.match(texto, /X-Content-Type-Options "nosniff"/);
    assert.match(texto, /sw\\\.js\|\\\.json/);
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
