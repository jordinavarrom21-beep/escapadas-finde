/**
 * Nombres oficiales de las localidades catalanas. Varias webs (Civitatis, Holidu,
 * Atrápalo…) las escriben con su exónimo castellano («Gerona», «Rosas», «Llansá»)
 * y otras con el oficial («Girona», «Roses»); sin unificarlos, el filtro de destino
 * del panel, la lista de destinos vetados y el detector de duplicados verían dos
 * sitios distintos. Solo se tocan los nombres de esta lista: el resto se deja igual.
 */

/** Sin tildes y en minúsculas (sin depender de util/xml.js, que arrastra el parser XML). */
const normalizar = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Exónimo (sin tildes y en minúsculas) → nombre oficial. Sacados de los datos reales. */
const OFICIALES = {
  gerona: 'Girona',
  lerida: 'Lleida',
  rosas: 'Roses',
  figueras: 'Figueres',
  'la escala': "L'Escala",
  estartit: "L'Estartit",
  llansa: 'Llançà',
  bagur: 'Begur',
  palamos: 'Palamós',
  cadaques: 'Cadaqués',
  'puerto de la selva': 'El Port de la Selva',
  'san feliu de guixols': 'Sant Feliu de Guíxols',
  'san feliu de pallarols': 'Sant Feliu de Pallerols',
  'playa de aro': "Platja d'Aro",
  'castillo de aro': "Castell d'Aro",
  'san pedro pescador': 'Sant Pere Pescador',
  'torroella de montgri': 'Torroella de Montgrí',
  banolas: 'Banyoles',
  vilaseca: 'Vila-seca',
  vandellos: 'Vandellòs',
  'villanueva y geltru': 'Vilanova i la Geltrú',
  'san sadurni de noya': "Sant Sadurní d'Anoia",
  tarrasa: 'Terrassa',
  'san carlos de la rapita': 'Sant Carles de la Ràpita',
  'la seo de urgel': "La Seu d'Urgell",
  'seo de urgel': "La Seu d'Urgell",
  puigcerda: 'Puigcerdà',
  'bellver de cerdana': 'Bellver de Cerdanya',
  baga: 'Bagà',
  'isona y conca della': 'Isona i Conca Dellà',
  viella: 'Vielha',
  salardu: 'Salardú',
  vich: 'Vic',
};

/** El nombre oficial si es un exónimo conocido; si no, el mismo nombre. */
export function nombreOficial(nombre) {
  if (typeof nombre !== 'string') return nombre;
  return OFICIALES[normalizar(nombre)] ?? nombre;
}
