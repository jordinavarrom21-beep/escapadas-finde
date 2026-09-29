# Contratos internos de Escapadas Finde

Este documento es la referencia compartida por todos los módulos. **Si un módulo
necesita algo que no está aquí, no lo inventes en otro archivo: documéntalo como
«cambio de contrato necesario».**

## Reglas generales

- Node ≥ 22, módulos ES (`import`/`export`), sin TypeScript. Dependencias: `fast-xml-parser`,
  `cheerio` y `nodemailer`, más `imapflow` y `mailparser` solo para el buzón. Todo lo demás,
  con la librería estándar.
- Identificadores, comentarios, logs y textos visibles **en español**. Código limpio:
  funciones pequeñas y puras cuando se pueda, sin abstracciones especulativas y sin
  comentarios que repitan el código.
- Las fuentes **nunca** llaman a `fetch` directamente: usan `ctx.http` (así se pueden
  simular en los tests).
- Uso justo: respetar robots.txt (lo comprueba el orquestador con `src/util/robots.js` a partir de
  las `urls` que declara cada fuente), espaciar las peticiones y no intentar nunca saltarse
  captchas, desafíos de Cloudflare ni ninguna otra protección anti-bot. Si una web
  devuelve un desafío, la fuente lanza un error descriptivo y ya está.
- Tests con `node:test` + `node:assert/strict` en `test/<modulo>.test.js`, con
  fixtures reales en `test/fixtures/`. Los tests **no** usan la red.
- Utilidades comunes disponibles (no las dupliques):
  - `src/util/http.js`: `obtenerTexto`, `obtenerJson`, `esperar`, `clienteHttp`, `crearClienteHttp({etiqueta, log})`,
    `metricasHttp()`, `reiniciarMetricas()`, `USER_AGENT` y los errores `ErrorHttp` (con `estado`, `dominio`,
    `intento`, `duracionMs` y `esperaSugeridaMs`), `ErrorRed` (`motivo: 'red' | 'timeout'`) y `ErrorParseo`
    (la respuesta llegó pero no es JSON; extiende `SyntaxError`, que es como las fuentes detectan los desafíos anti-bot)
  - `src/util/xml.js`: `parsearXml(texto, {arrays})`, `textoPlano(html)`, `decodificarEntidades`, `recortar`, `normalizarTexto`
  - `src/util/precio.js`: `parsearPrecio`, `extraerPrecio`, `extraerPrecios`
  - `src/util/fechas.js`: `ZONA`, `fechaLocal`, `horaLocal`, `sumarDias`, `diaSemana`, `diasEntre`, `etiquetaDia`, `etiquetaFechaHora`, `etiquetaRango`, `findesProximos`
  - `src/modelo.js`: `TEMAS`, `TIPOS`, `UNIDADES`, `REGIMENES`, `TRANSPORTES`, `crearOferta`, `validarOferta`
  - `src/cache.js`: clase `Cache` (`obtener(clave, maxEdadMs)`, `guardar(clave, valor)`, `podar`, `exportar`)
  - `src/util/robots.js`: `rutaPermitida(texto, ruta)`, `comprobarRobots(ctx, urls)` (caché `robots:<origen>` 1 día) y `ErrorRobots`

## Modelo «Oferta» (`src/modelo.js`)

Se crea siempre con `crearOferta(datos)`, que rellena los valores por defecto y lanza
un `TypeError` si algo no cumple el contrato. Las fuentes crean cada oferta dentro de
un `try/catch`, registran el error con `ctx.log` y descartan solo esa oferta.

