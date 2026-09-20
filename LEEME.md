# 🧳 Escapadas Finde

Vigilante 24/7 de **vuelos y escapadas de fin de semana desde Barcelona**. Cada
30 minutos revisa varias webs de ofertas, las clasifica por temática, calcula
el tiempo en coche, detecta puentes y te las enseña en un panel web (también
desde el móvil). Además te avisa por email.

Funciona gratis en GitHub Actions, así que **no hace falta tener el PC encendido**.

## Cómo funciona

```
GitHub Actions (cada 30 min)
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

- **Este finde**: lo mejor para este fin de semana y el siguiente, más el próximo puente.
- **Vuelos**: por finde o puente, aeropuerto, horario ideal y precio.
- **Escapadas**: filtros por temática (spa, romántico, rural, playa, gastronomía,
  familia, ciudad, aventura, parques, eventos, mascotas, alojamientos singulares),
  precio, noches, régimen, transporte y fuente. Incluye un **buscador por ubicación**:
  «cerca de Girona a menos de 1 h en coche».
- **Mapa**, **calendario** de los próximos findes, **historial de precios**, **vigilados**
  y **estado de las fuentes**.

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

(Si prefieres enviar desde otra cuenta, `SMTP_USER` y `SMTP_PASS` tienen prioridad).

## Buzón de newsletters

Con esos mismos secretos, cada ejecución lee los emails de los últimos 3 días del Gmail
dedicado y convierte las newsletters de viajes en ofertas. No marca nada como leído y
nunca publica los enlaces personales: los resuelve y se queda solo con la página final
del comercio. Suscribe ese Gmail a las newsletters que quieras: Booking, Groupon,
Voyage Privé, Travelzoo, Weekendesk, Atrápalo, Rusticae, Paradores, Vueling, easyJet,
Wizz Air, Volotea, Ryanair, Iberia Express, Renfe, Ouigo, iryo, Secret Flying,
Jack's Flight Club, y las alertas de precio de Google Flights, Skyscanner y KAYAK.

Para comprobar que llegan: en GitHub, **Actions → Vigilar ofertas → Run workflow** y
marca «Enviar un email de prueba».

## Configuración

Todo se cambia editando archivos del repo (se puede hacer desde la web de GitHub, también en el móvil).

**`config/ajustes.json`**
- `origen`: desde dónde calculas el tiempo en coche (por defecto, Barcelona).
- `vuelos.aeropuertos`, `vuelos.findes`, `vuelos.horarioIdeal` (salida del viernes a partir
  de las 15:00 y vuelta del domingo a partir de las 16:00).
- `puentes.festivosLocales`: añade aquí los festivos de tu municipio. Por ejemplo, La Mercè
  ya viene puesta para Barcelona; quítala si no es festivo para ti.
- `fuentes.<id>`: `activa`, `intervaloMin`.
- `emails.chollazos`: umbrales (vuelo de ida y vuelta ≤ 30 €, escapada ≤ 25 € por persona y noche…).

**`config/vigilados.json`**: tu lista de deseos. Ejemplos:

```json
{ "nombre": "Oporto en avión", "texto": "oporto", "tipo": "vuelo", "precioMax": 60 }
{ "nombre": "Spa a menos de 2 h", "tema": "spa", "cocheMaxMin": 120, "precioMax": 70 }
{ "nombre": "Casa rural cerca de Olot", "tema": "rural", "cerca": { "lat": 42.18, "lon": 2.49, "radioKm": 40 } }
```

Campos disponibles: `texto`, `tipo` (vuelo, escapada, hotel, paquete), `tema`, `fuente`,
`aeropuerto`, `precioMax`, `cocheMaxMin`, `cerca` y `puente: true`.

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
- **El cron se ha parado**: GitHub desactiva los crons tras 60 días sin actividad. El
  workflow lo reactiva solo, pero puedes hacerlo a mano en Actions → Enable workflow.
- **Empezar de cero**: borra la rama `datos` en GitHub. El siguiente escaneo la vuelve a crear.
