/**
 * Genera los iconos PNG de la app instalable a partir del dibujo de site/icono.svg,
 * sin dependencias: Android y Chrome piden PNG de 192 y 512 px (y uno «maskable»
 * sin esquinas redondeadas) y el iPhone ignora los SVG en apple-touch-icon.
 *
 *   node scripts/iconos.js
 *
 * Las formas de abajo son las mismas del SVG, en su sistema de 512 × 512. Si
 * cambias el SVG, cambia también esto y vuelve a ejecutarlo.
 */
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const SITE = new URL('../site/', import.meta.url);
/** Subfilas por píxel para el antialiasing vertical (el horizontal es exacto). */
const SUBFILAS = 8;
const PASOS_CURVA = 32;

const hex = (color) => [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16) / 255);
const mezclar = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// ── Geometría ────────────────────────────────────────────────────────────────

function cubica(p0, p1, p2, p3) {
  const puntos = [];
  for (let i = 1; i <= PASOS_CURVA; i++) {
    const t = i / PASOS_CURVA;
    const u = 1 - t;
    puntos.push([0, 1].map((k) => u ** 3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k]));
  }
  return puntos;
}

function arco(cx, cy, r, desde, hasta) {
  const puntos = [];
  for (let i = 0; i <= PASOS_CURVA; i++) {
    const a = desde + ((hasta - desde) * i) / PASOS_CURVA;
    puntos.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return puntos;
}

function rectanguloRedondeado(ancho, alto, r) {
  if (!r) return [[0, 0], [ancho, 0], [ancho, alto], [0, alto]];
  const q = Math.PI / 2;
  return [
    ...arco(ancho - r, r, r, -q, 0),
    ...arco(ancho - r, alto - r, r, 0, q),
    ...arco(r, alto - r, r, q, 2 * q),
    ...arco(r, r, r, 2 * q, 3 * q),
  ];
}

/** `M0 392c70-40 150-40 256 0s186 40 256 0v120H0z` */
function ola() {
  const tramo1 = cubica([0, 392], [70, 352], [150, 352], [256, 392]);
  // «s»: el primer control es el reflejo del último control anterior respecto al punto actual.
  const tramo2 = cubica([256, 392], [362, 432], [442, 432], [512, 392]);
  return [[0, 392], ...tramo1, ...tramo2, [512, 512], [0, 512]];
}

/** El avión de Material Icons, con `rotate(45 12 12)`, `scale(11)` y `translate(112 120)`. */
function avion() {
  const puntos = [
    [21, 16], [21, 14], [13, 9], [13, 3.5],
    ...cubica([13, 3.5], [13, 2.67], [12.33, 2], [11.5, 2]),
    ...cubica([11.5, 2], [10.67, 2], [10, 2.67], [10, 3.5]),
    [10, 9], [2, 14], [2, 16], [10, 13.5], [10, 19], [8, 20.5], [8, 22],
    [11.5, 21], [15, 22], [15, 20.5], [13, 19], [13, 13.5],
  ];
  const cos = Math.cos(Math.PI / 4);
  const sin = Math.sin(Math.PI / 4);
  return puntos.map(([x, y]) => {
    const rx = 12 + (x - 12) * cos - (y - 12) * sin;
    const ry = 12 + (x - 12) * sin + (y - 12) * cos;
    return [112 + 11 * rx, 120 + 11 * ry];
  });
}

/** Formas en orden de pintado; `color(y)` recibe la y en el sistema de 512. */
function formas({ sangrado }) {
  const arriba = hex('#14b8a6');
  const abajo = hex('#0f766e');
  return [
    { puntos: rectanguloRedondeado(512, 512, sangrado ? 0 : 112), color: (y) => mezclar(arriba, abajo, y / 512) },
    { puntos: arco(352, 164, 64, 0, 2 * Math.PI), color: () => hex('#fcd34d') },
    { puntos: ola(), color: () => hex('#0b5d57') },
    { puntos: avion(), color: () => hex('#ffffff') },
  ];
}

// ── Rasterizado ──────────────────────────────────────────────────────────────

/** Cobertura (0–1) de un polígono en cada píxel, con la regla par-impar. */
function cobertura(puntos, tam) {
  const escala = tam / 512;
  const p = puntos.map(([x, y]) => [x * escala, y * escala]);
  const cob = new Float32Array(tam * tam);
  for (let fila = 0; fila < tam; fila++) {
    for (let s = 0; s < SUBFILAS; s++) {
      const y = fila + (s + 0.5) / SUBFILAS;
      const cortes = [];
      for (let i = 0; i < p.length; i++) {
        const [x1, y1] = p[i];
        const [x2, y2] = p[(i + 1) % p.length];
        if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) cortes.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
      cortes.sort((a, b) => a - b);
      for (let i = 0; i + 1 < cortes.length; i += 2) {
        const desde = Math.max(0, cortes[i]);
        const hasta = Math.min(tam, cortes[i + 1]);
        for (let px = Math.floor(desde); px < hasta; px++) {
          const solape = Math.min(hasta, px + 1) - Math.max(desde, px);
          if (solape > 0) cob[fila * tam + px] += solape / SUBFILAS;
        }
      }
    }
  }
  return cob;
}

/** RGBA premultiplicado en coma flotante, pintando cada forma encima de la anterior. */
function pintar(tam, opciones) {
  const rgba = new Float32Array(tam * tam * 4);
  for (const forma of formas(opciones)) {
    const cob = cobertura(forma.puntos, tam);
    for (let fila = 0; fila < tam; fila++) {
      const color = forma.color(((fila + 0.5) * 512) / tam);
      for (let px = 0; px < tam; px++) {
        const a = Math.min(1, cob[fila * tam + px]);
        if (!a) continue;
        const i = (fila * tam + px) * 4;
        for (let k = 0; k < 3; k++) rgba[i + k] = color[k] * a + rgba[i + k] * (1 - a);
        rgba[i + 3] = a + rgba[i + 3] * (1 - a);
      }
    }
  }
  return rgba;
}

// ── PNG ──────────────────────────────────────────────────────────────────────

function bloque(tipo, datos) {
  const cabecera = Buffer.alloc(8);
  cabecera.writeUInt32BE(datos.length, 0);
  cabecera.write(tipo, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([cabecera.subarray(4), datos])), 0);
  return Buffer.concat([cabecera, datos, crc]);
}

