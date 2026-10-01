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
    assert.equal(textoViaje(e), 'Desde Barcelona · 3 personas · 2 noches');
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

describe('coste total en el panel', async () => {
  const { buscarEscapadas, leerFiltrosEscapadas } = await import('../site/js/filtros.js');
  const { contenidoFicha, tarjeta } = await import('../site/js/plantillas.js');
  const { resultadosEscapadas } = await import('../site/js/vistas.js');
  const conCoche = { ...datos, coche: { consumoL100km: 6.5, precioLitro: 1.8 } };
  const e = { ...estado(), datos: conCoche };

  it('las escapadas se pueden ordenar por coste total y las que no tienen total van al final', () => {
    const { ofertas, costes } = buscarEscapadas(conCoche.ofertas, leerFiltrosEscapadas({ orden: 'total' }), contextoBusqueda(e));
    const totales = ofertas.map((o) => costes.get(o.id).total);
    const conTotal = totales.filter((t) => t != null);
    assert.ok(conTotal.length > 0, 'la fixture tiene ofertas con total');
    assert.deepEqual(conTotal, [...conTotal].sort((a, b) => a - b), 'de menor a mayor');
    assert.ok(totales.indexOf(null) === -1 || totales.slice(totales.indexOf(null)).every((t) => t == null), 'sin total, al final');
    assert.match(resultadosEscapadas(e, { orden: 'total' }), /Ordenadas por lo que cuesta el viaje completo desde Barcelona para 3 personas/);
  });

  it('la tarjeta enseña el total y la ficha su desglose con lo estimado', () => {
    const { ofertas } = buscarEscapadas(conCoche.ofertas, leerFiltrosEscapadas({ orden: 'total' }), contextoBusqueda(e));
    const [primera] = ofertas;
    const ctx = ctxTarjetas(e);
    const html = tarjeta(primera, ctx);
    assert.match(html, /class="dato-extra coste-total" title="[^"]*\d+\s€\/persona[^"]*La oferta la cobra la web[^]*?Viaje (estimado )?para 3 personas<\/span> <strong>(≈ )?\d+\s€<\/strong>/);
    // Primero el coste comparable; debajo, rotulado, el precio de la web.
    assert.ok(html.indexOf('coste-total') < html.indexOf('precio--publicado'));
    assert.match(html, /<p class="precio precio--publicado"><span class="precio__etiqueta">Precio en [^<]+<\/span>/);
    const ficha = contenidoFicha(primera, ctx);
    assert.match(ficha, /<\/svg>Coste del viaje<\/h3>/);
    assert.match(ficha, /class="coste__grande"><strong>(≈ )?[\d.]+\s€<\/strong><span class="suave">3 personas/);
    assert.match(ficha, /class="coste__parte"[^]*coste__calculo/, 'cada parte con su cuenta debajo');
    assert.match(ficha, /data-mi-viaje/);
  });

  it('lo más cómodo pone primero lo que está más cerca', () => {
    const { ofertas, distancias } = buscarEscapadas(conCoche.ofertas, leerFiltrosEscapadas({ orden: 'comodo' }), contextoBusqueda(e));
    const minutos = ofertas.map((o) => distancias.get(o.id)?.minutos).filter((m) => m != null);
    assert.deepEqual(minutos, [...minutos].sort((a, b) => a - b));
  });
});

describe('presupuesto y calidad/precio', async () => {
  const { buscarEscapadas, filtrosActivos, leerFiltrosEscapadas } = await import('../site/js/filtros.js');
  const conCoche = { ...datos, coche: { consumoL100km: 6.5, precioLitro: 1.8 } };
  const e = { ...estado(), datos: conCoche };
  const buscar = (params) => buscarEscapadas(conCoche.ofertas, leerFiltrosEscapadas(params), contextoBusqueda(e));

  it('el presupuesto total o por persona deja solo lo que cabe, con total comprobable', () => {
    const { ofertas, costes, sinTotal } = buscar({ pres: '300' });
    assert.ok(ofertas.length > 0);
    assert.ok(ofertas.every((o) => costes.get(o.id).total <= 300));
    assert.ok(sinTotal > 0, 'se cuentan las que no se pueden comprobar');
    const porPersona = buscar({ pres: '100', prespor: 'persona' });
    assert.ok(porPersona.ofertas.every((o) => porPersona.costes.get(o.id).porPersona <= 100));
    assert.deepEqual(filtrosActivos('escapadas', { pres: '100', prespor: 'persona' }).map((c) => c.texto), ['Hasta 100 € por persona (viaje completo)']);
  });

  it('calidad/precio pone primero más nota por euro', () => {
    const { ofertas, costes } = buscar({ orden: 'calidad' });
    const valores = ofertas.map((o) => (o.valoracion?.nota && costes.get(o.id).porPersona ? o.valoracion.nota / costes.get(o.id).porPersona : null)).filter((v) => v != null);
    assert.ok(valores.length > 1);
    assert.deepEqual(valores, [...valores].sort((a, b) => b - a));
  });
});

describe('comparar', async () => {
  const { vistaComparar } = await import('../site/js/vistas.js');
  const conCoche = { ...datos, coche: { consumoL100km: 6.5, precioLitro: 1.8 } };
  const hoteles = conCoche.ofertas.filter((o) => o.tipo === 'hotel' && typeof o.precio === 'number').slice(0, 3);
  const e = { ...estado(), datos: conCoche, comparar: new Set(hoteles.map((o) => o.id)) };

  it('una columna por oferta elegida, con el viaje completo y el más barato marcado', () => {
    const html = vistaComparar(e, {});
    assert.equal((html.match(/<th scope="col">/g) ?? []).length, 3);
    assert.match(html, /Viaje completo<br><span class="suave">3 personas desde Barcelona/);
    assert.match(html, /El más barato/);
    assert.match(html, /href="#\/comparar\?ids=/, 'enlace para compartir la comparación');
  });

  it('un enlace compartido manda sobre lo elegido y sin nada elegido lo explica', () => {
    assert.equal((vistaComparar(e, { ids: hoteles[0].id }).match(/<th scope="col">/g) ?? []).length, 1);
    assert.match(vistaComparar({ ...e, comparar: new Set() }, {}), /No has elegido nada para comparar/);
  });
});

describe('encuéntrame un finde', async () => {
  const { buscadorFinde, paramsBuscadorFinde } = await import('../site/js/vistas.js');
  it('un solo formulario desde tu salida y lleva a escapadas con esos filtros, por coste total', () => {
    const html = buscadorFinde({ ...estado(GIRONA) });
    assert.match(html, /Desde <button[^>]*data-mi-viaje>Girona, 3 personas y 2 noches<\/button>/);
    for (const campo of ['cuando', 'pres', 'como', 'temas']) assert.match(html, new RegExp(`name="${campo}"`));
    assert.deepEqual(paramsBuscadorFinde({ cuando: 'finde', pres: '150', como: 'sincoche', temas: 'spa' }),
      { cuando: 'finde', temas: 'spa', orden: 'total', pres: '150', prespor: 'persona', sincoche: '1' });
    assert.deepEqual(paramsBuscadorFinde({ cuando: '', pres: '', como: 'coche' }), { cuando: '', temas: '', orden: 'total', transporte: 'coche' });
  });
});

describe('compartir la búsqueda y marcas propias', async () => {
  const { filtrosActivos, paramsViaje, viajeDeParams } = await import('../site/js/filtros.js');
  const { avisoViajeCompartido } = await import('../site/js/vistas.js');
  const { tarjeta } = await import('../site/js/plantillas.js');

  it('el enlace lleva salida, viajeros y noches, que no cuentan como filtros', () => {
    const p = paramsViaje(GIRONA, { viajeros: 4, noches: 3 });
    assert.deepEqual(p, { sal: 'Girona', slat: '41.98', slon: '2.82', vj: '4', nc: '3' });
    assert.deepEqual(filtrosActivos('escapadas', { temas: 'spa', ...p }).map((c) => c.clave), ['temas']);
    assert.deepEqual(viajeDeParams(p), { salida: { nombre: 'Girona', lat: '41.98', lon: '2.82' }, viaje: { viajeros: '4', noches: '3' } });
    assert.equal(viajeDeParams({ temas: 'spa' }), null);
  });

  it('quien abre el enlace ve para quién era y elige si lo usa; si ya es lo suyo, no se avisa', () => {
    assert.match(avisoViajeCompartido(estado(), { vj: '4', nc: '3', sal: 'Girona', slat: '41.98', slon: '2.82' }), /se compartió para <strong>Girona, 4 personas y 3 noches<\/strong>; tú la ves para Barcelona, 3 personas y 2 noches/);
    assert.equal(avisoViajeCompartido(estado(), { vj: '3', nc: '2' }), '');
  });

  it('«reservada» y «no disponible» se ven en la tarjeta, solo para quien las marcó', () => {
    const [o] = datos.ofertas;
    const ctx = ctxTarjetas({ ...estado(), misEstados: new Map([[o.id, 'no-disponible']]) });
    assert.match(tarjeta(o, ctx), /insignia--alerta">[^]*?No disponible \(marcada por ti\)/);
    assert.ok(!tarjeta(o, ctxTarjetas(estado())).includes('marcada por ti'));
  });
});
