/**
 * Prueba funcional de la web en el navegador: cada acción y cada vista, con los datos de
 * site/data/. Uso: npm run test:navegador (sale con error si algo falla).
 * Las comprobaciones que dependen de lo que haya ese día (un chollazo destacado, vuelos
 * con fecha…) miran los datos y prueban el caso que toque.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, arrancar, contexto as nuevoContexto, vigilarErrores } from './comun.mjs';
import { ponerPortada } from '../scripts/preparar-web.js';
import { generarPaginas } from '../src/paginas.js';
import { repartir } from '../site/js/vigencia.js';

const { base: BASE, navegador: b, cerrar } = await arrancar();
const datos = JSON.parse(readFileSync(path.join(RAIZ, 'site/data/ofertas.json'), 'utf8'));
const conVuelosConFecha = datos.ofertas.some((o) => o.vuelo?.ida?.salida);
// Las que la web enseña, como en app.js: con datos de otro día, una oferta caducada ya no sale al buscarla.
const { vigentes } = repartir(datos.ofertas, {
  ahora: new Date(),
  revision: Number.isFinite(Date.parse(datos.generado)) ? new Date(datos.generado) : new Date(),
  intervalos: new Map((datos.fuentes ?? []).map((f) => [f.id, f.intervaloMin])),
});
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
// El H1 que lee Google con la página cargada es el mismo que trae el HTML (no «¿Qué quieres organizar?»).
ok(/^Escapadas de fin de semana desde /.test((await p.locator('h1').first().textContent()).trim()) && (await p.locator('h1').count()) === 1, 'portada: un solo H1, «Escapadas de fin de semana desde …»');
ok(!(await p.locator('.portada__destacado, .sugerencia').count()), 'portada: sin «Sugerencia de hoy»');
ok((await p.locator('.buscador-finde input[name="cuando"]').count()) >= 3, 'portada: opciones de «¿Cuándo?»');
ok((await p.locator('.organizar input[name="que"]').count()) === 3, 'portada: «¿Qué buscas?» con escapadas, vuelos y planes');
ok((await p.locator('.viaje-resumen').count()) === 1 && !(await p.locator('#boton-viaje').isVisible()) && !(await p.locator('#buscador').isVisible()), 'portada: tu viaje y el destino, una sola vez');
// La portada y el pie dicen lo mismo del estado de las webs.
// El estado de las webs va en el pie (y arriba solo si falla más de una cuarta parte, con el mismo texto).
const problemasPortada = p.locator('.portada__problemas');
const estadoPie = (await p.locator('#estado-fuentes').textContent()).trim();
ok(!(await problemasPortada.count()) || estadoPie.includes((await problemasPortada.textContent()).trim()), `portada y pie: el mismo estado de las webs («${estadoPie}»)`);
ok((await p.locator('.portada__confianza').textContent()).includes('cada web a su ritmo'), 'portada: «Datos actualizados hace … · cada web a su ritmo»');
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
// Otras fechas: el calendario sale aquí mismo al elegirla (entrada y salida, sin ir a otra vista).
ok(await p.locator('[data-fechas-propias]').isHidden(), 'otras fechas: calendario plegado de entrada');
await p.locator('label:has(input[name="cuando"][value="rango"])').click();
ok(await p.locator('#buscador-finde-calendario').isVisible() && (await p.locator('.calendario__paso').textContent()).includes('fecha de entrada'), 'otras fechas: el calendario se abre pidiendo la fecha de entrada');
const diasInicio = p.locator('.buscador-finde .calendario__dia:not(:disabled)');
const [entradaInicio, salidaInicio] = [await diasInicio.nth(9).getAttribute('data-dia'), await diasInicio.nth(11).getAttribute('data-dia')];
await diasInicio.nth(9).click();
ok((await p.locator('.calendario__paso').textContent()).includes('la fecha de salida'), 'otras fechas: después pide la de salida');
await diasInicio.nth(11).click();
await p.waitForTimeout(200);
ok(await p.locator('#buscador-finde-calendario').isHidden() && (await p.locator('.buscador-finde [data-fechas-campo="salida"] .fechas__valor').textContent()).length > 3
  && (await p.locator('[data-enviar-para]').textContent()).startsWith('para '), 'otras fechas: con la salida se cierra y el botón dice esos días');
ok(await p.evaluate(() => document.querySelector('.buscador-finde').elements.desde.value) === entradaInicio && await p.evaluate(() => document.querySelector('.buscador-finde').elements.hasta.value) === salidaInicio, 'otras fechas: entrada y salida en el buscador');
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
ok(hp.startsWith('#/planes') && hp.includes('q=Girona'), `buscador: destino y planes (${hp})`);

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

// La barra «¿Cuándo?»: atajos, calendario con teclado, quitar; las fechas se conservan con otros filtros.
await ir(p, 'escapadas');
ok((await p.locator('.filtros [data-campo-fechas], .filtros input[type="date"]').count()) === 0 && (await p.locator('section[data-fechas]').count()) === 1, 'fechas: un solo sitio para elegirlas (la barra), no repetidas en los filtros');
ok((await p.locator('.filtros select[name="orden"]').count()) === 0 && (await p.locator('#resultados [data-otro-orden]').count()) === 1, 'orden: un solo sitio (encima de los resultados, con «Otro orden…»)');
await p.locator('.fechas__rapidas .chip[data-fechas-rapida="finde"]').click();
await p.waitForTimeout(300);
ok((await p.evaluate(() => location.hash)).includes('cuando=finde') && (await p.locator('.fechas__rapidas .chip[data-fechas-rapida="finde"]').getAttribute('aria-pressed')) === 'true', 'fechas: «Este finde» se aplica sin salir de la vista');
ok(await p.evaluate(() => document.activeElement?.matches('.chip[data-fechas-rapida="finde"]')), 'fechas: el foco sigue en el atajo');
await p.locator('section[data-fechas] [data-fechas-campo="entrada"]').click();
ok(await p.locator('section[data-fechas] [data-fechas-panel]').isVisible(), 'fechas: «Fecha de entrada» abre el calendario aquí mismo');
const foco = () => p.evaluate(() => document.activeElement?.dataset.dia);
const enfocado = await foco();
await p.keyboard.press('ArrowRight');
ok((await foco()) > enfocado, 'calendario: las flechas mueven el día');
await p.keyboard.press('Escape');
ok(await p.locator('section[data-fechas] [data-fechas-panel]').isHidden() && (await p.evaluate(() => location.hash)).includes('cuando=finde'), 'calendario: Escape lo cierra sin cambiar nada');
await p.locator('section[data-fechas] [data-fechas-campo="entrada"]').click();
const diasBarra = p.locator('section[data-fechas] .calendario__dia:not(:disabled)');
const entradaBarra = await diasBarra.nth(8).getAttribute('data-dia');
const salidaBarra = await diasBarra.nth(11).getAttribute('data-dia');
await diasBarra.nth(8).click();
await diasBarra.nth(11).click();
await p.waitForTimeout(400);
const hashFechas = await p.evaluate(() => location.hash);
ok(hashFechas.includes(`desde=${entradaBarra}`) && hashFechas.includes(`hasta=${salidaBarra}`) && !hashFechas.includes('cuando='), `fechas: entrada y salida del calendario (${hashFechas})`);
ok((await p.locator('section[data-fechas] .fechas__noches').textContent()) === '3 noches' && (await p.locator('#boton-viaje').textContent()).includes('3 noches'), 'fechas: las noches de tu viaje son las de tus fechas');
await p.locator('.filtros label.chip--tema:has(input[value="playa"])').first().click();
await p.waitForTimeout(400);
ok((await p.evaluate(() => location.hash)).includes(`desde=${entradaBarra}`), 'fechas: no se pierden al tocar otro filtro');
await p.locator('.atajos a.chip--atajo').first().click();
await p.waitForTimeout(300);
ok((await p.evaluate(() => location.hash)).includes(`desde=${entradaBarra}`), 'fechas: los atajos las conservan');
await p.locator('#resultados [data-otro-orden]').selectOption('calidad');
await p.waitForTimeout(400);
ok((await p.evaluate(() => location.hash)).includes('orden=calidad') && (await p.locator('#resultados .orden-rapido__otro--elegido').count()) === 1, 'orden: «Otro orden…» lo aplica');
await p.locator('section[data-fechas] .fechas__quitar').click();
await p.waitForTimeout(300);
ok(!/desde=|cuando=/.test(await p.evaluate(() => location.hash)), 'fechas: «Quitar fechas»');
await p.locator('#boton-viaje').click();
await p.waitForSelector('#mi-viaje[open]');
await p.locator('#mi-viaje select[name="noches"]').selectOption('2');
await p.locator('#mi-viaje button[type="submit"]').click();
await p.waitForTimeout(300);
await ir(p, 'escapadas');

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
// La ficha tiene su dirección (#/oferta/<id>): se puede compartir, «atrás» la cierra y la lista sigue igual.
const hashLista = await p.evaluate(() => location.hash);
await p.locator('#resultados .enlace-ficha').nth(1).click();
await p.waitForSelector('#ficha[open]');
const idSegunda = await p.locator('#ficha [data-descartar]').getAttribute('data-descartar');
const hashFicha = `#/oferta/${encodeURIComponent(idSegunda)}`;
ok((await p.evaluate(() => location.hash)) === hashFicha, 'ficha: su dirección es #/oferta/<id>');
const tarjetasAntes = await tarjetas(p);
await p.goBack();
await p.waitForTimeout(300);
ok(!(await p.locator('#ficha[open]').count()) && (await p.evaluate(() => location.hash)) === hashLista && (await tarjetas(p)) === tarjetasAntes, 'ficha: «atrás» la cierra y vuelve a la misma lista');
await p.goForward();
await p.waitForSelector('#ficha[open]');
ok((await p.locator('#ficha [data-descartar]').getAttribute('data-descartar')) === idSegunda, 'ficha: «adelante» la vuelve a abrir');
await p.locator('#ficha [data-cerrar-ficha]').click();
await p.waitForTimeout(300);
ok((await p.evaluate(() => location.hash)) === hashLista, 'ficha: al cerrarla, la dirección vuelve a ser la de la lista');
{
  const directa = await pagina(c);
  await directa.goto(`${BASE}${hashFicha}`);
  await directa.waitForSelector('#ficha[open]', { timeout: 10000 }).catch(() => {});
  ok((await directa.locator('#ficha[open] [data-descartar]').getAttribute('data-descartar').catch(() => null)) === idSegunda, 'ficha: su enlace la abre al cargar la web');
  await directa.locator('#ficha [data-cerrar-ficha]').click();
  await directa.waitForTimeout(300);
  ok((await directa.evaluate(() => location.hash)) === '#/finde' && (await directa.locator('.portada').count()) === 1, 'ficha: cerrarla desde el enlace deja la portada');
  await directa.goto(`${BASE}#/oferta/no-existe`);
  await directa.waitForTimeout(500);
  ok(!(await directa.locator('#ficha[open]').count()), 'ficha: el enlace de una oferta que ya no está no abre nada');
  await directa.close();
}

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
ok(/lugar=tu(%20|\+)ubicaci/.test(await p.evaluate(() => location.hash)), 'usar mi ubicación: filtra desde tu posición');

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
  // Un rango elegido en Escapadas llega a Vuelos y no se pierde al tocar otro filtro (los campos de la barra son del formulario).
  await p.goto(`${BASE}#/vuelos?desde=2026-10-16&hasta=2026-10-18`); await p.waitForSelector('#resultados'); await p.waitForTimeout(300);
  ok((await p.locator('.fechas__rapidas .chip[data-fechas-rapida=""]').getAttribute('aria-pressed')) === 'false', 'vuelos: con un rango, «Cualquier fecha» no sale marcado');
  ok((await p.locator('section[data-fechas] .fechas__valor').allTextContents()).join(' ') === 'vie 16 oct dom 18 oct', 'vuelos: la barra dice la entrada y la salida');
  await p.locator('.filtros input[name="ideal"]').check(); await p.waitForTimeout(400);
  const hashRango = await p.evaluate(() => location.hash);
  ok(hashRango.includes('desde=2026-10-16') && hashRango.includes('ideal=1'), `vuelos: el rango sobrevive a tocar otro filtro (${hashRango})`);
  // Un finde que ya pasó en la URL: se dice, no se finge «cualquier fecha».
  await p.goto(`${BASE}#/vuelos?finde=2020-01-03`); await p.waitForSelector('#resultados'); await p.waitForTimeout(300);
  ok((await p.locator('section[data-fechas] .fechas__noches').textContent()).includes('Fechas que ya pasaron') && (await p.locator('#resultados').textContent()).includes('ya pasó'), 'vuelos: un finde pasado se explica');
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
const palabra = (vigentes.find((o) => o.tipo !== 'vuelo' && !descartadas.includes(o.id) && o.lugar?.nombre && /^[a-záéíóúñ]{5,}$/i.test(o.lugar.nombre)
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
await k.reload(); await k.waitForSelector('#principal .titulo-vista'); await k.waitForTimeout(300);
ok(!(await k.locator('.aviso-cookies').count()), 'cookies: el rechazo se respeta (no se vuelve a preguntar enseguida)');
// Pasados seis meses, se vuelve a preguntar (a quien rechazó y a quien aceptó).
await k.evaluate(() => {
  const guardada = JSON.parse(localStorage.getItem('escapadas-cookies'));
  localStorage.setItem('escapadas-cookies', JSON.stringify({ ...guardada, fecha: new Date(Date.now() - 200 * 86_400_000).toISOString() }));
});
await k.reload(); await k.waitForSelector('#principal .titulo-vista'); await k.waitForTimeout(300);
ok(await k.locator('.aviso-cookies').isVisible(), 'cookies: pasados seis meses se vuelve a preguntar');
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

// ── Plan de corrección (tarea 41): fotos con texto alternativo, apartamento ≠ hotel, sin JavaScript ──
const cp = await contexto();
const pp = await pagina(cp);
await ir(pp, 'escapadas');
const altFotos = await pp.locator('#resultados img.tarjeta__imagen').evaluateAll((imgs) => imgs.map((i) => i.alt));
ok(!altFotos.length || altFotos.every((alt) => alt.trim().length > 3), `fotos: cada una dice de qué es («${altFotos[0] ?? 'sin fotos'}»)`);
ok((await pp.locator('.marca img').getAttribute('alt')) === '', 'logo: alt vacío (el nombre ya va escrito al lado)');
const apartamento = await pp.evaluate(async () => (await (await fetch('data/ofertas.json')).json()).ofertas.find((o) => o.alojamiento === 'apartamento')?.id ?? null);
if (apartamento) {
  await pp.goto(`${BASE}#/oferta/${encodeURIComponent(apartamento)}`);
  await pp.waitForSelector('#ficha[open]');
  const textoFicha = await pp.locator('#ficha .ficha__contenido').textContent();
  ok(/Apartamento/.test(textoFicha) && !/Hotel \d★/.test(textoFicha), 'un apartamento sale como apartamento, no como hotel');
}
await cp.close();
const sinJs = await contexto({ javaScriptEnabled: false });
const nj = await sinJs.newPage();
await nj.goto(`${BASE}`);
ok(await nj.locator('.sin-js').isVisible(), 'sin JavaScript: lo dice y ofrece las guías');
ok((await nj.locator('.sin-js a[href="escapadas/"]').count()) === 1 && (await nj.locator('.sin-js a[href="vuelos/"]').count()) === 1, 'sin JavaScript: enlaces a las guías principales');
ok(!(await nj.locator('.cargando').isVisible()), 'sin JavaScript: no se queda en «Cargando ofertas…»');
await sinJs.close();
// ── Auditoría de octubre de 2026: cada fallo arreglado, con el caso que lo reproducía ──
const ca = await contexto();
const a = await pagina(ca);
const listo = () => a.waitForFunction(() => window.escapadasListo === true || document.documentElement.classList.contains('sin-panel'), null, { timeout: 30000 });
// Un enlace de ficha cortado al compartirlo («%» suelto) ya no tumba el panel.
await a.goto(`${BASE}#/oferta/buscounchollo%3`);
await listo();
ok(await a.evaluate(() => window.escapadasListo === true && !document.documentElement.classList.contains('sin-panel')), 'enlace de ficha roto («%3»): el panel arranca');
ok((await aviso(a)).includes('Esa oferta ya no está'), 'enlace de ficha roto: avisa de que la oferta no está');
// Ficha dentro de ficha («Qué hacer allí»): cerrarla vuelve a la lista, con un solo «atrás».
await ir(a, 'escapadas');
let conPlanes = false;
for (let i = 0; i < 12 && !conPlanes; i++) {
  await a.locator('#resultados [data-ficha]').nth(i).click();
  await a.waitForSelector('#ficha[open]');
  conPlanes = (await a.locator('#ficha .ficha__actividades [data-ficha]').count()) > 0;
  if (!conPlanes) { await a.locator('#ficha [data-cerrar-ficha]').first().click(); await a.waitForTimeout(200); }
}
if (conPlanes) {
  await a.locator('#ficha .ficha__actividades [data-ficha]').first().click();
  await a.waitForTimeout(500);
  await a.locator('#ficha [data-cerrar-ficha]').first().click();
  await a.waitForTimeout(500);
  ok(!(await a.evaluate(() => document.querySelector('#ficha').open)) && (await a.evaluate(() => location.hash)).startsWith('#/escapadas'), 'ficha desde otra ficha: al cerrarla se vuelve a la lista');
}
// Calendario: eligiendo la salida, el teclado no se pierde en los días que no se pueden elegir.
await a.locator('main [data-fechas-campo="entrada"]').first().click();
await a.locator('main [data-calendario] [data-dia]:not([disabled])').nth(3).click();
for (let i = 0; i < 3; i++) await a.keyboard.press('PageDown');
ok(await a.evaluate(() => document.activeElement?.matches('[data-dia]:not([disabled])')), 'calendario: Av Pág no lleva el foco a un día desactivado');
await a.keyboard.press('Escape');
ok(!(await a.locator('.fechas--abierta').count()), 'calendario: y Escape lo sigue cerrando');
// «Tu viaje»: Escape en las sugerencias de la salida las cierra sin cerrar el diálogo.
await a.locator('[data-mi-viaje]:visible').first().click();
await a.waitForSelector('#mi-viaje[open] #salida-texto');
await a.locator('#salida-texto').fill('Gir');
await a.waitForFunction(() => document.querySelector('#salida-texto').getAttribute('aria-expanded') === 'true', null, { timeout: 5000 });
await a.keyboard.press('Escape');
await a.waitForTimeout(200);
ok(await a.evaluate(() => document.querySelector('#mi-viaje').open && document.querySelector('#salida-texto').getAttribute('aria-expanded') === 'false'), 'tu viaje: Escape cierra las sugerencias y deja el diálogo abierto');
await a.keyboard.press('Escape');
// «Cargar una copia»: se ve el foco del teclado.
await ir(a, 'mis');
await a.focus('[data-exportar-guardados]');
await a.keyboard.press('Tab');
ok(await a.evaluate(() => getComputedStyle(document.activeElement.closest('label')).outlineStyle === 'solid'), 'copia de seguridad: «Cargar una copia» enseña el foco');
// Comparar: «Ver oferta» es un enlace a oferta como los demás (se mide; con Drive, rel="sponsored").
const ids = await a.evaluate(async () => (await (await fetch('data/ofertas.json')).json()).ofertas.filter((o) => o.url?.startsWith('https://')).slice(0, 2).map((o) => o.id));
await a.evaluate((lista) => localStorage.setItem('escapadas:comparar', JSON.stringify(lista)), ids);
await a.reload();
await ir(a, 'comparar');
ok((await a.locator('.comparar a[data-clic]').count()) === ids.length, `comparar: «Ver oferta» lleva data-clic (${ids.length} ofertas)`);
await ca.close();
// La pastilla de novedades cuadra con «Verlas» después de «Hay ofertas nuevas» → «Ver».
const cn = await contexto();
let nuevos = false;
const doce = new Date(Date.parse(datos.generado) + 12 * 3_600_000).toISOString();
await cn.route('**/data/version.json', (r) => (nuevos ? r.fulfill({ json: { generado: doce } }) : r.continue()));
await cn.route('**/data/ofertas.json', (r) => (nuevos ? r.fulfill({ json: { ...datos, generado: doce } }) : r.continue()));
const n = await pagina(cn);
await ir(n, 'finde');
nuevos = true;
await n.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await n.waitForSelector('[data-ver-datos-nuevos]', { timeout: 10000 });
await n.locator('[data-ver-datos-nuevos]').click();
await n.waitForTimeout(400);
const pastilla = await n.evaluate(() => { const p = document.querySelector('#novedades'); return p.hidden ? 0 : Number(p.textContent.match(/[\d.]+/)?.[0].replace('.', '')); });
await n.evaluate(() => { location.hash = '#/buscar?nuevas=1'; });
await n.waitForTimeout(600);
const verlas = Number((await n.locator('#principal').innerText()).match(/([\d.]+) ofertas?/)?.[1].replace('.', '') ?? 0);
ok(pastilla === verlas, `novedades: tras «Ver», la pastilla cuenta lo mismo que «Verlas» (${pastilla} y ${verlas})`);
await cn.close();