| Campo | Quién lo rellena | Significado |
|---|---|---|
| `id` | fuente | `"<fuente>:<id estable>"`. Debe ser el mismo entre ejecuciones para la misma oferta |
| `fuente` | fuente | id de la fuente (`ryanair`, `buscounchollo`…) |
| `tipo` | fuente | `vuelo` \| `escapada` \| `hotel` \| `paquete` |
| `titulo`, `descripcion` | fuente | texto plano; descripción recortada a ≤ 300 caracteres con `recortar` |
| `url` | fuente | enlace a la oferta original (sin parámetros de seguimiento) |
| `imagen` | fuente | URL absoluta o `null` |
| `precio` | fuente | número en EUR o `null` si no hay precio |
| `precioTexto` | fuente | cómo lo presenta la web, p. ej. «desde 108 € por persona» |
| `unidad` | fuente | `pp` (por persona, estancia completa) \| `pp/noche` \| `total` \| `i/v` (ida y vuelta por persona) \| `noche` (habitación por noche) \| `trayecto` (billete de tren, bus o ferry por persona y trayecto, solo ida) \| `null` |
| `precioAnterior`, `descuento` | fuente | precio tachado o anterior que publica la web, y % de descuento |
| `noches` | fuente o `temas.js` | número de noches si se conoce |
| `regimen` | fuente o `temas.js` | `solo-alojamiento` \| `desayuno` \| `media-pension` \| `pension-completa` \| `todo-incluido` |
| `temas` | fuente + `temas.js` | ids de `TEMAS` (se unen los de la fuente y los detectados) |
| `transporte` | fuente o `temas.js` | `avion` \| `coche` \| `tren` \| `bus` \| `ferry` |
| `lugar` | fuente (+ `geo.js` completa lat/lon, `zona.js` provincia y comunidad) | `{nombre, region, pais, codigoPais, lat, lon, iata, provincia, comunidad}`. `nombre` va con el nombre oficial (`util/lugares.js`: «Gerona» → «Girona»); `region` es lo que dice la web |
| `cocheMin`, `cocheKm`, `cocheEstimado` | `geo.js` | tiempo y distancia en coche desde `ajustes.origen`; `cocheEstimado=true` si es una estimación en línea recta |
| `fechas` | fuente (`salida`, `vuelta`) + `festivos.js` (`findeId`, `puenteId`) | `salida`/`vuelta` en hora local `YYYY-MM-DDTHH:mm:ss` o `YYYY-MM-DD` |
| `vuelo` | solo fuentes de vuelos | ver más abajo |
| `etiquetas` | fuente | etiquetas crudas de la web (sirven para temas y filtros) |
| `publicada`, `caduca` | fuente | fechas ISO 8601 o `null` |
| `vistaPrimera`, `vistaUltima` | `almacen.js` | ISO UTC |
| `bajada`, `minimoHistorico` | `historial.js` | € que ha bajado respecto al máximo de los últimos 7 días; `true` si es el precio más bajo registrado, alguna vez estuvo más alto y hay historial suficiente (≥ 3 días con precio y el primero de hace ≥ 7 días) |
| `puntuacion`, `chollazo`, `chollazoMotivo` | `puntuacion.js` | 0–100, si merece alerta (`esChollazo`; el panel usa este campo) y por qué, en una frase comprobable (`motivoChollazo`: error de tarifa, vuelo i/v o precio por persona y noche por debajo del límite, o la puntuación) |
| `enlaces` | `enlaces.js` | `[{etiqueta, url}]`: reservar, comparar, hotel, ruta… |
| `alojamiento` | fuente o `temas.js` | `hotel` \| `casa-rural` \| `camping` \| `apartamento` \| `parador` \| `balneario` \| `hostal` \| `null` |
| `valoracion` | fuente | `{nota: 0–10, n: nº de opiniones}` o `null` |
| `establecimiento` | fuente | nombre propio del alojamiento («Can Salvà», «Parador de Cardona») solo si la web lo publica como dato aparte (no se saca de títulos de pack); `null` si no. Sirve para buscar ese mismo alojamiento en otras webs |
| `ninos` | `ninos.js` | `null` si no es un plan para ir con niños; si lo es, `{ventaja, descuento, detalle}`: `ventaja` es `gratis`, `descuento` (con `descuento` en %), `reducido` (tarifa infantil sin %) o `null` (apta para niños sin precio especial); `detalle` es el texto para la ficha («1 niño gratis (de 2 a 16 años)»). Se deduce del título, la descripción, el precio publicado y las etiquetas; lo negado («no se admiten niños») y lo «solo adultos» no cuenta. Si no es `null`, la oferta lleva también el tema `familia` |
| `estrellas` | fuente o `categoria.js` | categoría del alojamiento, 1–5, o `null`. Holidayguru la da como dato; en el resto se lee del texto («Hotel 4*», «(4*, 8,8/10…)», «SPA****», «hotel de 3 estrellas»), sin contar «reseñas de 5 estrellas» ni las negritas `**…**`. Con varias, la más baja. Una oferta con estrellas y sin `alojamiento` pasa a `hotel`. Si el texto dice «solo adultos» / «adults only», la oferta lleva la etiqueta `solo-adultos` |
| `historialPorNoche` | `historial.js` | `true` si el historial, `bajada` y `minimoHistorico` van por noche: precios por noche y estancias con fechas cerradas y precio total, cuyas fechas y noches cambian de un día a otro. Su serie se guarda como `<id>~noche` y se publica con el id de la oferta |
| `precioNoche` | `puntuacion.js` | precio por persona y noche cuando se puede deducir (`precioPorPersonaNoche`) |
| `referencia` | `referencia.js` | `{mediana, ahorroPct, grupo, descripcion, n}`: comparación con ofertas parecidas; `descripcion` dice el grupo en palabras («escapadas de relax y spa en Girona, por persona y noche»). Las actividades no tienen: no son comparables entre sí |
| `urlReserva`, `afiliado`, `patrocinada` | `afiliacion.js` | la `url` con el identificador de afiliado de un proveedor activo y aprobado (o igual que `url`), qué proveedor (`null` si ninguno) y `{anunciante}` si alguien paga por ella. `url` se queda limpia. No cambian la puntuación ni el orden |
| `equivalentes` | `duplicados.js` | el mismo alojamiento en otras webs, de la más barata a la más cara: `[{id, fuente, precio, unidad, precioNoche, url}]` |
| `costeCoche` | `geo.js` | `{eur, litros}` del viaje de ida y vuelta desde `ajustes.origen`, solo si se va en coche (`transporte` `coche` o `null`): una oferta de tren, bus, avión o ferry no gasta gasolina (`vaEnCoche`) |
| `tiempo` | `tiempo.js` | `{dia, maxC, minC, lluviaPct, codigo, texto}` del finde o puente asignado |
| `eventos` | `eventos.js` | hasta 3 `{nombre, fecha, url, municipio}` cerca del destino esos días, sin repetir el mismo acto en el mismo municipio (`sinRepetir`). En una oferta sin fechas propias son los del próximo finde: el panel los enseña solo en la ficha y avisando |

