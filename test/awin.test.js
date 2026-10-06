/**
 * Awin automático (src/awin.js): con la clave en el secreto AWIN_API_TOKEN, los programas
 * aceptados se activan solos por dominio; sin clave o si Awin falla, todo queda igual.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { conProgramasAwin, programasAwin, programasDeRespuesta } from '../src/awin.js';
import { conAfiliacion, proveedoresActivos } from '../src/afiliacion.js';
import { Cache } from '../src/cache.js';

const RESPUESTA = [
  { id: 12345, name: 'eDreams ES', displayUrl: 'https://www.edreams.es', validDomains: [{ domain: 'www.edreams.es' }] },
  { id: 777, name: 'Web nueva', displayUrl: 'https://www.webnueva.com/' },
  { id: 'x', name: 'sin número' },
  { id: 9, name: 'sin dominio' },
];
const CONFIG = {
  redes: { awin: { afiliado: '3115639' } },
  proveedores: {
    edreams: { activo: false, aprobado: false, dominios: ['edreams.es', 'edreams.com'], awinmid: '', envoltura: '' },
    civitatis: { activo: false, aprobado: false, dominios: ['civitatis.com'], parametros: { aid: '' } },
  },
};

describe('Awin automático', () => {
  it('de la respuesta de la API: número y dominios, sin los programas sin número o sin dominio', () => {
    assert.deepEqual(programasDeRespuesta(RESPUESTA), [
      { id: '12345', nombre: 'eDreams ES', dominios: ['edreams.es'] },
      { id: '777', nombre: 'Web nueva', dominios: ['webnueva.com'] },
    ]);
    assert.deepEqual(programasDeRespuesta({ error: 'x' }), []);
  });

  it('activa los aceptados por dominio, añade los que faltan y arma el enlace de Awin', () => {
    const logs = [];
    const config = conProgramasAwin(CONFIG, programasDeRespuesta(RESPUESTA), (m) => logs.push(m));
    assert.equal(config.proveedores.edreams.awinmid, '12345');
    assert.deepEqual(config.proveedores['awin-777'].dominios, ['webnueva.com']);
    assert.equal(config.proveedores.civitatis.activo, false, 'lo que no está en Awin no cambia');
    const activos = proveedoresActivos(config);
    assert.deepEqual(activos.map((p) => p.id).sort(), ['awin-777', 'edreams']);
    assert.equal(conAfiliacion('https://www.edreams.es/vuelos', activos).url,
      'https://www.awin1.com/cread.php?awinmid=12345&awinaffid=3115639&ued=https%3A%2F%2Fwww.edreams.es%2Fvuelos');
    assert.match(logs[0], /2 programas aceptados/);
    assert.equal(conProgramasAwin(CONFIG, null), CONFIG);
  });

  it('lo escrito a mano manda: un proveedor con envoltura propia no se toca', () => {
    const manual = { ...CONFIG, proveedores: { edreams: { ...CONFIG.proveedores.edreams, envoltura: 'https://red.com/?u={url}' } } };
    assert.deepEqual(conProgramasAwin(manual, programasDeRespuesta(RESPUESTA)).proveedores.edreams, manual.proveedores.edreams);
  });

  it('pide a la API con la clave en la cabecera (nunca en la URL), guarda 12 h y sin clave no pide nada', async () => {
    const peticiones = [];
    const ctx = (env) => ({
      env, ahora: new Date('2026-10-06T12:00:00Z'), cache: new Cache(), log: () => {},
      http: { json: async (url, opciones) => { peticiones.push({ url, opciones }); return RESPUESTA; } },
    });
    assert.equal(await programasAwin(ctx({}), '3115639'), null);
    assert.equal(peticiones.length, 0);
    const logs = [];
    const c = { ...ctx({ AWIN_API_TOKEN: 'clave-de-prueba' }), log: (m) => logs.push(m) };
    const programas = await programasAwin(c, '3115639');
    assert.equal(programas.length, 2);
    assert.equal(peticiones[0].url, 'https://api.awin.com/publishers/3115639/programmes?relationship=joined');
    assert.equal(peticiones[0].opciones.cabeceras.Authorization, 'Bearer clave-de-prueba');
    assert.doesNotMatch(peticiones[0].url, /clave-de-prueba/);
    assert.match(logs[0], /Awin: 2 programas aceptados \(eDreams ES, Web nueva\)/);
    await programasAwin(c, '3115639');
    assert.equal(peticiones.length, 1, 'la segunda vez, de la caché');
  });

  it('con la clave bien pero sin programas aceptados, lo dice', async () => {
    const logs = [];
    const ctx = { env: { AWIN_API_TOKEN: 'x' }, ahora: new Date(), cache: new Cache(), log: (m) => logs.push(m), http: { json: async () => [] } };
    assert.deepEqual(await programasAwin(ctx, '3115639'), []);
    assert.match(logs[0], /Awin: 0 programas aceptados todavía/);
    // Sin ninguno aceptado, se vuelve a preguntar a la hora (no a las 12 h).
    let veces = 1;
    ctx.http.json = async () => { veces++; return []; };
    await programasAwin(ctx, '3115639');
    assert.equal(veces, 1, 'dentro de la hora, de la caché');
    await programasAwin({ ...ctx, ahora: new Date(ctx.ahora.getTime() + 61 * 60 * 1000) }, '3115639');
    assert.equal(veces, 2, 'pasada la hora, se pregunta otra vez');
  });

  it('si Awin falla se avisa sin la clave y se sigue', async () => {
    const logs = [];
    const error = Object.assign(new Error('HTTP 401 en api.awin.com'), { estado: 401 });
    const ctx = { env: { AWIN_API_TOKEN: 'secreta' }, ahora: new Date(), cache: new Cache(), log: (m) => logs.push(m), http: { json: async () => { throw error; } } };
    assert.equal(await programasAwin(ctx, '3115639'), null);
    assert.match(logs[0], /Awin no responde \(401\)/);
    assert.doesNotMatch(logs[0], /secreta/);
  });
});
