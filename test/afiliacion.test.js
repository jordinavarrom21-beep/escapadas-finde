import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { aplicarAfiliacion, conAfiliacion, proveedoresActivos } from '../src/afiliacion.js';
import { puntuar } from '../src/enriquecer/puntuacion.js';
import { contenidoFicha, tarjeta } from '../site/js/plantillas.js';
import { AJUSTES, oferta } from './ayudas.js';

const CONFIG = JSON.parse(readFileSync(new URL('../config/afiliacion.json', import.meta.url), 'utf8'));
const activa = (extra = {}) => ({ proveedores: { civitatis: { activo: true, aprobado: true, dominios: ['civitatis.com'], parametros: { aid: '123' }, ...extra } } });
const ctx = { temas: new Map(), fuentes: new Map(), favoritos: new Set() };

describe('afiliación', () => {
  it('tal como está en el repo, todo desactivado: ningún proveedor y los enlaces quedan igual', () => {
    assert.deepEqual(proveedoresActivos(CONFIG), []);
    const o = aplicarAfiliacion(oferta({ url: 'https://www.civitatis.com/es/barcelona/visita/' }), { activos: [] });
    assert.equal(o.urlReserva, 'https://www.civitatis.com/es/barcelona/visita/');
    assert.equal(o.afiliado, null);
    const html = tarjeta(o, ctx);
    assert.ok(!html.includes('sponsored') && !html.includes('Enlace de afiliado'));
  });

  it('activo pero sin aprobar o sin identificador no marca nada, y lo avisa', () => {
    const avisos = [];
    assert.deepEqual(proveedoresActivos(activa({ aprobado: false }), (m) => avisos.push(m)), []);
    assert.deepEqual(proveedoresActivos(activa({ parametros: { aid: '' } }), (m) => avisos.push(m)), []);
    assert.equal(avisos.length, 2);
    assert.match(avisos[0], /civitatis.*aprobado: true/);
  });

  it('con la cuenta aprobada añade el identificador conservando los parámetros de la URL', () => {
    const activos = proveedoresActivos(activa());
    assert.deepEqual(conAfiliacion('https://www.civitatis.com/es/buscar/?q=Girona', activos), { url: 'https://www.civitatis.com/es/buscar/?q=Girona&aid=123', afiliado: 'civitatis' });
    assert.equal(conAfiliacion('https://www.booking.com/x', activos).afiliado, null, 'otro dominio, igual');
    assert.equal(conAfiliacion('https://civitatis.com.estafa.es/', activos).afiliado, null, 'un dominio que solo lo contiene no cuenta');
    const o = aplicarAfiliacion(oferta({ url: 'https://www.civitatis.com/es/barcelona/visita/', enlaces: [{ etiqueta: 'Actividades en Civitatis', url: 'https://www.civitatis.com/es/buscar/?q=Sitges' }] }), { activos });
    assert.equal(o.url, 'https://www.civitatis.com/es/barcelona/visita/', 'la url limpia se conserva (duplicados, historial)');
    assert.equal(o.urlReserva, 'https://www.civitatis.com/es/barcelona/visita/?aid=123');
    assert.equal(o.enlaces[0].afiliado, 'civitatis');
    const html = tarjeta(o, ctx);
    assert.match(html, /href="https:\/\/www\.civitatis\.com\/es\/barcelona\/visita\/\?aid=123"[^>]*rel="sponsored noopener noreferrer"/);
    assert.match(html, /Enlace de afiliado/);
    const ficha = contenidoFicha(o, ctx);
    assert.match(ficha, /Actividades en Civitatis <span class="suave">\(afiliado\)<\/span>/);
    assert.match(ficha, /No cambia tu precio ni el orden de las ofertas/);
  });

  it('una patrocinada se marca y no cambia su puntuación', () => {
    const [normal, pagada] = [oferta({ precio: 50, unidad: 'pp' }), oferta({ precio: 50, unidad: 'pp' })];
    aplicarAfiliacion(pagada, { patrocinadas: [{ ofertaId: pagada.id, anunciante: 'Hotel X' }] });
    aplicarAfiliacion(normal, {});
    puntuar([normal, pagada], AJUSTES);
    assert.equal(pagada.puntuacion, normal.puntuacion);
    assert.deepEqual(pagada.patrocinada, { anunciante: 'Hotel X' });
    assert.match(tarjeta(pagada, ctx), /Patrocinado · Hotel X/);
    assert.match(tarjeta(pagada, ctx), /rel="sponsored/);
    const caducada = aplicarAfiliacion(oferta({}), { patrocinadas: [{ ofertaId: 'x', anunciante: 'Y', hasta: '2000-01-01' }] });
    assert.equal(caducada.patrocinada, null);
  });
});

describe('vigilados: fechas y presupuesto del viaje completo', async () => {
  const { coincide, costeDesdeOrigen, validarVigilado } = await import('../src/vigilados.js');
  const { criterioVigilado, leerFiltrosEscapadas } = await import('../site/js/filtros.js');
  // Casa rural en Girona: 120 € la noche la casa entera, 2 h en coche, 25 € de gasolina ida y vuelta.
  const casa = oferta({ tipo: 'hotel', precio: 120, unidad: 'noche', temas: ['spa'], cocheKm: 100, cocheMin: 90, costeCoche: { eur: 25, litros: 13 }, fechas: { salida: '2026-10-09', vuelta: '2026-10-11' } });

  it('el presupuesto usa el mismo coste del viaje que el panel', () => {
    assert.equal(costeDesdeOrigen(casa, 2).total, 265, '120 × 2 noches + 25 € de gasolina');
    assert.equal(coincide(casa, { nombre: 'x', presupuestoMax: 270 }), true);
    assert.equal(coincide(casa, { nombre: 'x', presupuestoMax: 180 }), false);
    assert.equal(coincide(casa, { nombre: 'x', presupuestoMax: 140, presupuestoPor: 'persona', viajeros: 2 }), true, '132,50 € por persona');
    assert.equal(coincide(oferta({ precio: 50, unidad: null }), { nombre: 'x', presupuestoMax: 999 }), false, 'sin total no se puede comprobar');
  });

  it('«cualquier finde de octubre» con desde/hasta', () => {
    const octubre = { nombre: 'x', desde: '2026-10-01', hasta: '2026-10-31' };
    assert.equal(coincide(casa, octubre), true);
    assert.equal(coincide(casa, { ...octubre, desde: '2026-11-01', hasta: '2026-11-30' }), false);
    assert.equal(coincide(oferta({ caduca: '2026-10-05T10:00:00Z' }), octubre), true, 'flexible y vigente en octubre');
    assert.equal(coincide(oferta({ caduca: '2026-09-20T10:00:00Z' }), octubre), false, 'caduca antes');
    assert.deepEqual(validarVigilado({ nombre: 'x', desde: '1/10', presupuestoPor: 'pareja', viajeros: 0 }).length, 3);
  });

  it('el panel copia fechas, presupuesto, viajeros y un radio alrededor de tu salida', () => {
    const f = leerFiltrosEscapadas({ temas: 'spa', h: '2', desde: '2026-10-01', hasta: '2026-10-31', pres: '180', prespor: 'total' });
    const criterio = criterioVigilado('Spa en octubre', f, { salida: { nombre: 'Girona', lat: 41.9794, lon: 2.8214 }, viajeros: 2 });
    assert.deepEqual(criterio, {
      nombre: 'Spa en octubre', tema: 'spa', cerca: { lat: 41.9794, lon: 2.8214, radioKm: 123 },
      desde: '2026-10-01', hasta: '2026-10-31', presupuestoMax: 180, viajeros: 2, sinCruceros: true,
    });
    assert.deepEqual(validarVigilado(criterio), []);
  });
});

describe('vigilados en el panel: los avisos solo se dan por activos si se entregan', async () => {
  const { vistaVigilados } = await import('../site/js/vistas.js');
  const base = { propietario: true, vigilados: [], porId: new Map(), ubicacion: {}, datos: { temas: [], origen: { nombre: 'Barcelona', lat: 41.39, lon: 2.17 } } };
  it('dice si el email está configurado, si no lo está o si aún no se sabe', () => {
    assert.match(vistaVigilados({ ...base, datos: { ...base.datos, avisos: { email: true } } }), /Avisos por email activos/);
    assert.match(vistaVigilados({ ...base, datos: { ...base.datos, avisos: { email: false } } }), /no están configurados[^]*no te llegará ningún aviso/);
    assert.match(vistaVigilados(base), /tras la próxima revisión/);
    assert.match(vistaVigilados(base), /"activo": false/);
  });
  it('a un visitante no le enseña los criterios del dueño ni cómo está montado el correo', () => {
    const visitante = { ...base, propietario: false, vigilados: [{ nombre: 'Oporto en avión', coincidencias: [] }], datos: { ...base.datos, avisos: { email: false } } };
    const html = vistaVigilados(visitante);
    assert.doesNotMatch(html, /Oporto|secretos|GitHub|vigilados\.json/);
    assert.match(html, /Esta web no envía emails/);
    assert.match(html, /#\/mis\?ver=busquedas/);
  });
});

describe('afiliación con envoltura (Awin, TradeTracker…)', () => {
  it('envuelve la URL de la oferta, codificada, en el enlace de la red', () => {
    const activos = proveedoresActivos({ proveedores: { atrapalo: { activo: true, aprobado: true, dominios: ['atrapalo.com'], envoltura: 'https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued={url}' } } });
    const r = conAfiliacion('https://www.atrapalo.com/hoteles/x?a=1&b=2', activos);
    assert.equal(r.afiliado, 'atrapalo');
    assert.equal(r.url, 'https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued=https%3A%2F%2Fwww.atrapalo.com%2Fhoteles%2Fx%3Fa%3D1%26b%3D2');
  });
  it('una envoltura sin {url} o sin https no se activa, y se avisa', () => {
    const avisos = [];
    const activos = proveedoresActivos({ proveedores: { x: { activo: true, aprobado: true, dominios: ['x.com'], envoltura: 'http://red.com/?u=' } } }, (m) => avisos.push(m));
    assert.deepEqual(activos, []);
    assert.match(avisos[0], /envoltura https con \{url\}/);
  });
  it('Awin: con el número del anunciante (awinmid) y el tuyo (redes.awin.afiliado) se arma el enlace profundo', () => {
    const config = { redes: { awin: { afiliado: '3115639' } }, proveedores: { edreams: { activo: true, aprobado: true, dominios: ['edreams.es'], awinmid: ' 1234 ', envoltura: '' } } };
    const r = conAfiliacion('https://www.edreams.es/vuelos?a=1', proveedoresActivos(config));
    assert.equal(r.afiliado, 'edreams');
    assert.equal(r.url, 'https://www.awin1.com/cread.php?awinmid=1234&awinaffid=3115639&ued=https%3A%2F%2Fwww.edreams.es%2Fvuelos%3Fa%3D1');
    const avisos = [];
    assert.deepEqual(proveedoresActivos({ ...config, redes: {} }, (m) => avisos.push(m)), []);
    assert.deepEqual(proveedoresActivos({ ...config, proveedores: { edreams: { ...config.proveedores.edreams, awinmid: 'abc' } } }, (m) => avisos.push(m)), []);
    assert.match(avisos[0], /awinmid/);
    assert.equal(CONFIG.redes.awin.afiliado, '3115639');
  });
  it('la configuración del repositorio trae todas las webs desactivadas', () => {
    assert.ok(Object.keys(CONFIG.proveedores).length >= 15);
    assert.deepEqual(proveedoresActivos(CONFIG), []);
  });
});