Etiquetas especiales (en `etiquetas`) que otros módulos entienden:
`temperatura:<grados>` (popularidad en Chollometro), `promocion` y `sale-de:<ciudad>` (`vuelos.js`), `top-chollo` (destacado por la
propia web), `error-tarifa` (tarifa errónea detectada, p. ej. en Fly4free), `caduca-estimada` (la
web no publica hasta cuándo vale y `caduca` la ha supuesto el vigilante, como en el buzón: sirve
para la poda, pero el panel no la enseña como dato).

`fechas.salida`/`vuelta` son las del viaje; `caduca`, hasta cuándo vale la promoción para reservar.
El panel las enseña por separado («Fechas flexibles · ⏳ Promoción hasta el mié 30 sep»).

Campo `vuelo` (solo en fuentes de vuelos con fechas concretas, como Ryanair; las
ofertas de vuelos de blogs y comunidades usan `tipo: 'vuelo'` con `vuelo: null`):

```js
{
  origen: 'BCN', destino: 'OPO',
  ida:    { salida: '2026-10-16T23:40:00', llegada: '2026-10-17T00:55:00', numero: 'FR1234', precio: 30.99 },
  vuelta: { salida: '2026-10-18T05:55:00', llegada: '2026-10-18T09:05:00', numero: 'FR4321', precio: 31.49 },
  consultaId: 'BCN:2026-10-16:2026-10-18:normal',  // identifica la consulta que la produjo
  horarioIdeal: true,        // la salida y la vuelta cumplen ajustes.vuelos.horarioIdeal
  patron: 'vie-dom',         // id del patrón, o 'puente'
  nuevaRuta: false
}
```

