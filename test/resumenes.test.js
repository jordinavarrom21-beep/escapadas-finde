import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { anadirResumenes, leerRespuesta, mensajeLote, resumibles } from '../src/enriquecer/resumenes.js';
import { crearCtx, oferta } from './ayudas.js';

const TEXTO = '2 noches en hotel 4* con desayuno buffet y acceso al circuito spa de 90 minutos para dos personas.';
const respuestaCon = (resumenes, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'text', text: JSON.stringify({ resumenes }) }] });

function claudeFalso(responder) {
  const peticiones = [];
  return { peticiones, beta: { messages: { create: async (p) => { peticiones.push(p); return responder(p); } } } };
}

describe('resúmenes de una frase con Claude (opcional)', () => {
  it('sin ANTHROPIC_API_KEY no pide nada', async () => {
    const { ctx } = crearCtx();
    const claude = claudeFalso(() => { throw new Error('no debería llamarse'); });
    ctx.claude = claude;
    const o = oferta({ descripcion: TEXTO });
    await anadirResumenes([o], ctx);
    assert.equal(o.resumen, null);
    assert.equal(claude.peticiones.length, 0);
  });

  it('pide en lote, con salida JSON y esfuerzo bajo; guarda y no repite mientras el texto no cambie', async () => {
    const { ctx } = crearCtx();
    ctx.env = { ANTHROPIC_API_KEY: 'x' };
    const ofertas = [oferta({ descripcion: TEXTO }), oferta({ descripcion: TEXTO }), oferta({ tipo: 'vuelo', descripcion: TEXTO })];
    const claude = claudeFalso((p) => respuestaCon(JSON.parse(p.messages[0].content).map((x) => ({ id: x.id, resumen: 'Hotel 4* dos noches con desayuno y circuito spa' }))));
    ctx.claude = claude;
    await anadirResumenes(ofertas, ctx);
    assert.equal(claude.peticiones.length, 1);
    const [peticion] = claude.peticiones;
    assert.equal(peticion.model, 'claude-opus-5-5');
    assert.equal(peticion.output_config.effort, 'low');
    assert.equal(peticion.output_config.format.type, 'json_schema');
    assert.equal(JSON.parse(peticion.messages[0].content).length, 2, 'los vuelos no se resumen');
    assert.equal(ofertas[0].resumen, 'Hotel 4* dos noches con desayuno y circuito spa');
    await anadirResumenes(ofertas, ctx);
    assert.equal(claude.peticiones.length, 1, 'la segunda vez sale de lo guardado');
  });

  it('un rechazo o un JSON roto no rompe el escaneo', async () => {
    const { ctx, logs } = crearCtx();
    ctx.env = { ANTHROPIC_API_KEY: 'x' };
    ctx.claude = claudeFalso(() => respuestaCon([], 'refusal'));
    const o = oferta({ descripcion: TEXTO });
    await anadirResumenes([o], ctx);
    assert.equal(o.resumen, null);
    assert.match(logs.join('\n'), /lote fallido/);
  });

  it('solo se aceptan los ids pedidos', () => {
    const r = leerRespuesta(respuestaCon([{ id: 'a', resumen: 'Resumen válido de la a' }, { id: 'intruso', resumen: 'No pedido para nada' }]), ['a']);
    assert.deepEqual([...r.keys()], ['a']);
    assert.equal(resumibles([oferta({ descripcion: 'corto' })]).length, 0);
    assert.ok(mensajeLote([oferta({ descripcion: 'x'.repeat(2000) })]).length < 1200, 'el texto va recortado');
  });
});
