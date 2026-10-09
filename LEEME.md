# 🧳 Escapadas Finde

Vigilante 24/7 de **vuelos y escapadas de fin de semana desde Barcelona**. Varias
veces al día revisa webs de ofertas (cada una a su ritmo, de 30 minutos a un día), las clasifica por temática, calcula
el tiempo en coche, detecta puentes y te las enseña en un panel web (también
desde el móvil). Además te avisa por email.

Funciona gratis en GitHub Actions, así que **no hace falta tener el PC encendido**.

## Cómo funciona

```
GitHub Actions: «Revisión continua» lanza un escaneo cada 15 min (ver «Revisión continua»)
  └─ npm run escanear
       ├─ fuentes      Buscounchollo, Viajeros Piratas, Holidayguru, Nomolesten,
       │               Chollometro, Fly4free, canales de Telegram… (comprobando antes su robots.txt)
       │               + Google Flights a través de Apify (opcional, de pago, una vez al día)
       ├─ enriquecer   temáticas · festivos y puentes · geolocalización · tiempo en coche
       │               · enlaces a Booking/Trivago/Google Flights… · puntuación de chollo
       │               · notas de Google Maps y precios de Google Hoteles (opcional, Apify)
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
  busca en todo y lleva a la pestaña que toque con la búsqueda puesta. Da igual que sobren o
  falten espacios («lloretdemar», «barce lona»), y si lo escrito no da nada exacto, enseña lo
  más parecido avisándolo («barclona», «girnoa»). Mientras no haya una
  fuente de vuelos con día y hora, «Vuelos» es **Chollos de vuelos** (blogs y comunidades, con
  fechas flexibles) y no enseña filtros de finde, aeropuerto ni horario que no se aplicarían.
  Los vuelos de Google Flights (con Apify) traen el día pero no la hora: el billete dice el día,
  la duración y las escalas, y la hora se ve al abrir la búsqueda en Google Flights.
  Las fechas se eligen en un solo sitio, la barra **«¿Cuándo?»** de cada pestaña (y de Buscar):
  **Fecha de entrada** y **Fecha de salida** abren un calendario en la misma página (un toque
  para la entrada y otro para la salida, también con el teclado) y hay atajos para este finde,
  el siguiente y cada puente (en Vuelos, con cuántos hay y desde cuánto). Las noches de esas
  fechas pasan a ser las de tu viaje (el coste se calcula con ellas). El Inicio usa el mismo
  calendario en «Otras fechas».
- **Fechas**, con **Calendario** (los próximos 12 findes) y **Puentes** (qué día pedir y sus ofertas).
- **Guardados**: **búsquedas guardadas** («Guardar búsqueda» en cualquier búsqueda:
  aquí y en el número del menú ves cuántas ofertas nuevas la cumplen desde la última vez que la
  miraste, sin email ni GitHub), favoritos, «Comparar lado a lado», lo que has marcado como
  reservado o no disponible y los **avisos por email** (los antiguos «vigilados»). Con
  **«Descargar mis guardados»** y «Cargar una copia» se pasan a otro navegador o dispositivo, sin cuenta.

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
  no se pierden. Los blogs, foros y canales de Telegram (Viajeros Piratas, Chollometro, Fly4free,
  Exprime Viajes, Escapada Barata) solo publican lo último: sus ofertas se guardan `fuentes.<id>.retencionDias` (5) días; el resto, como mucho
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

- **Generales**: `escapadas/`, `escapadas/menos-de-100-euros/`, `escapadas/este-finde/`,
  `escapadas/puente/` (el próximo puente), `escapadas/a-menos-de-1-hora/`,
  `escapadas/a-menos-de-2-horas/` y `escapadas/sin-coche/`
- **Por temática y alojamiento**: `escapadas/spa/`, `con-ninos/`, `rurales/`, `romanticas/`,
  `playa/`, `gastronomicas/`, `con-perro/`, `aventura-y-nieve/`, `ciudades/`,
  `alojamientos-singulares/`, `parques-tematicos/`, `casas-rurales/` y `campings/`
- **Por zona**: las provincias, comunidades y países con más escapadas (`escapadas/girona/`,
  `escapadas/cataluna/`, `escapadas/andorra/`…), como mucho 16
- `vuelos/` (chollos que salen de tu origen) y `actividades/gratis/`
- `sitemap.xml` con todas ellas

Cada una tiene su `canonical`, migas de pan, datos estructurados (schema.org: la web, la
página con su lista y las migas), imagen para compartir y enlaces a todas las demás guías.
Enlaza al panel con esos filtros puestos y no copia las descripciones de los proveedores. Las
combinaciones de filtros siguen en `#/…` y no se indexan. Los enlaces antiguos (`#/finde`,
`#/escapadas?…`) siguen funcionando igual.