## Contexto que recibe cada fuente (`ctx`)

```js
{
  ahora: Date,
  ajustes,                 // config/ajustes.json
  http: { texto, json, redireccion, esperar }, // src/util/http.js; redireccion = un salto sin seguirlo
  cache: Cache,
  log: (mensaje) => void,  // ya lleva el prefijo de la fuente
  findes: Finde[],         // findesProximos(ajustes.vuelos.findes, ahora)
  puentes: Puente[],       // de festivos.js (puede estar vacío si Nager.at falla)
  env: process.env,        // para fuentes que necesitan secretos
}
```

## Fuentes (`src/fuentes/<id>.js`)

Cada fuente exporta por defecto un objeto y, con nombre, sus funciones puras de
interpretación para poder probarlas con fixtures:

```js
export function parsear(texto, ctx) { /* → Oferta[] */ }

export default {
  id: 'viajerospiratas',
  nombre: 'Viajeros Piratas',
  web: 'https://www.viajerospiratas.es',
  modo: 'feed',            // feed | api | html | navegador | afiliado | buzon
  requiere: [],            // variables de entorno obligatorias (p. ej. ['TRAVELPAYOUTS_TOKEN'])
  urls: ['https://www.viajerospiratas.es/feed/'], // TODAS las URLs (o rutas representativas) que puede pedir
  async obtener(ctx) {
    // → { ofertas: Oferta[], reemplazar?: boolean | ((oferta) => boolean) }
  },
};
```

- `reemplazar: true` significa que el resultado es el **catálogo completo** de la
  fuente: el almacén borra sus ofertas guardadas que ya no aparecen. Una función
  limita el borrado a las ofertas que devuelvan `true` (p. ej. solo las de las consultas
  de Ryanair que han ido bien). Sin `reemplazar`, las ofertas antiguas caducan por
  `retencionDias` o, en html y api, por revisiones sin verlas (ver `podar`).
- Si la fuente falla del todo, lanza un error con un mensaje claro en español.
- Si `requiere` contiene variables que no están en `ctx.env`, el orquestador no la
  ejecuta y la marca como `desactivada`, indicando qué falta.
- Antes de ejecutarla (salvo las de `modo: 'buzon'`, que leen un correo propio por IMAP), el orquestador llama a `comprobarRobots(ctx, fuente.urls)`. Si alguna
  ruta está prohibida (`ErrorRobots`), la fuente queda `bloqueada` con el motivo y no se
  ejecuta. Las páginas extra con parámetros (paginación, filtros) también van en `urls`.
- `ajustes.fuentes[id]` puede llevar `activa: false` y un `motivo` (se muestra en el panel).
- El intervalo y la activación salen de `ajustes.fuentes[id]`.
- `src/fuentes/index.js` exporta `FUENTES` (array con todos los módulos).

## Enriquecedores (`src/enriquecer/`)

- `temas.js`
  - `clasificar(oferta)` → `{temas, regimen, noches, transporte}` detectados en
    título, descripción, etiquetas y lugar. No modifica la oferta.
  - `aplicarClasificacion(oferta)` rellena `regimen`, `noches` y `transporte` solo si
    son `null`, y une los `temas`.
- `vuelos.js`
  - `clasificarVueloSinFecha(oferta)`: en los vuelos sin `vuelo` (blogs y comunidades), pasa a
    `paquete` los que incluyen alojamiento («3 noches en hotel con vuelos»), etiqueta `promocion` los
    que no son un billete (descuentos, códigos, «muchos destinos») y anota `sale-de:<ciudad>` con las
    salidas que publica el título (o la descripción, en los paquetes con avión). Idempotente.
