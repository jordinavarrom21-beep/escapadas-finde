/**
 * Iconos de trazo (SVG en línea, 24×24) en lugar de emoji: se ven igual en todos los
 * sistemas, heredan el color del texto y no los lee el lector de pantalla (aria-hidden).
 * También las ilustraciones que sustituyen a la foto cuando la oferta no trae ninguna.
 */

/** Un círculo como trazo de <path> (así cada icono es un solo <path>). */
const C = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const NUBE = 'M7 15.5a4 4 0 1 1 1-7.9A5 5 0 0 1 17.6 9a3.3 3.3 0 0 1-.6 6.5z';
const AVION = 'M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z';
const CALENDARIO = 'M4 6.5h16V20H4zM4 10.5h16M8.5 4v4M15.5 4v4';
const CASA = 'M3.5 11L12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5h4v5';
const CAMA = `M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3${C(7, 10.5, 1.5)}`;
const CUBIERTOS = 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 3.5-3 7h3v11';
const CORAZON = 'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z';
const GOTA = 'M12 3.5c3.2 4.2 6 7.3 6 10.8a6 6 0 0 1-12 0c0-3.5 2.8-6.6 6-10.8z';
const DESTELLO = 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z';
const EDIFICIOS = 'M3 21h18M5 21V9l5-3v15M10 21V4h6v17M16 21v-9h3v9';
const PERSONAS = `${C(9, 8, 3)}M3.5 20c0-3.2 2.4-5.5 5.5-5.5s5.5 2.3 5.5 5.5M16 5.3a3 3 0 0 1 0 5.4M17.5 14.8c1.9.7 3 2.5 3 5.2`;

