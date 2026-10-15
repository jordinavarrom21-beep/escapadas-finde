/**
 * El texto de las newsletters del buzón no se guarda en estado.json (rama «datos», pública):
 * lo que se dedujo de él, sí, y el siguiente escaneo lo conserva sin volver a deducirlo.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Cache } from '../src/cache.js';
import { escanear } from '../src/core/scan-pipeline.js';
import { estadoInicial, estadoParaGuardar, fuentesSinTexto } from '../src/almacen.js';
import { guardarTrasFallo } from '../src/escanear.js';
import { FUENTES } from '../src/fuentes/index.js';
import { marcarEquivalentes } from '../src/enriquecer/duplicados.js';
import { resumibles } from '../src/enriquecer/resumenes.js';
import { separarDatosPanel } from '../src/panel-datos.js';
import { AHORA, AJUSTES, oferta } from './ayudas.js';

const TEXTO = 'Dos noches con circuito de spa y cena. Los niños gratis hasta 12 años. Alojamiento en una casa rural.';
const modulos = { obtenerFestivos: async () => [], geolocalizar: async () => {}, calcularCoche: async () => {} };
const sinRed = { json: async () => [], texto: async () => '', esperar: async () => {} };
const boletin = (ofertas) => ({
  id: 'boletin', nombre: 'Boletín', web: 'https://mail.google.com', modo: 'buzon', requiere: [], urls: [], guardarTexto: false,
  obtener: async () => ({ ofertas: ofertas() }),
});
const web = (ofertas) => ({ id: 'web', nombre: 'Web', web: 'https://web.es', modo: 'buzon', requiere: [], urls: [], obtener: async () => ({ ofertas: ofertas() }) });
const correr = (estado, fuentes) => escanear({
  ajustes: { ...AJUSTES, fuentes: {} }, estado, fuentes, http: sinRed, ahora: AHORA, env: {}, modulos, cache: new Cache(),
  opciones: { sinEmails: true, forzar: true }, log: () => {},
});
const deducido = (o) => ({ temas: [...o.temas].sort(), ninos: o.ninos, alojamiento: o.alojamiento, noches: o.noches });
// Lo que pasa entre dos escaneos: se guarda en estado.json y se vuelve a leer.
const guardarYLeer = (estado, fuentes) => JSON.parse(JSON.stringify(estadoParaGuardar(estado, fuentesSinTexto(fuentes))));

describe('el texto de las newsletters no se guarda en la rama datos', () => {
  test('la fuente del buzón es la única que no guarda su texto', () => {
    assert.deepEqual([...fuentesSinTexto(FUENTES)], ['buzon']);
  });

  test('se guarda sin el texto pero con lo deducido de él, y el siguiente escaneo lo conserva', async () => {
    const nueva = () => oferta({ id: 'boletin:1', fuente: 'boletin', tipo: 'escapada', titulo: 'Escapada al Montseny', descripcion: TEXTO, precio: 120 });
    const del = oferta({ id: 'web:1', fuente: 'web', tipo: 'escapada', titulo: 'Escapada al Montseny', descripcion: TEXTO, precio: 120 });
    let leidas = [nueva()];
    const fuentes = [boletin(() => leidas), web(() => [structuredClone(del)])];
    const primero = await correr(estadoInicial(), fuentes);
    const antes = deducido(primero.estado.ofertas['boletin:1']);
    // Que de verdad sale del texto: spa, niños gratis (y por eso familia) y casa rural.
    assert.deepEqual(antes.temas.filter((t) => ['spa', 'familia'].includes(t)), ['familia', 'spa']);
    assert.equal(antes.ninos?.ventaja, 'gratis');
    assert.equal(antes.alojamiento, 'casa-rural');
    // En memoria el texto sigue ahí: el panel, las guías y los emails se hacen con él.
    assert.equal(primero.estado.ofertas['boletin:1'].descripcion, TEXTO);

    const guardado = guardarYLeer(primero.estado, fuentes);
    assert.equal(guardado.ofertas['boletin:1'].descripcion, '');
    assert.equal(guardado.ofertas['boletin:1'].textoRetirado, true);
    assert.match(guardado.ofertas['boletin:1'].huellaTexto, /^[0-9a-f]{16}$/);
    assert.ok(!JSON.stringify(guardado.ofertas['boletin:1']).includes('circuito'), 'ni un trozo del texto');
    // Las demás webs guardan su texto como siempre.
    assert.equal(guardado.ofertas['web:1'].descripcion, TEXTO);

    // Más de 3 días después ya no se relee el email: la oferta guardada sigue igual.
    leidas = [];
    const segundo = await correr(guardado, fuentes);
    assert.deepEqual(deducido(segundo.estado.ofertas['boletin:1']), antes);

    // Si vuelve a llegar con su texto, se deduce otra vez de él (con las reglas de ahora).
    leidas = [nueva()];
    const tercero = await correr(guardarYLeer(segundo.estado, fuentes), fuentes);
    assert.equal(tercero.estado.ofertas['boletin:1'].descripcion, TEXTO);
    assert.deepEqual(deducido(tercero.estado.ofertas['boletin:1']), antes);
  });

  test('si el escaneo se rompe a medias, tampoco se guarda el texto del buzón', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sin-texto-'));
    try {
      const ruta = (clave) => path.join(dir, `${clave}.json`);
      const estado = estadoInicial();
      estado.ofertas['buzon:1'] = oferta({ id: 'buzon:1', fuente: 'buzon', descripcion: TEXTO });
      estado.ofertas['weekendesk:1'] = oferta({ id: 'weekendesk:1', fuente: 'weekendesk', descripcion: TEXTO });
      guardarTrasFallo({ estado, cache: new Cache() }, ruta);
      const guardado = JSON.parse(readFileSync(ruta('estado'), 'utf8'));
      assert.equal(guardado.ofertas['buzon:1'].descripcion, '');
      assert.equal(guardado.ofertas['weekendesk:1'].descripcion, TEXTO);
      // Sin la marca: lo guardado a medias no se ha enriquecido, así que se vuelve a deducir.
      assert.equal(guardado.ofertas['buzon:1'].textoRetirado, undefined);
      assert.equal(estado.ofertas['buzon:1'].descripcion, TEXTO, 'en memoria no se toca');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('una copia guardada sin texto y otra con él siguen siendo la misma oferta repetida', () => {
    const datos = { fuente: 'buzon', titulo: 'Escapada al Montseny', precio: 120, descripcion: TEXTO };
    const [guardada] = Object.values(estadoParaGuardar({ ofertas: { 'buzon:1': oferta({ id: 'buzon:1', ...datos }) } }, new Set(['buzon'])).ofertas);
    const nueva = oferta({ id: 'buzon:2', ...datos });
    marcarEquivalentes([guardada, nueva]);
    assert.equal([guardada, nueva].filter((o) => o.etiquetas.includes('duplicada')).length, 1);
    const distinta = oferta({ id: 'buzon:3', ...datos, descripcion: 'Otra cosa: una noche con desayuno.' });
    marcarEquivalentes([guardada, distinta]);
    assert.ok(!distinta.etiquetas.includes('duplicada'));
  });

  test('las marcas no van al panel', () => {
    const o = { ...oferta({ fuente: 'buzon', descripcion: '' }), textoRetirado: true, huellaTexto: 'abcdef0123456789' };
    const [ligera] = separarDatosPanel({ generado: AHORA.toISOString(), ofertas: [o] }).ofertas.ofertas;
    assert.equal('textoRetirado' in ligera, false);
    assert.equal('huellaTexto' in ligera, false);
  });

  test('las ofertas de las webs de chollos no se resumen: el panel no enseña su resumen', () => {
    const largo = `${TEXTO} ${TEXTO}`;
    const ofertas = [oferta({ fuente: 'buzon', descripcion: largo }), oferta({ fuente: 'chollometro', descripcion: largo }), oferta({ fuente: 'weekendesk', descripcion: largo })];
    assert.deepEqual(resumibles(ofertas).map((o) => o.fuente), ['weekendesk']);
  });
});
