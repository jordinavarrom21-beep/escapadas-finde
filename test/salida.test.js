/**
 * Tu salida: con otra ciudad que no es el origen del escaneo, las distancias, los
 * aeropuertos y el texto se calculan desde ella (estimando), no desde Barcelona.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { medirDistancias } from '../site/js/filtros.js';
import { contextoBusqueda, ctxTarjetas, misAeropuertos, nombreSalida, resultadosVuelos, textoViaje, vistaFinde } from '../site/js/vistas.js';

const datos = JSON.parse(readFileSync(new URL('./fixtures/panel/ofertas.json', import.meta.url), 'utf8'));
const GIRONA = { nombre: 'Girona', lat: 41.9794, lon: 2.8214 };

function estado(salida = null) {
  return {
    datos, historial: {}, vigilados: [], ahora: new Date('2026-09-18T08:00:00Z'), hoy: '2026-09-18', findes: datos.findes,
    puente: datos.puentes[0], favoritos: new Set(), descartadas: new Set(), busquedas: [], salto: 0, referencia: null,
    paginas: new Map(), ubicacion: {}, temas: new Map(datos.temas.map((t) => [t.id, t])),
    fuentes: new Map(datos.fuentes.map((f) => [f.id, f.nombre])), porId: new Map(datos.ofertas.map((o) => [o.id, o])),
    salida, viaje: { viajeros: 3, noches: 2 }, distanciasOrigen: medirDistancias(datos.ofertas, salida, datos.origen),
  };
}

describe('tu salida en el panel', () => {
  it('sin salida propia, todo es desde el origen del escaneo con sus aeropuertos', () => {
    const e = estado();
    assert.equal(nombreSalida(e), 'Barcelona');
    assert.deepEqual(misAeropuertos(e), datos.aeropuertos);
    assert.equal(textoViaje(e), '📍 Desde Barcelona · 3 personas · 2 noches');
    assert.equal(ctxTarjetas(e).salidaPropia, false);
  });

  it('desde Girona: distancias estimadas desde allí, aeropuertos cercanos y sin la gasolina del escaneo', () => {
    const e = estado(GIRONA);
    assert.equal(nombreSalida(e), 'Girona');
    assert.deepEqual(misAeropuertos(e), ['GRO', 'PGF', 'BCN']);
    const ctx = ctxTarjetas(e);
    assert.equal(ctx.desde, 'Girona');
    assert.equal(ctx.salidaPropia, true);
    assert.equal(ctx.viajeros, 3);
    const girona = datos.ofertas.find((o) => o.lugar?.nombre === 'Girona' && o.tipo !== 'vuelo');
    assert.ok(ctx.distancias.get(girona.id).km < 2, 'Girona está a 0 km de Girona, no a 100');
    assert.equal(contextoBusqueda(e).salida, GIRONA);
    assert.match(resultadosVuelos(e, {}), /Billetes sin fecha/);
    assert.match(vistaFinde(e, {}), /a menos de 3 h de Girona/);
  });
});