// Móvil con el sistema en oscuro: la web sale clara (el oscuro solo si se elige), la «ⓘ» abre y
// cierra su explicación, y «Hay ofertas nuevas» se va solo, se cierra con ✕ y no vuelve.
const cd = await contexto({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
let escaneo = null;
await cd.route('**/data/version.json', (r) => (escaneo ? r.fulfill({ json: { generado: escaneo } }) : r.continue()));
await cd.route('**/data/ofertas.json', (r) => (escaneo ? r.fulfill({ json: { ...datos, generado: escaneo } }) : r.continue()));
const d = await pagina(cd);
await ir(d, 'escapadas');
ok(await d.evaluate(() => !document.documentElement.dataset.theme && getComputedStyle(document.body).backgroundColor === 'rgb(244, 239, 230)'), 'tema: con el sistema en oscuro y nada elegido, la web sale clara');
// La de «¿Dónde?», que sale siempre (la de los resultados depende de los datos de ese día).
await d.evaluate(() => document.querySelectorAll('[data-plegable-movil]').forEach((x) => { x.open = true; }));
const info = d.locator('[data-info="info-lugar"]');
const textoInfo = d.locator(`#${await info.getAttribute('aria-controls')}`);
ok(!(await textoInfo.isVisible()), 'ⓘ: la explicación empieza plegada');
await info.click();
ok(await textoInfo.isVisible() && (await info.getAttribute('aria-expanded')) === 'true', 'ⓘ: al pulsarla se abre la explicación');
await info.click();
ok(!(await textoInfo.isVisible()) && (await info.getAttribute('aria-expanded')) === 'false', 'ⓘ: al pulsarla otra vez se pliega');
const avisoDatos = d.locator('#datos-nuevos');
const nuevoEscaneo = async (horas) => {
  escaneo = new Date(Date.parse(datos.generado) + horas * 3_600_000).toISOString();
  await d.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
};
await nuevoEscaneo(12);
await d.waitForSelector('#datos-nuevos [data-cerrar-datos-nuevos]', { timeout: 10000 });
const caja = await avisoDatos.boundingBox();
// El alto del aviso lo marca la ✕ (44 px): una segunda línea de texto aún cabe en él. Se mide el texto.
const lineasAviso = await d.$eval('#datos-nuevos .aviso-flotante__texto', (t) => Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)));
ok(caja.x >= 0 && caja.x + caja.width <= 390 && lineasAviso === 1, `aviso de ofertas nuevas: cabe en una línea en el móvil (${Math.round(caja.width)}×${Math.round(caja.height)}, ${lineasAviso} línea(s) de texto)`);
// Con el foco del teclado en «Ver» no se va (si no, el foco se perdía con él); sin él, sí.
await d.focus('#datos-nuevos [data-ver-datos-nuevos]');
await d.waitForTimeout(10_500);
ok(await avisoDatos.isVisible(), 'aviso de ofertas nuevas: con el foco en «Ver» no se va');
await d.evaluate(() => document.querySelector('#principal').focus());
await d.waitForTimeout(10_500);
ok(!(await avisoDatos.isVisible()), 'aviso de ofertas nuevas: se va solo a los 10 s');
await d.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await d.waitForTimeout(1500);
ok(!(await avisoDatos.isVisible()), 'aviso de ofertas nuevas: no vuelve por los mismos datos');
await nuevoEscaneo(13);
await d.waitForSelector('#datos-nuevos [data-cerrar-datos-nuevos]', { timeout: 10000 });
await d.locator('#datos-nuevos [data-cerrar-datos-nuevos]').click();
ok(!(await avisoDatos.isVisible()) && (await d.evaluate(() => document.activeElement?.id)) === 'principal', 'aviso de ofertas nuevas: se cierra con ✕ y el foco vuelve al contenido');
await nuevoEscaneo(14);
await d.waitForTimeout(1500);
ok(!(await avisoDatos.isVisible()), 'aviso de ofertas nuevas: cerrado con ✕, no vuelve en esta visita');
await cd.close();

