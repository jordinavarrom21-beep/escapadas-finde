/**
 * Páginas legales y de confianza con URL propia (antes solo existían dentro del panel, en
 * «#/ayuda?seccion=…», que los buscadores no leen bien y no se pueden enlazar desde fuera):
 * aviso legal (LSSI, art. 10), privacidad (RGPD, art. 13), cookies, contacto, quiénes somos y
 * cómo se calcula todo, y créditos de las fotos. Se generan con cada escaneo, como las guías.
 *
 * Los datos del titular salen de config/ajustes.json → «legal». Aquí no se inventa nada: si
 * faltan, la página lo dice y no se indexa hasta que estén.
 */
import { readFileSync } from 'node:fs';
import { escaparHtml as esc } from '../site/js/formato.js';
import { FOTOS_TEMA, FOTO_PORTADA } from '../site/js/fotos-tema.js';
import { legalParaPanel } from './legal.js';

const NOMBRE_WEB = 'Escapadas Finde';
export const CARPETAS_LEGALES = ['aviso-legal', 'privacidad', 'cookies', 'contacto', 'sobre-nosotros', 'creditos-fotos'];
const PENDIENTE = '<strong class="pendiente">[dato pendiente de completar por el titular]</strong>';

/** Qué terceros están activos (config/ajustes.json): cambian la privacidad y las cookies. */
export function tercerosDeAjustes(ruta = new URL('../config/ajustes.json', import.meta.url)) {
  try {
    const a = JSON.parse(readFileSync(ruta, 'utf8'));
    return { analytics: Boolean(a.googleAnalytics), drive: Boolean(a.travelpayoutsDrive), ads: Boolean(a.googleAds?.id), fotosOfertas: a.fotos?.usarLasDeLasOfertas === true };
  } catch {
    return { analytics: false, drive: false, ads: false };
  }
}

/** La página: misma cabecera, estilos y pie que las guías; sin JavaScript. */
/**
 * El pie: con terceros activos, un enlace a la política que consentimiento.js cambia por «Cookies»
 * (abre el aviso); sin ellos, «Sin cookies ni seguimiento», que entonces es verdad. Antes decía
 * «Sin cookies» aunque la página de al lado enumerara Google Analytics.
 */
export const cookiesPie = (terceros, raiz) => (terceros?.analytics || terceros?.drive || terceros?.ads
  ? `<a href="${raiz}cookies/" data-sin-cookies>Cookies</a>`
  : '<span data-sin-cookies>Sin cookies ni seguimiento</span>');

function pagina({ ruta, titulo, descripcion, cuerpo, indexable = true }, { base, terceros }) {
  const raiz = '../';
  const canonical = base ? `${base}${ruta}/` : null;
  const enlaces = [['sobre-nosotros', 'Quiénes somos'], ['contacto', 'Contacto'], ['aviso-legal', 'Aviso legal'], ['privacidad', 'Privacidad'], ['cookies', 'Cookies'], ['creditos-fotos', 'Créditos de las fotos']]
    .map(([r, t]) => (r === ruta ? `<span aria-current="page">${t}</span>` : `<a href="${raiz}${r}/">${t}</a>`)).join(' · ');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'none'; object-src 'none'; base-uri 'self'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} · ${NOMBRE_WEB}</title>
<meta name="description" content="${esc(descripcion)}">
<meta name="robots" content="${indexable ? 'max-image-preview:large' : 'noindex, follow'}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<meta name="theme-color" content="#f4efe6">
<link rel="icon" href="${raiz}icono.svg" type="image/svg+xml">
<link rel="stylesheet" href="${raiz}css/estilos.css">
<link rel="preload" href="${raiz}fonts/figtree.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${raiz}fonts/bricolage-grotesque.woff2" as="font" type="font/woff2" crossorigin>
</head>
<body>
<header class="cabecera"><div class="contenedor cabecera__fila"><a class="marca" href="${raiz}"><img src="${raiz}icono.svg" alt="" width="28" height="28"><span>${NOMBRE_WEB}</span></a></div></header>
<main class="contenedor guia pagina-legal">
<nav class="migas" aria-label="Estás en"><ol><li><a href="${raiz}">Inicio</a></li><li aria-current="page">${esc(titulo)}</li></ol></nav>
<h1>${esc(titulo)}</h1>
${cuerpo}
</main>
<footer class="pie contenedor">
<p>${enlaces} · ${cookiesPie(terceros, raiz)}</p>
<p><a href="${raiz}">${NOMBRE_WEB}</a>: escapadas de fin de semana desde Barcelona. No vendemos nada: el precio y las condiciones los confirma la web de cada oferta.</p>
</footer>
</body>
</html>
`;
}

const mail = (email) => `<a href="mailto:${esc(email)}">${esc(email)}</a>`;

function avisoLegal(legal, t) {
  const fila = (nombre, valor) => `<li><strong>${nombre}:</strong> ${valor ? esc(valor) : PENDIENTE}</li>`;
  return `<h2>Quién está detrás</h2>