- `zona.js`
  - `aplicarZona(oferta)`: `lugar.provincia` y `lugar.comunidad` en España a partir de lo
    que diga `region` (provincia, comunidad, comarca, zona turística…); null si no se sabe.
- `alojamiento.js`
  - `aplicarAlojamiento(oferta)` rellena `alojamiento` (hotel, casa-rural, camping…):
    primero el de la fuente y, si no, por palabras clave.
- `enlaces.js`
  - `enlacesPara(oferta, {origen, ahora, max = 8})` → `[{etiqueta, url, grupo}]`, agrupados
    en comparar, alojamiento, actividades y llegar (Google Flights, Skyscanner, Booking,
    Trivago, Civitatis, GetYourGuide, GuruWalk, Omio, Direct Ferries, Google Maps…), con
    destino y fechas ya rellenados cuando se conocen. Solo se construyen URLs: nunca se
    consultan esas webs. Las actividades no reciben enlaces a más actividades. Si la oferta
    tiene `establecimiento`, además (fuera de `max`) los del grupo `este-alojamiento`: ese mismo
    alojamiento en Booking con las fechas y en Google Hoteles (o, en casas rurales, campings y
    apartamentos, una búsqueda en Google para dar con su web), buscando «nombre, localidad».
- `precios.js` (guardián)
  - `revisarPrecios(ofertas, log)` → nº de ofertas con un precio no creíble (negativo,
    por debajo del mínimo de su tipo o < 8 €/noche por persona; los billetes de bus, tren
    y ferry pueden valer desde 1 €). Les pone `precio` y `precioNoche` a `null`,
    `chollazo` a `false` y la etiqueta «precio-dudoso»; `precioTexto` se conserva.
- `referencia.js`
  - `calcularReferencia(ofertas)` rellena `referencia` `{grupo, descripcion, mediana, n, ahorroPct}` (salvo en actividades)
    comparando con la mediana de su grupo (ruta de vuelo, billetes por transporte,
    tipo + zona…). Sin red.
- `duplicados.js`
  - `marcarEquivalentes(ofertas)`: la misma escapada en varias webs: mismo alojamiento
    normalizado (sin «Can», «Cal», «Casa» o «Rural» delante y con «Masía» = «Mas», si lo que
    queda tiene al menos 4 letras) en la misma localidad escrita de cualquier forma (sin tildes,
    apóstrofos ni signos) y a menos de 25 km; o con el nombre exacto en localidades distintas a
    menos de 4 km (municipio en una web, pedanía en otra). Nunca en provincias distintas. Cada
    una guarda en `equivalentes` las de las otras webs (la primera es la más barata del grupo);
    todas menos la más barata llevan la etiqueta «duplicada». Conservador: ante la duda no agrupa. Además, dos ofertas de la misma
    web idénticas en todo lo que se ve (título, precio, unidad, noches, lugar, régimen,
    descripción, fechas y etiquetas) son la misma publicada dos veces: la de id menor se queda y
    la otra lleva «duplicada» sin `equivalentes`.
- `tiempo.js` / `eventos.js`
  - `anadirTiempo(ofertas, ctx)`: previsión de Open-Meteo para el finde o puente.
  - `anadirEventos(ofertas, ctx)`: agenda cultural de Cataluña (Socrata) cerca del destino.
- `festivos.js`
  - `obtenerFestivos(ctx, anios)` → `Festivo[]` `{fecha, nombre, ambito: 'nacional'|'autonomico'|'local'}`.
    Nager.at (`/api/v3/PublicHolidays/{año}/ES`, filtrando por `ajustes.puentes.comunidad`)
    + `ajustes.puentes.festivosLocales`, con caché de 7 días (`festivos:<año>`).
  - `calcularPuentes(festivos, {desde, hasta})` → `Puente[]`:
    `{id, nombre, desde, hasta, dias, festivos, salidas: [fecha, ...], vuelta, etiqueta}`.
    Un puente es cualquier bloque de ≥ 3 días no laborables seguidos (sábados, domingos,
    festivos y el día puente entre un festivo en martes/jueves y el fin de semana).
    `desde`/`hasta` son el primer y el último día libre; `salidas` son el día laborable
    anterior (salir por la tarde) y `desde`; `vuelta` es `hasta`.
  - `asignarFechas(oferta, findes, puentes)` → `{findeId, puenteId}` según las fechas
    de la oferta.
