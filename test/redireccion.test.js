import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { ErrorRed, clienteHttp, crearClienteHttp, obtenerRedireccion } from '../src/util/http.js';

/** Servidor local de verdad: prueba el fetch real de Node con redirect: 'manual'. */
describe('http: obtenerRedireccion (un salto, sin seguirlo)', () => {
  let base;
  let servidor;
  const pedidas = [];

  before(async () => {
    servidor = createServer((peticion, respuesta) => {
      pedidas.push({ url: peticion.url, cookie: peticion.headers.cookie ?? null });
      if (peticion.url === '/click') {
        respuesta.writeHead(302, { location: 'https://www.booking.com/hotel/es/peralada.es.html?aid=1', 'set-cookie': 'rastreo=1' });
        respuesta.end('cuerpo que no se debe leer');
      } else if (peticion.url === '/relativa') {
        respuesta.writeHead(301, { location: '/destino?x=1' }).end();
      } else if (peticion.url === '/lento') {
        setTimeout(() => respuesta.writeHead(200).end(), 500);
      } else {
        respuesta.writeHead(200, { 'content-type': 'text/html' }).end('<p>web final</p>');
      }
    });
    await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    base = `http://127.0.0.1:${servidor.address().port}`;
  });
  after(() => servidor.close());

  it('devuelve el destino de la redirección sin pedirlo', async () => {
    pedidas.length = 0;
    const r = await obtenerRedireccion(`${base}/click`);
    assert.deepEqual(r, { estado: 302, destino: 'https://www.booking.com/hotel/es/peralada.es.html?aid=1' });
    assert.deepEqual(pedidas.map((p) => p.url), ['/click'], 'solo se pide el enlace, no la web del comercio');
  });

  it('resuelve los destinos relativos y no guarda cookies entre peticiones', async () => {
    pedidas.length = 0;
    await obtenerRedireccion(`${base}/click`);
    const r = await obtenerRedireccion(`${base}/relativa`);
    assert.deepEqual(r, { estado: 301, destino: `${base}/destino?x=1` });
    assert.deepEqual(pedidas.map((p) => p.cookie), [null, null]);
  });

  it('sin redirección devuelve el estado y destino null', async () => {
    assert.deepEqual(await obtenerRedireccion(`${base}/final`), { estado: 200, destino: null });
  });

  it('corta con un ErrorRed de tiempo agotado', async () => {
    await assert.rejects(obtenerRedireccion(`${base}/lento`, { timeoutMs: 50 }), (error) => error instanceof ErrorRed && error.motivo === 'timeout');
  });

  it('los clientes que reciben las fuentes lo exponen (el buzón lo necesita)', () => {
    assert.equal(clienteHttp.redireccion, obtenerRedireccion);
    assert.equal(crearClienteHttp({ etiqueta: 'buzon' }).redireccion, obtenerRedireccion);
  });
});
