/**
 * Texto propio de cada guía (escapadas/spa/, escapadas/girona/…): lo que una persona que
 * busca ese tipo de escapada quiere saber antes de mirar ofertas. Va debajo de la lista en
 * cada página estática (src/paginas.js) y, las preguntas, también como FAQPage en JSON-LD.
 *
 * Las ofertas cambian cada 15 minutos; este texto no. Por eso no dice precios, fechas ni
 * nombres de hoteles: solo lo que sigue siendo cierto aunque cambien las ofertas. Una guía
 * sin entrada aquí se publica igual, solo con la lista.
 *
 * Algunas guías llevan además un título propio y consejos prácticos.
 *
 * `{desde}` se cambia por la ciudad de origen (config/ajustes.json → origen.nombre).
 */

/** @type {Record<string, {titulo?: string, parrafos: string[], consejos?: string[], preguntas?: [string, string][]}>} */
export const TEXTOS_GUIAS = {
  escapadas: {
    titulo: 'Cómo elegir una escapada de fin de semana desde {desde}',
    parrafos: [
      'Desde {desde} hay escapadas para todos los gustos a menos de tres horas: la Costa Brava y la Costa Daurada para el mar, el Pirineo y el Montseny para la montaña, la Garrotxa y el Priorat para el turismo rural y el vino, y ciudades como Girona, Tarragona o Andorra para un plan más urbano.',
      'Aquí están las escapadas que vigilamos, de la más barata a la más cara según lo que cuesta el viaje entero para dos personas: el precio de la oferta y, si se va en coche, la gasolina de ida y vuelta desde {desde}. Así una casa rural a 40 minutos y un hotel a cinco horas se comparan con el mismo criterio.',
      'Si ya sabes qué buscas, las guías de abajo filtran por temática (spa, playa, con niños, con perro…), por distancia en coche o por zona. Para combinar varios filtros a la vez, con mapa y comparación, ábrelo en el panel.',
    ],
    consejos: [
      'Reserva con 2 o 3 semanas de antelación para los fines de semana normales y con más tiempo para los puentes: los precios suben cuando se llenan.',
      'Sal el viernes por la tarde o el sábado temprano: evitarás los atascos de salida de {desde} de la tarde del sábado.',
      'Mira si el desayuno, el parking o el spa están incluidos: es donde más cambia el precio final entre dos ofertas parecidas.',
      'Las fechas flexibles suelen ser más baratas: si puedes ir en domingo-lunes o fuera de puente, ahorrarás bastante.',
    ],
    preguntas: [
      ['¿Qué incluye el «viaje completo»?', 'El precio que publica la web de la oferta para dos personas más la gasolina estimada de ida y vuelta desde {desde} si el plan es en coche. No incluye peajes, aparcamiento ni gastos en destino.'],
      ['¿Cada cuánto se actualizan las ofertas?', 'Las webs se revisan cada 15 minutos. En cada oferta pone cuándo se comprobó por última vez; aun así, el precio y la disponibilidad los confirma siempre la web que la publica.'],
      ['¿Se reserva aquí?', 'No. Escapadas Finde no vende nada: cada oferta enlaza a la web que la publica, que es donde se reserva y se paga.'],
      ['¿Cuál es la mejor época para hacer una escapada?', 'Primavera y otoño: hay buen tiempo, menos gente y precios más bajos que en verano. En invierno, el Pirineo para la nieve y los hoteles con spa son los planes estrella.'],
    ],
  },
  'escapadas/menos-de-100-euros': {
    parrafos: [
      'Con 100 € por persona da para mucho más de lo que parece si se sale de {desde} con flexibilidad: hoteles de costa fuera de temporada, casas rurales en el Prepirineo o escapadas con media pensión de las que se publican como chollo durante unos días.',
      'El límite se aplica al viaje completo, no solo al precio del anuncio: una oferta barata a seis horas de coche puede salir más cara que otra a una hora. Por eso aquí cuenta también la gasolina. Viajar de domingo a martes o fuera de puentes suele bajar mucho el precio.',
    ],
    preguntas: [
      ['¿Los 100 € son por persona o en total?', 'Por persona, calculado sobre un viaje para dos: la oferta más la gasolina estimada de ida y vuelta, dividido entre dos.'],
      ['¿Cómo encontrar escapadas aún más baratas?', 'Fechas flexibles, salir entre semana y mirar destinos a menos de dos horas, donde la gasolina pesa poco. La guía de «A menos de 1 hora» suele tener las opciones más económicas.'],
    ],
  },
  'escapadas/este-finde': {
    parrafos: [
      'Escapadas para el próximo fin de semana: ofertas con fecha ese finde y ofertas de fechas flexibles que siguen vigentes. Con tan poco margen, lo que más cuenta es la distancia: a menos de dos horas de {desde} se llega el viernes por la tarde y se aprovecha el sábado entero.',
      'Las ofertas de última hora se agotan rápido. Si una te encaja, confirma disponibilidad cuanto antes en la web que la publica.',
    ],
    preguntas: [
      ['¿Se puede reservar una escapada para este mismo finde?', 'Sí: muchas ofertas de fechas flexibles admiten reservas con pocos días de antelación, pero la disponibilidad la confirma cada web en el momento.'],
    ],
  },
  'escapadas/puente': {
    parrafos: [
      'En los puentes los precios suben y lo bueno se llena antes, así que conviene reservar con margen. Aquí están las ofertas con fecha en el próximo puente y las de fechas flexibles que lo cubren, ordenadas por el coste del viaje completo desde {desde}.',
      'Con tres o cuatro días ya compensan destinos a más distancia (Pirineo, Andorra, la costa de Valencia o el interior de Aragón). Si sales el primer día a primera hora o el último por la tarde, evitarás los peores atascos de salida y regreso.',
    ],
  },
  'escapadas/a-menos-de-1-hora': {
    parrafos: [
      'En menos de una hora desde {desde} hay mar, montaña y pueblos medievales: el Maresme y la Costa Brava sur, el Montseny, el Penedès y sus bodegas, el Moianès o la costa del Garraf. Son escapadas ideales para salir el sábado por la mañana sin madrugar.',
      'El tiempo es el real por carretera desde el centro de {desde}, sin contar el tráfico de salida. Al estar tan cerca, la gasolina apenas cuenta y el viaje completo depende casi solo del alojamiento.',
    ],
    preguntas: [
      ['¿Qué hacer a menos de una hora de {desde}?', 'Rutas por el Montseny, bodegas del Penedès, pueblos de costa en el Maresme y la Costa Brava sur, o balnearios como los de Caldes de Montbui. En la lista están las ofertas de ahora en esa distancia.'],
    ],
  },
  'escapadas/a-menos-de-2-horas': {
    titulo: 'Escapadas a menos de 2 horas de {desde}',
    parrafos: [
      'Con menos de dos horas de coche, desde {desde} llegas a casi toda la Costa Brava sur (Tossa de Mar, Lloret, Sant Feliu de Guíxols), al Montseny, a la Garrotxa, a Girona, a la Costa Daurada (Salou, Cambrils) y a pueblos de interior como Cardona, Vic o Rupit. Es la distancia ideal para aprovechar el fin de semana sin pasar medio día en la carretera.',
      'El tiempo de cada oferta es el real por carretera desde {desde}, no la distancia en línea recta. Ten en cuenta que los viernes por la tarde y los domingos por la tarde puede haber atascos en las salidas de la ciudad.',
      'Las ofertas se ordenan por el viaje completo para dos (oferta más gasolina), así que se ve enseguida si compensa ir más lejos.',
    ],
    consejos: [
      'Sal temprano o a mediodía para evitar las horas punta de salida y entrada en {desde}.',
      'Con dos horas o menos de viaje, incluso una sola noche compensa.',
      'Revisa los peajes de la ruta: aquí no están incluidos en el coste estimado.',
    ],
    preguntas: [
      ['¿Qué hay a menos de 2 horas de {desde}?', 'La Costa Brava sur, el Montseny, la Garrotxa (Olot, Besalú), Girona, Vic, Cardona, Montserrat, la Costa Daurada y parte del Priorat, entre otros.'],
    ],
  },
  'escapadas/sin-coche': {
    parrafos: [
      'Escapadas a las que se llega sin coche desde {desde}: en tren (Rodalies, regionales y alta velocidad), en autobús, en ferry a Baleares o en avión. Muchas ciudades y pueblos de costa están bien conectados y se recorren a pie.',
      'El precio que ves es el que publica cada web; cuando incluye el transporte, ya está todo. Si no, suma el billete: en estas ofertas no hay gasolina que calcular.',
    ],
    preguntas: [
      ['¿Dónde ir sin coche desde {desde}?', 'Girona, Tarragona, Sitges o la costa del Maresme se alcanzan en tren; Baleares en ferry o avión; y muchas capitales españolas y europeas en alta velocidad o vuelo directo.'],
    ],
  },
  'escapadas/spa': {
    titulo: 'Escapadas con spa y balnearios cerca de {desde}',
    parrafos: [
      'Cataluña tiene una larga tradición termal. A menos de una hora de {desde} están Caldes de Montbui y La Garriga, dos pueblos de aguas termales con balnearios históricos. En Girona, Caldes de Malavella es otro clásico, y en Tarragona hay grandes centros termales con piscinas y circuitos de aguas.',
      'Además de los balnearios, muchos hoteles de la costa y de montaña tienen spa propio con piscina climatizada, jacuzzi, sauna y baño turco. Las escapadas con spa son de las más demandadas en otoño e invierno, y un plan perfecto para desconectar un fin de semana.',
      'Fíjate en si la oferta incluye el acceso al spa o solo el alojamiento, cuánto tiempo dura el circuito y si hay que reservar turno: en algunos hoteles el spa tiene horarios limitados o se paga aparte, y los masajes casi siempre van aparte.',
    ],
    consejos: [
      'Comprueba si el circuito de spa está incluido en el precio y cuántas veces puedes usarlo durante la estancia.',
      'Lleva chanclas y gorro de baño: en muchos spas son obligatorios y si no los llevas te los cobran.',
      'Los domingos por la noche y entre semana suele haber menos gente y mejores precios.',
      'Si buscas tranquilidad, elige hoteles solo para adultos o spas con turnos reservados.',
    ],
    preguntas: [
      ['¿Dónde hay balnearios cerca de {desde}?', 'Los más cercanos están en Caldes de Montbui y La Garriga, a menos de una hora. También hay balnearios y centros termales en Caldes de Malavella (Girona), en Tarragona y en Andorra.'],
      ['¿Qué diferencia hay entre balneario y spa?', 'Un balneario usa aguas mineromedicinales de manantial; un spa usa agua corriente con circuitos de piscinas, chorros, sauna y baño turco. Las dos opciones están en esta guía.'],
      ['¿El acceso al spa está incluido?', 'Depende de la oferta: algunas incluyen acceso ilimitado, otras un circuito con horario. Compruébalo en la web de cada oferta antes de reservar.'],
    ],
  },
  'escapadas/con-ninos': {
    titulo: 'Escapadas con niños desde {desde}',
    parrafos: [
      'Viajar con niños pide planes cerca, alojamiento cómodo y algo que hacer. Desde {desde}, PortAventura en Salou es el destino más famoso para familias, pero hay muchas más opciones: granjas escuela y casas rurales con animales, la zona volcánica de la Garrotxa con rutas fáciles, el Delta de l’Ebre para ver aves o ir en bici, o la Costa Daurada con playas de aguas tranquilas.',
      'Los apartamentos y las casas rurales suelen ser más prácticos que un hotel, porque tenéis cocina y más espacio. Si preferís hotel, buscad los que tienen habitaciones familiares, piscina o club infantil.',
      'El coste del viaje completo está calculado para dos personas; si vais más, revisa en cada web cómo cuentan a los niños (muchos alojamientos tienen precio reducido o gratis para los más pequeños).',
    ],
    consejos: [
      'Elige destinos a menos de dos horas: los viajes largos en coche se hacen pesados para los peques.',
      'Comprueba la edad a partir de la cual los niños pagan y si la cuna o la cama supletoria tienen coste.',
      'Busca alojamientos con jardín, piscina o zona de juegos: os darán un respiro a todos.',
      'En temporada baja, muchos parques y actividades tienen descuentos para familias.',
    ],
    preguntas: [
      ['¿Qué hacer con niños un fin de semana cerca de {desde}?', 'Parques temáticos como PortAventura, rutas por los volcanes de la Garrotxa, el Delta de l’Ebre, playas de la Costa Daurada, granjas escuela o una casa rural con animales son algunos de los planes más populares.'],
      ['¿Los niños pagan en las escapadas?', 'Depende de cada alojamiento: muchos hoteles no cobran a los menores de 2 o 3 años y hacen descuento hasta los 12. Revisa siempre las condiciones de la oferta.'],
    ],
  },
  'escapadas/rurales': {
    titulo: 'Escapadas rurales y de naturaleza desde {desde}',
    parrafos: [
      'Para desconectar en plena naturaleza, desde {desde} tienes muy cerca el Montseny, con bosques de hayas y masías, y la Garrotxa, con sus volcanes, Olot y la Fageda d’en Jordà. Más al norte están el Ripollès y la Cerdanya, puertas del Pirineo, y hacia el sur el Priorat y la Terra Alta, con viñedos y pueblos de piedra.',
      'Las escapadas rurales son de las más económicas, sobre todo si vais en grupo: una casa rural entera dividida entre varias personas suele salir más barata que un hotel. Además, muchas admiten mascotas y tienen jardín, chimenea o piscina.',
      'Ten en cuenta el tiempo en coche: en las zonas de montaña las carreteras son más lentas, así que el tiempo real puede ser mayor que el que marca la distancia. Si vais en grupo, mira también la guía de casas rurales, con casas enteras.',
    ],
    consejos: [
      'En casas rurales enteras, suele haber un mínimo de dos noches en fin de semana y más en puentes.',
      'Pregunta si la leña de la chimenea, la ropa de cama y la limpieza final están incluidas.',
      'Lleva algo de compra: en muchos pueblos pequeños las tiendas cierran pronto o los domingos.',
      'Primavera y otoño son las mejores épocas para hacer rutas y ver los paisajes en su mejor momento.',
    ],
    preguntas: [
      ['¿Dónde hacer turismo rural cerca de {desde}?', 'El Montseny, la Garrotxa, el Ripollès, el Berguedà, la Cerdanya y el Priorat son las zonas rurales más populares, todas entre una y dos horas y media en coche.'],
      ['¿Es más barata una casa rural que un hotel?', 'Para grupos y familias, normalmente sí: el precio de la casa entera se divide entre todos. Para una pareja, una habitación en una casa rural o un hotel rural puede salir parecido a un hotel.'],
    ],
  },
  'escapadas/casas-rurales': {
    titulo: 'Casas rurales cerca de {desde}: qué tener en cuenta',
    parrafos: [
      'Una casa rural es una de las mejores opciones para escapadas en familia o con amigos: tenéis espacio, cocina y, muchas veces, jardín, barbacoa o piscina. Las zonas con más oferta cerca de {desde} son el Montseny, Osona, la Garrotxa, el Berguedà, el Empordà y el Priorat.',
      'Hay dos formas de alquilarlas: la casa entera (alquiler íntegro) o por habitaciones (alquiler compartido, más parecido a un pequeño hotel). En esta guía comparamos ambas por el coste total del viaje, para que veas cuánto os costará de verdad; las que no permiten calcularlo van al final, por precio.',
    ],
    consejos: [
      'Comprueba la capacidad real: algunas camas son supletorias o sofás cama.',
      'Mira la política de cancelación, la fianza y si la limpieza final va aparte antes de reservar.',
      'Si vais en invierno, confirma que la casa tiene calefacción además de chimenea.',
      'Para grupos grandes, reserva con más antelación: las casas de más de 10 plazas se llenan antes.',
    ],
    preguntas: [
      ['¿Dónde hay casas rurales cerca de {desde}?', 'En el Montseny, el Moianès, Osona, la Garrotxa, el Berguedà y el Priorat, todas a menos de dos horas; y en el Pirineo un poco más lejos.'],
      ['¿Las casas rurales admiten perros?', 'Muchas sí, aunque a veces con un suplemento o un límite de tamaño. Puedes ver las que admiten mascotas en la guía de escapadas con perro.'],
    ],
  },
  'escapadas/romanticas': {
    titulo: 'Ideas para una escapada romántica cerca de {desde}',
    parrafos: [
      'Para una escapada en pareja cerca de {desde}, los clásicos son los pueblos de la Costa Brava, como Begur, Calella de Palafrugell, Tossa de Mar o Cadaqués, con calas, paseos al atardecer y buenos restaurantes. A unas dos horas, los pueblos medievales del Empordà, como Peratallada o Pals, y Besalú en la Garrotxa son perfectos para perderse sin prisa.',
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
      ['¿Dónde hacer una escapada romántica cerca de {desde}?', 'La Costa Brava (Begur, Calella de Palafrugell, Cadaqués), los pueblos medievales del Empordà (Peratallada, Pals), Besalú y la Garrotxa, el Priorat y Sitges son algunas de las opciones más populares, todas a menos de dos horas y media en coche.'],
      ['¿Qué regalar en una escapada en pareja?', 'Las ofertas con cena romántica, circuito de spa o masaje para dos incluidos son un buen regalo. Los alojamientos singulares, como cabañas o burbujas, también son un plan diferente para una ocasión especial.'],
    ],
  },
  'escapadas/playa': {
    parrafos: [
      'Hoteles y apartamentos junto al mar desde {desde}: Costa Brava, Maresme, Garraf, Costa Daurada, Terres de l\'Ebre y, un poco más lejos, la costa de Castellón y Valencia. Fuera de julio y agosto los precios bajan mucho y las playas están tranquilas.',
      'Si vas en coche, ten en cuenta el aparcamiento en primera línea, que en temporada alta puede costar más que la gasolina.',
    ],
  },
  'escapadas/gastronomicas': {
    parrafos: [
      'Enoturismo, catas y escapadas con la cena incluida cerca de {desde}. Cataluña tiene varias denominaciones de origen a menos de dos horas, como el Penedès, el Priorat, Montsant, Empordà o Costers del Segre, además de una cocina de mercado y de temporada muy ligada al territorio.',
      'Si la escapada incluye cata o visita a bodega, reserva el horario con antelación y planifica quién conduce a la vuelta.',
    ],
  },
  'escapadas/con-perro': {
    titulo: 'Escapadas con perro: alojamientos que admiten mascotas',
    parrafos: [
      'Cada vez más alojamientos admiten perros, sobre todo casas rurales, campings y hoteles de montaña. Las zonas de interior de Cataluña, como el Montseny, la Garrotxa o el Pirineo, son ideales para ir con tu perro: hay muchas rutas de senderismo y espacios abiertos.',
      'Que acepten mascotas no siempre significa lo mismo: algunos alojamientos solo aceptan perros pequeños, cobran un suplemento por noche o no permiten dejarlos solos en la habitación, y casi ninguno deja entrar en restaurante o spa. En la costa, recuerda que en temporada alta muchas playas no permiten perros; busca las playas habilitadas para ellos.',
    ],
    consejos: [
      'Confirma el tamaño y el número de perros que admite el alojamiento y si hay suplemento.',
      'Lleva su cama, comedero y una correa: en muchos sitios es obligatorio llevarlos atados.',
      'Lleva la cartilla de vacunación al día por si te la piden.',
      'Busca alojamientos con jardín vallado: tu perro estará más cómodo y tú más tranquilo.',
    ],
    preguntas: [
      ['¿Dónde ir con perro cerca de {desde}?', 'El Montseny, la Garrotxa, el Berguedà y el Pirineo tienen muchos alojamientos y rutas aptas para perros. En la costa hay playas para perros, pero conviene comprobar las normas de cada municipio.'],
    ],
  },
  'escapadas/aventura-y-nieve': {
    parrafos: [
      'Esquí, deportes de montaña y planes de aventura desde {desde}: estaciones del Pirineo catalán y de Andorra, barranquismo, rafting en el Noguera Pallaresa, vías ferratas y rutas de montaña.',
      'En invierno, fíjate en si la oferta incluye forfait y en el estado de las carreteras de montaña. En temporada de nieve los fines de semana se llenan pronto.',
    ],
  },
  'escapadas/ciudades': {
    parrafos: [
      'Escapadas urbanas desde {desde}: ciudades para visitar museos, pasear y comer bien, desde Girona o Tarragona hasta capitales españolas y europeas a un tren o un vuelo corto.',
      'En una escapada de ciudad suele compensar ir sin coche: busca también en la guía de escapadas sin coche y en los chollos de vuelos.',
    ],
  },
  'escapadas/alojamientos-singulares': {
    parrafos: [
      'Cabañas en los árboles, glamping, burbujas para ver las estrellas, masías restauradas y otros alojamientos con algo especial cerca de {desde}. Son la escapada perfecta cuando el plan es el propio alojamiento.',
      'Suelen tener pocas unidades y se agotan antes, sobre todo en fin de semana: si una te gusta, mira la disponibilidad pronto.',
    ],
  },
  'escapadas/parques-tematicos': {
    parrafos: [
      'Escapadas a parques temáticos con alojamiento incluido desde {desde}. Los paquetes de hotel con entradas suelen salir más baratos que comprarlo todo por separado, sobre todo si se aprovechan dos días de parque.',
      'Revisa qué días abre el parque en las fechas que elijas y si la entrada es para uno o dos días.',
    ],
  },
  'escapadas/campings': {
    parrafos: [
      'Campings, bungalós y glamping cerca de {desde}, en la costa y en la montaña. Un bungaló en un buen camping es de las escapadas más económicas para familias o grupos, con piscina y actividades incluidas.',
      'Fuera de temporada muchos campings cierran o reducen servicios; comprueba qué está abierto en tus fechas.',
    ],
  },
  vuelos: {
    parrafos: [
      'Chollos de vuelos que salen de {desde}, recogidos de blogs y comunidades de viajeros que publican tarifas especialmente baratas. Son precios de ida y vuelta o por trayecto, sin fechas fijas: la disponibilidad se confirma en la web de cada chollo.',
      'Los vuelos baratos duran poco. Si ves uno que te encaja, compruébalo enseguida y fíjate en el equipaje incluido, que es lo que más cambia el precio final.',
    ],
  },
  'actividades/gratis': {
    parrafos: [
      'Free tours y visitas sin coste de entrada cerca de {desde}. Los free tours funcionan con propina voluntaria al final: pagas lo que te parezca que vale la visita.',
      'Muchos necesitan reserva previa aunque sean gratis, porque tienen plazas limitadas.',
    ],
  },
  'escapadas/cataluna': {
    parrafos: [
      'Escapadas por Cataluña desde {desde}: costa, Pirineo, viñedos y pueblos medievales casi todo a menos de tres horas. Es la opción que mejor aprovecha un fin de semana porque se pierde poco tiempo en la carretera.',
      'Para afinar por provincia, mira las guías de Girona, Tarragona, Lleida y la provincia de Barcelona.',
    ],
  },
  'escapadas/girona': {
    parrafos: [
      'Escapadas en la provincia de Girona: la Costa Brava, el Empordà, la Garrotxa y sus volcanes, el Ripollès y la Cerdanya en el Pirineo, y la propia ciudad de Girona. Desde {desde} se llega a casi todo en menos de dos horas.',
    ],
  },
  'escapadas/barcelona': {
    parrafos: [
      'Escapadas sin salir de la provincia de Barcelona: el Montseny, el Maresme, el Penedès, el Garraf, el Berguedà y el Lluçanès, entre otros. Ideales para irse el sábado y volver el domingo sin pasar horas en el coche.',
    ],
  },
  'escapadas/tarragona': {
    parrafos: [
      'Escapadas en la provincia de Tarragona desde {desde}: la Costa Daurada, el Priorat y el Montsant, el Delta de l\'Ebre, la Tarragona romana y los pueblos del interior.',
    ],
  },
  'escapadas/lleida': {
    parrafos: [
      'Escapadas en la provincia de Lleida desde {desde}: el Pirineo (Vall d\'Aran, Pallars, Alt Urgell), deportes de aventura, estaciones de esquí y pueblos de montaña. Es la provincia más lejana de Cataluña, ideal para fines de semana largos.',
    ],
  },
  'escapadas/andorra': {
    parrafos: [
      'Escapadas a Andorra desde {desde}: nieve en invierno, montaña y senderismo en verano, y compras todo el año. Se llega en unas tres horas por carretera.',
      'Andorra no está en la Unión Europea: lleva el DNI o pasaporte y revisa los límites de lo que puedes traer de vuelta.',
    ],
  },
  'escapadas/comunidad-valenciana': {
    parrafos: [
      'Escapadas a la Comunidad Valenciana desde {desde}: la costa de Castellón está a unas tres horas por la AP-7, y Valencia ciudad y Alicante quedan bien para fines de semana largos o puentes, también en tren.',
      'Fuera del verano, la costa valenciana tiene buen tiempo y precios mucho más bajos.',
    ],
  },
  'escapadas/valencia': {
    parrafos: [
      'Escapadas en la provincia de Valencia desde {desde}: la ciudad, la Albufera, la costa y el interior. Valencia está bien conectada en tren, así que se puede ir sin coche.',
    ],
  },
  'escapadas/alicante': {
    parrafos: [
      'Escapadas en la provincia de Alicante desde {desde}: Costa Blanca, pueblos del interior y la ciudad. Por la distancia, compensa en puentes o fines de semana largos, o combinando con un vuelo.',
    ],
  },
  'escapadas/islas-baleares': {
    parrafos: [
      'Escapadas a Mallorca, Menorca, Ibiza y Formentera desde {desde}, en ferry o en avión. Fuera de julio y agosto hay muchas ofertas de hotel y el clima sigue siendo bueno.',
      'Si vas en ferry con coche, súmalo al presupuesto; en avión, comprueba el equipaje incluido.',
    ],
  },
  'escapadas/andalucia': {
    parrafos: [
      'Escapadas a Andalucía desde {desde}: Sevilla, Granada, Málaga, Córdoba, Cádiz o la costa de Almería. Por la distancia, lo habitual es ir en avión o en tren de alta velocidad y aprovechar un puente.',
    ],
  },
  'escapadas/castilla-y-leon': {
    parrafos: [
      'Escapadas a Castilla y León desde {desde}: ciudades monumentales como Salamanca, Segovia, Burgos o León, turismo rural y bodegas de la Ribera del Duero. Mejor para puentes o fines de semana largos.',
    ],
  },
  'escapadas/castilla-la-mancha': {
    parrafos: [
      'Escapadas a Castilla-La Mancha desde {desde}: Toledo, Cuenca y sus casas colgadas, pueblos con encanto y turismo rural. Encaja bien en un puente, en coche o en tren hasta Madrid y conexión.',
    ],
  },
  'escapadas/galicia': {
    parrafos: [
      'Escapadas a Galicia desde {desde}: costa, gastronomía y el Camino de Santiago. Por la distancia, lo práctico es volar a Santiago, A Coruña o Vigo y aprovechar un fin de semana largo.',
    ],
  },
  'escapadas/canarias': {
    parrafos: [
      'Escapadas a Canarias desde {desde}: clima suave todo el año, playas y naturaleza volcánica. Solo en avión, así que fíjate en si la oferta incluye el vuelo y el equipaje.',
    ],
  },
  'escapadas/francia': {
    parrafos: [
      'Escapadas a Francia desde {desde}: el sur de Francia (Perpiñán, Colliure, Carcasona) está a pocas horas en coche, y el Pirineo francés es otra opción para la nieve y la montaña.',
    ],
  },
};

const conOrigen = (texto, desde) => texto.replaceAll('{desde}', desde);

/** El texto de una guía con la ciudad de origen puesta, o null si no tiene. */
export function textoGuia(ruta, desde) {
  const t = TEXTOS_GUIAS[ruta];
  if (!t) return null;
  return {
    titulo: t.titulo ? conOrigen(t.titulo, desde) : null,
    parrafos: t.parrafos.map((p) => conOrigen(p, desde)),
    consejos: (t.consejos ?? []).map((c) => conOrigen(c, desde)),
    preguntas: (t.preguntas ?? []).map(([p, r]) => [conOrigen(p, desde), conOrigen(r, desde)]),
  };
}