- `geo.js`
  - `geolocalizar(ofertas, ctx, {maxNuevas = 40})`: completa `lugar.lat/lon` de las
    ofertas que tienen `lugar.nombre` pero no coordenadas. Usa Nominatim con caché
    (`geo:<consulta>`, 90 días, también para los «no encontrado») y ≥ 1,1 s entre
    peticiones.
  - `calcularCoche(ofertas, ctx)`: rellena `cocheMin`/`cocheKm` desde `ajustes.origen`
    para las ofertas que no son vuelos y tienen coordenadas dentro de
    `ajustes.coche.maxKmLineaRecta`. OSRM `table` por lotes (≤ 80 destinos) con caché
    (`ruta:<lat>,<lon>` redondeado a 3 decimales, 180 días). Si OSRM falla, estima
    con línea recta × 1,3 a `velocidadMediaKmh` y marca `cocheEstimado`.
  - `calcularCosteCoche(ofertas, ctx)`: `costeCoche` `{eur, litros}` (ida y vuelta) con el consumo de
    `ajustes.coche` y el precio del carburante del Ministerio (caché diaria). Solo en las ofertas a las
    que se va en coche (`vaEnCoche`); el panel enseña el de las demás solo como comparación en la ficha.
  - `distanciaKm(a, b)`: haversine.
- `puntuacion.js`
  - `puntuar(ofertas, ajustes)`: asigna `puntuacion` (0–100) a todas.
  - `esChollazo(oferta, ajustes)` → boolean, según `ajustes.emails.chollazos`.

## Historial (`src/historial.js`)

`data/historial.json`: `{ "<ofertaId>": [["YYYY-MM-DD", precioMinimoDelDia], ...] }`.

- `registrarPrecios(historial, ofertas, ahora)`: añade o actualiza el mínimo del día y
  rellena `bajada` y `minimoHistorico` en cada oferta.
- `compactar(historial, ahora, {maxDias = 120, idsVivos})`: quita los puntos antiguos
  y las series de ofertas que ya no existen desde hace más de 30 días.
- `seriesPara(historial, ids)` → el subconjunto que se publica en el panel.

## Almacén y estado (`src/almacen.js`)

`data/estado.json`:

```js
{
  version: 1,
  ofertas: { [id]: Oferta },
  fuentes: { [id]: { ultimoIntento, ultimoOk, error, desdeError, total, duracionMs } },
  emails: {
    inicializado: false,
    resumenEnviado: null,            // 'YYYY-MM-DD' del viernes del último resumen
    alertados: { [ofertaId]: ISO },  // chollazos ya avisados (se podan a los 30 días)
    enviosHoy: { fecha: 'YYYY-MM-DD', n: 0 },
    vigilados: { ['<criterio>|<ofertaId>']: ultimoPrecioAvisado },
    fuentesCaidas: { [fuenteId]: ISO } // último aviso de fuente caída
  }
}
```

- `cargarJson(ruta, porDefecto)` y `guardarJson(ruta, datos)` (escritura atómica:
  archivo temporal y después renombrar).
- `fusionar(estado, fuenteId, {ofertas, reemplazar}, ahora)`: conserva `vistaPrimera`,
  actualiza `vistaUltima` y aplica `reemplazar`.
