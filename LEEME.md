# 🧳 Escapadas Finde

Vigilante 24/7 de **vuelos y escapadas de fin de semana desde Barcelona**. Varias
veces al día revisa webs de ofertas (cada una a su ritmo, de 30 minutos a un día), las clasifica por temática, calcula
el tiempo en coche, detecta puentes y te las enseña en un panel web (también
desde el móvil). Además te avisa por email.

Funciona gratis en GitHub Actions, así que **no hace falta tener el PC encendido**.

## Cómo funciona

```
GitHub Actions (cron cada 30 min, pero GitHub lanza los que puede: ver «Revisión puntual»)
  └─ npm run escanear
       ├─ fuentes      Buscounchollo, Viajeros Piratas, Holidayguru, Nomolesten,
       │               Chollometro, Fly4free… (comprobando antes su robots.txt)
       ├─ enriquecer   temáticas · festivos y puentes · geolocalización · tiempo en coche
       │               · enlaces a Booking/Trivago/Google Flights… · puntuación de chollo
       ├─ historial    evolución de precios (mínimo diario)
       └─ emails       resumen del viernes · chollazos · bajadas en tus vigilados
  ├─ guarda data/ en la rama «datos» (así el historial de main no crece)
  └─ publica site/ en GitHub Pages → tu panel
```

## El panel

`https://<tu-usuario>.github.io/escapadas-finde/`

El menú tiene cuatro apartados (abajo en el móvil y la tableta, al alcance del pulgar):

- **Inicio** (este finde): lo mejor para este fin de semana y el siguiente, la cuenta atrás, el
  próximo puente, «Sorpréndeme» y los chollazos.
- **Explorar**, con pestañas **Escapadas · Planes · Vuelos · Mapa**. El buscador de la cabecera
  busca en todo y lleva a la pestaña que toque con la búsqueda puesta. Mientras no haya una
  fuente de vuelos con día y hora, «Vuelos» es **Chollos de vuelos** (blogs y comunidades, con
  fechas flexibles) y no enseña filtros de finde, aeropuerto ni horario que no se aplicarían.
- **Fechas**, con **Calendario** (los próximos 12 findes) y **Puentes** (qué día pedir y sus ofertas).
- **Mis cosas**: **búsquedas guardadas que avisan** («Guardar y avisarme» en cualquier búsqueda:
  aquí y en el número del menú ves cuántas ofertas nuevas la cumplen desde la última vez que la
  miraste, sin email ni GitHub), favoritos, «Comparar lado a lado», lo que has marcado como
  reservado o no disponible y los **avisos por email** (los antiguos «vigilados»).

- **Escapadas**: filtros por temática (spa, romántico, rural, playa, gastronomía,
  familia, ciudad, aventura, parques, eventos, mascotas, alojamientos singulares),
  «¿Cómo vas?» (en coche o sin coche), un solo campo de precio («Hasta … €» contando el precio
  de la oferta, por persona y noche o el viaje completo), noches, régimen y web. Incluye un
  **buscador por ubicación**: «cerca de Girona a menos de 1 h en coche». En pantallas grandes
  los filtros van en un panel a la izquierda y los resultados siempre a la vista.
- **Tarjetas o lista**: cada tarjeta enseña lo justo (cuándo, qué incluye, una etiqueta, el
  precio y el total de tu viaje) y el resto está en la ficha; con «Lista», una fila por oferta
  para comparar muchas de un vistazo. Se enseñan 12 y «Ver más». La nota (0–100) mide lo bueno
  que es el chollo y la ficha explica qué cuenta. En el móvil, las secciones de «Este finde» y
  de «Puentes» se deslizan de lado.
- **Comparar precios** (en la ficha de cada oferta): si el mismo alojamiento está en varias
  webs (p. ej. una casa rural en Escapada Rural y en Tus Casas Rurales), una tabla con el
  precio por persona y noche en cada una, cuál es la más barata y cuánto ahorras en tu viaje;
  la tarjeta lo resume en una línea. Si la web da el nombre propio del alojamiento, además
  enlaces para buscarlo en Booking (con tus fechas) y en Google Hoteles o, si es una casa
  rural, un camping o un apartamento, en Google para dar con su propia web.