// «Nueva versión» (sale si llega una versión nueva mientras escribes): en una línea en 320 px.
// Se simula el cambio de service worker: ya había uno («controller») y avisa del nuevo.
const cv = await contexto({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
await cv.addInitScript(() => { Object.defineProperty(ServiceWorkerContainer.prototype, 'controller', { get: () => ({}), configurable: true }); });
const v = await pagina(cv);
await ir(v, 'escapadas');
await v.evaluate(() => {
  document.querySelectorAll('[data-plegable-movil]').forEach((x) => { x.open = true; });
  document.querySelector('#principal input[type="search"], #principal input[type="text"]').focus();
  navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
});
await v.waitForSelector('#datos-nuevos [data-actualizar]', { timeout: 5000 });
const version = await v.$eval('#datos-nuevos', (a) => {
  const t = a.querySelector('.aviso-flotante__texto');
  const b = a.getBoundingClientRect();
  return { texto: t.textContent.trim(), lineas: Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)), dentro: b.left >= 0 && b.right <= innerWidth };
});
ok(version.texto === 'Nueva versión' && version.lineas === 1 && version.dentro, `aviso de versión nueva: «${version.texto}» cabe en una línea en 320 px (${version.lineas} línea(s))`);
await cv.close();

// ── Carga en un móvil lento: la portada de index.html mientras llegan las ofertas ──
// La que pone el despliegue (scripts/preparar-web.js): scripts/servir.js sirve site/ tal cual, sin ella.
// Con la fecha de ahora: tema.js no enseña una de hace más de 3 h (la del service worker de otra visita).
const indiceCon = (generado) => ponerPortada(readFileSync(path.join(RAIZ, 'site/index.html'), 'utf8'), generarPaginas({ ...datos, generado }).portada);
const indicePreparado = indiceCon(new Date().toISOString());
const historial = JSON.parse(readFileSync(path.join(RAIZ, 'site/data/historial.json'), 'utf8'));
const esperar = (ms) => new Promise((listo) => { setTimeout(listo, ms); });
/** Una página con la portada estática y, si se pide, ofertas.json o historial.json que tardan. */
async function cargaMovil({ ruta = 'finde', ofertasMs = 0, historialMs = 0, indice = indicePreparado, favoritos = null } = {}) {
  const cm = await contexto({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  if (favoritos) await cm.addInitScript((ids) => { localStorage.setItem('escapadas:favoritos', JSON.stringify(ids)); }, favoritos);
  await cm.route((url) => url.pathname === '/' || url.pathname === '/index.html', (r) => r.fulfill({ body: indice, contentType: 'text/html; charset=utf-8' }));
  if (ofertasMs) await cm.route('**/data/ofertas.json', async (r) => { await esperar(ofertasMs); await r.continue(); });
  if (historialMs) await cm.route('**/data/historial.json', async (r) => { await esperar(historialMs); await r.continue(); });
  await cm.addInitScript(() => {
    // Si la portada estática llega a verse antes de que pinte el panel, y cuándo pinta.
    window.addEventListener('escapadas:listo', () => { window.listoEn = performance.now(); });
    const mirar = () => {
      const estatica = document.querySelector('.portada-estatica');
      if (estatica && getComputedStyle(estatica).display !== 'none') window.estaticaVista ??= performance.now();
      if (!window.escapadasListo) requestAnimationFrame(mirar);
    };
    requestAnimationFrame(mirar);
  });
  const pm = await pagina(cm);
  await pm.goto(`${BASE}#/${ruta}`);
  return { cm, pm, listo: () => pm.waitForFunction(() => window.escapadasListo === true, null, { timeout: 30000 }) };
}
const inicioPedido = (pm, archivo) => pm.evaluate((a) => performance.getEntriesByType('resource').find((e) => e.name.includes(`/data/${a}`))?.startTime ?? null, archivo);
{
  const { cm, pm, listo } = await cargaMovil({ ofertasMs: 4000 });
  await pm.waitForTimeout(2600);
  const estatica = pm.locator('.portada-estatica');
  ok(await estatica.isVisible() && (await pm.locator('.portada-estatica .fila-guia').count()) > 0, 'carga lenta: a los 2 s se ve la portada de index.html, con lo mejor de ahora');
  const [cargando, titulo] = [await pm.locator('.cargando').boundingBox(), await pm.locator('.portada-estatica h1.titulo-vista').boundingBox()];
  ok(cargando && titulo && cargando.y < titulo.y, 'carga lenta: «Cargando ofertas…» encima de la portada estática');
  await listo();
  ok((await estatica.count()) === 0 && (await pm.locator('#principal .portada').count()) === 1, 'carga lenta: al llegar las ofertas, el panel la sustituye');
  await cm.close();
}
{
  // La de hace dos días (el index.html que guardó el service worker en otra visita): no se enseña.
  const { cm, pm, listo } = await cargaMovil({ ofertasMs: 4000, indice: indiceCon(new Date(Date.now() - 2 * 86_400_000).toISOString()) });
  await pm.waitForTimeout(2600);
  ok(!(await pm.locator('.portada-estatica').isVisible()) && await pm.locator('.cargando').isVisible(), 'carga lenta con una portada vieja: solo «Cargando ofertas…», no las ofertas de hace días');
  await listo();
  await cm.close();
}
{
  const { cm, pm, listo } = await cargaMovil();
  await listo();
  ok(await pm.evaluate(() => window.estaticaVista == null), 'carga rápida: la portada estática no llega a verse (no salta de un contenido a otro)');
  await pm.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('/data/historial.json')));
  const [ofertas, deHistorial, listoEn] = [await inicioPedido(pm, 'ofertas.json'), await inicioPedido(pm, 'historial.json'), await pm.evaluate(() => window.listoEn)];
  ok(ofertas < listoEn && deHistorial >= listoEn, `portada: el historial se pide después de pintar (ofertas a los ${Math.round(ofertas)} ms, panel a los ${Math.round(listoEn)}, historial a los ${Math.round(deHistorial)})`);
  await cm.close();
}
{
  const { cm, pm, listo } = await cargaMovil({ ruta: 'escapadas' });
  await listo();
  ok((await inicioPedido(pm, 'historial.json')) < (await pm.evaluate(() => window.listoEn)), 'Explorar: el historial se pide desde el principio (sus tarjetas lo usan)');
  await cm.close();
}
{
  // Una ficha abierta desde la portada antes de que llegue el historial espera a tenerlo.
  const { cm, pm, listo } = await cargaMovil({ historialMs: 2500 });
  await listo();
  const conHistorial = Object.keys(historial).filter((id) => historial[id].length >= 2);
  const id = await pm.evaluate((ids) => [...document.querySelectorAll('#principal [data-ficha]')].map((b) => b.dataset.ficha).find((x) => ids.includes(x)) ?? null, conHistorial);
  if (id) {
    await pm.evaluate((x) => { location.hash = `#/oferta/${encodeURIComponent(x)}`; }, id);
    await pm.waitForSelector('#ficha[open]', { timeout: 10000 });
    ok((await pm.locator('#ficha canvas#ficha-grafica').count()) === 1, 'ficha abierta antes de que llegue el historial: sale con su gráfica');
  }
  await cm.close();
}
{
  // Sin tocar nada, al llegar el historial la portada se repinta con él (con favoritos, sus
  // tarjetas de «Recomendado para ti» lo usan).
  const { cm, pm, listo } = await cargaMovil({ historialMs: 2500, favoritos: vigentes.filter((o) => o.tipo !== 'vuelo').slice(0, 3).map((o) => o.id) });
  await listo();
  const recomendadas = await pm.locator('#principal .seccion:has-text("Recomendado para ti") .tarjeta').count();
  await pm.evaluate(() => { document.querySelector('#principal .portada').dataset.deAntes = '1'; });
  await pm.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('/data/historial.json') && e.responseEnd > 0), null, { timeout: 15000 });
  await pm.waitForTimeout(300);
  ok(recomendadas > 0 && (await pm.locator('#principal .portada').count()) === 1 && (await pm.locator('#principal .portada[data-de-antes]').count()) === 0, `portada sin tocar: se repinta al llegar el historial (${recomendadas} recomendadas)`);
  await cm.close();
}
{
  // «Sorpréndeme» abierto antes de que llegue el historial: no se cierra al llegar, ni se pierde
  // lo elegido en «Cambiar» sin buscar aún, ni el foco.
  const { cm, pm, listo } = await cargaMovil({ historialMs: 2500 });
  await listo();
  await pm.locator('.organizar__opcion:has(input[value="vuelos"])').click();
  await pm.locator('#buscador-finde-q').fill('Cadaqués');
  await pm.locator('.atajos-portada [data-sorpresa]').click();
  const planes = await pm.locator('#sorpresa .tarjeta').count();
  await pm.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('/data/historial.json') && e.responseEnd > 0), null, { timeout: 15000 });
  await pm.waitForTimeout(300);
  ok(planes > 0 && await pm.locator('#sorpresa-bloque').isVisible() && (await pm.locator('#sorpresa .tarjeta').count()) === planes, `«Sorpréndeme» sigue abierto al llegar el historial (${planes} planes)`);
  const formulario = await pm.evaluate(() => ({
    que: document.querySelector('input[name="que"]:checked')?.value,
    destino: document.querySelector('#buscador-finde-q')?.value,
    foco: document.activeElement?.matches('[data-sorpresa]') ?? false,
  }));
  ok(formulario.que === 'vuelos' && formulario.destino === 'Cadaqués' && formulario.foco, `al llegar el historial sigue lo elegido en «Cambiar» y el foco (${JSON.stringify(formulario)})`);
  await cm.close();
}
{
  // Ni al llegar las rutas por carretera desde otra salida (OSRM, unos segundos después de pintar).
  const cr = await contexto({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await cr.route('https://router.project-osrm.org/**', async (r) => {
    const n = r.request().url().split('/driving/')[1].split('?')[0].split(';').length;
    await esperar(300);
    const fila = Array.from({ length: n }, (_, i) => (i === 0 ? 0 : 3600 + i));
    await r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'Ok', durations: [fila], distances: [fila.map((s) => s * 25)] }) });
  });
  await cr.addInitScript(() => {
    if (sessionStorage.getItem('salida-puesta')) return;
    sessionStorage.setItem('salida-puesta', '1');
    localStorage.setItem('escapadas:salida', JSON.stringify({ nombre: 'Girona', lat: 41.9794, lon: 2.8214 }));
  });
  const pr = await pagina(cr);
  await pr.goto(`${BASE}#/finde`);
  await pr.waitForFunction(() => window.escapadasListo === true, null, { timeout: 30000 });
  await pr.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('/data/historial.json') && e.responseEnd > 0), null, { timeout: 15000 });
  await pr.waitForTimeout(300);
  await pr.locator('.atajos-portada [data-sorpresa]').click();
  const planes = await pr.locator('#sorpresa .tarjeta').count();
  await pr.waitForFunction(() => localStorage.getItem('escapadas:rutas'), null, { timeout: 40000, polling: 100 });
  await pr.waitForTimeout(300);
  ok(planes > 0 && await pr.locator('#sorpresa-bloque').isVisible() && (await pr.locator('#sorpresa .tarjeta').count()) === planes, `«Sorpréndeme» sigue abierto al llegar las rutas desde otra salida (${planes} planes)`);
  await cr.close();
}