function png(rgba, tam) {
  const filas = Buffer.alloc(tam * (tam * 4 + 1));
  for (let fila = 0; fila < tam; fila++) {
    const base = fila * (tam * 4 + 1); // el primer byte de cada fila es el filtro 0 (ninguno)
    for (let px = 0; px < tam; px++) {
      const i = (fila * tam + px) * 4;
      const a = rgba[i + 3];
      for (let k = 0; k < 3; k++) filas[base + 1 + px * 4 + k] = a ? Math.round((rgba[i + k] / a) * 255) : 0;
      filas[base + 1 + px * 4 + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0);
  ihdr.writeUInt32BE(tam, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, sin entrelazado
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', deflateSync(filas, { level: 9 })),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

const ICONOS = [
  { archivo: 'icono-192.png', tam: 192, sangrado: false },
  { archivo: 'icono-512.png', tam: 512, sangrado: false },
  // «maskable» y el del iPhone van a sangre: el sistema les pone su propia máscara.
  { archivo: 'icono-maskable-512.png', tam: 512, sangrado: true },
  { archivo: 'apple-touch-icon.png', tam: 180, sangrado: true },
];

for (const { archivo, tam, sangrado } of ICONOS) {
  const datos = png(pintar(tam, { sangrado }), tam);
  writeFileSync(new URL(archivo, SITE), datos);
  console.log(`${archivo}: ${tam}×${tam}, ${(datos.length / 1024).toFixed(1)} KB`);
}
