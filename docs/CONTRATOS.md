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
  - `src/util/http.js`: `obtenerTexto`, `obtenerJson`, `esperar`, `clienteHttp`, `ErrorHttp`, `USER_AGENT`
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
| `unidad` | fuente | `pp` (por persona, estancia completa) \| `pp/noche` \| `total` \| `i/v` (ida y vuelta por persona) \| `noche` (habitación por noche) \| `null` |
| `precioAnterior`, `descuento` | fuente | precio tachado o anterior que publica la web, y % de descuento |
| `noches` | fuente o `temas.js` | número de noches si se conoce |
| `regimen` | fuente o `temas.js` | `solo-alojamiento` \| `desayuno` \| `media-pension` \| `pension-completa` \| `todo-incluido` |
| `temas` | fuente + `temas.js` | ids de `TEMAS` (se unen los de la fuente y los detectados) |
| `transporte` | fuente o `temas.js` | `avion` \| `coche` \| `tren` \| `bus` \| `ferry` |
| `lugar` | fuente (+ `geo.js` completa lat/lon) | `{nombre, region, pais, codigoPais, lat, lon, iata}` |
| `cocheMin`, `cocheKm`, `cocheEstimado` | `geo.js` | tiempo y distancia en coche desde `ajustes.origen`; `cocheEstimado=true` si es una estimación en línea recta |
| `fechas` | fuente (`salida`, `vuelta`) + `festivos.js` (`findeId`, `puenteId`) | `salida`/`vuelta` en hora local `YYYY-MM-DDTHH:mm:ss` o `YYYY-MM-DD` |
| `vuelo` | solo fuentes de vuelos | ver más abajo |
| `etiquetas` | fuente | etiquetas crudas de la web (sirven para temas y filtros) |
| `publicada`, `caduca` | fuente | fechas ISO 8601 o `null` |
| `vistaPrimera`, `vistaUltima` | `almacen.js` | ISO UTC |
| `bajada`, `minimoHistorico` | `historial.js` | € que ha bajado respecto al máximo de los últimos 7 días; `true` si es el precio más bajo registrado (con ≥ 2 días de historial) |
| `puntuacion`, `chollazo` | `puntuacion.js` | 0–100, y si merece alerta (`esChollazo`; el panel usa este campo) |
| `enlaces` | `enlaces.js` | `[{etiqueta, url}]`: reservar, comparar, hotel, ruta… |
| `alojamiento` | fuente o `temas.js` | `hotel` \| `casa-rural` \| `camping` \| `apartamento` \| `parador` \| `balneario` \| `hostal` \| `null` |
| `valoracion` | fuente | `{nota: 0–10, n: nº de opiniones}` o `null` |
| `precioNoche` | `puntuacion.js` | precio por persona y noche cuando se puede deducir (`precioPorPersonaNoche`) |
| `referencia` | `referencia.js` | `{mediana, ahorroPct, grupo, n}`: comparación con ofertas parecidas |
| `equivalentes` | `duplicados.js` | la misma oferta en otras webs: `[{fuente, precio, unidad, url}]` |
| `costeCoche` | `geo.js` | `{eur, litros}` del viaje de ida y vuelta desde `ajustes.origen` |
| `tiempo` | `tiempo.js` | `{dia, maxC, minC, lluviaPct, codigo, texto}` del finde o puente asignado |
| `eventos` | `eventos.js` | hasta 3 `{nombre, fecha, url, municipio}` cerca del destino esos días |

