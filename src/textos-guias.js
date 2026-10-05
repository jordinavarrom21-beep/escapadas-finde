/**
 * Textos propios de cada guía (src/paginas.js): qué buscar, a dónde ir, consejos y preguntas
 * frecuentes. Es el contenido que no cambia con cada escaneo y que no sale de ninguna web de
 * ofertas: lo que hace que la página sea útil por sí misma (y no un simple listado).
 *
 * Clave: la ruta de la guía (la misma que en definiciones()). Una guía sin texto aquí se
 * publica igual, solo con el listado. Los tiempos en coche son aproximados desde Barcelona.
 *
 * { titulo, parrafos: string[], consejos: string[], preguntas: [{ p, r }] }
 */
export const TEXTOS_GUIAS = {
  escapadas: {
    titulo: 'Cómo elegir una escapada de fin de semana desde Barcelona',
    parrafos: [
      'Desde Barcelona hay escapadas para todos los gustos a menos de tres horas: la Costa Brava y la Costa Daurada para el mar, el Pirineo y el Montseny para la montaña, la Garrotxa y el Priorat para el turismo rural y el vino, y ciudades como Girona, Tarragona o Andorra para un plan más urbano.',
      'El precio que anuncia cada web casi nunca es lo que acabas pagando. Por eso aquí ordenamos las ofertas por el coste del viaje completo para dos personas: el precio de la oferta más la gasolina estimada de ida y vuelta. Así una casa rural barata a cuatro horas no parece mejor que un hotel algo más caro a una hora.',
      'Las ofertas se revisan cada 15 minutos en más de 20 webs de viajes. Las que caducan o se agotan desaparecen solas, y cada una indica cuándo la comprobamos por última vez.',
    ],
    consejos: [
      'Reserva con 2 o 3 semanas de antelación para los fines de semana normales y con más tiempo para los puentes: los precios suben cuando se llenan.',
      'Sal el viernes por la tarde o el sábado temprano: evitarás los atascos de salida de Barcelona de la tarde del sábado.',
      'Mira si el desayuno, el parking o el spa están incluidos: es donde más cambia el precio final entre dos ofertas parecidas.',
      'Las fechas flexibles suelen ser más baratas: si puedes ir en domingo-lunes o fuera de puente, ahorrarás bastante.',
    ],
    preguntas: [
      { p: '¿Cuánto cuesta una escapada de fin de semana desde Barcelona?', r: 'Para dos personas y una noche, lo habitual es entre 100 y 250 € con el viaje incluido. Las casas rurales y los hoteles fuera de la costa en temporada baja son lo más barato; los hoteles con spa y la costa en verano, lo más caro.' },
      { p: '¿Cuál es la mejor época para hacer una escapada?', r: 'Primavera y otoño: hay buen tiempo, menos gente y precios más bajos que en verano. En invierno, el Pirineo para la nieve y los hoteles con spa son los planes estrella.' },
      { p: '¿Los precios incluyen la gasolina?', r: 'El precio de cada oferta es el que publica su web. Además, calculamos aparte el coste del viaje completo sumando la gasolina estimada desde Barcelona (sin peajes).' },
    ],
  },

  'escapadas/romanticas': {
    titulo: 'Ideas para una escapada romántica cerca de Barcelona',
    parrafos: [
      'Para una escapada en pareja cerca de Barcelona, los clásicos son los pueblos de la Costa Brava, como Begur, Calella de Palafrugell, Tossa de Mar o Cadaqués, con calas, paseos al atardecer y buenos restaurantes. A unas dos horas, los pueblos medievales del Empordà, como Peratallada o Pals, y Besalú en la Garrotxa son perfectos para perderse sin prisa.',
      'Si preferís la montaña, el Priorat combina paisajes de viñedos, bodegas y pueblos como Siurana encima de un risco. Y para algo más especial, los alojamientos singulares (cabañas en los árboles, burbujas para ver las estrellas o masías restauradas) son de las opciones más buscadas para aniversarios y sorpresas.',
      'Muchas ofertas románticas incluyen extras como cena, cava en la habitación, salida tardía o acceso al spa. Compara siempre qué incluye cada una: a veces una oferta algo más cara sale mejor que reservar esos extras por separado.',
    ],
    consejos: [
      'Para sorprender a tu pareja, busca ofertas con cena incluida o con spa privado: suelen salir más baratas que pagarlos aparte.',
      'Los hoteles solo para adultos (adults only) garantizan un ambiente tranquilo.',
      'En la Costa Brava, fuera de julio y agosto encontrarás mejores precios y menos gente.',
      'Pide una habitación con vistas al reservar: muchas veces cuesta poco más o nada.',
    ],
    preguntas: [
      { p: '¿Dónde hacer una escapada romántica cerca de Barcelona?', r: 'La Costa Brava (Begur, Calella de Palafrugell, Cadaqués), los pueblos medievales del Empordà (Peratallada, Pals), Besalú y la Garrotxa, el Priorat y Sitges son algunas de las opciones más populares, todas a menos de dos horas y media en coche.' },
      { p: '¿Qué regalar en una escapada en pareja?', r: 'Las ofertas con cena romántica, circuito de spa o masaje para dos incluidos son un buen regalo. Los alojamientos singulares, como cabañas o burbujas, también son un plan diferente para una ocasión especial.' },
      { p: '¿Cuánto cuesta una escapada romántica?', r: 'Desde unos 100 € para dos en una casa rural o un hotel sencillo, hasta 300 € o más en hoteles con spa, cena incluida o alojamientos singulares.' },
    ],
  },

  'escapadas/spa': {
    titulo: 'Escapadas con spa y balnearios cerca de Barcelona',
    parrafos: [
      'Cataluña tiene una larga tradición termal. A menos de una hora de Barcelona están Caldes de Montbui y La Garriga, dos pueblos de aguas termales con balnearios históricos. En Girona, Caldes de Malavella es otro clásico, y en Tarragona hay grandes centros termales con piscinas y circuitos de aguas.',
      'Además de los balnearios, muchos hoteles de la costa y de montaña tienen spa propio con piscina climatizada, jacuzzi, sauna y baño turco. Las escapadas con spa son de las más demandadas en otoño e invierno, y un plan perfecto para desconectar un fin de semana.',
      'Fíjate en si la oferta incluye el acceso al spa o solo el alojamiento, cuánto tiempo dura el circuito y si hay que reservar turno: en algunos hoteles el spa tiene horarios limitados o se paga aparte.',
    ],
    consejos: [
      'Comprueba si el circuito de spa está incluido en el precio y cuántas veces puedes usarlo durante la estancia.',
      'Lleva chanclas y gorro de baño: en muchos spas son obligatorios y si no los llevas te los cobran.',
      'Los domingos por la noche y entre semana suele haber menos gente y mejores precios.',
      'Si buscas tranquilidad, elige hoteles solo para adultos o spas con turnos reservados.',
    ],
    preguntas: [
      { p: '¿Dónde hay balnearios cerca de Barcelona?', r: 'Los más cercanos están en Caldes de Montbui y La Garriga, a menos de una hora. También hay balnearios y centros termales en Caldes de Malavella (Girona), en Tarragona y en Andorra.' },
      { p: '¿Qué diferencia hay entre un balneario y un spa?', r: 'Un balneario usa aguas mineromedicinales de manantial con propiedades terapéuticas; un spa usa agua corriente, normalmente con piscina, jacuzzi, sauna y tratamientos de bienestar.' },
      { p: '¿Cuánto cuesta una escapada con spa?', r: 'Para dos personas y una noche con circuito de spa, lo habitual es entre 120 y 250 €, según el hotel, la temporada y si incluye cena o masaje.' },
    ],
  },

  'escapadas/rurales': {
    titulo: 'Escapadas rurales y de naturaleza desde Barcelona',
    parrafos: [
      'Para desconectar en plena naturaleza, desde Barcelona tienes muy cerca el Montseny, con bosques de hayas y masías, y la Garrotxa, con sus volcanes, Olot y la Fageda d’en Jordà. Más al norte están el Ripollès y la Cerdanya, puertas del Pirineo, y hacia el sur el Priorat y la Terra Alta, con viñedos y pueblos de piedra.',
      'Las escapadas rurales son de las más económicas, sobre todo si vais en grupo: una casa rural entera dividida entre varias personas suele salir más barata que un hotel. Además, muchas admiten mascotas y tienen jardín, chimenea o piscina.',
      'Ten en cuenta el tiempo en coche: en las zonas de montaña las carreteras son más lentas, así que el tiempo real puede ser mayor que el que marca la distancia.',
    ],
    consejos: [
      'En casas rurales enteras, suele haber un mínimo de dos noches en fin de semana y más en puentes.',
      'Pregunta si la leña de la chimenea, la ropa de cama y la limpieza final están incluidas.',
      'Lleva algo de compra: en muchos pueblos pequeños las tiendas cierran pronto o los domingos.',
      'Primavera y otoño son las mejores épocas para hacer rutas y ver los paisajes en su mejor momento.',
    ],
    preguntas: [
      { p: '¿Dónde hacer turismo rural cerca de Barcelona?', r: 'El Montseny, la Garrotxa, el Ripollès, el Berguedà, la Cerdanya y el Priorat son las zonas rurales más populares, todas entre una y dos horas y media en coche.' },
      { p: '¿Es más barata una casa rural que un hotel?', r: 'Para grupos y familias, normalmente sí: el precio de la casa entera se divide entre todos. Para una pareja, una habitación en una casa rural o un hotel rural puede salir parecido a un hotel.' },
    ],
  },

  'escapadas/casas-rurales': {
    titulo: 'Casas rurales cerca de Barcelona: qué tener en cuenta',
    parrafos: [
      'Una casa rural es una de las mejores opciones para escapadas en familia o con amigos: tenéis espacio, cocina y, muchas veces, jardín, barbacoa o piscina. Las zonas con más oferta cerca de Barcelona son el Montseny, Osona, la Garrotxa, el Berguedà, el Empordà y el Priorat.',
      'Hay dos formas de alquilarlas: la casa entera (alquiler íntegro) o por habitaciones (alquiler compartido, más parecido a un pequeño hotel). En esta guía comparamos ambas por el coste total del viaje, para que veas cuánto os costará de verdad.',
    ],
    consejos: [
      'Comprueba la capacidad real: algunas camas son supletorias o sofás cama.',
      'Mira la política de cancelación y la fianza antes de reservar.',
      'Si vais en invierno, confirma que la casa tiene calefacción además de chimenea.',
      'Para grupos grandes, reserva con más antelación: las casas de más de 10 plazas se llenan antes.',
    ],
    preguntas: [
      { p: '¿Cuánto cuesta alquilar una casa rural un fin de semana?', r: 'Depende mucho del tamaño y la temporada: una casa para 4-6 personas suele costar entre 200 y 500 € por dos noches; dividido entre todos, puede salir por menos de 50 € por persona y noche.' },
      { p: '¿Las casas rurales admiten perros?', r: 'Muchas sí, aunque a veces con un suplemento o un límite de tamaño. Puedes ver las que admiten mascotas en la guía de escapadas con perro.' },
    ],
  },

  'escapadas/con-ninos': {
    titulo: 'Escapadas con niños desde Barcelona',
    parrafos: [
      'Viajar con niños pide planes cerca, alojamiento cómodo y algo que hacer. Desde Barcelona, PortAventura en Salou es el destino más famoso para familias, pero hay muchas más opciones: granjas escuela y casas rurales con animales, la zona volcánica de la Garrotxa con rutas fáciles, el Delta de l’Ebre para ver aves o ir en bici, o la Costa Daurada con playas de aguas tranquilas.',
      'Los apartamentos y las casas rurales suelen ser más prácticos que un hotel, porque tenéis cocina y más espacio. Si preferís hotel, buscad los que tienen habitaciones familiares, piscina o club infantil.',
    ],
    consejos: [
      'Elige destinos a menos de dos horas: los viajes largos en coche se hacen pesados para los peques.',
      'Comprueba la edad a partir de la cual los niños pagan y si la cuna o la cama supletoria tienen coste.',
      'Busca alojamientos con jardín, piscina o zona de juegos: os darán un respiro a todos.',
      'En temporada baja, muchos parques y actividades tienen descuentos para familias.',
    ],
    preguntas: [
      { p: '¿Qué hacer con niños un fin de semana cerca de Barcelona?', r: 'Parques temáticos como PortAventura, rutas por los volcanes de la Garrotxa, el Delta de l’Ebre, playas de la Costa Daurada, granjas escuela o una casa rural con animales son algunos de los planes más populares.' },
      { p: '¿Los niños pagan en las escapadas?', r: 'Depende de cada alojamiento: muchos hoteles no cobran a los menores de 2 o 3 años y hacen descuento hasta los 12. Revisa siempre las condiciones de la oferta.' },
    ],
  },

  'escapadas/con-perro': {
    titulo: 'Escapadas con perro: alojamientos que admiten mascotas',
    parrafos: [
      'Cada vez más alojamientos admiten perros, sobre todo casas rurales, campings y hoteles de montaña. Las zonas de interior de Cataluña, como el Montseny, la Garrotxa o el Pirineo, son ideales para ir con tu perro: hay muchas rutas de senderismo y espacios abiertos.',
      'Antes de reservar, revisa bien las condiciones: algunos alojamientos solo aceptan perros pequeños, cobran un suplemento por noche o no permiten dejarlos solos en la habitación. En la costa, recuerda que en temporada alta muchas playas no permiten perros; busca las playas habilitadas para ellos.',
    ],
    consejos: [
      'Confirma el tamaño y el número de perros que admite el alojamiento y si hay suplemento.',
      'Lleva su cama, comedero y una correa: en muchos sitios es obligatorio llevarlos atados.',
      'Lleva la cartilla de vacunación al día por si te la piden.',
      'Busca alojamientos con jardín vallado: tu perro estará más cómodo y tú más tranquilo.',
    ],
    preguntas: [
      { p: '¿Cobran por llevar perro a un hotel?', r: 'Muchos alojamientos cobran un suplemento por mascota y noche, normalmente entre 10 y 25 €. Algunas casas rurales y campings no cobran nada.' },
      { p: '¿Dónde ir con perro cerca de Barcelona?', r: 'El Montseny, la Garrotxa, el Berguedà y el Pirineo tienen muchos alojamientos y rutas aptas para perros. En la costa hay playas para perros, pero conviene comprobar las normas de cada municipio.' },
    ],
  },

  'escapadas/a-menos-de-2-horas': {
    titulo: 'Escapadas a menos de 2 horas de Barcelona',
    parrafos: [
      'Con menos de dos horas de coche, desde Barcelona llegas a casi toda la Costa Brava sur (Tossa de Mar, Lloret, Sant Feliu de Guíxols), al Montseny, a la Garrotxa, a Girona, a la Costa Daurada (Salou, Cambrils) y a pueblos de interior como Cardona, Vic o Rupit. Es la distancia ideal para aprovechar el fin de semana sin pasar medio día en la carretera.',
      'El tiempo de cada oferta es el real por carretera desde Barcelona, no la distancia en línea recta. Ten en cuenta que los viernes por la tarde y los domingos por la tarde puede haber atascos en las salidas de la ciudad.',
    ],
    consejos: [
      'Sal temprano o a mediodía para evitar las horas punta de salida y entrada en Barcelona.',
      'Con dos horas o menos de viaje, incluso una sola noche compensa.',
      'Revisa los peajes de la ruta: aquí no están incluidos en el coste estimado.',
    ],
    preguntas: [
      { p: '¿Qué hay a menos de 2 horas de Barcelona?', r: 'La Costa Brava sur, el Montseny, la Garrotxa (Olot, Besalú), Girona, Vic, Cardona, Montserrat, la Costa Daurada y parte del Priorat, entre otros.' },
    ],
  },
};