<ul>
${fila('Titular', legal?.titular)}
${fila('NIF', legal?.nif)}
${fila('Domicilio', legal?.domicilio)}
<li><strong>Email de contacto:</strong> ${legal?.email ? mail(legal.email) : PENDIENTE}</li>
</ul>
<h2>Qué es esta web</h2>
<p>${NOMBRE_WEB} es un buscador de ofertas de viaje publicadas por otras webs: escapadas, hoteles, casas rurales, planes y vuelos para salir un fin de semana desde Barcelona. No vende viajes ni hace reservas. El precio, la disponibilidad y las condiciones los fija y los confirma siempre la web de cada oferta, a la que se llega con el botón «Ver oferta en…».</p>
<h2>Enlaces de afiliado</h2>
<p>${t.drive ? 'Si aceptas las cookies de afiliación, los enlaces a webs de la red de Travelpayouts (Booking.com, Trip.com, Omio…) pasan a ser de afiliado: si reservas, esa web nos puede pagar una comisión.' : 'Algunos enlaces pueden ser de afiliado: si reservas por ellos, esa web nos puede pagar una comisión.'} Tu precio no cambia y el orden de las ofertas tampoco: depende solo del precio, las fechas y la calidad. Los enlaces comerciales van marcados para los buscadores como patrocinados.</p>
<h2>Contenidos, marcas y fotos</h2>
<p>Las ofertas, sus nombres y sus marcas son de sus webs y dueños. Los textos de esta web, la selección y los cálculos son propios. Las fotos son de Wikimedia Commons, con licencia libre, y cada una lleva su autor y su licencia (ver <a href="../creditos-fotos/">créditos de las fotos</a>).${t?.fotosOfertas ? ' Cuando la oferta trae foto, se enseña la que publica su web, cargada desde esa web y con su nombre: sus derechos son de esa web, y la retiramos si lo pide.' : ' No usamos fotos de las webs de las ofertas.'}</p>
<h2>Responsabilidad</h2>
<p>Las ofertas se revisan con frecuencia, pero pueden cambiar o terminar antes. Comprueba siempre la oferta en su web antes de reservar. Los tiempos en coche y el coste del viaje son estimaciones (ver <a href="../sobre-nosotros/">cómo se calcula</a>).</p>`;
}

function privacidad(legal, t) {
  const responsable = legal?.titular ? `${esc(legal.titular)}${legal.nif ? ` (NIF ${esc(legal.nif)})` : ''}, ${legal.email ? mail(legal.email) : PENDIENTE}` : PENDIENTE;
  const terceros = [
    t.analytics && '<li><strong>Medición (Google Analytics), solo si la aceptas.</strong> Qué secciones se visitan, qué ofertas se abren, guardan o comparten, a qué web se va desde ellas y lo que se escribe en «Buscar», con datos generales del navegador, el dispositivo y la zona. Base legal: tu consentimiento. Los trata Google por cuenta nuestra y pueden llegar a EE. UU. (Marco de Privacidad de Datos UE-EE. UU.).</li>',
    t.drive && '<li><strong>Afiliación (Travelpayouts), solo si la aceptas.</strong> Su código convierte los enlaces a webs de su red en enlaces de afiliado, guarda una cookie de sesión y recibe la dirección y el texto de la página que ves. Base legal: tu consentimiento.</li>',
    t.ads && '<li><strong>Google Ads, solo si lo aceptas.</strong> Cuenta como conversión cada clic en una oferta. Base legal: tu consentimiento.</li>',
  ].filter(Boolean).join('\n');
  return `<h2>Responsable</h2>