Etiquetas especiales (en `etiquetas`) que otros módulos entienden:
`temperatura:<grados>` (popularidad en Chollometro), `top-chollo` (destacado por la
propia web), `error-tarifa` (tarifa errónea detectada, p. ej. en Fly4free).

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
  http: { texto, json, esperar },
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
  `retencionDias`.
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
- `enlaces.js`
  - `enlacesPara(oferta, {origen})` → `[{etiqueta, url}]` (entre 2 y 6). Vuelos: Ryanair
    (reserva), Google Flights, Skyscanner, y alojamiento en el destino para esas fechas
    (Booking, Trivago, Airbnb). Escapadas: la oferta, «cómo llegar» en Google Maps
    desde el origen, y alojamiento alternativo por la zona (Booking, Trivago, Escapada
    Rural). Todo con destino y fechas ya rellenados cuando se conocen.
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
- `podar(estado, ahora, {retencionDias})`: quita las ofertas caducadas, los vuelos
  cuya salida ya ha pasado y las que no se ven desde hace más de `retencionDias`.

Otros archivos de `data/`: `cache.json` (Cache), `historial.json`.
**Todo `data/` se guarda entre ejecuciones en la rama `datos` del repo.**

## Orden del escaneo (`src/escanear.js`)

1. Cargar `config/ajustes.json`, `config/vigilados.json` y `data/*`.
2. `obtenerFestivos` → `calcularPuentes` (próximos 120 días) y `findesProximos`.
3. Ejecutar las fuentes a las que les toca (han pasado ≥ 80 % de su intervalo desde
   `ultimoIntento`, o `--forzar`, o `--solo=<id>`). Las fuentes se ejecutan en paralelo
   entre sí: cada una ya espacia sus propias peticiones.
4. `fusionar` los resultados → `podar`.
5. Enriquecer todas las ofertas: `aplicarClasificacion` → `asignarFechas` →
   `geolocalizar` → `calcularCoche` → `enlacesPara` → `registrarPrecios` → `puntuar`.
6. Escribir `site/data/ofertas.json`, `site/data/historial.json` y `site/data/vigilados.json`.
7. `procesarEmails` (salvo con `--sin-emails`).
8. Guardar `data/estado.json`, `data/cache.json` y `data/historial.json`, e imprimir un
   resumen por fuente. El código de salida es 0 aunque fallen algunas fuentes y 1 si
   fallan todas.

## Datos del panel (`site/data/ofertas.json`)

```js
{
  generado: ISO,
  origen: { nombre, lat, lon },
  aeropuertos: ['BCN', 'GRO', 'REU'],
  temas: TEMAS,
  findes: Finde[],        // {id, viernes, sabado, domingo, etiqueta, puenteId}
  puentes: Puente[],
  fuentes: [{ id, nombre, web, modo, estado: 'ok'|'error'|'desactivada'|'bloqueada'|'pendiente', motivo, ultimoOk, error, total, falta: [] }],
  ofertas: Oferta[]       // ordenadas por puntuación descendente
}
```

`site/data/historial.json` = `seriesPara(...)` y `site/data/vigilados.json` = la
configuración de vigilados con, para cada criterio, los ids de las ofertas que
coinciden: `{vigilados: [{...criterio, coincidencias: [ids]}]}`.

## Vigilados (`src/vigilados.js`)

Criterios de `config/vigilados.json` (todos los campos son opcionales salvo `nombre`;
una oferta coincide si cumple **todos** los que estén presentes):
`{nombre, texto, tipo, tema, fuente, aeropuerto, precioMax, cocheMaxMin, cerca: {lat, lon, radioKm}, puente: true}`.
`texto` se busca sin tildes ni mayúsculas en título, lugar y destino.

- `cargarVigilados(ruta)` y `coincide(oferta, criterio)` → boolean.

## Emails (`src/emails/`)

- `plantillas.js`: `resumenSemanal(datos)`, `alertaChollazos(datos)`,
  `alertaVigilados(datos)` y `alertaFuentes(datos)` → `{asunto, html, texto}`. HTML con
  estilos en línea y tablas (compatible con Gmail), en español y apto para móvil.
- `enviar.js`: `crearTransporte(env)` → transporte de nodemailer o `null` si faltan
  `SMTP_USER`/`SMTP_PASS`/`EMAIL_TO` (Gmail por defecto; `SMTP_HOST`/`SMTP_PORT`
  opcionales). `enviarEmail(transporte, mensaje, env)`.
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
