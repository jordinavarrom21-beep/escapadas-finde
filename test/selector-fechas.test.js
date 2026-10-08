/**
 * El calendario de «Fecha de entrada» y «Fecha de salida» (site/js/selector-fechas.js): qué pasa
 * al tocar cada día, la cuadrícula de cada mes y lo que dice a quien no ve la pantalla.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  camposFechas, completarSalida, diasDePuentes, elegirDia, htmlCalendario, nombreDia, semanasDelMes, sumarMeses, textoNoches,
} from '../site/js/selector-fechas.js';

describe('selector de fechas: entrada y salida', () => {
  it('el primer toque es la entrada y el segundo la salida; uno anterior a la entrada pasa a ser la entrada', () => {
    const vacio = { entrada: '', salida: '', editando: 'entrada' };
    const conEntrada = elegirDia(vacio, '2026-10-16');
    assert.deepEqual(conEntrada, { entrada: '2026-10-16', salida: '', editando: 'salida', completo: false });
    assert.deepEqual(elegirDia(conEntrada, '2026-10-18'), { entrada: '2026-10-16', salida: '2026-10-18', editando: 'entrada', completo: true });
    assert.deepEqual(elegirDia(conEntrada, '2026-10-14'), { entrada: '2026-10-14', salida: '', editando: 'salida', completo: false });
    assert.equal(elegirDia(conEntrada, '2026-10-16').completo, true, 'el mismo día: un solo día');
    // Eligiendo otra vez la entrada se empieza de nuevo.
    assert.deepEqual(elegirDia({ entrada: '2026-10-16', salida: '2026-10-18', editando: 'entrada' }, '2026-10-20'), { entrada: '2026-10-20', salida: '', editando: 'salida', completo: false });
  });

  it('sin salida, las noches de tu viaje después de la entrada; las noches se dicen junto a las fechas', () => {
    assert.equal(completarSalida({ entrada: '2026-10-30', salida: '' }, 3).salida, '2026-11-02');
    assert.equal(completarSalida({ entrada: '2026-10-30', salida: '' }).salida, '2026-11-01');
    assert.equal(completarSalida({ entrada: '', salida: '' }).salida, '');
    assert.equal(textoNoches('2026-10-16', '2026-10-18'), '2 noches');
    assert.equal(textoNoches('2026-10-16', '2026-10-17'), '1 noche');
    assert.equal(textoNoches('2026-10-16', '2026-10-16'), 'Un día');
    assert.equal(textoNoches('', ''), '');
  });

  it('los meses: semanas de lunes a domingo, con huecos, y el cambio de año', () => {
    const octubre = semanasDelMes('2026-10');
    assert.deepEqual(octubre[0], [null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'], 'el 1 de octubre de 2026 es jueves');
    assert.equal(octubre.flat().filter(Boolean).length, 31);
    assert.ok(octubre.every((semana) => semana.length === 7));
    assert.equal(sumarMeses('2026-12', 1), '2027-01');
    assert.equal(sumarMeses('2027-01', -1), '2026-12');
    assert.equal(nombreDia('2026-10-16'), 'viernes 16 de octubre');
  });

  it('el calendario: los días pasados no se eligen, los de un puente van marcados y cada día dice qué es', () => {
    const puentes = diasDePuentes([{ nombre: 'Fiesta Nacional', desde: '2026-10-10', hasta: '2026-10-12' }]);
    assert.deepEqual([...puentes.keys()], ['2026-10-10', '2026-10-11', '2026-10-12']);
    const html = htmlCalendario({ entrada: '2026-10-16', salida: '2026-10-18', editando: 'entrada' }, { hoy: '2026-10-08', mes: '2026-10', meses: 2, foco: '2026-10-16', puentes });
    assert.match(html, /<caption>octubre 2026<\/caption>[^]*<caption>noviembre 2026<\/caption>/);
    assert.match(html, /data-dia="2026-10-07" aria-label="miércoles 7 de octubre" aria-pressed="false" tabindex="-1" disabled>/, 'ayer, no');
    assert.match(html, /calendario__dia--hoy[^"]*" data-dia="2026-10-08" aria-label="jueves 8 de octubre, hoy"/);
    assert.match(html, /data-dia="2026-10-12" aria-label="lunes 12 de octubre, puente: Fiesta Nacional"/);
    assert.match(html, /data-dia="2026-10-16" aria-label="viernes 16 de octubre, fecha de entrada" aria-pressed="true" tabindex="0"/);
    assert.match(html, /calendario__dia--rango[^"]*" data-dia="2026-10-17"/);
    assert.match(html, /data-dia="2026-10-18" aria-label="domingo 18 de octubre, fecha de salida" aria-pressed="true"/);
    assert.match(html, /Entrada vie 16 oct · Salida dom 18 oct/);
    assert.match(html, /data-cal-mes="-1" aria-label="Mes anterior" disabled/, 'no se va a meses pasados');
    assert.match(htmlCalendario({ entrada: '2026-10-16', salida: '', editando: 'salida' }, { hoy: '2026-10-08', mes: '2026-10' }), /Ahora, la fecha de salida/);
    // Un año como mucho: el último mes no deja seguir.
    assert.match(htmlCalendario({ entrada: '', salida: '', editando: 'entrada' }, { hoy: '2026-10-08', mes: '2027-09' }), /data-cal-mes="1" aria-label="Mes siguiente" disabled/);
  });

  it('los campos: «Fecha de entrada» y «Fecha de salida», con «Añadir fecha» si no hay y quitar solo si se pide', () => {
    const html = camposFechas({ entrada: '2026-10-16', salida: '', idPanel: 'x', quitar: true });
    assert.match(html, /data-fechas-campo="entrada" aria-expanded="false" aria-controls="x">\s*<span class="fechas__etiqueta">Fecha de entrada<\/span>\s*<span class="fechas__valor">vie 16 oct/);
    assert.match(html, /<span class="fechas__etiqueta">Fecha de salida<\/span>\s*<span class="fechas__valor fechas__valor--vacio">Añadir fecha/);
    assert.match(html, /data-fechas-rapida="" aria-label="Quitar las fechas"/);
    assert.doesNotMatch(camposFechas({ idPanel: 'x' }), /Quitar/);
  });
});