- `podar(estado, ahora, {retencionDias, fuentes})`: quita las ofertas caducadas, cualquier oferta
  (no solo vuelos) cuya salida ya ha pasado, las que no se ven desde hace más de `retencionDias`
  (o `fuentes[id].retencionDias`) y, en las fuentes `adaptable` (modo html o api) sin retención
  propia, las que su última lectura buena (`estado.fuentes[id].ultimoOk`) no trae desde hace
  `REVISIONES_SIN_VER` (8) intervalos y al menos 2 días. `fuentes`: `{id: {intervaloMin,
  retencionDias?, adaptable}}` (lo arma el pipeline con `ajustes.fuentes` y el `modo` de cada una).
  Por eso una fuente no debe poner en `fechas` algo que no sea la fecha del viaje (Nomolesten
  ponía la del precio y la poda la vaciaba cada medianoche).

Otros archivos de `data/`: `cache.json` (Cache), `historial.json`.
**Todo `data/` se guarda entre ejecuciones en la rama `datos` del repo.**

## Orden del escaneo (`src/core/scan-pipeline.js`; la CLI `src/escanear.js` lee y escribe el disco)

1. Cargar `config/ajustes.json`, `config/vigilados.json` y `data/*`.
2. `obtenerFestivos` → `calcularPuentes` (próximos 120 días) y `findesProximos`.
3. Ejecutar las fuentes a las que les toca (han pasado ≥ 80 % de su intervalo desde
   `ultimoIntento`, o `--forzar`, o `--solo=<id>`), con robots.txt comprobado antes
   (salvo el buzón). Como mucho `ajustes.maxFuentesEnParalelo` a la vez y una por
   dominio (`src/core/source-runner.js`); cada una espacia sus propias peticiones.
4. `fusionar` los resultados → `podar`.
5. Enriquecer todas las ofertas, en este orden (cada paso usa lo del anterior):
   `completarOferta` → `clasificarVueloSinFecha` → `aplicarClasificacion` → `aplicarAlojamiento` → `aplicarZona` → `precioNoche` →
   `asignarFechas` → `geolocalizar` → `calcularCoche` → `calcularCosteCoche` →
   `revisarPrecios` → `calcularReferencia` → `marcarEquivalentes` → `anadirTiempo` →
   `anadirEventos` → `enlacesPara` → `registrarPrecios` → `compactar` → `puntuar`.
   El guardián de precios va antes de la referencia para que un precio imposible no
   hunda la mediana ni pase por chollazo.
6. `procesarEmails` (salvo con `--sin-emails`), dentro de `escanear()` y antes de escribir nada.
7. La CLI guarda `data/estado.json`, `data/cache.json` y `data/historial.json`, escribe
   `site/data/ofertas.json`, `site/data/historial.json` y `site/data/vigilados.json`, las páginas para
   buscadores de `src/paginas.js` (`site/escapadas/…`, `site/vuelos/`, `site/actividades/gratis/` y
   `site/sitemap.xml`, borrando antes las de la pasada anterior), e imprime
   un resumen por fuente. El código de salida es 0 aunque fallen algunas fuentes y 1 si fallan
   todas las que se han ejecutado en esta pasada. Si `escanear()` lanza, no se escribe nada y el
   workflow no despliega (comprueba que exista `site/data/ofertas.json`).
8. Antes de todo, la CLI valida `config/ajustes.json` (`cargarAjustes`) y carga el estado con
   `cargarEstado` (migra, valida y, si está roto, recupera el `.bak`).
   Una fuente cuyas ofertas no lleven `fuente` igual a su `id` da error: si no, el
   `reemplazar` de otra fuente podría borrarlas.

## Datos del panel (`site/data/ofertas.json`)

```js
{
  generado: ISO,
  origen: { nombre, lat, lon },
  aeropuertos: ['BCN', 'GRO', 'REU'],
  viajeros: 2,
  coche: { consumoL100km, precioLitro, carburante }, // precioLitro: el medio del Ministerio de hoy, o el de los ajustes
  afiliacion: { proveedores: ['civitatis'], medicion: null }, // proveedores que marcan enlaces y dónde contar clics
  temas: TEMAS,
  findes: Finde[],        // {id, viernes, sabado, domingo, etiqueta, puenteId}
  puentes: Puente[],
  fuentes: [{ id, nombre, web, modo, estado: 'ok'|'error'|'desactivada'|'bloqueada'|'pendiente', motivo, ultimoOk, error, total, falta: [], intervaloMin }],
  ofertas: Oferta[]       // ordenadas por puntuación descendente
}
```