La **portada** también se lee sin JavaScript: al publicar, `scripts/preparar-web.js` pone en
`index.html` qué es la web, lo mejor de ahora y los enlaces a todas las guías (el panel lo
sustituye al pintar), y en su `<head>` los datos estructurados de la web.

Para que Google las encuentre: en [Search Console](https://search.google.com/search-console)
añade tu dominio y envía `sitemap.xml`. El archivo de verificación de Search Console
(`site/googleb….html`) está en el repositorio: si solo estuviera en el hosting, el siguiente
despliegue lo borraría y se perdería la verificación. El `robots.txt` deja leer todo, también
`data/` (el panel la necesita para pintarse cuando lo pinta Google); que los datos en bruto no
salgan en los resultados lo dice su cabecera `X-Robots-Tag: noindex` del `.htaccess`.

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

## Publicar la web

Ya está publicada: cada escaneo despliega `site/` en **GitHub Pages**
(`https://<tu-usuario>.github.io/escapadas-finde/`), con HTTPS y sin coste. Lo que lleva
para cualquier visitante:

- **Primera visita**: una bienvenida de una línea (qué es y cómo se usa) que se cierra con
  «Entendido»; **Cómo funciona** (`#/ayuda`), enlazada desde el pie, con preguntas frecuentes
  y la **privacidad** (sin cuentas, cookies ni seguimiento salvo lo que aceptes de Google Analytics,
  Google Ads o Travelpayouts, si están activados; lo guardado vive en su navegador).
- **Aviso legal**: «Cómo funciona» → Aviso legal, enlazado desde el pie. Quién está detrás sale de
  `"legal": {"titular", "nif", "domicilio", "email"}` en `config/ajustes.json` (obligatorio en
  España para una web con enlaces de afiliado o anuncios, LSSI art. 10). Sin titular o email no se
  enseña la identidad de nadie; en modo propietario se avisa de que faltan.
- **Avisos por email**: son de quien administra la web; a los visitantes no se les enseñan.
- **Google Ads (opcional)**: con `"googleAds": {"id": "AW-…", "conversion": "AW-…/etiqueta"}` en
  `config/ajustes.json`, el despliegue añade un aviso de cookies con «Aceptar» y «Rechazar».
  Nada de Google se carga hasta aceptar (modo de consentimiento v2), cada clic en una oferta
  cuenta como conversión y la privacidad lo explica. Con `id` vacío, la web sigue sin cookies.
  La elección (aceptar, rechazar o elegir cuáles) vale seis meses, para quien acepta y para quien
  rechaza; después se vuelve a preguntar. Antes, cada visitante la cambia con «Cookies» en el pie.
- **Google Analytics 4 (opcional)**: con `"googleAnalytics": "G-…"` (el ID de medición del flujo
  de datos web: Analytics → Administrar → Flujos de datos) en `config/ajustes.json`, el despliegue
  abre la CSP a Analytics y lo mete en el mismo aviso de cookies, en la portada y en las guías.
  Nada se carga hasta aceptar la medición (con varias finalidades, «Configurar» deja elegir cada
  una). Cuenta una visita por sección del panel (`#/escapadas`…, sin filtros, con la `?utm_…` de
  la dirección para atribuir campañas) y estos eventos, con los parámetros `web` (de qué web es la
  oferta), `tipo` (escapada, hotel, vuelo…), `destino` y `precio`:
  `clic_oferta` (ir a la web de la oferta; también `enlace`: afiliado, patrocinado o normal),
  `ver_oferta` (abrir su ficha), `guardar_oferta` (favorito), `search` (`search_term`: lo escrito
  en «Buscar») y `share` (copiar el enlace de una búsqueda). Las visitas con `?propietario=1` no
  cuentan. En la propiedad: *Medición mejorada → Vistas de página → Configuración avanzada*:
  desactiva **«Cambios de página basados en eventos del historial del navegador»** (si no, cada
  sección cuenta dos veces); *Google Signals* desactivado; **eventos clave** `clic_oferta` y
  `guardar_oferta`; **dimensiones personalizadas** (de evento) `web`, `tipo`, `destino` y
  `enlace`, y la métrica `precio`. Vacío, nada de Google Analytics.
- **Travelpayouts Drive (opcional)**: con `"travelpayoutsDrive": "https://emrldco.com/….js?t=…"`
  (la dirección `src` del código de Travelpayouts → Drive → *Instalación manual*) en
  `config/ajustes.json`, el despliegue abre la CSP a Drive y lo mete en el mismo aviso de
  cookies, en la portada y en las guías para buscadores. Drive no se carga hasta «Aceptar»
  (deja una cookie de sesión y lee las de analítica); con permiso, convierte en enlaces de
  afiliado los de las marcas de su red. No pegues su `<script>` en el HTML: la CSP lo bloquea.
  Ajustes recomendados en su panel: *Switch links* sí; *Keywords* y *Recommendations* no
  (solo en inglés y meten bloques en el diseño); *Smart previews* solo en escritorio;
  *Targeted offers* no (abren pestañas por detrás). Vacío, nada de Travelpayouts.
- **Al compartir el enlace** (WhatsApp, redes): título, descripción e imagen `site/og.png`.
  El despliegue pone la dirección absoluta que exigen las redes.
- **Enlaces rotos**: `site/404.html`, con un botón a la portada.
- **Modo propietario**: lo que solo sirve a quien administra la web (copiar búsquedas para
  los avisos por email de `config/vigilados.json`, la pestaña «Avisos por email») no se enseña
  a los visitantes. Para verlo en tu navegador entra una vez con
  `https://<tu-usuario>.github.io/escapadas-finde/?propietario=1` (se recuerda; `=0` lo quita).
  En `localhost` sale siempre. No protege nada: solo ordena la interfaz.

## Tu dominio (Hostinger u otro)

Hay dos formas. La **A** es la recomendada: gratis, sin subir nada y con las ofertas al día
cada 15 minutos. La **B** es para quien tiene además un plan de *hosting* y quiere la web allí.

En las dos, pon tu dominio en GitHub → *Settings* → *Secrets and variables* → *Actions* →
pestaña **Variables** → *New repository variable*: `PANEL_URL` = `https://tudominio.es/`.
Así los emails, el sitemap, el `robots.txt` y la vista previa al compartir usan tu dominio.

### A · El dominio apunta a GitHub Pages (recomendado)

1. **GitHub** → *Settings* → *Pages* → *Custom domain*: escribe `tudominio.es` → *Save*.
2. **Hostinger** (hPanel) → *Dominios* → tu dominio → *DNS / Nameservers* → *Registros DNS*:
   - Borra los registros `A` y `AAAA` de `@` que ya haya (los de la página de aparcamiento).
   - Añade cuatro registros `A` con nombre `@`: `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153` y `185.199.111.153`.
   - Opcional (IPv6): cuatro `AAAA` con nombre `@`: `2606:50c0:8000::153`, `2606:50c0:8001::153`,
     `2606:50c0:8002::153` y `2606:50c0:8003::153`.
   - Cambia (o crea) el `CNAME` con nombre `www` para que apunte a `jordinavarrom21-beep.github.io`.
3. Espera a que se propague (de minutos a unas horas). Vuelve a *Settings* → *Pages*: cuando
   salga «DNS check successful», marca **Enforce HTTPS**.
4. Recomendado: *Settings* de tu cuenta de GitHub → *Pages* → *Add a domain* para **verificar**
   el dominio (evita que otra cuenta lo use en GitHub Pages).

Nada más: cada escaneo publica en tu dominio. No hace falta el zip.

### B · La web en el hosting de Hostinger

Cada escaneo deja la web lista para tu hosting en la rama **`web-hosting`** de GitHub (con su
`.htaccess`), y lleva sus propios datos, que se renuevan en cada escaneo: no depende de GitHub Pages.
Hostinger la despliega sola con cada cambio:

1. hPanel → *Sitios web* → *Administrar* → *Avanzado* → **Git**: conecta tu cuenta de GitHub
   (una vez).
2. En esa misma pantalla, *Despliegue automático*: repositorio `jordinavarrom21-beep/escapadas-finde`,
   rama **`web-hosting`**, carpeta vacía (la raíz de `public_html`). Guarda: la despliega en el
   momento y, desde entonces, con cada escaneo.
3. hPanel → *Seguridad* → *SSL*: el certificado gratuito tiene que estar activo (el `.htaccess`
   manda todo a `https://`).
4. Cuando tengas dominio: apúntalo a la web del hosting en hPanel y crea en GitHub las variables
   **`HOSTING_URL`** y `PANEL_URL`, las dos = `https://tudominio.es/` (canónica, sitemap, enlaces
   de los emails y un solo dominio, con o sin `www`).

**Sin Git (a mano)**: *Actions* → **Empaquetar para tu hosting** → *Run workflow* deja un zip en
la rama `web-zip`… o en tu PC `npm run datos:publicados && npm run empaquetar -- --dominio
tudominio.es` (→ `dist/escapadas-finde-web.zip`). Súbelo a `public_html` con el *Administrador de
archivos*, *Extraer*, y listo. Las ofertas se actualizan igual (las lee de GitHub Pages); las
páginas para buscadores son las del zip.

**Por FTP** (si prefieres que GitHub suba la web a tu hosting): secretos `FTP_SERVIDOR`,
`FTP_USUARIO` y `FTP_CONTRASENA` y variable `FTP_ACTIVO` = `true` (opcionales `FTP_CARPETA`,
por defecto `public_html`, y `FTP_VERIFICAR_TLS` = `yes`). Borra en el hosting lo que ya no esté,
salvo `.well-known`. No pegues nunca contraseñas en un chat: solo en GitHub.

El `.htaccess` (lo genera `scripts/preparar-web.js`) sirve la página 404, comprime, pone
cabeceras de seguridad, no guarda en caché los datos (cambian cada 15 min) y nunca sirve las
copias `.bak`. En cualquier otro host estático (Netlify, Cloudflare Pages…) sube la misma
carpeta `dist/escapadas-finde-web/`; allí el `.htaccess` no hace nada.

## Revisión continua (cada 15 minutos)

GitHub no garantiza los crons: en la práctica lanza unas 6 de las 48 revisiones diarias
(una cada ~4 h). Por eso el workflow **Revisión continua** (`relevo.yml`) se queda despierto
casi 6 horas lanzando «Vigilar ofertas» cada 15 minutos y, antes de terminar, se relanza a
sí mismo; un cron cada 2 h lo rearranca si la cadena se corta. En un repositorio público es
gratis.

- **Canales de Telegram** (`src/fuentes/telegram.js`): se lee la vista pública de cada canal
  (`t.me/s/<canal>`, sin cuenta; t.me no tiene robots.txt). Cada mensaje con precio y enlace
  es una oferta; sorteos, tarjetas, «#clip» y anuncios de otros canales se descartan. Hoy:
  **Exprime Viajes** (vuelos, hoteles y paquetes, cada 30 min) y **Escapada Barata** (hoteles
  en España con fechas cerradas, cada hora). Para añadir otro canal: una línea con
  `canalTelegram({...})` en ese archivo, su entrada en `FUENTES` y en `config/ajustes.json`.
- **Sin solapes ni duplicados**: nunca corren dos escaneos a la vez (van en cola), cada web
  se consulta solo cuando le toca por su `intervaloMin` (Chollómetro cada 15 min, Viajeros
  Piratas cada 20, BuscoUnChollo, Holidayguru y Fly4free cada 30…) y las ofertas repetidas
  se marcan y se ocultan.
- **Sin perder ofertas**: una oferta solo se retira si caduca, si su fecha ya pasó o si su web
  lleva al menos 2 días sin publicarla; una lectura fallida o incompleta no borra nada.
- **Arrancarla a mano**: Actions → Revisión continua → Run workflow. **Pararla**: Actions →
  Revisión continua → «…» → Disable workflow.

## Comandos (en tu PC)

```bash
npm install              # una vez
npm test                 # todos los tests (sin red)
npm run escanear         # escaneo real; --forzar ignora los intervalos, --solo=<fuente>, --sin-emails
npm run panel            # sirve el panel en http://localhost:8080 (tras escanear)
npm run email:prueba     # sin SMTP guarda los emails en data/emails-prueba/ para verlos
npm run lint             # ESLint: errores reales (variables sin usar, sin declarar…)
npm run datos:publicados # baja a site/data/ los datos de la web publicada (sin escanear)
npm run test:navegador   # prueba todas las acciones de la web en Chromium (necesita site/data/)
npm run test:maquetacion # desbordes, textos cortados y botones pequeños en 7 anchos (TEMAS=light,dark)
npm run empaquetar -- --dominio tudominio.es   # zip para tu hosting (ver «Tu dominio»)
```

Cada PR pasa por el workflow **Comprobar** (`comprobar.yml`): ESLint, los tests y las dos pruebas
del navegador con los datos publicados. Si algo falla, no se fusiona.

## Fotos, resúmenes y salud de las fuentes

- **Fotos de destino** (gratis): las ofertas sin foto (casi todos los vuelos) llevan la del
  artículo de Wikipedia del lugar, por la API pública de Wikimedia, con el crédito enlazado a su
  página en Commons (autor y licencia). Una consulta por lugar, guardada 30 días.
- **Resumen de una frase** (opcional, de pago): con el secreto `ANTHROPIC_API_KEY`, Claude
  escribe qué incluye de verdad cada oferta (solo con datos del texto de la web) y la ficha lo
  enseña como «En una frase». Modelo y límite en `config/ajustes.json` → `resumenes`
  (`maxPorEscaneo`: cuántos nuevos por escaneo). Cada resumen se guarda y solo se rehace si
  cambia el texto de la oferta. Sin el secreto, no hace nada.
- **Eventos cerca de cada oferta** (gratis): conciertos, fiestas, ferias, teatro, cine y
  actividades para niños a menos de 25 km del alojamiento en las fechas de la oferta. Salen en
  la tarjeta («Concierto a 3 km»), en la ficha («Qué hay esos días por la zona») y en el filtro
  «¿Algo que hacer cerca esos días?». Fuentes públicas por zona (`src/enriquecer/agendas.js`):
  Agenda Cultural de Catalunya, Kulturklik (Euskadi y Navarra), agenda de Castilla y León,
  agendas municipales de Madrid, Zaragoza y Málaga y la del Institut Valencià de Cultura
  (Comunitat Valenciana). Cada agenda se descarga solo si hay ofertas en su zona y se guarda
  6 horas.
- **¿Sigue activa?** En cada escaneo se mira, poco a poco (unas 20 páginas, con pausa y
  respetando robots.txt), la página de las ofertas de las webs que dicen en ella si el chollo ha
  terminado (hoy, Chollometro): las terminadas se retiran y las activas cuentan como vistas. Las
  webs que se leen enteras retiran lo que dejan de publicar a los 2 días; las de feed, a los
  5–10 días sin verlas (`src/enriquecer/vigencia.js`).
- **Conciertos y festivales de toda España** (opcional, gratis): crea una cuenta en
  [developer.ticketmaster.com](https://developer.ticketmaster.com), copia la «Consumer Key» y
  guárdala como secreto `TICKETMASTER_KEY` en GitHub (*Settings → Secrets and variables →
  Actions*). Sin el secreto, no hace nada.
- **Salud de las fuentes**: cada lunes el workflow `salud.yml` abre o actualiza el issue
  «Fuentes con problemas» con las webs que llevan más de un día fallando y qué hacer; lo cierra
  solo cuando todas vuelven a ir bien.

## Datos de Google con Apify (opcional, de pago)

Google no deja leer sus resultados (su robots.txt prohíbe, por ejemplo, la búsqueda de Google
Flights), así que esta web no los lee: los lee **[Apify](https://apify.com)**, un proveedor de
datos externo que cobra por resultado, y el escaneo recoge lo que devuelve por su API. Es la
única excepción a «solo se leen las páginas que las webs permiten leer», y «Cómo funciona» lo
dice en cuanto está activo. Hay tres piezas, cada una con su actor de la tienda de Apify:

| Qué | Actor | Dónde se ve | Cada cuánto |
|---|---|---|---|
| **Vuelos de Google Flights** (fuente `googleflights`): los destinos más baratos de cada finde y puente desde BCN, de todas las aerolíneas, con aerolínea, escalas y duración (sin hora: se ve al abrir la búsqueda). Los que solo vuela Wizz Air se saltan: ya llegan con hora de su fuente | `lergassy/google-flights-scraper` | Explorar → Vuelos | Una vez al día |
| **Nota de Google Maps** para los alojamientos cuya web no publica opiniones (sus estrellas de 1 a 5, pasadas a 0–10). Solo si el sitio de Google se llama igual y está en el mismo sitio; la nota de la propia web siempre manda | `compass/crawler-google-places` | Tarjeta y ficha («en Google») | Una vez cada 90 días por alojamiento |
| **Precios de Google Hoteles** de una noche (el viernes de su finde o del próximo) en ese mismo hotel en Booking, Hotels.com, su web oficial… Solo si la web oficial que da Google se llama como el hotel | `vittuhy/google-travel-hotel-prices` | Ficha → «Comparar precios» | Como mucho 2 hoteles al día, los de mejor nota |

**Para activarlo**: crea una cuenta gratis en Apify, copia tu token en *Settings → API &
Integrations* y guárdalo como secreto: `gh secret set APIFY_TOKEN`. Sin él no se usa nada y
Google Flights sale como «desactivada» con el motivo «Falta configurar: APIFY_TOKEN».

**Lo que cuesta** (plan gratuito: 5 $ de crédito al mes, sin tarjeta). Cada ejecución lleva un tope
(`maxTotalChargeUsd`) y el escaneo apunta lo que estima que gasta en la caché; al llegar a
`apify.presupuestoMensualUsd` (4,5 $) deja de lanzar actores hasta el mes siguiente y Google Flights
pasa a «desactivada» con el motivo (no cuenta como caída ni manda emails). Los límites están en
`config/ajustes.json` → `apify`:

- `googleFlights`: `aeropuertos` (["BCN"]), `findes` (6), `destinosPorConsulta` (25) y
  `maxUsdPorConsulta` (0,01 $). Unos 7 vuelos-consulta al día ≈ 1,2 $/mes. Se activa y se espacia
  como cualquier fuente, en `fuentes.googleflights`.
- `googleMaps`: `activo`, `maxPorEscaneo` (5) y `maxPorDia` (10) alojamientos ≈ 0,004 $ cada uno.
- `googleHoteles`: `activo`, `maxPorDia` (2) y `diasValidez` (7) ≈ 0,02 $ cada hotel.

En la consola de Apify (*Billing*) ves el gasto real; si notas que se acerca a los 5 $, baja los
límites o pon `"activo": false` en la pieza que menos te interese.

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
Civitatis, GetYourGuide y GuruWalk. Con el secreto `APIFY_TOKEN`, Google Flights entra además
como fuente a través de Apify (ver «Datos de Google con Apify»).

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
nunca se intenta saltar un captcha ni una protección anti-bot. La excepción, decidida a
propósito y explicada en «Cómo funciona», son los datos de Google que llegan a través de
Apify (ver «Datos de Google con Apify»): el escaneo solo habla con la API de Apify, pero quien
lee Google es Apify, con sus propios medios.

Por eso **Ryanair está desactivada**: su robots.txt prohíbe `/api`. Los vuelos con fecha
y hora llegan de **Wizz Air**, gratis y sin registro: su web usa una API pública (mapa de
rutas y calendario de precios por día) que su robots.txt no prohíbe. Para cada finde y
puente da la tarifa más baja de la ida y de la vuelta y todas las horas de salida de esos
días; la hora exacta de la tarifa más baja se ve al reservar. Hoy vuela desde Barcelona
(Girona y Reus no tienen rutas de Wizz). Trivago y
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