- **Mapa**, **calendario** de los próximos findes, **historial de precios**, **vigilados**
  y **estado de las webs** (enlazado en el pie). Las novedades desde tu última visita salen
  en una pastilla junto a «Tu salida». Hay modo claro y oscuro.
- **Tu viaje** (botón «Desde … · 2 personas · 2 noches», debajo de la cabecera): la ciudad desde
  la que sales, cuántos viajáis y cuántas noches si la oferta no las fija. Se guarda solo en
  tu navegador y no pide tu ubicación salvo que pulses «Usar mi ubicación». Desde el origen
  de `config/ajustes.json` los tiempos en coche son reales; desde otra ciudad, estimados.
- **Coste total del viaje**: la oferta para tus viajeros y noches más la gasolina estimada
  (sin peajes ni aparcamiento). La ficha separa lo publicado de lo estimado y dice qué falta
  cuando no se puede dar un total. Las escapadas se ordenan por coste total, por persona o
  por comodidad.
- Cada oferta dice **cuándo se comprobó** en su web. Si hace más de un día (o de tres
  intervalos de su web) que no se ve, avisa de que puede haber cambiado o terminado.

**Como app en el móvil o el ordenador**: abre el panel y, en Android o en Chrome/Edge,
pulsa «Instalar aplicación»; en el iPhone, desde Safari, Compartir → «Añadir a pantalla
de inicio». Se abre a pantalla completa, con icono propio y accesos directos, y sin
conexión muestra los últimos datos descargados.

## Emails

| Email | Cuándo |
|---|---|
| Resumen del finde | Los viernes a partir de las 8:00 (hora de Madrid), una vez |
| Chollazos | Nada más aparecer un chollo excepcional (como mucho 3 alertas al día) |
| Bajada en vigilados | Cuando algo de tu lista baja del último precio avisado |
| Fuente caída | Si una web lleva más de 24 h fallando (una vez al día) |

Los emails salen desde el **Gmail dedicado** (el mismo que lee el buzón de newsletters).
Para activarlos, guarda estos tres **secretos** en el repo. Cada comando te pide el valor,
que nunca queda escrito en ningún archivo:

```bash
gh secret set GMAIL_USER           # el Gmail dedicado, p. ej. escapadasfinde.jordi@gmail.com
gh secret set GMAIL_APP_PASSWORD   # su contraseña de aplicación (myaccount.google.com/apppasswords)
gh secret set EMAIL_TO             # dónde quieres recibir los avisos (tu email de siempre)
```

¿Prefieres enviar desde otra cuenta? Guarda las tres de SMTP (`SMTP_HOST`, `SMTP_USER` y
`SMTP_PASS`; `SMTP_PORT` es opcional, 587 por defecto, y `SMTP_FROM` también, para los
proveedores cuyo usuario no es una dirección, como SendGrid o SES) y se usarán ellas para enviar. Van
siempre juntas: si falta una, los emails se desactivan y el registro del escaneo dice cuál
falta, en lugar de mezclar el usuario de una cuenta con la contraseña de otra.

## Buzón de newsletters

Con esos mismos secretos, cada ejecución lee los emails de los últimos 3 días del Gmail
dedicado y convierte las newsletters de viajes en ofertas. No marca nada como leído y
nunca publica los enlaces personales: los resuelve y se queda solo con la página final
del comercio. Suscribe ese Gmail a las newsletters que quieras: Booking, Groupon,
Voyage Privé, Travelzoo, Weekendesk, Atrápalo, Rusticae, Paradores, Vueling, easyJet,
Wizz Air, Volotea, Ryanair, Iberia Express, Renfe, Ouigo, iryo, Secret Flying,
Jack's Flight Club, y las alertas de precio de Google Flights, Skyscanner y KAYAK.

Como el panel es público, el buzón es desconfiado:

- Solo acepta correos de esos comercios que **Gmail haya verificado** (DMARC o DKIM del
  dominio del comercio). Poner «booking.com» en el nombre del remitente no basta.
- Solo **newsletters** (con cabecera de baja de lista). Confirmaciones de reserva,
  localizadores, códigos, facturas o avisos de cuenta se ignoran siempre.
