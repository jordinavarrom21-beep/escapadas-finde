/**
 * La foto de una oferta: la de su destino (Wikimedia Commons, src/enriquecer/fotos.js) o, si no
 * hay, una foto de ejemplo de su temática en lugar de la ilustración. Las de ejemplo son de
 * Wikimedia Commons con licencia libre, guardadas en site/img/temas/ (500 px); su autor y su
 * licencia salen en la ficha, en el texto al pasar por encima y en /creditos-fotos/. Ninguna es
 * del alojamiento. Las claves son las escenas de iconos.js (tipoEscena).
 */
import { urlSegura } from './formato.js?v=hosting-e96a69a7d213';
import { tipoEscena } from './iconos.js?v=hosting-e96a69a7d213';

export const FOTOS_TEMA = {
  mar: {
    archivo: 'img/temas/mar.jpg', lugar: 'Calella de Palafrugell', autor: 'Jorge Franganillo', licencia: 'CC BY 2.0',
    licenciaUrl: 'https://creativecommons.org/licenses/by/2.0', pagina: 'https://commons.wikimedia.org/wiki/File:Calella_de_Palafrugell_-_53619347398.jpg',
  },
  montana: {
    archivo: 'img/temas/montana.jpg', lugar: 'Serra Cabirolera, Cadí-Moixeró', autor: 'Vicens', licencia: 'CC BY 3.0',
    licenciaUrl: 'https://creativecommons.org/licenses/by/3.0', pagina: 'https://commons.wikimedia.org/wiki/File:Serra_Cabirolera_01.jpg',
  },
  ciudad: {
    archivo: 'img/temas/ciudad.jpg', lugar: 'Girona', autor: 'Patronat de Turisme Costa Brava Pirineu de Girona', licencia: 'CC BY-SA 3.0',
    licenciaUrl: 'https://creativecommons.org/licenses/by-sa/3.0', pagina: 'https://commons.wikimedia.org/wiki/File:Girona_des_de_l_aire_edited.jpg',
  },
  cielo: {
    archivo: 'img/temas/cielo.jpg', lugar: 'nubes', autor: 'Colin Kranz', licencia: 'CC BY-SA 4.0',
    licenciaUrl: 'https://creativecommons.org/licenses/by-sa/4.0', pagina: 'https://commons.wikimedia.org/wiki/File:Cumulus_-_visualization.jpg',
  },
};

/**
 * La foto de la cabecera de la portada: otra que la de ejemplo de «mar» (si no, se repetía en las
 * tarjetas). Recortada a 16:9 y comprimida: CC BY-SA pide decirlo y compartirla igual.
 */
export const FOTO_PORTADA = {
  archivo: 'img/portada.jpg', grande: 'img/portada-960.jpg', lugar: 'Tossa de Mar', autor: 'Sylvestre', licencia: 'CC BY-SA 4.0',
  licenciaUrl: 'https://creativecommons.org/licenses/by-sa/4.0', pagina: 'https://commons.wikimedia.org/wiki/File:Tossa_de_Mar_-_center.jpg', cambios: 'recortada',
};

/** El crédito de una foto de ejemplo, con la misma forma que el de las de destino. */
export const creditoTema = (t) => ({
  texto: `Foto de ejemplo (${t.lugar}): ${t.autor} · ${t.licencia}`, url: t.pagina, autor: t.autor, licencia: t.licencia, licenciaUrl: t.licenciaUrl,
});

/**
 * Qué foto enseñar y con qué crédito. `raiz` lleva a la raíz de la web desde la página
 * (las guías están en carpetas); `ejemplo` dice que no es del destino de la oferta.
 * @returns {{url: string, credito: object|null, ejemplo: boolean}}
 */
export function fotoOferta(o, raiz = '') {
  const propia = urlSegura(o.imagen);
  if (propia) return { url: propia, credito: o.imagenCredito ?? null, ejemplo: false };
  const tema = FOTOS_TEMA[tipoEscena(o)] ?? FOTOS_TEMA.ciudad;
  return { url: `${raiz}${tema.archivo}`, credito: creditoTema(tema), ejemplo: true };
}