<p>${responsable}.</p>
<h2>Qué datos se tratan y para qué</h2>
<ul>
<li><strong>No hay cuentas ni formularios.</strong> No pedimos tu nombre, tu email ni tu teléfono.</li>
<li><strong>Lo que guardas en la web</strong> (favoritos, búsquedas, ciudad de salida y preferencias) se queda <strong>solo en tu navegador</strong>. No nos llega.</li>
${terceros || '<li>No usamos cookies de medición, publicidad ni afiliación.</li>'}
<li><strong>Servicios técnicos:</strong> al buscar un pueblo, lo escrito se consulta en Photon (komoot); el mapa carga imágenes de OpenStreetMap; las fotos de los destinos se cargan de los servidores de Wikimedia (upload.wikimedia.org)${t?.fotosOfertas ? ' y las de las ofertas, de la web que las publica' : ''}; si cambias la ciudad de salida, las distancias se calculan con OSRM (solo se envían coordenadas); algunas librerías se cargan de cdnjs. El alojamiento de la web (Hostinger) puede registrar datos técnicos de la conexión, como la dirección IP, por seguridad.</li>
<li>«Usar mi ubicación» solo funciona si lo pulsas, y la distancia se calcula en tu dispositivo.</li>
</ul>
<h2>Cuánto tiempo</h2>
<p>Tu elección sobre las cookies vale seis meses; después se vuelve a preguntar.${t.analytics ? ' Los datos de Google Analytics se guardan el plazo configurado en su propiedad (por defecto, dos meses).' : ''} Lo guardado en tu navegador dura hasta que lo borras.</p>
<h2>Tus derechos</h2>
<p>Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad de tus datos, y retirar tu consentimiento cuando quieras (en «Cookies», en el pie de la web), escribiendo al email de contacto: ${legal?.email ? mail(legal.email) : PENDIENTE}. Si no te atendemos bien, puedes reclamar ante la <a href="https://www.aepd.es" rel="noopener">Agencia Española de Protección de Datos</a>.</p>
<p>Al pulsar «Ver oferta en…» vas a otra web, con su propia política de privacidad.</p>`;
}

function cookies(t) {
  const filas = [
    ['escapadas-cookies', 'Esta web (en tu navegador, no es una cookie)', 'Recordar si aceptas o rechazas', '6 meses'],
    ['Favoritos, búsquedas y preferencias', 'Esta web (en tu navegador)', 'Que la web recuerde lo que guardas', 'Hasta que lo borres'],
    t.analytics && ['_ga, _ga_…', 'Google Analytics', 'Medición, solo si la aceptas', '2 años'],
    t.drive && ['Cookie de sesión de Travelpayouts', 'Travelpayouts', 'Afiliación, solo si la aceptas', 'La sesión'],
    t.ads && ['Cookies de Google Ads', 'Google', 'Conversiones, solo si las aceptas', 'Según Google'],
  ].filter(Boolean);
  return `<p>${t.analytics || t.drive || t.ads ? 'Sin tu permiso no se carga ninguna cookie opcional: la web funciona igual si pulsas «Rechazar».' : 'Esta web no usa cookies opcionales.'} Puedes cambiar tu elección cuando quieras en «Cookies», en el pie de la web.</p>
<div class="tabla-desliza"><table class="tabla-legal">
<thead><tr><th scope="col">Qué</th><th scope="col">De quién</th><th scope="col">Para qué</th><th scope="col">Duración</th></tr></thead>
<tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
</table></div>`;
}

function contacto(legal) {
  return `<p>Para cualquier duda, una oferta que ya no está o un dato que no cuadra: ${legal?.email ? mail(legal.email) : PENDIENTE}.</p>
<p>No vendemos viajes: para una reserva hecha, escribe a la web donde reservaste.</p>`;
}

function sobreNosotros(datos, t) {
  const desde = datos.origen?.nombre ?? 'Barcelona';
  return `<p>${NOMBRE_WEB} reúne en un sitio las escapadas de fin de semana que publican las webs de viajes, para salir desde ${esc(desde)} sin abrir veinte pestañas. Revisamos esas webs varias veces al día y enseñamos lo que cuesta de verdad el viaje.</p>
