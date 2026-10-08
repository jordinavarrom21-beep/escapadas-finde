/**
 * Prueba funcional de la web en el navegador: cada acción y cada vista, con los datos de
 * site/data/. Uso: npm run test:navegador (sale con error si algo falla).
 * Las comprobaciones que dependen de lo que haya ese día (un chollazo destacado, vuelos
 * con fecha…) miran los datos y prueban el caso que toque.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, arrancar, contexto as nuevoContexto, vigilarErrores } from './comun.mjs';

const { base: BASE, navegador: b, cerrar } = await arrancar();
const datos = JSON.parse(readFileSync(path.join(RAIZ, 'site/data/ofertas.json'), 'utf8'));
const conVuelosConFecha = datos.ofertas.some((o) => o.vuelo?.ida?.salida);
const fallos = [];
const hechos = [];
const errores = [];
const ok = (cond, texto) => { if (cond) hechos.push(texto); else fallos.push(texto); };

const contexto = (opciones) => nuevoContexto(b, opciones);
async function pagina(c) {
  const p = await c.newPage();
  vigilarErrores(p, errores);
  return p;
}
const ir = async (p, ruta) => { await p.goto(`${BASE}#/${ruta}`); await p.waitForSelector('#principal .titulo-vista'); await p.waitForTimeout(300); };
const aviso = (p) => p.locator('#aviso').textContent();
const tarjetas = (p) => p.locator('#resultados .tarjeta, #resultados .billete').count();

const c = await contexto();
const p = await pagina(c);

// ── Portada ──
await ir(p, 'finde');
// Sin «Sugerencia de hoy»: la primera escapada de «Lo mejor para este finde» hace sus veces en las pruebas.
const primeraIdea = '.ideas__columna:first-child .idea:not(.idea--evento) .enlace-ficha';
const hayDestacado = await p.locator(primeraIdea).count() > 0;
ok(!(await p.locator('.portada__destacado, .sugerencia').count()), 'portada: sin «Sugerencia de hoy»');
ok((await p.locator('.buscador-finde input[name="cuando"]').count()) >= 3, 'portada: opciones de «¿Cuándo?»');
ok((await p.locator('.organizar input[name="que"]').count()) === 3, 'portada: «¿Qué buscas?» con escapadas, vuelos y planes');
ok((await p.locator('.viaje-resumen').count()) === 1 && !(await p.locator('#boton-viaje').isVisible()) && !(await p.locator('#buscador').isVisible()), 'portada: tu viaje y el destino, una sola vez');
// La portada y el pie dicen lo mismo del estado de las webs.
const estadoPortada = (await p.locator('.portada__confianza a[href="#/fuentes"]').textContent()).trim();
ok((await p.locator('#estado-fuentes').textContent()).includes(estadoPortada), `portada y pie: el mismo estado de las webs («${estadoPortada}»)`);
// El botón dice qué se va a ver y para cuándo.
await p.locator('.organizar__opcion:has(input[value="vuelos"])').click();
ok((await p.locator('[data-enviar-accion]').textContent()) === 'Ver vuelos', 'buscador: el botón cambia a «Ver vuelos»');
ok(!(await p.locator('.buscador-finde__mas').isVisible()), 'buscador: «Afinar la escapada» solo con escapadas');
await p.locator('.buscador-finde label.opcion:has(input[name="cuando"][value=""])').click();
ok((await p.locator('[data-enviar-para]').textContent()) === 'en cualquier fecha', 'buscador: el botón dice «en cualquier fecha»');
await p.locator('.organizar__opcion:has(input[value="escapadas"])').click();
// «Sorpréndeme» (atajo) abre tres planes; «Otra ronda», otros.
ok(await p.locator('#sorpresa-bloque').isHidden(), 'sorpresa: plegada de entrada');
await p.locator('.atajos-portada [data-sorpresa]').click();
await p.waitForTimeout(300);
ok(await p.locator('#sorpresa-bloque').isVisible() && (await aviso(p)).includes('Tres planes para ti'), 'sorpresa: el atajo la abre');
const antes = await p.locator('#sorpresa').innerHTML();
await p.locator('#sorpresa-bloque [data-sorpresa]').click();
await p.waitForTimeout(200);
ok((await p.locator('#sorpresa').innerHTML()) !== antes, 'sorpresa: «Otra ronda» cambia los planes');
ok((await aviso(p)).includes('Tres planes nuevos'), 'sorpresa: se anuncia');
// Lo mejor para este finde: tres listas cortas a la vista, cada una con su «Ver…».
ok((await p.locator('.portada__ideas .ideas__columna').count()) === 3 && await p.locator('.portada__ideas').isVisible(), 'lo mejor del finde: tres columnas a la vista');
// (El separador «Otras fechas» de Vuelos no es una oferta.)
ok((await p.locator('.ideas__lista').evaluateAll((ls) => ls.every((l) => l.querySelectorAll('.idea').length <= 4))), 'lo mejor del finde: como mucho cuatro por lista');
ok((await p.locator('.ideas__columna .ideas__mas').count()) === 3, 'lo mejor del finde: cada lista con su «Ver…»');
// Otras fechas: el calendario sale al elegirla y lleva a Escapadas con esas fechas.
ok(await p.locator('[data-fechas-propias]').isHidden(), 'otras fechas: calendario plegado de entrada');
await p.locator('label:has(input[name="cuando"][value="rango"])').click();
ok(await p.locator('[data-fechas-propias]').isVisible(), 'otras fechas: el calendario se abre');
await p.locator('label:has(input[name="cuando"][value="finde"])').click();
if (hayDestacado) {
  // La primera idea: su ficha guarda el favorito y descartar desde ella la quita
  const idDestacado = await p.locator(primeraIdea).first().getAttribute('data-ficha');
  await p.locator(primeraIdea).first().click();
  await p.waitForSelector('#ficha[open]');
  await p.locator('#ficha .boton-fav').click();
  ok((await p.locator('#ficha .boton-fav').getAttribute('aria-pressed')) === 'true', 'ficha: favorito marcado');
  await p.locator('#ficha [data-descartar]').click();
  await p.waitForTimeout(300);
  ok(!(await p.locator('#ficha[open]').count()), 'descartar desde la ficha la cierra');
  // (Las filas de eventos enlazan a la escapada de al lado: no son esa oferta en la lista.)
  ok(!(await p.locator(`.idea:not(.idea--evento) [data-ficha="${idDestacado}"]`).count()), 'descartar la quita de «Lo mejor para este finde»');
  // La descartada no vuelve al recargar
  await p.reload(); await p.waitForSelector('.portada');
  ok(!(await p.locator(`.idea:not(.idea--evento) [data-ficha="${idDestacado}"]`).count()), 'la descartada no vuelve tras recargar');
  // Recomendado aparece al tener favoritos
  ok((await p.locator('text=Por tus').count()) > 0 || (await p.locator('.seccion:has-text("Recomendado para ti") .rejilla').count()) > 0, 'recomendado: aparece con favoritos');
}

// Buscador de la portada
await p.locator('.buscador-finde label.opcion:has(input[name="cuando"]:not([value="finde"]):not([value=""]))').first().click();
// «Afinar la escapada» (plegado): qué apetece, cómo vas y presupuesto; luego «Ver escapadas».
await p.locator('.buscador-finde__mas > summary').click();
await p.locator('.buscador-finde select[name="temas"]').selectOption('rural');
await p.locator('.buscador-finde label.opcion:has(input[value="sincoche"])').click();
await p.locator('#buscador-finde-pres').fill('150');
await p.locator('.buscador-finde__enviar').click();
await p.waitForSelector('#resultados .resultados__cuenta');
const h = decodeURIComponent(await p.evaluate(() => location.hash));
ok(/#\/escapadas\?/.test(h) && /temas=rural/.test(h) && /sincoche=1/.test(h) && /pres=150/.test(h) && /prespor=persona/.test(h) && /orden=total/.test(h), `buscador: lleva a escapadas con los filtros (${h})`);
ok((await p.locator('.activos .chip--activo').count()) >= 3, 'buscador: se ven los filtros puestos');
// Con destino y «Planes»: a Planes con la búsqueda escrita.
await ir(p, 'finde');
await p.locator('.organizar__opcion:has(input[value="actividades"])').click();
await p.locator('#buscador-finde-q').fill('Girona');
await p.locator('#buscador-finde-q').press('Enter');
await p.waitForTimeout(400);
const hp = decodeURIComponent(await p.evaluate(() => location.hash));
ok(hp.startsWith('#/actividades') && hp.includes('q=Girona'), `buscador: destino y planes (${hp})`);

// ── Escapadas: filtros, ver más, comparar, descartar ──
await ir(p, 'escapadas');
const cuentaInicial = await p.locator('#resultados .resultados__cuenta').textContent();
await p.locator('.filtros label.chip--tema:has(input[value="playa"])').first().click();
await p.waitForTimeout(400);
ok((await p.evaluate(() => location.hash)).includes('temas=playa'), 'filtro de temática: pasa a la URL');
ok((await p.locator('#resultados .resultados__cuenta').textContent()) !== cuentaInicial, 'filtro de temática: cambia el número de resultados');
ok((await p.locator('.activos .chip--activo:has-text("Playa")').count()) === 1, 'filtro de temática: chip puesto con su icono');
await p.locator('.activos a:has-text("Quitar todos")').click();
await p.waitForTimeout(400);
ok(!(await p.evaluate(() => location.hash)).includes('temas='), '«Quitar todos» quita los filtros');
const n1 = await tarjetas(p);
await p.locator('#resultados [data-mas]').first().click();
await p.waitForTimeout(300);
ok((await tarjetas(p)) > n1, `«Ver más» añade tarjetas (${n1} → ${await tarjetas(p)})`);
ok(await p.evaluate(() => document.activeElement?.classList.contains('enlace-ficha')), '«Ver más» lleva el foco a la primera tarjeta nueva');
for (let i = 0; i < 4; i++) await p.locator('#resultados .boton-comparar').nth(i).click();
ok((await aviso(p)).includes('Solo se comparan 3'), 'comparar: no deja más de 3');
ok((await p.locator('#barra-comparar a[href="#/comparar"]').textContent()).includes('3'), 'comparar: la barra cuenta 3');
await p.locator('[data-vaciar-comparar]').click();
ok(await p.locator('#barra-comparar').isHidden(), 'comparar: «Vaciar» oculta la barra');
ok((await p.locator('#resultados .boton-comparar[aria-pressed="true"]').count()) === 0, 'comparar: «Vaciar» desmarca los botones');
const cuentaAntes = await p.locator('#resultados .resultados__cuenta').textContent();
const idPrimera = await p.locator('#resultados .tarjeta [data-descartar]').first().getAttribute('data-descartar');
await p.locator('#resultados .tarjeta [data-descartar]').first().click();
await p.waitForTimeout(300);
ok(!(await p.locator(`#resultados [data-descartar="${idPrimera}"]`).count()), 'descartar: la tarjeta desaparece');
const numero = (t) => Number(t.replace(/\D/g, ''));
ok(numero(await p.locator('#resultados .resultados__cuenta').textContent()) === numero(cuentaAntes) - 1, 'descartar: el total baja en 1');

// Más filtros: contador y valoración mínima
await p.locator('.filtros__mas--panel > summary').click();
await p.locator('.filtros__mas--panel input[name="nota"]').fill('9');
await p.waitForTimeout(600);
ok((await p.locator('[data-contador-mas]').textContent()).includes('1 puesto'), 'más filtros: el contador sube');
ok((await p.evaluate(() => location.hash)).includes('nota=9'), 'más filtros: valoración en la URL');

// Ubicación con sugerencias (Photon)
await p.locator('#lugar-texto').fill('Girona');
await p.waitForSelector('#lugar-sugerencias:not([hidden]) li', { timeout: 5000 }).catch(() => {});
const nSug = await p.locator('#lugar-sugerencias li').count();
ok(nSug > 0, `ubicación: salen sugerencias (${nSug})`);
if (nSug) {
  await p.locator('#lugar-sugerencias li').first().click();
  await p.waitForTimeout(500);
  ok((await p.evaluate(() => location.hash)).includes('lat='), 'ubicación: elegirla filtra por cercanía');
}

// Búsquedas guardadas, copiar vigilado y compartir
await c.grantPermissions(['clipboard-read', 'clipboard-write']);
await p.locator('details.filtros__mas:has(> summary:has-text("Guardar búsqueda")) > summary').click();
await p.locator('[data-nombre-busqueda]').fill('Prueba Girona');
await p.locator('[data-guardar-busqueda]').click();
await p.waitForTimeout(300);
ok((await p.locator('.chip--guardada:has-text("Prueba Girona")').count()) === 1, 'búsqueda guardada: aparece su chip');
await p.locator('[data-nombre-busqueda]').fill('Prueba Girona');
await p.locator('[data-copiar-vigilado]').click();
await p.waitForTimeout(300);
const json = await p.locator('.vigilado-json').textContent().catch(() => '');
let criterio = null; try { criterio = JSON.parse(json); } catch {}
ok(criterio?.nombre === 'Prueba Girona' && criterio.cerca, 'copiar como vigilado: JSON válido con nombre y cercanía');
await p.locator('[data-compartir-busqueda]').click();
await p.waitForTimeout(300);
ok((await aviso(p)).includes('Enlace copiado') || (await aviso(p)).includes('El enlace es'), 'compartir búsqueda: da el enlace');
await p.locator('[data-borrar-busqueda="Prueba Girona"]').click();
await p.waitForTimeout(300);
ok((await p.locator('.chip--guardada:has-text("Prueba Girona")').count()) === 0, 'búsqueda guardada: se borra');

// ── Ficha: mis estados y gráfica ──
await ir(p, 'escapadas?orden=ahorro');
await p.locator('#resultados .enlace-ficha').first().click();
await p.waitForSelector('#ficha[open]');
const idFicha = await p.locator('#ficha [data-descartar]').getAttribute('data-descartar');
await p.locator('#ficha [data-mi-estado="reservada"]').click();
await p.waitForTimeout(200);
ok((await p.locator('#ficha [data-mi-estado="reservada"]').getAttribute('aria-pressed')) === 'true', 'mis estados: «La he reservado» se marca');
// La gráfica solo sale con dos días de historial: sin ellos, la ficha lo dice.
ok((await p.locator('#ficha canvas#ficha-grafica').count()) === 1 || (await p.locator('#ficha .ficha__historial').textContent()).includes('Aún no hay historial suficiente'), 'ficha: gráfica del historial (o el aviso de que aún no hay)');
if (await p.locator('#ficha canvas#ficha-grafica').count()) {
  await p.waitForTimeout(800);
  ok(await p.evaluate(() => Boolean(window.Chart?.getChart?.(document.querySelector('#ficha-grafica')))), 'ficha: Chart.js dibuja la gráfica');
}
await p.locator('#ficha [data-cerrar-ficha]').click();
await p.waitForTimeout(200);
ok(!(await p.locator('#ficha[open]').count()), 'ficha: se cierra con su botón');
ok(await p.evaluate(() => document.activeElement?.classList.contains('enlace-ficha')), 'ficha: el foco vuelve a la tarjeta');
ok((await p.locator(`#resultados .tarjeta:has([data-ficha="${idFicha}"]) .insignia--mio`).count()) === 1, 'mis estados: la tarjeta dice «Reservada»');

// ── Tu viaje ──
await p.locator('#boton-viaje').click();
await p.waitForSelector('#mi-viaje[open]');
await p.locator('#mi-viaje input[name="viajeros"]').fill('3');
await p.locator('#mi-viaje button[type="submit"]').click();
await p.waitForTimeout(400);
ok((await p.locator('#boton-viaje').textContent()).includes('3 personas'), 'tu viaje: el botón dice 3 personas');
ok((await p.locator('#resultados .coste-total').first().textContent()).includes('3 personas'), 'tu viaje: el coste total es para 3');
await p.locator('#boton-viaje').click();
await p.locator('#mi-viaje input[name="viajeros"]').fill('2');
await p.locator('#mi-viaje button[type="submit"]').click();
await p.waitForTimeout(300);

// Usar mi ubicación (geolocalización simulada)
await c.grantPermissions(['geolocation']);
await c.setGeolocation({ latitude: 41.98, longitude: 2.82 });
await ir(p, 'escapadas');
await p.locator('.filtros [data-mi-ubicacion]').click();
await p.waitForTimeout(600);
ok((await p.evaluate(() => location.hash)).includes('lugar=Tu'), 'usar mi ubicación: filtra desde tu posición');

// ── Vuelos, actividades, calendario, puentes, vigilados, fuentes, buscar ──
await ir(p, 'vuelos');
const nVuelos = await p.locator('#resultados .resultados__cuenta').textContent();
// Con vuelos con fecha, «Vuelos y trenes» con filtro de finde; sin ellos, «Chollos de vuelos» sin él.
const tituloVuelos = (await p.locator('.titulo-vista').textContent()).trim();
const filtroFinde = await p.locator('input[name="finde"]').count();
ok(conVuelosConFecha ? tituloVuelos === 'Vuelos y trenes' && filtroFinde > 0 : tituloVuelos === 'Chollos de vuelos' && filtroFinde === 0, `vuelos: título y filtro de finde según los datos («${tituloVuelos}»)`);
await p.locator('.filtros input[name="mios"]').check();
await p.waitForTimeout(400);
ok((await p.evaluate(() => location.hash)).includes('mios=1'), 'vuelos: «Solo desde mis aeropuertos»');
ok(typeof nVuelos === 'string', 'vuelos: resumen de resultados');
if (conVuelosConFecha) {
  // Un rango elegido en Escapadas llega a Vuelos y no se pierde al tocar otro filtro (el formulario no tiene campos de rango).
  await p.goto(`${BASE}#/vuelos?desde=2026-10-16&hasta=2026-10-18`); await p.waitForSelector('#resultados'); await p.waitForTimeout(300);
  ok(!(await p.locator('input[name="finde"][value=""]').isChecked()), 'vuelos: con un rango, «Todos» no sale marcado');
  await p.locator('.filtros input[name="ideal"]').check(); await p.waitForTimeout(400);
  const hashRango = await p.evaluate(() => location.hash);
  ok(hashRango.includes('desde=2026-10-16') && hashRango.includes('ideal=1'), `vuelos: el rango sobrevive a tocar otro filtro (${hashRango})`);
  // Un finde que ya pasó en la URL: se dice, no se finge «cualquier fecha».
  await p.goto(`${BASE}#/vuelos?finde=2020-01-03`); await p.waitForSelector('#resultados'); await p.waitForTimeout(300);
  ok((await p.locator('.franja-periodo__texto').textContent()).includes('Fechas que ya pasaron') && (await p.locator('#resultados').textContent()).includes('ya pasó'), 'vuelos: un finde pasado se explica');
}
// El periodo elegido en Explorar arranca marcado en Inicio.
// El Inicio ofrece «el puente» = el próximo que no ha terminado (hoy de verdad: la prueba corre con el reloj real).
const hoyReal = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const puenteId = [...(datos.puentes ?? [])].filter((x) => x.hasta >= hoyReal).sort((a, b) => a.desde.localeCompare(b.desde))[0]?.id;
if (puenteId) {
  await p.goto(`${BASE}#/escapadas?cuando=${puenteId}`); await p.waitForSelector('#resultados'); await p.waitForTimeout(300);
  await ir(p, 'finde');
  ok((await p.locator('.buscador-finde input[name="cuando"]:checked').getAttribute('value')) === puenteId, 'inicio: arranca con el puente elegido en Explorar');
  ok((await p.locator('[data-enviar-para]').textContent()).startsWith('para '), 'inicio: el botón dice esos días');
}
await ir(p, 'actividades');
await p.locator('.filtros input[name="gratis"]').check();
await p.waitForTimeout(400);
const gratis = await p.locator('#resultados .precio__gratis').count();
ok(gratis === await p.locator('#resultados .tarjeta').count(), `actividades: «Solo gratis» solo deja las gratis (${gratis})`);
await ir(p, 'calendario');
await p.locator('.finde-celda').nth(2).locator('a[href^="#/escapadas"]').click();
await p.waitForTimeout(300);
const destinoCelda = await p.evaluate(() => location.hash);
ok(destinoCelda.startsWith('#/escapadas?cuando=') || (conVuelosConFecha && destinoCelda.startsWith('#/vuelos?finde=')), `calendario: una celda lleva a sus planes (${destinoCelda})`);
await ir(p, 'puentes');
ok((await p.locator('.puente').count()) > 0 && (await p.locator('.dia--festivo').count()) > 0, 'puentes: días y festivos');
await ir(p, 'vigilados');
ok((await p.locator('.vigilado, .vacio').count()) > 0, 'vigilados: se pinta');
await ir(p, 'fuentes');
ok((await p.locator('.tabla-fuentes tbody tr').count()) > 10, 'fuentes: tabla completa');
// Un pueblo de una oferta que no se haya descartado antes en esta prueba (las descartadas no salen).
const descartadas = await p.evaluate(() => JSON.parse(localStorage.getItem('escapadas:descartadas') ?? '[]'));
const palabra = (datos.ofertas.find((o) => o.tipo !== 'vuelo' && !descartadas.includes(o.id) && o.lugar?.nombre && /^[a-záéíóúñ]{5,}$/i.test(o.lugar.nombre)
  && !datos.ofertas.some((x) => x.lugar?.nombre === o.lugar.nombre && descartadas.includes(x.id)))?.lugar.nombre ?? 'spa').toLowerCase();
await p.locator('#q').fill(palabra);
await p.locator('#buscador button[type="submit"]').click();
await p.waitForTimeout(400);
ok(decodeURIComponent(await p.evaluate(() => location.hash)).startsWith(`#/buscar?q=${palabra}`) && (await tarjetas(p)) > 0, `buscador de la cabecera: busca «${palabra}»`);
ok((await p.locator('.buscar__pestanas a[href^="#/escapadas?q="]').count()) === 1, 'buscador: sigue en la pestaña de Escapadas con la búsqueda puesta');
await p.goBack(); await p.waitForTimeout(300);
ok((await p.evaluate(() => location.hash)) === '#/fuentes', 'Atrás vuelve a la vista anterior');

// ── Mapa con Leaflet: ventana de un destino de vuelo ──
await ir(p, 'mapa');
await p.waitForSelector('.leaflet-container', { timeout: 10000 });
await p.waitForTimeout(800);
const marcadores = await p.locator('.marcador-precio').count();
ok(marcadores > 0, `mapa: destinos de vuelo con precio (${marcadores})`);
if (marcadores) {
  // Sin force: con muchos destinos un marcador tapa a otro y el clic caía en el de encima.
  await p.locator('.marcador-precio').first().dispatchEvent('click');
  await p.waitForSelector('.leaflet-popup .tarjeta, .leaflet-popup .billete', { timeout: 5000 }).catch(() => {});
  ok((await p.locator('.leaflet-popup .tarjeta, .leaflet-popup .billete').count()) === 1, 'mapa: la ventana enseña la tarjeta');
}

// ── Menú de cuatro apartados y pestañas ──
await ir(p, 'finde');
await p.locator('.navegacion a[data-vista="calendario"]').click(); await p.waitForSelector('.titulo-vista'); await p.waitForTimeout(200);
ok((await p.evaluate(() => location.hash)).startsWith('#/calendario'), 'menú: «Fechas» abre el calendario');
ok((await p.locator('.navegacion a[aria-current="page"]').textContent()).includes('Fechas'), 'menú: «Fechas» marcado');
await p.locator('.pestanas a[data-vista="puentes"]').click(); await p.waitForTimeout(300);
ok((await p.evaluate(() => location.hash)).startsWith('#/puentes') && (await p.locator('.navegacion a[aria-current="page"]').textContent()).includes('Fechas'), 'pestañas: Puentes sigue dentro de «Fechas»');
await p.locator('.navegacion a[data-vista="escapadas"]').click(); await p.waitForTimeout(300);
await p.locator('.pestanas a[data-vista="actividades"]').click(); await p.waitForTimeout(300);
ok((await p.locator('.titulo-vista').textContent()).trim() === 'Planes' && (await p.locator('.navegacion a[aria-current="page"]').textContent()).includes('Explorar'), 'pestañas: Planes dentro de «Explorar»');
await p.locator('.navegacion a[data-vista="mis"]').click(); await p.waitForTimeout(300);
ok((await p.locator('.titulo-vista').textContent()).trim() === 'Favoritos' && (await p.locator('.pestanas a[href="#/mis?ver=busquedas"]').count()) === 1, 'menú: «Guardados» abre Favoritos, con su pestaña de Búsquedas guardadas');
await p.locator('.pestanas a[data-vista="vigilados"]').click(); await p.waitForTimeout(300);
ok((await p.locator('.titulo-vista').textContent()).trim() === 'Avisos por email', 'pestañas: avisos por email dentro de «Mis cosas»');
await p.locator('#estado-fuentes').click(); await p.waitForTimeout(300);
ok((await p.evaluate(() => location.hash)).startsWith('#/fuentes'), 'pie: el estado de las webs abre Fuentes');
await p.locator('#cambiar-tema').click();
const tema = await p.evaluate(() => document.documentElement.dataset.theme);
await p.reload(); await p.waitForSelector('.titulo-vista');
ok((await p.evaluate(() => document.documentElement.dataset.theme)) === tema, `tema: se recuerda al recargar (${tema})`);
ok((await p.locator('#cambiar-tema').getAttribute('aria-label')).includes(tema === 'dark' ? 'claro' : 'oscuro'), 'tema: el botón dice a qué cambia');
// Novedades
await ir(p, 'finde');
if (await p.locator('#novedades:not([hidden])').count()) {
  await p.locator('#novedades').click();
  await p.waitForTimeout(400);
  ok((await p.evaluate(() => location.hash)).startsWith('#/buscar?nuevas=1'), 'novedades: la pastilla lleva a las novedades');
}
// Teclado: recién cargada la página, el primer Tab va a «Saltar al contenido»
await p.reload(); await p.waitForSelector(".titulo-vista");
await p.keyboard.press('Tab');
ok(await p.evaluate(() => document.activeElement?.classList.contains('saltar')), 'teclado: «Saltar al contenido» primero');
await c.close();

// ── Móvil: filtros plegados, barra de abajo y «Más filtros» a pantalla completa ──
const cm = await contexto({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const m = await pagina(cm);
await ir(m, 'escapadas');
ok(!(await m.locator('[data-plegable-movil]').evaluate((d) => d.open)), 'móvil: los filtros empiezan plegados');
await m.locator('#barra-comparar [data-abrir-filtros]').click();
ok(await m.locator('[data-plegable-movil]').evaluate((d) => d.open), 'móvil: «Filtros» de la barra los abre');
await m.locator('.filtros__mas--panel > summary').click();
const panel = await m.locator('.filtros__mas--panel').evaluate((d) => getComputedStyle(d).position);
ok(panel === 'fixed', 'móvil: «Más filtros» a pantalla completa');
await m.locator('[data-cerrar-mas]').click();
ok(!(await m.locator('.filtros__mas--panel').evaluate((d) => d.open)), 'móvil: «Ver resultados» cierra el panel');
await m.locator('.navegacion a[data-vista="calendario"]').click();
await m.waitForTimeout(500);
ok((await m.evaluate(() => location.hash)).startsWith('#/calendario'), 'móvil: la barra de abajo navega');
ok((await m.locator('.navegacion a[data-vista="calendario"]').getAttribute('aria-current')) === 'page', 'móvil: marca el apartado actual');
ok((await m.locator('.navegacion > ul > li').count()) === 4, 'móvil: cuatro apartados abajo');
await cm.close();

// ── Aviso de cookies con Google Analytics y Drive: cada uno con su permiso ──
// La portada como la deja el despliegue (etiquetas y CSP); gtag.js y Drive, simulados (vacíos).
const { ponerDrive, ponerGoogleAnalytics } = await import('../scripts/preparar-web.js');
const conCookies = ponerDrive(ponerGoogleAnalytics(readFileSync(path.join(RAIZ, 'site/index.html'), 'utf8'), 'G-PRUEBA1234'), 'https://drive.example.com/drive.js?t=1');
const ck = await contexto();
await ck.route((url) => ['/', '/index.html'].includes(url.pathname) && url.hostname === '127.0.0.1', (r) => r.fulfill({ body: conCookies, contentType: 'text/html; charset=utf-8' }));
const cargados = [];
await ck.route(/googletagmanager\.com|drive\.example\.com/, (r) => { cargados.push(new URL(r.request().url()).hostname); return r.fulfill({ body: '', contentType: 'text/javascript' }); });
const k = await pagina(ck);
const visitas = () => k.evaluate(() => (window.dataLayer ?? []).filter((e) => e[0] === 'event' && e[1] === 'page_view').map((e) => e[2].page_location.replace(location.origin, '')));
await ir(k, 'finde');
ok(await k.locator('.aviso-cookies').isVisible(), 'cookies: el aviso sale en la primera visita');
ok(!cargados.length && !(await visitas()).length, 'cookies: nada de Google ni de Drive antes de elegir');
await k.locator('.aviso-cookies [data-cookies="elegir"]').click();
ok((await k.locator('.aviso-cookies__opcion').count()) === 2 && !(await k.locator('.aviso-cookies__opcion input:checked').count()), 'cookies: «Configurar» enseña cada finalidad, sin marcar');
await k.locator('.aviso-cookies__opcion:has(input[name="analytics"])').click();
await k.locator('.aviso-cookies [data-cookies="guardar"]').click();
await k.waitForTimeout(300);
ok(!(await k.locator('.aviso-cookies').count()) && cargados.includes('www.googletagmanager.com') && !cargados.includes('drive.example.com'), 'cookies: solo la medición: Google Analytics sí, Drive no');
ok(JSON.stringify(await visitas()) === '["/#/finde"]', `analytics: la visita a Inicio (${await visitas()})`);
await k.evaluate(() => { location.hash = '#/escapadas?orden=precio'; });
await k.waitForTimeout(400);
await k.evaluate(() => { location.hash = '#/escapadas?orden=distancia'; });
await k.waitForTimeout(400);
ok(JSON.stringify(await visitas()) === '["/#/finde","/#/escapadas"]', `analytics: una visita por sección, sin filtros (${await visitas()})`);
const eventos = (nombre) => k.evaluate((n) => (window.dataLayer ?? []).filter((e) => e[0] === 'event' && e[1] === n).map((e) => ({ ...e[2] })), nombre);
await k.locator('#resultados [data-ficha]').first().click();
await k.waitForSelector('#ficha[open]');
const [vista1] = await eventos('ver_oferta');
ok(vista1?.web && vista1?.tipo && vista1.send_to === 'G-PRUEBA1234', `analytics: abrir una oferta (${JSON.stringify(vista1)})`);
await k.keyboard.press('Escape');
await k.locator('#q').fill('Girona');
await k.locator('#q').press('Enter');
await k.waitForTimeout(300);
ok((await eventos('search'))[0]?.search_term === 'Girona', 'analytics: lo buscado');
// Vuelve con una campaña en la dirección: la visita la lleva (si no, no se atribuye).
await k.goto(`${BASE}?utm_source=prueba&utm_medium=email#/finde`);
await k.waitForSelector('#principal .titulo-vista');
await k.waitForTimeout(500);
ok(!(await k.locator('.aviso-cookies').count()) && JSON.stringify(await visitas()) === '["/?utm_source=prueba&utm_medium=email#/finde"]', `cookies: la elección se recuerda; la visita lleva la campaña (${await visitas()})`);
await k.locator('[data-abrir-cookies]').first().click();
ok(await k.locator('.aviso-cookies__opcion input[name="analytics"]').isChecked() && !(await k.locator('.aviso-cookies__opcion input[name="drive"]').isChecked()), 'cookies: «Cookies» del pie enseña lo aceptado');
await k.locator('.aviso-cookies [data-cookies="no"]').click();
await k.waitForLoadState('load');
await k.waitForSelector('#principal .titulo-vista');
await k.waitForTimeout(500);
ok(!(await visitas()).length && JSON.parse(await k.evaluate(() => localStorage.getItem('escapadas-cookies'))).decision === 'no', 'cookies: «Rechazar» recarga sin Google Analytics');
await ck.close();

// ── Service worker: instala la interfaz (fuentes e iconos incluidos) y funciona sin conexión ──
// Con service worker (el resto de pruebas lo bloquean para no mezclar cachés).
const cs = await contexto({ serviceWorkers: 'allow' });
const s = await pagina(cs);
await s.goto(`${BASE}#/finde`);
await s.waitForSelector('.titulo-vista');
await s.evaluate(() => navigator.serviceWorker.ready);
await s.waitForTimeout(1500);
const cacheados = await s.evaluate(async () => {
  const claves = await caches.keys();
  const interfaz = await caches.open(claves.find((k) => k.startsWith('escapadas-interfaz')));
  return (await interfaz.keys()).map((r) => new URL(r.url).pathname);
});
ok(['/fonts/figtree.woff2', '/fonts/bricolage-grotesque.woff2', '/js/iconos.js', '/css/estilos.css'].every((r) => cacheados.includes(r)), `service worker: guarda fuentes, iconos y estilos (${cacheados.length} archivos)`);
await s.reload(); await s.waitForSelector('.titulo-vista'); await s.waitForTimeout(800);
await cs.setOffline(true);
await s.reload(); await s.waitForSelector('.titulo-vista', { timeout: 10000 }).catch(() => {});
ok((await s.locator('.portada').count()) === 1, 'sin conexión: la portada se abre con lo guardado');
ok(await s.evaluate(() => document.fonts.check('800 20px "Bricolage Grotesque"')), 'sin conexión: las tipografías siguen cargadas');
await cs.close();

await cerrar();
console.log(`${hechos.length} comprobaciones bien, ${fallos.length} mal`);
if (fallos.length) console.log(`FALLOS:\n- ${fallos.join('\n- ')}`);
if (errores.length) console.log(`ERRORES:\n- ${[...new Set(errores)].join('\n- ')}`);
if (fallos.length || errores.length) process.exitCode = 1;