export const ICONOS = {
  // Navegación y cabecera
  finde: 'M4 8h16v12H4zM9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M4 13h16M10.5 13v2h3v-2',
  calendario: CALENDARIO,
  vuelos: AVION,
  avion: AVION,
  escapadas: CASA,
  actividades: 'M3 8.5V6h18v2.5a2.5 2.5 0 0 0 0 5V18H3v-2.5a2.5 2.5 0 0 0 0-5zM14 6v2M14 11v2M14 16v2',
  mapa: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  puentes: DESTELLO,
  vigilados: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20.5a2 2 0 0 0 4 0',
  fuentes: `M12 14v7M8.5 10.5a5 5 0 0 1 7 0M5.5 7.5a9 9 0 0 1 13 0${C(12, 13, 1.2)}`,
  comparar: 'M3.5 4.5h7v15h-7zM13.5 4.5h7v15h-7z',
  mas: `${C(5, 12, 1.3)}${C(12, 12, 1.3)}${C(19, 12, 1.3)}`,
  todo: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  buscar: `${C(11, 11, 7)}M20 20l-4-4`,
  luna: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  sol: `${C(12, 12, 4)}M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4`,
  pin: `M12 21s-6.5-5.8-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.2 12 21 12 21z${C(12, 9.8, 2.2)}`,
  ubicacion: `${C(12, 12, 7.5)}${C(12, 12, 2.5)}M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22`,
  // Datos de la oferta
  coche: `M4 16v-4l2-5h12l2 5v4zM4 12h16${C(7.5, 16, 1.5)}${C(16.5, 16, 1.5)}`,
  tren: 'M6 3.5h12a1 1 0 0 1 1 1V15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4.5a1 1 0 0 1 1-1zM5 10.5h14M9 17l-2.5 3.5M15 17l2.5 3.5M8.5 13.5h.01M15.5 13.5h.01',
  bus: 'M5 4h14v13H5zM5 11h14M8 20v-3M16 20v-3M8 14h.01M16 14h.01',
  ferry: 'M3 16l2 4h14l2-4zM6 16V9h12v7M12 9V4M9 6.5h6',
  crucero: 'M3 16l2 4h14l2-4zM6 16V9h12v7M12 9V4M9 6.5h6',
  reloj: `${C(12, 12, 8.5)}M12 7.5V12l3 2`,
  arena: 'M7 3h10M7 21h10M8 3v3.5a4 4 0 0 0 8 0V3M8 21v-3.5a4 4 0 0 1 8 0V21',
  despegue: 'M3 20h18M3.5 12.5l2.5 3 12.8-4.6a1.7 1.7 0 0 0-1.1-3.2l-4.3 1.5L7 5.5 5.2 6.2l4.1 4.2-3.1 1.1L4.4 10z',
  noches: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  cama: CAMA,
  cubiertos: CUBIERTOS,
  fuego: 'M12 21c-3.9 0-7-2.8-7-6.6 0-3.1 2.2-5 3.5-7 .5 1.8 1.6 2.9 2.7 3.3C11 7.3 12.4 4.6 14.5 3c.4 3 4.5 5.6 4.5 11.4 0 3.8-3.1 6.6-7 6.6z',
  estrella: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  corazon: CORAZON,
  bajada: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
  cartera: 'M4 7h15a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1zM4 7l12-3v3M16 13.5h.01',
  gasolina: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M5 10h10M15 8l3 3v6a1.5 1.5 0 0 0 3 0V9l-3-3',
  repetir: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  personas: PERSONAS,
  enlace: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  externo: 'M7 17L17 7M9 7h8v8',
  // Acciones
  cerrar: 'M6 6l12 12M18 6L6 18',
  flecha: 'M5 12h14M13 6l6 6-6 6',
  atras: 'M19 12H5M11 6l-6 6 6 6',
  abajo: 'M6 9l6 6 6-6',
  filtros: `M4 7h9M17 7h3M4 17h3M11 17h9${C(15, 7, 2)}${C(9, 17, 2)}`,
  lista: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  check: 'M5 12l5 5 9-10',
  alerta: 'M12 4L2.5 20h19zM12 10v4.5M12 17.5h.01',
  info: `${C(12, 12, 8.5)}M12 11v5M12 8h.01`,
  prohibido: `${C(12, 12, 8.5)}M6 6l12 12`,
  copiar: 'M9 9h11v11H9zM5 15H4V4h11v1',
  guardar: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-6h8v6',
  compartir: 'M12 4v11M7.5 8.5L12 4l4.5 4.5M5 13v6h14v-6',
  nuevo: DESTELLO,
  recargar: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  deshacer: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  regla: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  // Tiempo
  despejado: `${C(12, 12, 4)}M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4`,
  'sol-nubes': `${C(9, 9, 3.2)}M9 3.5v1.2M3.5 9h1.2M5.1 5.1l.9.9M12.9 5.1l-.9.9M9.5 19a3.5 3.5 0 1 1 .9-6.9 4.3 4.3 0 0 1 8.2 1.1 2.9 2.9 0 0 1-.6 5.8z`,
  nublado: 'M7 18a4.5 4.5 0 1 1 1.2-8.8A5.5 5.5 0 0 1 18.5 11 3.5 3.5 0 0 1 17.5 18z',
  niebla: 'M4 10h16M4 14h16M6 18h12M7 6h10',
  lluvia: `${NUBE}M8.5 19l-1 2M12.5 19l-1 2M16.5 19l-1 2`,
  nieve: `${NUBE}M8 19.5h.01M12 21h.01M16 19.5h.01`,
  tormenta: `${NUBE}M12.5 14l-2 3.5h3l-2 3.5`,
  // Temáticas (se piden como «tema-<id>»)
  'tema-spa': GOTA,
  'tema-romantico': CORAZON,
  'tema-rural': 'M3 20l6.5-11 4 6.5 2.5-4 5 8.5z',
  'tema-playa': `M2 16c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2${C(12, 8, 3.5)}`,
  'tema-gastronomia': CUBIERTOS,
  'tema-familia': PERSONAS,
  'tema-ciudad': EDIFICIOS,
  'tema-aventura': `${C(12, 12, 9)}M15.5 8.5l-2 5-5 2 2-5z`,
  'tema-parques': `${C(12, 10, 7)}M12 3v14M5 10h14M7 5l10 10M17 5L7 15M9 21l3-4 3 4`,
  'tema-eventos': DESTELLO,
  'tema-mascotas': `${C(6.5, 10.5, 1.7)}${C(10.5, 6.5, 1.7)}${C(15, 7, 1.7)}${C(18.5, 11, 1.6)}M8.5 18c0-2.5 1.8-5 4-5s4 2.5 4 5c0 1.5-1.5 2.2-4 2.2s-4-.7-4-2.2z`,
  'tema-singular': 'M6 4h12l3 5-9 11L3 9zM3 9h18M9 4l3 16M15 4l-3 16',
  // Alojamientos
  hotel: 'M4 21V4h16v17M3 21h18M9.5 21v-4h5v4M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01',
  'casa-rural': CASA,
  camping: 'M12 4L3 20h18zM12 20v-5M9.5 20l2.5-5 2.5 5',
  apartamento: 'M5 21V3h14v18M3 21h18M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01',
  parador: 'M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12zM10 21v-4a2 2 0 0 1 4 0v4',
  balneario: GOTA,
  hostal: CAMA,
};