<h2>De dónde salen las ofertas</h2>
<p>De webs de viajes y comunidades de chollos públicas. Solo se leen las páginas que esas webs permiten leer (su robots.txt) y nunca se salta un bloqueo. Cada oferta dice en qué web está y cuándo se vio allí por última vez. Si su web deja de mostrarla, sale como «Sin confirmar» y acaba retirándose.</p>
<h2>Cómo se calcula el viaje completo</h2>
<ul>
<li><strong>Alojamiento:</strong> el precio que publica la web, para 2 personas y 2 noches si la oferta no fija otra cosa. Si una casa solo se alquila entera, se cuenta la casa entera, no dos plazas.</li>
<li><strong>Gasolina:</strong> ida y vuelta por carretera, con un consumo de 6,5 litros cada 100 km y el precio medio del día en las gasolineras de ${esc(desde)} (datos del Ministerio). Sin peajes ni aparcamiento.</li>
<li><strong>Tiempo en coche:</strong> el de la ruta por carretera desde ${esc(desde)}.</li>
<li>Todo lo estimado lleva «≈» y la ficha de cada oferta separa lo publicado de lo estimado.</li>
</ul>
<h2>Cómo se ordenan</h2>
<p>Por el coste del viaje, por persona, por cercanía o por el «Valor» (0-100), que mide lo buena que es la oferta frente a otras parecidas: precio, fechas, comodidad y opiniones. Ninguna web paga por salir antes. Las ofertas patrocinadas, si las hubiera, se marcarían y no subirían en el orden.</p>
<h2>Las fotos</h2>
<p>${t?.fotosOfertas ? 'Si la oferta trae foto, es la que publica su web (con su nombre). Si no, la ' : 'Son del destino, no del alojamiento: '}${t?.fotosOfertas ? 'del destino, de Wikimedia Commons' : 'de Wikimedia Commons'}, con licencia libre, autor y licencia en cada una. Cuando no hay ninguna se enseña una foto de ejemplo de la temática. Ver <a href="../creditos-fotos/">créditos de las fotos</a>.</p>`;
}

function creditosFotos(datos, t) {
  const temas = [
    { lugar: `${FOTO_PORTADA.lugar} (cabecera de la portada, ${FOTO_PORTADA.cambios})`, autor: FOTO_PORTADA.autor, licencia: FOTO_PORTADA.licencia, licenciaUrl: FOTO_PORTADA.licenciaUrl, url: FOTO_PORTADA.pagina },
    ...Object.values(FOTOS_TEMA).map((f) => ({ lugar: `${f.lugar} (foto de ejemplo)`, autor: f.autor, licencia: f.licencia, licenciaUrl: f.licenciaUrl, url: f.pagina })),
  ];
  const vistas = new Map();
  for (const o of datos.ofertas ?? []) {
    const c = o.imagenCredito;
    if (c?.licencia && c.url && !vistas.has(c.url)) vistas.set(c.url, { lugar: c.lugar ?? o.lugar?.nombre ?? '', autor: c.autor, licencia: c.licencia, licenciaUrl: c.licenciaUrl, url: c.url });
  }
  const filas = [...temas, ...[...vistas.values()].sort((a, b) => a.lugar.localeCompare(b.lugar, 'es'))];
  const enlace = (url, texto) => (url ? `<a href="${esc(url)}" rel="noopener">${esc(texto)}</a>` : esc(texto));
  return `<p>Las fotos de esta web son de <a href="https://commons.wikimedia.org" rel="noopener">Wikimedia Commons</a> y tienen licencia libre. Son del destino o de ejemplo, nunca del alojamiento. Estas son las que se ven hoy, con su autor y su licencia.${t?.fotosOfertas ? ' Además, cuando una oferta trae foto, se enseña la de su web, que lleva el nombre de esa web y no está en esta lista.' : ''}</p>
<div class="tabla-desliza"><table class="tabla-legal">
<thead><tr><th scope="col">Lugar</th><th scope="col">Autor</th><th scope="col">Licencia</th><th scope="col">Archivo</th></tr></thead>
<tbody>${filas.map((f) => `<tr><td>${esc(f.lugar)}</td><td>${esc(f.autor ?? 'ver en Commons')}</td><td>${enlace(f.licenciaUrl, f.licencia)}</td><td>${enlace(f.url, 'Commons')}</td></tr>`).join('')}</tbody>
</table></div>`;
}

/** Las seis páginas, listas para escribir en site/. */
export function paginasLegales(datos, { base = null, terceros = { analytics: false, drive: false, ads: false } } = {}) {
  const legal = legalParaPanel(datos.legal ?? null) ?? datos.legal ?? null;
  const completo = Boolean(legal?.titular && legal?.email);
  const defs = [
    { ruta: 'aviso-legal', titulo: 'Aviso legal', descripcion: `Quién está detrás de ${NOMBRE_WEB}, qué hace la web y de qué responde.`, cuerpo: avisoLegal(legal, terceros), indexable: completo },
    { ruta: 'privacidad', titulo: 'Política de privacidad', descripcion: `Qué datos trata ${NOMBRE_WEB}, para qué, con quién y cómo ejercer tus derechos.`, cuerpo: privacidad(legal, terceros), indexable: completo },
    { ruta: 'cookies', titulo: 'Política de cookies', descripcion: `Qué cookies usa ${NOMBRE_WEB} y cómo cambiar tu elección.`, cuerpo: cookies(terceros) },
    { ruta: 'contacto', titulo: 'Contacto', descripcion: `Cómo contactar con ${NOMBRE_WEB}.`, cuerpo: contacto(legal), indexable: completo },
    { ruta: 'sobre-nosotros', titulo: 'Quiénes somos y cómo funciona', descripcion: `Qué es ${NOMBRE_WEB}, de dónde salen las ofertas y cómo se calcula el coste del viaje completo.`, cuerpo: sobreNosotros(datos, terceros) },
    { ruta: 'creditos-fotos', titulo: 'Créditos de las fotos', descripcion: 'Autor y licencia de cada foto de la web (Wikimedia Commons).', cuerpo: creditosFotos(datos, terceros) },
  ];
  return defs.map((d) => ({ ruta: `${d.ruta}/index.html`, indexable: d.indexable ?? true, url: `${d.ruta}/`, contenido: pagina(d, { base, terceros }) }));
}