// En Puentes, desde el menú, al llegar las rutas: sin tocar, se repinta y el título sigue con el
// foco; con un carrusel deslizado, no se repinta (no vuelve a la primera tarjeta).
for (const deslizar of [false, true]) {
  const cr = await contexto({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await cr.route('https://router.project-osrm.org/**', async (r) => {
    const n = r.request().url().split('/driving/')[1].split('?')[0].split(';').length;
    await esperar(300);
    const fila = Array.from({ length: n }, (_, i) => (i === 0 ? 0 : 3600 + i));
    await r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'Ok', durations: [fila], distances: [fila.map((x) => x * 25)] }) });
  });
  await cr.addInitScript(() => {
    if (sessionStorage.getItem('salida-puesta')) return;
    sessionStorage.setItem('salida-puesta', '1');
    localStorage.setItem('escapadas:salida', JSON.stringify({ nombre: 'Girona', lat: 41.9794, lon: 2.8214 }));
  });
  const pr = await pagina(cr);
  await pr.goto(`${BASE}#/finde`);
  await pr.waitForFunction(() => window.escapadasListo === true, null, { timeout: 30000 });
  await pr.evaluate(() => { location.hash = '#/puentes'; });
  await pr.waitForFunction(() => document.activeElement?.matches('#principal .titulo-vista'), null, { timeout: 10000 });
  const rejilla = pr.locator('#principal .carruseles .rejilla').first();
  if (deslizar) await rejilla.evaluate((r) => { r.scrollLeft = 200; });
  await pr.waitForTimeout(200);
  const izquierda = deslizar ? await rejilla.evaluate((r) => Math.round(r.scrollLeft)) : 0;
  await pr.evaluate(() => { document.querySelector('#principal .titulo-vista').dataset.deAntes = '1'; });
  await pr.waitForFunction(() => localStorage.getItem('escapadas:rutas'), null, { timeout: 40000, polling: 100 });
  await pr.waitForTimeout(300);
  const repintada = (await pr.locator('#principal .titulo-vista[data-de-antes]').count()) === 0;
  if (deslizar) {
    const ahora = await pr.locator('#principal .carruseles .rejilla').first().evaluate((r) => Math.round(r.scrollLeft));
    ok(izquierda > 0 && !repintada && ahora === izquierda, `Puentes con un carrusel deslizado: no se repinta al llegar las rutas (${izquierda} → ${ahora})`);
  } else {
    const foco = await pr.evaluate(() => document.activeElement?.matches('#principal .titulo-vista') ?? false);
    ok(repintada && foco, `Puentes sin tocar: se repinta al llegar las rutas y el título sigue con el foco (repintada ${repintada}, foco ${foco})`);
  }
  await cr.close();
}

ok(!errores.some((e) => /Content Security Policy|Refused to (load|apply|execute|connect)/.test(e)), 'CSP: ningún error en la consola en todo el recorrido');

await cerrar();
console.log(`${hechos.length} comprobaciones bien, ${fallos.length} mal`);
if (fallos.length) console.log(`FALLOS:\n- ${fallos.join('\n- ')}`);
if (errores.length) console.log(`ERRORES:\n- ${[...new Set(errores)].join('\n- ')}`);
if (fallos.length || errores.length) process.exitCode = 1;