/**
 * `<svg>` de un icono (vacío si no existe). Es decorativo: el texto de al lado dice lo que es;
 * si va solo, el botón que lo lleva tiene su aria-label.
 */
export function icono(nombre, clase = '') {
  const d = ICONOS[nombre];
  if (!d) return '';
  return `<svg class="ic${clase ? ` ${clase}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

/** Icono de la temática (o nada si no hay uno para ella). */
export const iconoTema = (id, clase = '') => icono(`tema-${id}`, clase);

/** Icono del código de tiempo de Open-Meteo (WMO). */
export function iconoTiempo(codigo) {
  if (!Number.isFinite(codigo)) return '';
  if (codigo === 0) return icono('despejado');
  if (codigo <= 2) return icono('sol-nubes');
  if (codigo === 3) return icono('nublado');
  if (codigo <= 48) return icono('niebla');
  if (codigo <= 67) return icono('lluvia');
  if (codigo <= 77) return icono('nieve');
  if (codigo <= 82) return icono('lluvia');
  if (codigo <= 86) return icono('nieve');
  return icono('tormenta');
}

const ESCENAS = {
  mar: `<circle class="escena__sol" cx="236" cy="58" r="26"/>
<path class="escena__cerca" d="M0 112H320V180H0z"/>
<path class="escena__lejos" d="M0 92C40 84 84 92 122 114 92 128 46 146 0 158z"/>
<path class="escena__trazo" d="M140 136q15-8 30 0t30 0M220 124q15-8 30 0t30 0M90 160q15-8 30 0t30 0M212 156q15-8 30 0t30 0"/>`,
  montana: `<circle class="escena__sol" cx="236" cy="52" r="22"/>
<path class="escena__lejos" d="M0 130L64 64l40 38 58-60 64 68 42-30 52 36v64H0z"/>
<path class="escena__nieve" d="M162 42l17 18-9-4-8 6-8-6-9 4z"/>
<path class="escena__cerca" d="M0 150c70-28 130-8 190-18s100-12 130 4v44H0z"/>`,
  ciudad: `<circle class="escena__sol" cx="72" cy="50" r="20"/>
<path class="escena__lejos" d="M18 180v-74h34v74zM58 180V80h28v100zM92 180v-62h30v62zM128 180V60h24v120zM158 180v-84h36v84zM200 180V74h26v106zM232 180v-68h34v68zM272 180V88h30v92z"/>
<path class="escena__cerca" d="M0 180v-34h40v34zM44 180v-48h30v48zM80 180v-28h44v28zM148 180v-44h30v44zM184 180v-24h52v24zM244 180v-40h28v40zM278 180v-26h42v26z"/>`,
  cielo: `<circle class="escena__sol" cx="250" cy="48" r="20"/>
<path class="escena__lejos" d="M40 128a22 22 0 0 1 36-18 28 28 0 0 1 52 8 18 18 0 0 1 4 36H52a14 14 0 0 1-12-26zM200 150a16 16 0 0 1 26-13 20 20 0 0 1 38 6 13 13 0 0 1 3 26h-58a10 10 0 0 1-9-19z"/>
<path class="escena__cerca" transform="translate(126 44) scale(3.1)" d="${AVION}"/>`,
};

/** Qué ilustración va con cada oferta: el mar, la montaña, la ciudad o el cielo (vuelos). */
export function tipoEscena(o) {
  if (o.tipo === 'vuelo') return 'cielo';
  const temas = o.temas ?? [];
  if (temas.includes('playa') || ['ferry', 'crucero'].includes(o.transporte) || o.tipo === 'crucero') return 'mar';
  if (temas.some((t) => ['rural', 'aventura', 'parques', 'mascotas'].includes(t)) || ['casa-rural', 'camping'].includes(o.alojamiento)) return 'montana';
  if (temas.includes('spa')) return 'mar';
  return 'ciudad';
}

/** Ilustración (SVG decorativo) que ocupa el sitio de la foto; toma el color de la temática. */
export function escena(tipo) {
  return `<svg class="escena escena--${tipo}" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect class="escena__cielo" width="320" height="180"/>${ESCENAS[tipo] ?? ESCENAS.ciudad}</svg>`;
}