- Quita de los textos emails, teléfonos, números largos y tu nombre. Para asegurarlo,
  guarda tu nombre y apellidos como secreto (opcional):
  `gh secret set BUZON_NOMBRES` → «Nombre Apellido1 Apellido2».
- Las imágenes solo se aceptan de la web del comercio o de su CDN.

En el registro de cada escaneo verás cuántos correos se han ignorado y por qué.

Para comprobar que llegan: en GitHub, **Actions → Vigilar ofertas → Run workflow** y
marca «Enviar un email de prueba».

## Configuración

Todo se cambia editando archivos del repo (se puede hacer desde la web de GitHub, también en el móvil).

**`config/ajustes.json`**
- `origen`: desde dónde calculas el tiempo en coche (por defecto, Barcelona).
- `vuelos.aeropuertos`, `vuelos.findes`, `vuelos.horarioIdeal` (salida del viernes a partir
  de las 15:00 y vuelta del domingo a partir de las 16:00).
- `puentes.festivosLocales`: los festivos de tu municipio. `"fecha": "09-24"` se repite todos los
  años (así viene La Mercè para Barcelona; quítala si no es festivo para ti) y `"2027-06-24"`
  vale solo para ese año.
- `viajeros`: cuántos viajáis (2 por defecto). Reparte los precios «por alojamiento» y los
  totales para calcular el precio por persona y noche.
- `fuentes.<id>`: `activa`, `intervaloMin` y, opcional, `retencionDias` (ver «Ofertas que ya no están»).
- `retencionDias` (10): lo máximo que se guarda una oferta que ya no se ve en su web.
- `emails.chollazos`: umbrales (vuelo de ida y vuelta ≤ 30 €, escapada ≤ 25 € por persona y noche…).
  Cambiarlos no rompe nada: los tests usan su propia copia de los ajustes.
- `preferencias`: `temasFavoritos` (suben 10 puntos), `evitarTemas` y `evitarDestinos` (nombre,
  provincia, comunidad o país: bajan a 0 puntos y nunca avisan como chollazo). Por ejemplo:
  `"evitarDestinos": ["Andorra"]`.

**`config/vigilados.json`**: tu lista de deseos. Ejemplos:

```json
{ "nombre": "Oporto en avión", "texto": "oporto", "tipo": "vuelo", "precioMax": 60 }
{ "nombre": "Spa a menos de 2 h", "tema": "spa", "cocheMaxMin": 120, "precioMax": 70 }
{ "nombre": "Casa rural cerca de Olot", "tema": "rural", "cerca": { "lat": 42.18, "lon": 2.49, "radioKm": 40 } }
```

Campos disponibles (la explicación de cada uno está en el «leeme» del propio archivo): `texto`
(palabras completas), `tipo`, `tema` o `temas`, `fuente`, `aeropuerto` (solo descarta vuelos que
publican otro origen), `alojamiento`, `regimenMinimo`, `valoracionMin`, `descuentoMin`,
`precioMax`, `precioNocheMax`, `noches` (número o `{min, max}`), `cocheMaxMin`, `cerca`, `pais`
(nombre o código), `region` (provincia o comunidad), `puente: true`, `finde` (fecha del finde o
del puente), `desde`/`hasta` (fechas), `presupuestoMax` con `presupuestoPor` («total» o «persona») y
`viajeros` (el viaje completo, con la gasolina desde el origen), `soloChollazos`, `soloMinimoHistorico`,
`ofertaId` y `activo: false` (pausa).

Por ejemplo, «dos personas, menos de 180 €, a unas 2 h de Girona, cualquier finde de octubre, con spa»:

```json
{ "nombre": "Spa en octubre", "tema": "spa", "cerca": { "lat": 41.98, "lon": 2.82, "radioKm": 123 },
  "desde": "2026-10-01", "hasta": "2026-10-31", "presupuestoMax": 180, "viajeros": 2 }
```

El panel lo genera con «Copiar como vigilado» y, en Vigilados, dice si los avisos por email
están activos de verdad (con los secretos del correo) o no.
Si uno está mal escrito, el registro del escaneo lo dice y el resto sigue funcionando.

