/** Todas las fuentes de ofertas. Para añadir una nueva, créala en esta carpeta y añádela aquí. */
import atrapalo from './atrapalo.js';
import buscounchollo from './buscounchollo.js';
import buzon from './buzon.js';
import campings from './campings.js';
import chollometro from './chollometro.js';
import civitatis from './civitatis.js';
import clubrural from './clubrural.js';
import escapadarural from './escapadarural.js';
import ferryhopper from './ferryhopper.js';
import flixbus from './flixbus.js';
import fly4free from './fly4free.js';
import guruwalk from './guruwalk.js';
import holidayguru from './holidayguru.js';
import holidu from './holidu.js';
import nomolesten from './nomolesten.js';
import ouigo from './ouigo.js';
import paradores from './paradores.js';
import renfe from './renfe.js';
import rusticae from './rusticae.js';
import ryanair from './ryanair.js';
import tuscasasrurales from './tuscasasrurales.js';
import viajerospiratas from './viajerospiratas.js';
import volotea from './volotea.js';
import weekendesk from './weekendesk.js';

export const FUENTES = [
  // Escapadas, hoteles y paquetes
  buscounchollo, viajerospiratas, holidayguru, atrapalo, weekendesk, nomolesten, rusticae, paradores,
  // Casas rurales, apartamentos y campings
  escapadarural, clubrural, tuscasasrurales, holidu, campings,
  // Actividades y experiencias
  civitatis, guruwalk,
  // Transporte
  volotea, ouigo, flixbus, ferryhopper, renfe, ryanair,
  // Comunidades y alertas
  chollometro, fly4free, buzon,
];