`site/data/historial.json` = `seriesPara(...)` y `site/data/vigilados.json` = la
configuración de vigilados con, para cada criterio, los ids de las ofertas que
coinciden: `{vigilados: [{...criterio, coincidencias: [ids]}]}`.

## Vigilados (`src/vigilados.js`)

Criterios de `config/vigilados.json` (todos los campos son opcionales salvo `nombre`;
una oferta coincide si cumple **todos** los que estén presentes). La lista completa y
explicada está en el «leeme» del propio archivo y en el typedef `Criterio` de
`src/vigilados.js`: `nombre, activo, ofertaId, texto, tipo, tema, temas, fuente, aeropuerto,
alojamiento, regimenMinimo, valoracionMin, descuentoMin, precioMax, precioNocheMax, noches,
cocheMaxMin, cerca, pais, region, puente, finde, soloChollazos, soloMinimoHistorico, desde, hasta,
presupuestoMax, presupuestoPor, viajeros`. El presupuesto usa `costeViaje` de `site/js/coste.js`
(`costeDesdeOrigen`), el mismo cálculo que el panel, con la gasolina desde `ajustes.origen`.
`texto` busca palabras completas sin tildes ni mayúsculas en título, lugar y destino; `pais`
con dos letras compara el código; `region` vale para la región de la web, la provincia o la
comunidad; `aeropuerto` solo descarta vuelos que publican otro origen.

- `cargarVigilados(ruta, log)`: con el JSON roto o sin lista, avisa y devuelve []; descarta
  lo que no es un objeto y avisa de lo que no coincidiría nunca (`validarVigilado`).
- `coincide(oferta, criterio)` → boolean.

## Emails (`src/emails/`)

- `plantillas.js`: `resumenSemanal(datos)`, `alertaChollazos(datos)`,
  `alertaVigilados(datos)` y `alertaFuentes(datos)` → `{asunto, html, texto}`. HTML con
  estilos en línea y tablas (compatible con Gmail), en español y apto para móvil.
- `enviar.js`: `configuracionEnvio(env)` elige un juego COMPLETO de credenciales:
  SMTP (`SMTP_HOST` + `SMTP_USER` + `SMTP_PASS`, `SMTP_PORT` 587 por defecto, STARTTLS
  obligatorio salvo en el 465) si hay algo de SMTP, o Gmail (`GMAIL_USER` +
  `GMAIL_APP_PASSWORD`); nunca mezcla campos. `crearTransporte(env, log)` → transporte
  o `null` (una cuenta a medias se avisa por `log`). `enviarEmail(transporte, mensaje, env)`.
- `decidir.js`:
  `procesarEmails({ofertas, estado, ajustes, vigilados, findes, puentes, fuentes, panelUrl, ahora, enviar})`.
  - Resumen: viernes (`ajustes.emails.resumen`) a partir de la hora indicada en Madrid,
    una sola vez por viernes.
  - Chollazos: `esChollazo` y no avisados antes; agrupados en un único email; como
    máximo `maxPorDia` emails al día. En la primera ejecución con emails configurados
    (`inicializado: false`) solo se marca lo que ya existía, sin enviar.
  - Vigilados: una oferta que coincide y cuyo precio es menor que el último avisado.
  - Fuentes caídas: estado `error` desde hace más de `fuenteCaidaHoras`, como mucho un aviso
    al día por fuente (las `bloqueada` y `desactivada` no avisan: son intencionadas).
  - Si no hay transporte (faltan secretos), no envía nada ni toca el estado.
- `prueba.js`: CLI. Con SMTP configurado envía un email de prueba con el resumen
  actual; sin SMTP guarda los cuatro emails como HTML en `data/emails-prueba/` para
  poder verlos.