## Ofertas que ya no están

No se visita cada oferta para ver si sigue (serían miles de peticiones y las webs bloquean):
se deduce de lo que cada web deja de publicar.

- **Se retiran** en el escaneo: las caducadas, las que salen en una fecha ya pasada, las que su
  web ya no trae cuando se lee su catálogo completo y, en las webs que se leen enteras en cada
  revisión (html y api), las que llevan **8 revisiones buenas seguidas** sin aparecer (y al
  menos 2 días): una web que se revisa cada 6 h las retira a los 2 días; una de cada 12 h, a los
  4. Se cuenta hasta la última lectura buena, así que si una web falla varios días sus ofertas
  no se pierden. Los blogs y foros (Viajeros Piratas, Chollometro, Fly4free) solo publican lo
  último: sus ofertas se guardan `fuentes.<id>.retencionDias` (5) días; el resto, como mucho
  `retencionDias` (10).
- **En el panel**, las que su web lleva más de 24 h (o 3 revisiones) sin publicar dicen «Sin
  comprobar…», van **al final** de las listas y no salen en el destacado, la sorpresa ni las
  recomendaciones. «Ocultar las que su web lleva días sin publicar» (en Más filtros) las quita.
- **«Ya no está disponible»** (en la ficha) la oculta de las listas en tu navegador, como la ✕;
  para volver a verlas, desmarca «Ocultar las descartadas y las no disponibles».

## Buscadores y enlaces para compartir

El panel vive en `#/…` (una sola página para los buscadores). Por eso cada escaneo escribe
también **páginas estáticas con URL legible**, sin JavaScript y con datos propios (coste del
viaje completo, tiempo de viaje, fechas, cuándo se comprobó), solo si tienen al menos 5 ofertas:

- `escapadas/`, `escapadas/menos-de-100-euros/`, `escapadas/este-finde/`, `escapadas/spa/`,
  `escapadas/con-ninos/`, `escapadas/rurales/`, `escapadas/romanticas/`, `escapadas/sin-coche/`
- `vuelos/` (chollos que salen de tu origen) y `actividades/gratis/`
- `sitemap.xml` con todas ellas

Cada una tiene su `canonical`, enlaza al panel con esos filtros puestos y no copia las
descripciones de los proveedores. Las combinaciones de filtros siguen en `#/…` y no se
indexan. Los enlaces antiguos (`#/finde`, `#/escapadas?…`) siguen funcionando igual.

Para que Google las encuentre: en [Search Console](https://search.google.com/search-console)
añade `https://<tu-usuario>.github.io/escapadas-finde/` y envía `sitemap.xml`. Un `robots.txt`
dentro de `escapadas-finde/` no serviría: los buscadores solo leen el de la raíz del dominio.

## Afiliación y patrocinios (`config/afiliacion.json`)

Ahora mismo **no hay ningún enlace de afiliado**: el panel lo dice en el pie. Para activarlo
con un proveedor (Civitatis, Booking, GetYourGuide…):

1. Date de alta en su programa y espera a que **aprueben** tu cuenta; lee sus condiciones
   (p. ej. https://www.civitatis.com/es/afiliados/): no todos permiten cualquier uso ni pagan
   lo mismo por todo.
2. En `config/afiliacion.json` pon `activo: true`, `aprobado: true` y tu identificador en
   `parametros` (se añade a sus enlaces conservando los demás parámetros).
3. En el siguiente escaneo sus enlaces llevan el identificador, `rel="sponsored"` y la marca
   «🔗 Enlace de afiliado», y el pie lo explica. Un proveedor a medias (sin aprobar o sin
   identificador) no marca nada y el registro del escaneo lo avisa.

- **Patrocinadas**: `{"ofertaId": "...", "anunciante": "...", "hasta": "AAAA-MM-DD"}` en
  `patrocinadas`. Se marcan «Patrocinado» y **no suben** en el orden: la puntuación no las ve.
- **Clics**: sin `medicion.url` no se mide nada. Si pones la dirección de un contador (p. ej.
  GoatCounter), añade su dominio a `connect-src` en `site/index.html`. Se envían proveedor,
  tipo de enlace, tipo de oferta y vista, nunca datos personales. **Un clic no es una venta**:
  las reservas y comisiones solo las confirma el panel de cada proveedor.

## Revisión puntual cada 30 minutos (opcional)

GitHub no garantiza los crons: en la práctica lanza unas 6 de las 48 revisiones diarias
(una cada ~4 h), y ponerlo más a menudo no cambia nada. Para una revisión puntual, que la
lance un servicio externo gratuito (unos 5 minutos de configurar):

1. En GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token:
   solo el repositorio `escapadas-finde`, permiso **Actions: Read and write**, y nada más.
2. En [cron-job.org](https://cron-job.org) (gratis), crea un trabajo cada 30 minutos:
   - URL: `https://api.github.com/repos/<tu-usuario>/escapadas-finde/actions/workflows/vigilar.yml/dispatches`
   - Método **POST**, cuerpo `{"ref":"main"}`
   - Cabeceras: `Authorization: Bearer <el token>`, `Accept: application/vnd.github+json`
3. Si una ejecución coincide con otra, GitHub la pone en cola (nunca van dos a la vez) y
   cada web sigue consultándose solo cuando le toca según su intervalo.

## Comandos (en tu PC)

```bash
npm install              # una vez
npm test                 # todos los tests (sin red)
npm run escanear         # escaneo real; --forzar ignora los intervalos, --solo=<fuente>, --sin-emails
npm run panel            # sirve el panel en http://localhost:8080 (tras escanear)
npm run email:prueba     # sin SMTP guarda los emails en data/emails-prueba/ para verlos
```

## Qué webs entran y cuáles no

El objetivo es **ofertas de viaje para un fin de semana desde Barcelona**. Con ese criterio:

**Entran como fuente** (publican ofertas con precio y se pueden leer de forma legítima):
escapadas y paquetes, hoteles y casas rurales, campings, vuelos y transporte barato,
actividades con precio, y todo lo que llegue por el buzón de newsletters.

**Campings**: Campings.net (ofertas de campings de toda España), **Sandaya** (una oferta por
camping con su mejor promoción: precio por noche, fin de semana o descuento) y **Huttopia**
(la promoción del momento en sus campings). De las dos cadenas solo entran los campings a
menos de 450 km en línea recta del origen. Eurocampings, Pitchup, Vacansoleil y camping.info
bloquean la lectura con protección anti-bot, y Yelloh! Village, Capfun, Homair, Siblu y
Eurocamp no publican sus ofertas en el HTML o su robots.txt no lo permite: entran si
suscribes su newsletter al Gmail del buzón (ya están en la lista de comercios conocidos).

**Más escapadas, esquí y chollos**: **Muchoviaje** (hoteles de sus secciones «Fin de semana»,
«Última hora», «Especial familias» y PortAventura, con estrellas y precio medio por noche),
**Grandvalira** (packs de hotel + forfait con fechas y actividades de esquí; en temporada) y
los feeds de las **categorías de viajes de Chollómetro** (viajes y ocio, hoteles, escapada,
billetes de avión y todo incluido), además de sus feeds generales. Sondeadas y descartadas:
Logitravel, Baleària y Baqueira bloquean la lectura (403 / anti-bot); Destinia, ALSA y Trasmed
cargan las ofertas con JavaScript; Toprural y Hoteles con Encanto no responden.

**Ofertas para ir con niños**: se detectan en todas las fuentes (título, descripción, precio
y etiquetas) y llevan una insignia en la tarjeta: «1 niño gratis», «Niños −60 %» o «Tarifa
para niños». En Explorar, «¿Vas con niños?» filtra los planes para ir con niños, los que
tienen niños gratis o con descuento, o solo los de niños gratis; la portada tiene su fila.

**Solo como enlace** (con destino y fechas ya puestos, porque no permiten leer sus
resultados): Booking, Agoda, Hotels.com, Trivago, Airbnb, Vrbo, Google Flights,
Skyscanner, KAYAK, Momondo, Kiwi, Expedia, eDreams, Rumbo, Omio, Direct Ferries,
Civitatis, GetYourGuide y GuruWalk.

**Descartados a propósito**, para que el panel no se llene de ruido:
- **Cruceros** (MSC, Costa, Royal Caribbean, NCL, Celebrity, Cruise.com): viajes de una
  semana o más, no escapadas de finde.
- **Alquiler de coches** (Rentalcars, Discover Cars, Sixt, Europcar, Hertz, Avis,
  Goldcar, OK Mobility, Record Go…): es un complemento, no una oferta de viaje.
- **Guías e inspiración** (Lonely Planet, Condé Nast, National Geographic, Spain.info,
  Tripadvisor, blogs de viajes): no publican precios.
- **Restaurantes** (TheFork, Michelin Guide): es otro producto.
- **Hoteles de lujo** (Mr & Mrs Smith, Tablet, Small Luxury Hotels, Leading Hotels,
  Relais & Châteaux): casi nunca están de oferta.
- **Cajas regalo** (Smartbox, Wonderbox): no tienen fechas ni precio de escapada.

Si alguna te interesa igualmente, suscribe el Gmail dedicado a su newsletter: entrará
por el buzón sin tocar código.

## Si una web cambia

Cada web tiene su lector y el resto sigue funcionando aunque una falle. En cada revisión se
compara lo leído con lo normal de esa web:

- **Falla o no trae nada** → «Con errores» en Fuentes; se conservan sus ofertas.
- **Trae muchas menos ofertas** (menos del 30 % de lo normal) → «Revisar»: no se borra nada de
  golpe; si de verdad ya no están, se retiran solas en unos días.
- **Deja de traer un detalle que casi siempre traía** (precio, foto, lugar, valoración,
  estrellas, fechas, noches, régimen…) → «Revisar», diciendo cuál.
- Si dura 12 h, la portada dice «N webs con problemas»; a las 24 h llega un email (con el
  correo configurado). Si un aviso dura 7 días, se da por lo normal.
- Mientras falla o avisa, la rama `datos` guarda en `data/muestras/<web>/` las páginas que leyó
  y el motivo: con ellas se ajusta su lector sobre la página real, y se borran solas cuando
  vuelve a ir bien.

## Fuentes y uso justo

Antes de consultar una web, se comprueba que su **robots.txt** lo permite. Si no lo
permite, la fuente queda «bloqueada» y no se toca. Además se espacian las peticiones y
nunca se intenta saltar un captcha ni una protección anti-bot.

Por eso **Ryanair está desactivada**: su robots.txt prohíbe `/api`. Los vuelos con fecha
llegarán por vías legítimas (Travelpayouts, SerpApi o las alertas por email). Trivago y
Booking solo aparecen como enlaces con destino y fechas ya puestos, porque no permiten leer
sus resultados.

### Añadir una fuente nueva

1. Crea `src/fuentes/<id>.js` siguiendo `docs/CONTRATOS.md`: `id`, `nombre`, `web`, `modo`
   (feed, api, html, navegador, afiliado o buzon), `requiere` (secretos necesarios),
   `urls` y `obtener(ctx)`.
2. Añádela a `src/fuentes/index.js` y a `config/ajustes.json`.
3. Tests en `test/<id>.test.js` con fixtures reales.

## Solución de problemas

- **Una fuente sale en rojo**: el panel (pestaña Fuentes) muestra el error. Si una web
  cambia su diseño, hay que ajustar su lector. Las demás siguen funcionando.
- **No llegan emails**: revisa los tres secretos y lanza el workflow con «email de prueba».
- **El cron se ha parado**: GitHub desactiva los crons de los repos sin actividad en 60
  días. Cada escaneo programado lo vuelve a marcar como activo, así que mientras funcione
  no debería pasar; si pasa, reactívalo en Actions → Vigilar ofertas → Enable workflow.
- **El panel tarda horas en actualizarse**: es el cron de GitHub; mira «Revisión puntual».
- **Empezar de cero**: borra la rama `datos` en GitHub. El siguiente escaneo la vuelve a crear.

## Licencia

Todos los derechos reservados (ver `LICENSE`). El repositorio es público solo para poder
publicar el panel con GitHub Pages: se puede consultar, pero no copiar, modificar ni
reutilizar sin permiso.
