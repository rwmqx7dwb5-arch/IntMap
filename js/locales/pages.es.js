/* ============================================================================
 *  IntMap · Reading pages — ESPAÑOL  (#R218)
 *  Un archivo por idioma; la forma del documento y lo que cuesta añadir otro idioma están
 *  en la cabecera de js/page-i18n.js. Las claves ausentes caen una a una al inglés.
 * ========================================================================== */
/* ⚠ the one-line bootstrap: on sources.html / science.html js/page-i18n.js has already run and
   this is a no-op; inside the app (where that file is never loaded) it creates a minimal registry so
   the Sources dialog can lazily read this file for the translated source descriptions. */
window.IntMapPageI18N=window.IntMapPageI18N||{_d:{},define:function(c,d){this._d[c]=d;},doc:function(c){return this._d[c];}};
window.IntMapPageI18N.define('es', {

  common: {
    backToMap: 'Volver al mapa',
    contents: 'Contenido',
    toScience: 'Ciencia y lógica',
    toSources: 'Fuentes de datos'
  },

  /* ══════════════════════════════════════════════════════════════════════════════════════════ */
  sources: {
    title: 'Fuentes de datos',
    meta: 'Cada organización cuyos datos muestra IntMap, dónde se usan, cómo se obtienen, su licencia y qué significa para tu privacidad.',
    sub: 'Cada número, línea e imagen que muestra IntMap y <b>de dónde procede</b>. Lo que se calcula con ellos está en la página <a href="./science.html">Ciencia y lógica</a>.',
    footer: [
      'Esta página enumera los <b>proveedores de datos</b>. Cómo se usan esos datos en los cálculos está en la página <a href="./science.html">Ciencia y lógica</a>.<br>Si encuentras un error aquí, avísanos con el formulario de comentarios de la aplicación.'
    ],
    sections: [
      {
        id: 'what', nav: 'Sobre esta página', h: 'Sobre esta página',
        blocks: [
          ['tagline', 'Todo lo que muestra IntMap fue medido y publicado por una organización externa. Esta página nombra esas organizaciones.'],
          ['p', 'IntMap no produce datos propios. Descarga lo que publican los servicios meteorológicos, la NASA, organismos de la ONU, universidades y la comunidad de OpenStreetMap, y lo dibuja en un solo mapa. Cuánto se puede confiar en una cifra de la pantalla depende de la organización que la publicó, y aquí puedes comprobar cuál es.'],
          ['p', 'La lista de abajo muestra los proveedores que la aplicación usa realmente, y crece a medida que crece el mapa. Para encontrar algo concreto, filtra por el nombre de una capa («mareas», «cultivos») o por la organización.']
        ]
      },
      {
        id: 'live', nav: 'Cuán actuales son los datos', h: 'Cuán actuales son las cifras',
        blocks: [
          ['tagline', 'La actualidad de los datos depende de la capa. La tabla siguiente indica qué momento representa cada tipo de capa.'],
          ['table',
            ['Tipo', 'Qué momento estás viendo', 'Ejemplos'],
            [
              ['Se descarga al mirar', 'El momento en que la activaste. Los terremotos se actualizan en minutos; los avisos se releen cada cinco aproximadamente', 'Terremotos, avisos, tiempo, aeronaves, imágenes de satélite'],
              ['Estadística anual', 'El último año publicado, y la aplicación siempre escribe cuál es', 'Comercio, mezcla energética, población, indicadores económicos'],
              ['Un año de referencia', 'Una observación de un año declarado; nada posterior está incluido', 'Cultivos (2000, 2010), zonas climáticas (1901&ndash;2020)'],
              ['Incluido en la aplicación', 'Capturado en la última actualización; la misma respuesta sin red alguna', 'Fronteras, litorales, fondo marino, catálogo estelar, texturas de planetas, elementos orbitales de satélites']
            ]
          ],
          ['lim', '<b>Conviene saberlo</b> — Algunos datos se alejan de la realidad al envejecer; los elementos orbitales de los satélites son el ejemplo más claro. Para esas capas, el panel muestra la fecha de captura. Nunca se presentan datos antiguos como si fueran actuales.']
        ]
      },
      {
        id: 'privacy', nav: 'Qué envía una capa', h: 'Qué ocurre al abrir una capa',
        blocks: [
          ['tagline', 'Tu navegador descarga los datos directamente del proveedor.'],
          ['p', 'IntMap casi no usa servidores intermedios: las teselas, el tiempo, los terremotos y todo lo demás los pide tu dispositivo directamente al proveedor. Por eso en sus registros de acceso quedarán <b>tu dirección IP y las teselas de mapa solicitadas</b>, lo que indica aproximadamente la zona que estabas viendo. Esto es igual en otras aplicaciones de mapas, pero se dice aquí con claridad.'],
          ['p', 'Tu ubicación se usa solo en tu dispositivo. Las coordenadas salen únicamente cuando preguntas algo sobre un lugar: una búsqueda, una ruta, una previsión. Las cuentas, las funciones de IA y los monitores se explican en el diálogo de Privacidad de la propia aplicación.']
        ]
      },
      {
        id: 'licence', nav: 'Quién hizo los datos', h: 'Quién hizo estos datos y en qué condiciones',
        blocks: [
          ['tagline', 'La atribución es obligatoria según estas licencias, y también es la forma de saber de quién es el trabajo detrás de una cifra.'],
          ['ul', [
            '<b>OpenStreetMap</b> (ODbL 1.0) &mdash; el mapa construido por voluntarios: carreteras, ferrocarril, edificios, lugares y límites administrativos, además de los datos base del cálculo de rutas. Se acredita en el mapa en todo momento.',
            '<b>Obras del Gobierno de EE. UU.</b> (NASA, NOAA, USGS, NWS &hellip;) &mdash; por norma, dominio público: imágenes, terremotos, luces urbanas, posiciones planetarias. Los logotipos y emblemas de la NASA no lo son.',
            '<b>Servicios meteorológicos nacionales</b> &mdash; los avisos se muestran tal como los publicó el organismo emisor, y el organismo siempre se nombra.',
            '<b>Natural Earth</b> &mdash; fronteras y litorales de dominio público.',
            '<b>Our World in Data</b> (CC BY 4.0) &mdash; estadísticas de electricidad, energía y cultivos, con el compilador original (Ember, Energy Institute, FAO) nombrado junto a ellas.',
            '<b>Banco Mundial</b>, <b>FAO</b>, <b>Wikipedia / Wikidata</b> &mdash; según las condiciones propias de cada proveedor, nombrados en el panel que los utiliza.'
          ]],
          ['note', 'Cada entrada enlaza a la página del proveedor, donde está el texto completo de la licencia. Las descripciones de aquí son resúmenes y no prevalecen sobre ese texto.']
        ]
      },
      {
        id: 'limits', nav: 'Lo que una fuente no dice', h: 'Lo que una fuente no te dice',
        blocks: [
          ['tagline', 'Que se cite una fuente no significa por sí solo que los datos sean exactos, actuales ni aplicables a tu propia ubicación.'],
          ['ul', [
            '<b>Un total nacional no es un valor local.</b> Una estadística de país pintada sobre todo el país no dice de dónde sale la cifra dentro de él. El sombreado cambia en la frontera; el fenómeno que describe normalmente no.',
            '<b>Donde no hay fuente de datos, la aplicación lo dice con palabras.</b> Un mapa vacío no es una afirmación de que no hay avisos en vigor.',
            '<b>Un resultado de simulación no es un dato de origen.</b> Los resultados de terremoto, tsunami, inundación e insolación se calculan a partir de los datos aquí listados. Las ecuaciones, los supuestos y los límites están en la página <a href="./science.html">Ciencia y lógica</a>.',
            '<b>En una emergencia, sigue siempre a las autoridades oficiales.</b> Lo que muestra esta aplicación es orientativo.'
          ]]
        ]
      },
      {
        id: 'list', nav: 'La lista, por temas', h: 'La lista, por temas', count: 'src-count',
        blocks: [
          ['tagline', 'Cada entrada es un proveedor, con su nombre, dónde lo usa IntMap y un enlace a su propia página.'],
          ['slot', 'src-panel']
        ]
      }
    ],
    filterPh: 'Filtrar — terremotos, mareas, NASA…',
    entries: 'entradas',
    loading: 'Cargando…',
    loadFail: 'No se pudo cargar la lista: vuelve a cargar la página.',
    noMatch: 'Ninguna fuente coincide con ese filtro.',
    groups: {
      base: 'Mapa base, relieve, elevación',
      imagery: 'Imágenes y teledetección',
      weather: 'Tiempo, océano, clima',
      hazard: 'Terremotos, peligros, avisos',
      space: 'Espacio y astronomía',
      econ: 'Economía, estadística, energía',
      geo: 'Países, límites, topónimos',
      transit: 'Transporte, rutas, aeronaves, buques',
      news: 'Noticias y referencia',
      other: 'Otros'
    }
  },

  /* ══════════════════════════════════════════════════════════════════════════════════════════ */
  science: {
    title: 'Ciencia y lógica',
    meta: 'Qué datos usa cada función y cada simulación de IntMap, con qué ecuaciones y bajo qué supuestos.',
    sub: 'Qué calcula realmente cada función de IntMap, a partir de qué datos y bajo qué supuestos. Aparte de la lista de fuentes: esta página trata del <b>método</b>.',
    footer: [
      'Esta página documenta el <b>método</b>. La lista de proveedores de datos está en la página <a href="./sources.html">Fuentes de datos</a>.<br>Si encuentras un error aquí, usa los comentarios de la aplicación.'
    ],
    sections: [
      {
        id: 'principles', nav: 'Principios', h: 'Principios',
        blocks: [
          ['tagline', 'Cuatro promesas que rigen en todas las funciones siguientes.'],
          ['h3', '① Ningún dato de relleno'],
          ['p', 'Cada número está medido, observado o publicado. Nada se genera para que parezca plausible. Cuando una descarga falla, la aplicación <b>dice que falló</b> en lugar de sustituirla por algo de aspecto razonable.'],
          ['h3', '② Todo tope se declara'],
          ['p', 'Los cálculos tienen presupuestos: longitud de recorrido, número de teselas, tamaño de malla. Alcanzar el presupuesto y devolver el resultado truncado en silencio sería afirmar que el fenómeno terminaba ahí, así que un presupuesto agotado siempre consta en la respuesta.'],
          ['h3', '③ Ninguna afirmación más fina que los datos'],
          ['p', 'Un cauce más estrecho que una muestra de elevación, o una inundación más fina que una celda del solucionador, se dibuja a la resolución propia de los datos, y el número de esos casos se <b>informa</b>, no se oculta.'],
          ['h3', '④ Cada modelo declara lo que no responde'],
          ['p', 'El modelo de agua responde «dónde queda y por dónde sale», no «a qué velocidad viaja el frente». Cada panel dice qué pregunta no está respondiendo.']
        ]
      },
      {
        id: 'elevation', nav: 'Datos de elevación', h: 'Datos de elevación — la base de todo cálculo de relieve',
        blocks: [
          ['p', 'Todas las funciones de relieve comparten un mismo muestreador de elevación. Los datos son teselas RGB de elevación codificadas en Terrarium, donde el color del píxel <em>es</em> la altura.'],
          ['p', 'La elevación de un punto se <b>interpola bilinealmente</b> a partir de las cuatro muestras que lo rodean; el vecino más próximo convertiría los píxeles de la tesela en escalones falsos y estropearía las respuestas de pendiente y de flujo. El espaciado sobre el terreno de una muestra en el nivel z es:'],
          ['tex', 'h \\;=\\; \\bigl(R \\cdot 256 + G + B/256\\bigr) - 32768 \\quad [\\mathrm{m}]'],
          ['tex', '\\Delta(z) \\;=\\; \\frac{40\\,075\\,017 \\, \\cos\\varphi}{2^{z} \\cdot 256} \\quad [\\mathrm{m\\;per\\;pixel}]'],
          ['table', ['z', 'Espaciado en latitudes medias', 'Se usa para'], [
            ['14', '~10 m', 'Cabecera de cauce, secciones transversales'],
            ['11', '~54 m', 'Traza larga aguas abajo'],
            ['7', '~860 m', '«¿Es el mar o una cuenca cerrada?»']
          ]],
          ['lim', 'Los huecos se rellenan a partir de los vecinos y el <b>número de celdas rellenadas se muestra siempre</b>. Si falta más del 30 %, el muestreador baja un nivel de zoom y reintenta; solo si también falla el nivel más grueso informa de un fallo, y nombra a la red, no al lugar.'],
          ['h3', 'Las cuatro muestras y el presupuesto del que salen'],
          ['tex', 'h(x,y) \\;=\\; \\sum_{i,j\\in\\{0,1\\}} h_{ij}\\,\\bigl(1-|x-i|\\bigr)\\bigl(1-|y-j|\\bigr)'],
          ['p', 'Una tesela son 256&times;256 muestras; una consulta a zoom 14 cuesta una petici&oacute;n HTTP por cuadrado de 2,4 km y se conserva durante la sesi&oacute;n. Todo c&aacute;lculo de terreno declara su presupuesto de teselas antes de empezar &mdash; un campo de intensidad pide hasta 1.600 y un tel&eacute;fono almacena 140 &mdash;, por eso las teselas en uso se <b>fijan</b> y se liberan en un <code>finally</code>. Sin eso, un campo grande expulsa sus propias entradas y vuelve a pedirlas: as&iacute; es como un campo se convierte en c&iacute;rculos conc&eacute;ntricos.']
        ]
      },
      {
        id: 'water', nav: 'Relieve y encaminamiento del agua', h: 'Modelado del relieve y encaminamiento del agua',
        blocks: [
          ['tagline', 'Dónde queda el agua, por dónde sale y dónde desborda — resuelto sobre el modelo digital de elevaciones real.'],
          ['h3', '① Relleno de depresiones — priority flood'],
          ['p', 'Barnes, Lehman &amp; Mulla (2014), la forma moderna de Planchon–Darboux. Un montículo mínimo crece hacia dentro desde el borde de la malla, tomando siempre la celda más baja alcanzada hasta el momento. El orden de extracción es un orden topológico de la red de drenaje, así que no hace falta una pasada aparte de direcciones de flujo, ni un caso especial para las depresiones, y los llanos drenan en vez de atascarse. Cada celda sale con:'],
          ['ul', [
            '<b>filled</b> — el nivel hasta el que se llena una depresión antes de desbordar',
            '<b>parent</b> — el vecino desde el que fue alcanzada, es decir, su salida'
          ]],
          ['h3', '② Reparto del volumen — flujo multidireccional'],
          ['p', 'D8 colapsa el flujo en líneas de una celda en una ladera abierta: es su artefacto característico. En su lugar, cada celda reparte el agua entre <b>todos los vecinos más bajos</b>, ponderando por pendiente y ancho de contorno (Freeman 1991 / Quinn 1991):'],
          ['tex', 'w_i \\;\\propto\\; \\left(\\frac{\\Delta z_i}{L_i}\\right)^{1.1} \\! \\cdot C_i, \\qquad C = \\tfrac{1}{2}\\Delta \\ (\\text{face}), \\;\\; 0.354\\,\\Delta \\ (\\text{corner})'],
          ['p', 'La ponderación es superlineal en la pendiente, así que las laderas dispersan y los valles convergen por sí solos. Una parte solo pasa a un <code>filled</code> estrictamente menor, de modo que los ciclos son imposibles.'],
          ['h3', '③ Los lagos retienen y luego cascadean'],
          ['p', 'Ordenar una sola vez las celdas de una depresión por elevación convierte el volumen almacenado en una suma prefija y el nivel para un volumen dado en una búsqueda binaria. Si la entrada no la llena, el agua se detiene ahí; solo el <b>desbordamiento</b> se inyecta en la salida que el priority flood ya identificó. Un embalse vacío, por tanto, no entrega toda su entrada aguas abajo.'],
          ['h3', '④ Más allá de la malla — caminar sobre el MDE en bruto'],
          ['p', 'La malla de trabajo mide como mucho 60 km; un río no. Fuera de ella, la traza inunda una ventana, sigue el <b>talweg</b> de esa ventana (la rama descendente con la mayor cuenca acumulada), mueve la ventana adonde se quedó y repite. Hay exactamente dos finales:'],
          ['ul', [
            '<b>El mar</b> — 1,5 km de terreno continuo a 0 m o por debajo. La elevación por sí sola no distingue el océano del mar Muerto o del valle de la Muerte, así que el último paso comprueba si la región ≤ 0 m está conectada al borde de una ventana de ~240 km <em>y</em> ocupa ≥ 15 % de ella (Pacífico abierto 100 %, mar Muerto 7 %).',
            '<b>Se detiene</b> — una cuenca que tendría que llenarse más de 25 m para salir. Eso es un lago, no ruido del MDE.'
          ]],
          ['p', 'Cuando el lago es más ancho que la ventana (el lago Biwa mide 63 km; la ventana, 15 km), no hay ningún vecino descendente dentro de él. La anticipación se ensancha entonces a <b>3&times; → 9&times; → 27&times;</b>, preguntando cada vez al MDE en el nivel cuyo espaciado corresponde a esa ventana. A 9&times; (~135 km) el Biwa cabe de sobra y se ve el Seta, el único camino por el que baja el nivel. <b>El umbral no crece con la escalera</b>: una muestra más gruesa solo puede sobreestimar el llenado necesario, así que mantener fijo el número hace la prueba más estricta al ensanchar la ventana, que es el lado seguro.'],
          ['h3', '⑤ El ancho y la profundidad que se dibujan'],
          ['p', 'En cada punto se lee el MDE en la <b>perpendicular</b> hasta ±1,8 km y la lámina de agua sube hasta que el área mojada iguala lo que tiene que pasar. Ese requisito sale de la continuidad:'],
          ['tex', 'A(s) \\;=\\; \\frac{C}{\\sqrt{S(s)}}, \\qquad v \\;=\\; K\\sqrt{S}, \\quad K = 40'],
          ['p', 'Que la velocidad vaya como &radic;pendiente es el término de pendiente de fricción que comparten todas las fórmulas de lámina libre; K = 40 da 1,3 m/s con un 0,1 % de pendiente, valor medio para un río de llanura real. Los tramos empinados salen estrechos y rápidos; los llanos, anchos y lentos. <b>El único número libre es el volumen (o el caudal) que introdujo el usuario.</b>'],
          ['lim', 'Es un <b>modelo estacionario de encaminamiento</b>, no un solucionador de aguas someras: no responde al tiempo de llegada (para eso hay otra función). El «vertido continuo» repite la misma solución estacionaria a medida que crece el volumen —una secuencia de llenado cuasiestática— y el panel muestra tiempo simulado, nunca tiempo de reloj.'],
          ['h3', 'El tama&ntilde;o de una ejecuci&oacute;n y qu&eacute; la limita'],
          ['tex', '\\text{priority flood: } O(n\\log n),\\qquad \\text{MFD: } w_i = \\frac{(\\Delta z_i/L_i)^{1.1}C_i}{\\sum_j (\\Delta z_j/L_j)^{1.1}C_j}'],
          ['table', ['Magnitud', 'Valor', 'Por qu&eacute; ese valor'], [
              ['Malla de trabajo', 'hasta 60 km, &le; 512&times;512 celdas', 'un tel&eacute;fono debe sostener el mont&iacute;culo, el relleno y la acumulaci&oacute;n a la vez'],
              ['Operaciones de mont&iacute;culo', 'O(n log n), n = celdas', 'cada celda entra y sale exactamente una vez'],
              ['Recorrido aguas abajo', 'ventanas de 15 km, &times;3 &rarr; &times;9 &rarr; &times;27', 'un lago m&aacute;s ancho que la ventana no tiene vecino m&aacute;s bajo dentro de ella'],
              ['Secci&oacute;n transversal', '&plusmn;1,8 km, 96 muestras', 'basta para un r&iacute;o de llanura y no borra un ca&ntilde;&oacute;n']
            ]],
          ['h3', 'La ley de fricci&oacute;n detr&aacute;s de K = 40'],
          ['tex', 'v \\;=\\; \\frac{1}{n}R_h^{2/3}S^{1/2}\\;\\;(\\text{Manning}), \\qquad K=\\frac{R_h^{2/3}}{n}\\;\\approx\\;40\\ \\text{for } R_h\\sim2\\,\\text{m},\\; n\\sim0.035'],
          ['p', 'La constante no es libre: es la ecuaci&oacute;n de Manning con un radio hidr&aacute;ulico de unos 2 m y n = 0,035, es decir un cauce natural con algo de vegetaci&oacute;n. Se indica aqu&iacute; para que el lector decida si aplica al tramo que mira.']
        ]
      },
      {
        id: 'seismic', nav: 'Sacudida sísmica', h: 'Sacudida sísmica',
        blocks: [
          ['p', 'La fuente es un espectro de Brune ω<sup>−2</sup>; entre ella y el suelo todo es un producto de tres atenuaciones con forma y constantes publicadas.'],
          ['tex', '\\dot{M}(f) = \\dfrac{M_0}{1+(f/f_c)^2}, \\qquad f_c = 4.906\\times10^{6}\\,\\beta\\left(\\dfrac{\\Delta\\sigma}{M_0}\\right)^{1/3}'],
          ['tex', 'A(f) = \\underbrace{\\dfrac{R_{\\theta\\phi}\\,F\\,V}{4\\pi\\rho\\beta^{3}}}_{\\text{source}}\\; \\dot{M}(f)\\; \\underbrace{G(r)}_{\\text{spreading}}\\; \\underbrace{e^{-\\pi f r/(Q(f)\\beta)}}_{\\text{anelastic}}\\; \\underbrace{e^{-\\pi\\kappa f}}_{\\text{near-surface}}'],
          ['tex', 'G(r) = \\begin{cases} r^{-1.3} & r \\le 70\\ \\text{km}\\\\ r^{+0.2} & 70 < r \\le 140\\ \\text{km}\\\\ r^{-0.5} & r > 140\\ \\text{km}\\end{cases} \\qquad Q(f) = Q_0 f^{\\eta},\\;\\; \\kappa = 0.035\\ \\text{s}'],
          ['tex', '\\log_{10} h_{\\text{eff}} = -0.405 + 0.235\\,M'],
          ['p', 'Un espectro no es un pico. El pico de un proceso aleatorio sale del factor de Cartwright y Longuet-Higgins, con N<sub>z</sub> cruces por cero en la duración T<sub>d</sub>.'],
          ['tex', 'y_{\\max} = \\sqrt{2\\ln N_z}\\left(1+\\dfrac{0.5772}{2\\ln N_z}\\right)\\sqrt{\\dfrac{1}{T_d}\\int_0^{\\infty}\\!\\!|Y(f)|^{2}df}'],
          ['p', 'El término de sitio es el terreno: V<sub>S30</sub> desde la pendiente, medida sobre el propio espaciado del MDE, y luego amplificación de cuarto de longitud de onda. Si los mosaicos de elevación no llegan, el campo recurre a una sola clase de sitio y lo dice — una intensidad con amplificación uniforme sólo depende de la distancia, y eso se dibuja como círculos concéntricos.'],
          ['tex', '\\text{slope} = \\dfrac{\\lVert\\nabla h\\rVert}{\\Delta s},\\quad \\Delta s = \\max\\!\\bigl(900\\,\\text{m},\\,1.25\\,\\Delta(z)\\bigr) \\;\\longrightarrow\\; V_{S30} \\;\\longrightarrow\\; A_{qwl} = \\sqrt{\\dfrac{\\rho_r\\beta_r}{\\overline{\\rho\\beta}(\\lambda/4)}}'],
          ['tex', '\\mathrm{MMI} = 3.78 + 1.47\\log_{10}\\mathrm{PGV}\\;\\;(\\mathrm{PGV}>0.76\\ \\text{cm/s}) \\qquad I_{\\mathrm{JMA}} = 2\\log_{10}a_0 + 0.94'],
          ['p', 'Los tiempos de llegada se trazan por rayos a través de la estructura de velocidades <b>IASP91</b>: el ángulo de salida se resuelve para la profundidad del foco y la distancia epicentral, y el camino se integra en vez de leerse de una tabla. De ahí salen las llegadas P y S.'],
          ['p', 'La amplitud es una atenuación empírica con la distancia por un <b>Q dependiente de la frecuencia</b> (atenuación anelástica) por una <b>amplificación del suelo</b>. La clase de suelo no se supone: sale de la pendiente medida al espaciado propio del MDE en ese punto (empinado = roca, llano = aluvial).'],
          ['lim', 'Más allá del extremo inferior de la escala de intensidad el campo está <b>extrapolando</b>, y lo dice. El epicentro está donde lo puso el usuario; nunca se usa una coordenada adivinada por la IA.'],
          ['h3', 'Del espectro al n&uacute;mero en pantalla'],
          ['p', 'El espectro de amplitudes de Fourier se eval&uacute;a en 64 frecuencias logar&iacute;tmicas entre 0,1 y 20 Hz; el resto es la integral del factor de pico anterior, por la regla del trapecio sobre esos 64 puntos. La duraci&oacute;n del trayecto es T<sub>d</sub> = T<sub>fuente</sub> + 0,05&thinsp;r (forma est&aacute;ndar de Boore).'],
          ['p', 'El campo se resuelve en una malla cuyo paso sale de la magnitud (512 m para M &lt; 6, 1&ndash;2 km por encima) y luego se interpola <b>solo para dibujar</b>. Nada se dibuja m&aacute;s fino que la malla en que se resolvi&oacute;.']
        ]
      },
      {
        id: 'tsunami', nav: 'Tsunami', h: 'Tsunami',
        blocks: [
          ['p', 'La propagación son las ecuaciones no lineales de aguas someras con fricción de fondo de Manning, resueltas explícitamente en una malla escalonada. El paso de tiempo lo fija la celda más rápida.'],
          ['tex', '\\dfrac{\\partial\\eta}{\\partial t} + \\nabla\\!\\cdot\\!\\bigl[(h+\\eta)\\mathbf{u}\\bigr] = 0, \\qquad \\dfrac{\\partial\\mathbf{u}}{\\partial t} + g\\nabla\\eta + \\dfrac{g\\,n^{2}\\lVert\\mathbf{u}\\rVert\\mathbf{u}}{(h+\\eta)^{4/3}} = 0'],
          ['tex', 'c = \\sqrt{g\\,h}, \\qquad \\Delta t \\le \\dfrac{\\mathrm{CFL}\\,\\Delta x}{\\max\\sqrt{g\\,h}}, \\qquad \\dfrac{H_2}{H_1} = \\left(\\dfrac{h_1}{h_2}\\right)^{1/4}'],
          ['p', 'La superficie inicial es el desplazamiento de Okada (1985) en semiespacio elástico de la ruptura dibujada: la ola parte de una falla con longitud, anchura, profundidad, buzamiento y deslizamiento.'],
          ['tex', '\\eta_0(x,y) = u_z^{\\,\\text{Okada}}\\bigl(x,y;\\,L,\\,W,\\,d,\\,\\delta,\\,\\lambda,\\,\\bar{D}\\bigr), \\qquad M_0 = \\mu\\,L\\,W\\,\\bar{D}'],
          ['p', 'El desplazamiento inicial de la superficie del mar es la solución de <b>Okada (1985)</b> para una falla rectangular en un semiespacio elástico. Importan dos detalles de implementación:'],
          ['ul', [
            'La arcotangente debe ser el <b>valor principal</b>: usar <code>atan2</code> produce un lóbulo falso de subsidencia detrás de la falla.',
            'Truncar la ventana de cálculo deja un escalón, y el escalón se propaga como un <b>frente de onda falso</b>. La ventana se ensancha hasta que el desplazamiento es despreciable.'
          ]],
          ['p', 'La propagación es la ecuación de <b>onda larga lineal</b> sobre batimetría medida, con velocidad de fase <span class="pg-eq pg-eq-inline">c = &radic;(gh)</span> — unos 200 m/s sobre 4 000 m de agua (velocidad de avión comercial), frenando y empinándose al disminuir la profundidad. Se ejecuta en un Web Worker para que el mapa siga respondiendo.'],
          ['h3', 'La discretizaci&oacute;n, escrita'],
          ['p', 'Malla escalonada Arakawa C y salto de rana en el tiempo: la superficie &eta; en los centros de celda y los dos flujos M y N en las caras intermedias, medio paso desfasados. Es el esquema de cualquier c&oacute;digo operativo de onda larga, y se escribe aqu&iacute; porque decir &laquo;ecuaciones de aguas someras&raquo; no dice <b>c&oacute;mo</b> se resolvieron.'],
          ['tex', '\\eta^{\\,t+1}_{i,j} = \\eta^{\\,t}_{i,j} - \\frac{\\Delta t}{\\Delta x}\\Bigl[(M^{\\,t+\\frac12}_{i+\\frac12,j}-M^{\\,t+\\frac12}_{i-\\frac12,j}) + (N^{\\,t+\\frac12}_{i,j+\\frac12}-N^{\\,t+\\frac12}_{i,j-\\frac12})\\Bigr]'],
          ['tex', 'M^{\\,t+\\frac12}_{i+\\frac12,j} = M^{\\,t-\\frac12}_{i+\\frac12,j} - g\\,D\\,\\frac{\\Delta t}{\\Delta x}\\bigl(\\eta^{\\,t}_{i+1,j}-\\eta^{\\,t}_{i,j}\\bigr) - \\frac{g\\,n^{2}}{D^{7/3}}\\lVert\\mathbf{M}\\rVert M\\,\\Delta t'],
          ['h3', 'Estabilidad, bordes y tierra seca'],
          ['tex', '\\frac{\\partial \\eta}{\\partial t} \\pm c\\,\\frac{\\partial \\eta}{\\partial x} = 0 \\quad\\text{(Sommerfeld, at the open edge)}, \\qquad D = h+\\eta > \\varepsilon_{\\text{dry}} = 0.01\\ \\text{m}'],
          ['p', 'El paso temporal sale de la condici&oacute;n CFL de la celda <b>m&aacute;s profunda</b> del dominio (0,45 del l&iacute;mite): es consecuencia de la batimetr&iacute;a, no un ajuste. Los bordes abiertos radian en vez de reflejar, y una celda solo est&aacute; mojada por encima de 1 cm, lo que impide que el t&eacute;rmino de fricci&oacute;n divida por una profundidad que se anula en la orilla.'],
          ['lim', 'El solucionador es <b>no dispersivo</b> (onda larga): no reproduce la dispersi&oacute;n de la onda l&iacute;der de una fuente muy corta ni modela rotura o remonte sobre rugosidad. Su respuesta son los tiempos de llegada y la primera cresta; la profundidad de inundaci&oacute;n en tierra es una cota, no un c&aacute;lculo de remonte.']
        ]
      },
      {
        id: 'sealevel', nav: 'Nivel del mar e inundación', h: 'Nivel del mar e inundación',
        blocks: [
          ['p', 'El terreno al nivel elegido o por debajo se sombrea: un llenado de bañera. El tono es la <b>propia profundidad</b>, y la resolución de los datos de elevación es directamente la resolución del borde inundado.'],
          ['lim', 'Diques, compuertas y drenaje no se modelan, y por defecto no se exige conectividad con el mar. La afirmación es, por tanto, <b>«este terreno está por debajo de ese nivel»</b>, no «esto es lo que se inundaría».'],
          ['h3', 'Conectividad, cuando se pide'],
          ['p', 'La respuesta por defecto es por celda: si ese suelo est&aacute; a ese nivel o por debajo. Con la conectividad activada, un relleno avanza desde el mar por la misma malla y solo se sombrean las celdas alcanzables &mdash; lo que excluye depresiones cerradas bajo el nivel del mar (Qattara, Valle de la Muerte). El panel dice cu&aacute;l de las dos se muestra.']
        ]
      },
      {
        id: 'tides', nav: 'Mareas', h: 'Mareas',
        blocks: [
          ['p', 'La serie es el modelo global de mareas de Open-Meteo Marine: nivel del mar horario sobre el nivel medio. Las pleamares y bajamares son sus <b>extremos locales</b>, con la hora afinada ajustando una parábola a las tres muestras alrededor de cada giro, de modo que la respuesta no queda clavada a la hora en que se muestrea el modelo.'],
          ['tex', 't^{*} \\;=\\; t_i + \\tfrac{1}{2}\\,\\frac{a-c}{a-2b+c}\\,\\Delta t'],
          ['p', 'Al activar la capa se explora el litoral a la vista y se pregunta al modelo por todos esos puntos a la vez, así que toda la costa visible lleva su nivel, su fase y su próximo giro <b>antes de tocar nada</b>, y el terreno a ese nivel o por debajo queda sombreado con los mismos datos de elevación del §6. Al tocar una costa, la vista general se sustituye por la tabla propia de ese punto, pedida con sus propias coordenadas.'],
          ['p', '«Hasta dónde llega el agua» usa exactamente la construcción del §6, con el nivel de marea actual como nivel del agua. En minutos u horas, un llenado en agua quieta es una aproximación razonable, pero no es un modelo de remonte.']
        ]
      },
      {
        id: 'currents', nav: 'Corrientes marinas', h: 'Corrientes marinas',
        blocks: [
          ['p', 'El campo incluido es flujo geostrófico por altimetría más la parte de Ekman inducida por el viento; cada corriente con nombre se integra luego por ese campo medido.'],
          ['tex', 'u_g = -\\dfrac{g}{f}\\dfrac{\\partial\\eta}{\\partial y}, \\qquad v_g = \\dfrac{g}{f}\\dfrac{\\partial\\eta}{\\partial x}, \\qquad f = 2\\Omega\\sin\\varphi'],
          ['tex', '\\lVert\\mathbf{u}_{ek}\\rVert = \\dfrac{B}{\\sqrt{|f|}}\\dfrac{\\lVert\\boldsymbol{\\tau}\\rVert}{\\rho_w},\\quad B = 0.065\\ \\text{s}^{-1/2}, \\qquad \\theta = \\theta_{\\tau} - \\operatorname{sgn}(\\varphi)\\,55^{\\circ}'],
          ['tex', '\\mathbf{x}_{n+1} = \\mathbf{x}_n + \\Delta s\\,\\hat{\\mathbf{u}}\\!\\left(\\mathbf{x}_n + \\tfrac{\\Delta s}{2}\\hat{\\mathbf{u}}(\\mathbf{x}_n)\\right), \\qquad \\Delta s = 25\\ \\text{km}'],
          ['p', 'Cálida o fría se <b>mide</b>, no se infiere de la dirección: la propia temperatura superficial frente a la media zonal de su latitud. Dentro de ±0,6 K se dibuja en gris.'],
          ['tex', '\\overline{\\Delta T} = \\dfrac{1}{N}\\sum_{i=1}^{N}\\Bigl[T(\\mathbf{x}_i)-\\langle T\\rangle_{\\varphi_i}\\Bigr] \\quad \\begin{cases}>+0.6\\ \\text{K} & \\text{warm}\\\\ <-0.6\\ \\text{K} & \\text{cold}\\\\ \\text{otherwise} & \\text{zonal}\\end{cases}'],
          ['tagline', 'Un campo de flujo, dibujado como las líneas de corriente del agua que realmente se mueve.'],
          ['p', 'El campo de velocidades es <code>ocean_current_velocity</code> y <code>ocean_current_direction</code> de Open-Meteo Marine, el mismo modelo sin clave que usan las mareas. Se pide en una sola petición una malla que cubre la vista, las celdas de tierra se descartan con la máscara de tierra incluida, y las respuestas se interpolan bilinealmente hasta formar un campo continuo.'],
          ['p', 'A través de ese campo se integra una <b>línea de corriente</b> desde cada punto semilla, hacia delante y hacia atrás, con un paso de Runge-Kutta de cuarto orden. Una línea es así un camino que el agua recorre de verdad, y no una flecha aislada. El grosor de la línea es la velocidad; las puntas de flecha a lo largo indican el sentido.'],
          ['eq', 'x<sub>n+1</sub> = x<sub>n</sub> + (h/6)(k<sub>1</sub> + 2k<sub>2</sub> + 2k<sub>3</sub> + k<sub>4</sub>), &nbsp; k<sub>i</sub> = u(x)/|u| &nbsp; (velocidad unitaria: el paso es una distancia)'],
          ['p', 'Cálida o fría se <b>mide, no se supone</b>. Una corriente cálida es una afirmación sobre lo que transporta el agua, así que cada línea de corriente se compara con la temperatura superficial del mar unos 110 km <b>aguas arriba</b> a lo largo de su propio camino. Si aguas arriba está más caliente, la corriente trae calor (rojo); si está más fría, trae frío (azul).'],
          ['lim', 'Donde la diferencia es menor de 0,25 K —dentro del propio ruido del modelo— la línea es <b>gris</b> y la leyenda dice «ninguna». Una corriente que no transporta contraste térmico no debe colorearse como si lo hiciera. Los nombres son de Wikidata (CC0), dibujados en la coordenada publicada para cada corriente; un nombre es un punto del mapa y no afirma que la línea contigua sea esa corriente.'],
          ['h3', 'El campo: qu&eacute; se promedia y sobre qu&eacute;'],
          ['p', 'El campo incluido es una <b>climatolog&iacute;a</b>: 36 campos de velocidad repartidos por todo el registro disponible (2015&rarr;hoy) m&aacute;s 24 campos de tensi&oacute;n del viento, en la malla de 0,25&deg; de la propia fuente. Una media de 36 campos reduce la varianza mesoescalar (remolinos) unas seis veces: por eso una traza es una corriente y no un anillo.'],
          ['tex', '\\mathbf{u}_{\\text{tot}} \\;=\\; \\underbrace{\\frac{g}{f}\\,\\hat{\\mathbf{k}}\\times\\nabla\\eta}_{\\text{geostrophic (altimetry)}} \\;+\\; \\underbrace{\\frac{B}{\\sqrt{|f|}}\\frac{\\boldsymbol{\\tau}}{\\rho_w}\\,\\mathcal{R}\\bigl(-\\operatorname{sgn}\\varphi\\cdot55^{\\circ}\\bigr)}_{\\text{Ekman (wind stress)}}'],
          ['h3', 'C&oacute;mo se produce la l&iacute;nea de una corriente con nombre'],
          ['tex', '\\mathbf{x}_{n+1} = \\mathbf{x}_n + \\Delta s\\;\\hat{\\mathbf{u}}\\!\\left(\\mathbf{x}_n + \\tfrac{\\Delta s}{2}\\,\\hat{\\mathbf{u}}(\\mathbf{x}_n)\\right), \\qquad \\Delta s = 25\\ \\text{km}'],
          ['p', 'Cada una de las 108 corrientes se integra hacia adelante y hacia atr&aacute;s desde un punto publicado de su n&uacute;cleo, hasta 5.000 km por lado, a trav&eacute;s de ese campo medido. Tres reglas terminan un recorrido: reentrar en una celda m&aacute;s de 12 pasos despu&eacute;s (remolino cerrado), volver a menos de 60 km del origen tras un trayecto real, o agotar un presupuesto de 12 celdas seguidas por debajo de 2,2 cm/s. Una traza que se cierra en menos de 1.500 km se <b>rechaza</b> y la semilla se reintenta desde el anillo que la rodea.'],
          ['h3', 'El archivo que lee el navegador'],
          ['tex', 's_{\\text{byte}} = \\left\\lfloor 255\\sqrt{\\frac{\\min(s,\\,2.5)}{2.5}} \\right\\rceil, \\qquad b_{\\text{byte}} = \\left\\lfloor \\frac{255\\,\\theta}{360^{\\circ}} \\right\\rceil'],
          ['tex', '\\text{stride} = \\min\\Bigl\\{\\,2^{k} \\;:\\; \\frac{\\Delta\\lambda_{\\text{view}}}{0.25^{\\circ}2^{k}}\\cdot\\frac{\\Delta\\varphi_{\\text{view}}}{0.25^{\\circ}2^{k}} \\le N_{\\max}\\Bigr\\},\\qquad N_{\\max}=4\\,200\\ (\\text{phone}),\\;9\\,000'],
          ['p', 'El campo viaja como una malla regular (1.440 &times; 720 celdas, un byte de velocidad y otro de rumbo) y no como una lista de flechas, porque una lista fija el espaciado en el momento de construirla. El cliente recorre la malla a saltos y elige el salto m&aacute;s grueso que a&uacute;n llena la vista con N<sub>max</sub> marcas como m&aacute;ximo; cada celda es la <b>media vectorial</b> de su bloque. La velocidad se cuantiza con una ra&iacute;z, de modo que la resoluci&oacute;n en el extremo lento es de 0,05 cm/s.'],
          ['h3', 'Los doce meses'],
          ['p', 'Un segundo archivo lleva doce climatolog&iacute;as mensuales a 0,5&deg; (seis a&ntilde;os de cada mes natural) y solo se descarga si se elige un mes. Cada corriente lleva adem&aacute;s sus doce velocidades mensuales y la proyecci&oacute;n media del flujo de ese mes <b>sobre su propio trazado</b>; cuando esa proyecci&oacute;n cambia de signo, la corriente se invierte con la estaci&oacute;n y la lista lo indica. Los trazados no se rehacen mes a mes.']
        ]
      },
      {
        id: 'atmosphere', nav: 'Atmósfera y cielo', h: 'Atmósfera y color del cielo',
        blocks: [
          ['tagline', 'De qué color es el cielo desde esta altura, con este ángulo solar y mirando en esta dirección — integrado, no elegido.'],
          ['p', 'Interpolar dos colores coincide con el cielo real en exactamente una elevación solar y una altura de cámara. Esta app vuela desde la calle hasta la órbita baja y viaja en el tiempo, así que el cielo se <b>integra</b>: el rayo de visión se integra hasta el tope de la atmósfera y, en cada paso, también el rayo hacia el Sol. Un paso cuyo rayo solar bloquea la Tierra no aporta nada — por eso el crepúsculo cae desde el suelo hacia arriba.'],
          ['h3', 'La transferencia radiativa que realmente se integra'],
          ['tex', 'L(\\mathbf{x},\\boldsymbol{\\omega}) \\;=\\; \\int_{0}^{t_{\\max}} T(\\mathbf{x},\\mathbf{p})\\,\\Bigl[\\, \\sigma_s^{R}(\\mathbf{p})\\,p_R(\\mu)\\,T(\\mathbf{p},\\mathbf{p}_{\\odot})\\,E_\\odot \\;+\\; \\sigma_s^{M}(\\mathbf{p})\\,p_M(\\mu)\\,T(\\mathbf{p},\\mathbf{p}_{\\odot})\\,E_\\odot \\;+\\; \\sigma_s(\\mathbf{p})\\,\\Psi_{ms}(h,\\theta_\\odot) \\Bigr]\\,dt'],
          ['tex', 'T(\\mathbf{a},\\mathbf{b}) \\;=\\; \\exp\\!\\left[-\\!\\int_{\\mathbf{a}}^{\\mathbf{b}}\\!\\bigl(\\beta_R\\,e^{-h/H_R} + 1.1\\,\\beta_M\\,e^{-h/H_M} + \\beta_{O_3}\\,\\Lambda(h)\\bigr)ds\\right]'],
          ['tex', 'p_R(\\mu) = \\frac{3}{16\\pi}\\bigl(1+\\mu^{2}\\bigr), \\qquad p_M(\\mu) = \\frac{3}{8\\pi}\\,\\frac{(1-g^{2})(1+\\mu^{2})}{(2+g^{2})\\,(1+g^{2}-2g\\mu)^{3/2}}, \\quad g = 0.76'],
          ['h3', 'El ozono y por qué el crepúsculo es azul'],
          ['p', 'El ozono <b>absorbe y no dispersa</b>, así que entra en la profundidad óptica de ambos rayos y en ninguna función de fase. Es lo que hace azul la hora azul: con el Sol bajo el horizonte la visual atraviesa 10–40 km, donde a Rayleigh le queda poco que quitar, y la banda de Chappuis cerca de 600 nm retira el amarillo-rojo restante.'],
          ['tex', '\\Lambda(h) \\;=\\; \\max\\!\\left(0,\\; 1 - \\frac{|h - 25\\,\\mathrm{km}|}{15\\,\\mathrm{km}}\\right), \\qquad \\beta_{O_3} = (0.650,\\,1.881,\\,0.085)\\times10^{-6}\\ \\mathrm{m^{-1}}'],
          ['h3', 'Dispersión múltiple'],
          ['p', 'La dispersión simple cuenta un fotón una vez. En el azul el aire es lo bastante espeso como para que la mayor parte llegue tras varios rebotes, y cada rebote borra la dirección — así que la parte múltiple es <b>isótropa</b> y no tiene función de fase. Cerrar la serie geométrica da un término que sólo depende de altura y elevación solar, tabulado 16 × 24.'],
          ['tex', '\\Psi_{ms} \\;=\\; \\frac{L^{(2)}}{1 - f}, \\qquad f = \\frac{1}{4\\pi}\\oint \\sigma_s\\,T\\,d\\omega \\;<\\; 1'],
          ['tex', 'C \\;=\\; \\Bigl[\\,1 - e^{-L\\,\\varepsilon}\\,\\Bigr]^{1/2.2}, \\qquad \\varepsilon = 0.7'],
          ['lim', 'Un solo perfil de aerosoles para todo el planeta, sin nubes, sin luminiscencia nocturna y sin luz estelar — la noche profunda integra a negro y se acota con un color nocturno medido. El limbo visto desde el espacio es el paso de dispersión del propio renderizador, no esta integral.'],
          ['h3', 'La marcha y lo que cuesta'],
          ['tex', 'L=\\sum_{i=1}^{16} T(\\mathbf{x},\\mathbf{p}_i)\\bigl[\\sigma_s^R p_R + \\sigma_s^M p_M\\bigr]T(\\mathbf{p}_i,\\odot)E_\\odot\\,\\Delta t \\;+\\;\\sum_{i}\\sigma_s\\Psi_{ms}\\Delta t,\\quad T \\text{ from } M=8 \\text{ sun steps}'],
          ['p', 'Diecis&eacute;is pasos a lo largo del rayo de visi&oacute;n, ocho a lo largo del rayo solar en cada uno, y una tabla 16&times;24 de dispersi&oacute;n m&uacute;ltiple interpolada dos veces por muestra. Unas 300 exponenciales por color, evaluadas solo cuando el Sol o la c&aacute;mara se han movido de verdad.'],
          ['h3', 'Vista desde fuera: el limbo'],
          ['tex', '\\theta_{\\text{limb}}(h_t) \\;=\\; \\arcsin\\!\\frac{R_\\oplus+h_t}{R_\\oplus+h_{\\text{eye}}} \\;-\\; 90^{\\circ}, \\qquad \\ell(h_t)\\;\\approx\\;2\\sqrt{2R_\\oplus H}\\,e^{-h_t/2H}'],
          ['p', 'Desde &oacute;rbita la atm&oacute;sfera no est&aacute; encima sino de canto: un rayo cuyo acercamiento m&iacute;nimo es de 6 km atraviesa unos 800 km de aire; uno de 55 km casi ninguno. Los dos extremos del degradado dibujado son esos dos rayos, as&iacute; que la banda es blanquiazul abajo en el lado diurno, roja en el terminador y negra en el lado nocturno, a cualquier altura de c&aacute;mara.'],
          ['lim', 'Un solo perfil de aerosoles para todo el planeta, sin nubes, sin luminiscencia nocturna y sin luz estelar: una noche profunda integra a negro y se eleva a un color nocturno medido.']
        ],
      },
      {
        id: 'sun', nav: 'Sol, sombra, cuenca visual', h: 'Sol, sombra y cuenca visual',
        blocks: [
          ['p', 'La posición solar sale del algoritmo astronómico estándar: de la declinación y el ángulo horario al acimut y la altura. Está verificado que da declinación 0° en un equinoccio y la oblicuidad en un solsticio.'],
          ['p', 'La insolación anual barre el MDE circundante por acimut para construir el <b>perfil real del horizonte</b> del punto y luego integra la trayectoria del Sol contra él. La cuenca visual responde <b>por celda del ráster</b> y no por rumbo, porque un barrido por rumbos se salta celdas a distancia.'],
          ['h3', 'El horizonte, y el a&ntilde;o integrado contra &eacute;l'],
          ['tex', 'H(\\alpha) = \\max_{r\\le R_{\\max}}\\arctan\\frac{z(r,\\alpha)-z_0}{r}, \\qquad E = \\int_{\\text{year}} I_0\\,\\cos\\theta_i\\,\\bigl[\\,\\gamma_s(t)>H(\\alpha_s(t))\\,\\bigr]\\,dt'],
          ['p', 'El terreno circundante se barre por acimut en pasos de 1&deg; hasta 25 km, y el mayor &aacute;ngulo de elevaci&oacute;n hallado en cada rumbo es su horizonte. Despu&eacute;s la trayectoria solar de todo el a&ntilde;o se integra contra ese perfil en pasos de 10 minutos, contando solo los instantes en que est&aacute; por encima.'],
          ['p', 'La cuenca visual responde <b>por celda de r&aacute;ster</b> y no por rumbo: un barrido por rumbos deja huecos que crecen con la distancia.']
        ]
      },
      {
        id: 'sats', nav: 'Satélites', h: 'Satélites',
        blocks: [
          ['p', 'Las órbitas se propagan desde TLE con <b>SGP4/SDP4</b>. Un TLE se degrada con la edad y —esto es lo importante— <b>diverge en silencio</b>, así que hay un límite duro a la antigüedad del juego de elementos y nada por encima de él se dibuja.'],
          ['p', 'El catálogo es una instantánea incluida más una descarga en vivo. Una categoría sin lista se <b>omite, no se muestra vacía</b>: un array vacío sería afirmar que esa categoría no tiene satélites.'],
          ['h3', 'SGP4 y por qu&eacute; la edad de un juego de elementos es un l&iacute;mite duro'],
          ['tex', 'n\'\' = n_0\\bigl[1 + \\tfrac{3}{2}k_2\\tfrac{(3\\cos^2 i-1)}{a^{2}(1-e^{2})^{3/2}}\\bigr],\\qquad \\sigma_{\\text{pos}} \\sim 1\\text{–}3\\ \\mathrm{km/day}\\ \\text{after epoch}'],
          ['p', 'Un TLE no es una posici&oacute;n: es un juego de elementos medios ajustado a una teor&iacute;a anal&iacute;tica concreta, y solo SGP4/SDP4 puede leerlo. En &oacute;rbita baja su error crece del orden de 1&ndash;3 km por d&iacute;a tras la &eacute;poca, y lo hace <b>en silencio</b>. Por eso el propagador rechaza los juegos demasiado antiguos en vez de dibujar un punto plausible en el sitio equivocado.']
        ]
      },
      {
        id: 'space', nav: 'Espacio y cuerpos', h: 'Espacio y cuerpos celestes',
        blocks: [
          ['p', 'Las posiciones de planetas y lunas son keplerianas, a partir de elementos orbitales. Los cuerpos se dibujan ampliados (a escala real son de menos de un píxel), pero el <b>techo de la ampliación es geometría, no gusto</b>: se sigue de exigir que la Luna quede libre de la Tierra incluso en el perigeo.'],
          ['p', 'Los satélites de los demás planetas provienen de la tabla de elementos medios del JPL para 177 lunas en una época declarada, cada uno propagado hasta la hora del reloj. Los elementos no están todos en un mismo plano: un satélite cercano de un planeta gigante declara el <b>plano de Laplace</b> local de su planeta, cuyo polo la tabla da en ascensión recta y declinación, y ese marco se arrastra en lugar de leerse como si fuera la eclíptica.'],
          ['p', 'A escala de modelo, un satélite se coloca con la misma ley de compresión que la Luna y luego se <b>empuja hacia fuera hasta librar a su primario</b>: comprimir una distancia y un radio con exponentes distintos puede meter una luna interior dentro del planeta que orbita. A escala real no se mueve nada, porque no hay nada que comprimir.'],
          ['p', 'Las estrellas salen de un catálogo incluido de estrellas brillantes de todo el cielo, en sus posiciones y magnitudes reales; el color se deriva del índice B&minus;V, es decir, de la temperatura de color real.'],
          ['h3', 'Posiciones'],
          ['tex', 'M = E - e\\sin E \\;\\Longrightarrow\\; E_{k+1}=E_k-\\frac{E_k-e\\sin E_k-M}{1-e\\cos E_k}, \\qquad \\tan\\frac{\\nu}{2}=\\sqrt{\\tfrac{1+e}{1-e}}\\tan\\frac{E}{2}'],
          ['p', 'Planetas y lunas provienen de elementos medios en una &eacute;poca declarada: se avanza la anomal&iacute;a media, se resuelve la ecuaci&oacute;n de Kepler por Newton-Raphson (cuatro iteraciones alcanzan 10<sup>&minus;12</sup> para e &lt; 0,9) y de ah&iacute; sale la anomal&iacute;a verdadera. Un sat&eacute;lite interior de un planeta gigante declara el <b>plano de Laplace</b> local de su planeta en vez de la ecl&iacute;ptica, y ese marco se arrastra tal cual.'],
          ['h3', 'Las dos escalas y lo que se conserva entre ellas'],
          ['tex', 'r_{\\text{model}} = 26\\,\\mathrm{AU}^{0.42}, \\qquad R_{\\text{model}} = 0.12\\left(\\frac{R}{R_\\oplus}\\right)^{1/3}, \\qquad d\' = \\frac{\\mathcal{P}\'\\bigl(\\mathcal{P}^{-1}(d\\tan\\tfrac{\\phi}{2})\\bigr)}{\\tan\\frac{\\phi}{2}}'],
          ['p', 'La escala modelo comprime los radios orbitales con un exponente de 0,42 y los radios de los cuerpos con una ra&iacute;z c&uacute;bica: son dos leyes distintas y ninguna conversi&oacute;n de la distancia de la c&aacute;mara puede mantener ambas. Lo que se traslada es el <b>radio real en el borde del encuadre</b>: fuera con la ley de la escala vieja y dentro con la de la nueva. Cuando un cuerpo llena el encuadre, el invariante pasa a ser su tama&ntilde;o aparente, mezclado en el logaritmo.']
        ]
      },
      {
        id: 'flight', nav: 'Modelo de vuelo', h: 'Modelo de vuelo',
        blocks: [
          ['p', 'El empuje y la sustentación caen con la densidad del aire, así que el <b>techo de servicio no es un muro</b>: un avión iniciado por encima desciende hasta que el aire puede sostenerlo, en vez de quedar sujeto artificialmente.'],
          ['p', 'La cámara está <em>en</em> el avión, y no es una vista de persecución corregida a posteriori.'],
          ['h3', 'Las fuerzas'],
          ['tex', 'L=\\tfrac12\\rho V^{2}S\\,C_L(\\alpha),\\quad D=\\tfrac12\\rho V^{2}S\\bigl(C_{D0}+\\tfrac{C_L^{2}}{\\pi e A\\!R}\\bigr),\\quad T=T_0\\left(\\frac{\\rho}{\\rho_0}\\right)^{0.7}'],
          ['p', 'C<sub>L</sub>(&alpha;) es lineal hasta el &aacute;ngulo de entrada en p&eacute;rdida y decae despu&eacute;s seg&uacute;n el modelo; la resistencia inducida es el t&eacute;rmino habitual 1/(&pi;eAR). El empuje cae con la densidad elevada a 0,7, y de ah&iacute; sale el techo de servicio sin ninguna regla que diga &laquo;hasta aqu&iacute;&raquo;.'],
          ['h3', 'El aire por el que vuela'],
          ['tex', '\\rho(h)=\\rho_0\\left(1-\\frac{Lh}{T_0}\\right)^{\\frac{g}{RL}-1},\\quad L=6.5\\ \\mathrm{K/km};\\qquad \\rho=\\rho_{11}e^{-\\frac{g(h-11\\,\\mathrm{km})}{R\\,T_{11}}}\\ (h>11\\ \\mathrm{km})'],
          ['p', 'La Atm&oacute;sfera Est&aacute;ndar Internacional en dos tramos: troposfera de gradiente lineal y estratosfera isoterma por encima de 11 km. La velocidad del aire es por tanto dos n&uacute;meros distintos, y el HUD dice cu&aacute;l es cada uno.'],
          ['h3', 'La integraci&oacute;n'],
          ['tex', '\\mathbf{y}_{n+1}=\\mathbf{y}_n+\\Delta t\\,\\mathbf{f}(\\mathbf{y}_n),\\quad \\Delta t=\\min\\!\\left(\\tfrac{1}{30}\\ \\mathrm{s},\\,\\Delta t_{\\text{frame}}\\right)\\ \\text{sub-stepped so } \\Delta t\\le \\tfrac{1}{120}\\ \\mathrm{s}'],
          ['p', 'Integraci&oacute;n expl&iacute;cita con paso acotado y subpasos, para que un fotograma largo no se convierta en un paso temporal largo. La c&aacute;mara est&aacute; <em>en</em> el avi&oacute;n, no es una vista de persecuci&oacute;n corregida despu&eacute;s.']
        ]
      },
      {
        id: 'routing', nav: 'Rutas y accesibilidad', h: 'Rutas y accesibilidad',
        blocks: [
          ['p', 'Las rutas por carretera vienen de OSRM sobre la red de OpenStreetMap, y las alternativas del mismo motor. El cálculo ferroviario corre sobre vía real de OSM y <b>se ajusta a la mayor componente conexa</b>: ajustarse a un apartadero aislado haría inalcanzable el destino. El transporte público usa horarios reales vía MOTIS/Transitous.'],
          ['p', 'Una isócrona es el conjunto de puntos que alcanza un presupuesto de tiempo, envuelto en una envolvente. La envolvente es para mostrarla; <b>la accesibilidad en sí se decide sobre la red</b>, no con la envolvente.'],
          ['h3', 'Qu&eacute; resuelve realmente una isocrona'],
          ['p', 'Un presupuesto de tiempo se expande desde el origen por la red viaria &mdash; una b&uacute;squeda de caminos m&iacute;nimos, no un c&iacute;rculo &mdash; y los nodos alcanzados se envuelven despu&eacute;s en una envolvente c&oacute;ncava para dibujarlos. <b>La accesibilidad se decide en la red</b>; la envolvente es solo la imagen de la respuesta.']
        ]
      },
      {
        id: 'trade', nav: 'Flujos comerciales', h: 'Flujos comerciales',
        blocks: [
          ['p', 'Comercio bilateral de bienes de BACI (CEPII) vía OEC: país declarante &times; socio &times; sección del SA &times; año, 1995–2024.'],
          ['p', '<b>El ancho de línea es proporcional a la raíz cuadrada del valor.</b> Por dos motivos. El principal socio de un país suele ser 500&times; su centésimo, así que un ancho lineal borra todo lo que no sean los tres primeros; y un logaritmo hace que un flujo de 200 M$ parezca un tercio de ancho que uno de 200 000 M$, lo que miente en el otro sentido. Con &radic;, el <b>área</b> del trazo (ancho &times; longitud) sigue la magnitud, que es la convención de los mapas de flujo.'],
          ['eq', 'w = 1,2 + 11,8 &middot; &radic;(v / v<sub>max</sub>) &nbsp;px'],
          ['lim', 'Solo se comprime la <b>imagen</b>. Al pasar el cursor aparecen tanto la forma corta (<code>$141.6B</code>) como la <b>cifra exacta y sin redondear</b> (<code>$141,585,432,101</code>). Nada en esta aplicación reescala un valor para mostrarlo.']
        ]
      },
      {
        id: 'energy', nav: 'Mezcla energética', h: 'Mezcla energética',
        blocks: [
          ['p', 'La mezcla eléctrica viene de Ember y la energía primaria del informe del Energy Institute, ambas vía Our World in Data, por país y año. El mapa lleva <b>el único número que ordena países</b> (proporción baja en carbono de la electricidad / proporción fósil de la energía primaria); la composición en sí es una <b>barra apilada</b>, porque nueve fuentes no son un color.'],
          ['p', 'Viajar en el tiempo relee <b>las filas de ese año</b> en lugar de interpolar. Si un país no tiene fila para ese año se usa la observación más reciente en ese año o antes, y se indica qué año se usó realmente.']
        ]
      },
      {
        id: 'crops', nav: 'Cultivos', h: 'Cultivos',
        blocks: [
          ['p', 'El ráster es FAO GAEZ v4: superficie cosechada, rendimiento o producción de un cultivo, en un año de referencia declarado, dibujado a la resolución que el servicio devuelve para la zona en pantalla.'],
          ['p', 'Una celda con datos es <b>opaca</b>: la rampa ya dice cuál es el número, así que la transparencia no dice nada y pertenece por entero al control de opacidad. Una celda sin cultivo permanece transparente, porque eso es ausencia de datos y no un valor pequeño.'],
          ['lim', 'Es una malla de año de referencia, no en vivo, y el panel dice de qué año. Una estadística nacional no es un mapa de parcelas: cuando necesites la extensión física del suelo cultivado, se ofrece aparte la clase de tierras de cultivo de 10 m de ESA WorldCover, y <b>ambas nunca se mezclan en una sola imagen</b>.']
        ]
      },
      {
        id: 'alerts', nav: 'Avisos', h: 'Avisos meteorológicos y de desastre',
        blocks: [
          ['p', 'Japón lee el flujo en tiempo real de la JMA <b>en la unidad para la que se emite el aviso</b>: incluye un nivel de prefectura y otro de municipio. El mapa se pinta por prefectura y las filas municipales se listan al tocar. El color es el nivel más alto realmente en vigor (aviso de emergencia = morado, aviso = rojo, advertencia = amarillo). Estados Unidos usa el flujo de avisos activos del NWS, que trae su propia geometría.'],
          ['lim', 'Que no se dibuje nada <b>no</b> es lo mismo que que no haya nada en vigor. Al tocar un país cuyo organismo no está conectado, la aplicación lo dice con palabras: no hará una afirmación sobre seguridad con un mapa vacío.']
        ]
      },
      {
        id: 'news', nav: 'Geolocalización de noticias', h: 'Geolocalización de noticias',
        blocks: [
          ['p', 'Situar un artículo en el mapa lo hace <b>código determinista</b>, no un modelo: la extracción, el emparejamiento y la desambiguación son reglas y nomenclátores, y la IA solo explica el significado. La agrupación también es determinista, con bigramas CJK para los titulares en japonés.'],
          ['p', 'La fecha de un artículo <b>no</b> es la fecha del suceso, y ambas se mantienen separadas.']
        ]
      },
      {
        id: 'time', nav: 'Reloj y máquina del tiempo', h: 'Reloj y máquina del tiempo',
        blocks: [
          ['p', 'En la aplicación hay exactamente un reloj. El terminador día-noche, las posiciones de los cuerpos, el año de las estadísticas, el año del comercio y la hora de descarga de los avisos están suscritos a él, de modo que moverse entre «ahora» y un instante pasado es un solo cambio que llega a todas las funciones.'],
          ['p', 'Viajar a un año pasado dibuja también <b>las fronteras de aquella época</b> (la instantánea histórica más próxima en ese año o antes). Nada que solo exista por años se interpola para parecer diario.']
        ]
      },
      {
        id: 'labels', nav: 'Tamaño de las etiquetas', h: 'Tamaño de las etiquetas',
        blocks: [
          ['p', 'Todo tamaño de texto del mapa deriva de una única escalera cuya especificación es una <b>relación</b>, no un valor: una etiqueta que no es de lugar es menor que una etiqueta de lugar. La referencia de las etiquetas que no son de lugar se mantiene aparte, de modo que subir el techo de los nombres de países no infla en silencio las etiquetas de mares, POI y retícula.']
        ]
      },
      {
        id: 'ai', nav: 'Lo que la IA no decide', h: 'Lo que la IA no puede decidir',
        blocks: [
          ['p', 'Atlas (la consola de IA) se encarga del <b>significado</b>; el código se encarga de la <b>ejecución</b>. En concreto:'],
          ['ul', [
            'La IA nunca escribe <b>coordenadas</b>. Nombra lugares como objetivos estructurados (códigos ISO, topónimos) que se resuelven contra conjuntos de datos reales.',
            'Un objetivo irresoluble ni se rescata ni se descarta en silencio: el fallo se devuelve como un hecho.',
            'Si algo ha cambiado lo decide el <b>código</b>; la IA solo escribe la explicación (monitores y alertas).',
            'La IA no puede informar de una acción que no ejecutó; una ejecución parcial se marca como parcial en el resultado.'
          ]]
        ]
      }
    ]
  },

  /* ── las descripciones de las entradas del registro (#R218) ──────────────────────────────────
     El registro en sí (js/reference-data.js) lleva inglés y japonés; los demás idiomas están aquí,
     indexados por el nombre de la entrada. Una entrada sin traducir cae al inglés una a una,
     igual que la prosa de arriba. */
  sourceUse: {
    "CRUST1.0 — global crustal model": "Incluido con la aplicación (data/crust1.bin.gz): el modelo global de corteza a 1° — sedimentos, corteza cristalina y manto superior, cada capa con su velocidad de cizalla, densidad y profundidad. El simulador sísmico construye con él el perfil de velocidades de cada sitio por debajo de 30 m, que es lo que permite que una cuenca amplifique los periodos largos.",
    "USGS Slab2 — subduction zone geometry": "Incluido con la aplicación (data/slab2.bin.gz): profundidad, rumbo y buzamiento de las 27 zonas de subducción activas. El simulador distingue así un sismo de interfaz de uno dentro de la placa que subduce — la misma pregunta y la misma respuesta en todo el planeta.",
    "Bird (2003) PB2002 plate boundaries": "Incluido con la aplicación (data/tectonics.bin.gz): distancia al límite de placas más cercano, su clase y los polígonos de orógenos (deformación difusa). Clasifica el entorno tectónico del sismo y con ello los parámetros publicados de movimiento del suelo.",
    "USGS ShakeMap station lists": "Aceleración y velocidad máximas registradas en instrumentos reales, para puntuar el modelo sísmico frente a observaciones (scripts/seismic-validate.mjs). Solo se descargan al ejecutar esa validación sin conexión; nunca por la aplicación en su navegador.",
    'CARTO basemaps': 'Teselas vectoriales del mapa base (claro/oscuro).',
    'MapLibre GL JS': 'El motor de dibujo predeterminado del mapa (BSD-3-Clause). Dibuja todas las vistas 2D/3D, la proyección de globo y la malla de relieve.',
    'CesiumJS': 'Segundo motor de dibujo opcional (Apache-2.0), seleccionable en Ajustes ▸ Comportamiento del mapa ▸ Motor del mapa. Solo se descarga si se elige. NO usa ningún activo de Cesium Ion ni token de acceso: dibuja las mismas imágenes de satélite de Esri y los mismos datos de elevación AWS terrarium que el motor predeterminado.',
    'Twemoji (Twitter Emoji)': 'Fuente web de banderas alojada por nosotros (TwemojiCountryFlags.woff2) para que los emoji de bandera se vean en plataformas sin glifos propios (por ejemplo Windows). Gráficos con licencia CC-BY 4.0.',
    'Esri World Imagery': 'Imágenes de satélite y etiquetas de lugares; teselas de referencia World Hillshade y World Transportation (capa de sombreado y la imagen de vista previa de la capa de carreteras).',
    'OpenStreetMap': 'Búsqueda de lugares y contornos de lugares/regiones (Nominatim), el curso real de un río al hacer clic en su nombre (#R217) y los datos del mapa base.',
    'NASA GIBS / Worldview': 'Temperatura, precipitación, temperatura superficial del mar, concentración de hielo marino y anomalía de TSM, nieve, índice de aerosoles y de aerosoles UV, monóxido de carbono, humedad del suelo, clorofila oceánica, incendios, vegetación (NDVI), temperatura de la superficie terrestre y del tope de nubes, color natural y sombreado del relieve.',
    'NASA Blue Marble (via NASA EOSDIS GIBS)': 'La imagen base de la Tierra entera incluida con la aplicación (data/world-basemap.jpg — Blue Marble: Shaded Relief and Bathymetry, 2048×1024 equirrectangular). Se dibuja DEBAJO de las teselas de satélite para que el globo nunca esté vacío mientras cargan y, al ser equirrectangular y no Web Mercator, es también la base SIN CONEXIÓN de los casquetes polares más allá de ±85,05° en el motor Cesium, donde las teselas Mercator no llegan. Encima de ella, los casquetes se dibujan con el servicio teselado EPSG:4326 de NASA GIBS (Blue Marble: Shaded Relief and Bathymetry, 500 m), porque una sola imagen equirrectangular tiene UNA única fila de píxeles para sus 0,176° superiores de latitud y la estira en un borrón radial sobre todo el casquete. En el motor MapLibre, donde una imagen equirrectangular no puede envolver el globo, la misma imagen se usa un paso más gruesa: se mide en ejecución el COLOR MEDIO de sus filas polares y se pinta como capa inferior, de modo que los casquetes más allá de ±85,05° sean hielo y no el color de borrado del motor. Ese color es una medida de esta imagen, no un valor elegido. Regenerado por scripts/build-world-basemap.mjs.',
    'NOAA sea-surface currents, wind stress and temperature (CoastWatch / PolarWatch ERDDAP)': 'El conjunto de corrientes marinas incluido (data/ocean-currents.json): 5.484 flechas y 26 corrientes con nombre. ⚠ Tanto las flechas como los TRAZADOS están medidos: una media de ocho compuestos de cinco días del campo global de velocidad superficial a 1/3°, con cada corriente con nombre trazada a través de ese campo por integración numérica desde una semilla publicada sobre su núcleo. Solo el NOMBRE y la semilla son editoriales; ninguna geometría se copia de un mapa. Cálida o fría también se deriva —la componente media hacia el polo a lo largo del trazado—, así que una corriente realmente zonal (la Circumpolar Antártica, los chorros ecuatoriales) sale como «ninguna» y se dibuja en gris. Obra del Gobierno de EE. UU., dominio público.',
    'JPL Solar System Dynamics — planetary satellites': 'Las 177 lunas dibujadas alrededor de los demás planetas (data/moons.json): elementos orbitales medios INCLUIDA la anomalía media en la época 2000-01-01.5 TDB, que es el número que convierte la posición de una luna en una respuesta y no en una colocación, además del plano de referencia propio de cada satélite (la eclíptica, o el plano de Laplace local de su planeta con su polo). Radios medios de la tabla de parámetros físicos acompañante.',
    'Hipparcos Catalog (ESA 1997) — CDS I/239': 'Las 98.887 estrellas tras el globo en modo oscuro (data/stars.bin: ascensión recta, declinación, magnitud V, índice de color B−V y el paralaje medido, hasta V 9,5). Las posiciones se precesan de J2000 al reloj del propio mapa y se giran según el tiempo sidéreo medio de Greenwich, de modo que el cielo es el cielo real de ese instante; los tamaños salen de las magnitudes medidas y los colores del B−V medido. Llegar tan por debajo del límite del ojo desnudo es también lo que dibuja la Vía Láctea: esa banda no es un degradado pintado, es donde las estrellas están realmente. Servido por el Centro de Datos astronómicos de Estrasburgo (CDS); el Bright Star Catalog (Hoffleit & Warren 1991, Harvard–Smithsonian TDC) sigue siendo la fuente de respaldo de la compilación.',
    'NASA/JPL Horizons — interplanetary spacecraft trajectories': 'El grupo «Naves» de Explorar el espacio (data/spacecraft.json): 17 vehículos — Voyager 1 y 2, Pioneer 10 y 11, New Horizons, Parker Solar Probe, Solar Orbiter, Juno, JUICE, Europa Clipper, Lucy, Psyche, BepiColombo, Hayabusa2, OSIRIS-APEX, JWST y Gaia. Posición Y velocidad heliocéntricas en la eclíptica J2000, muestreadas con un paso propio de cada nave (90 días para Voyager, 3 para Parker) e interpoladas en el cliente con Hermite cúbica, para reproducir el trayecto reconstruido en vez de encordarlo. ⚠ Horizons responde sin cabeceras CORS, así que esto se descarga en tiempo de COMPILACIÓN y se incluye; y ⚠ una trayectoria no es telemetría: Pioneer 10 y 11 dejaron de responder en 2003 y 1995 y Gaia fue pasivada en 2025, así que lo que se dibuja para ellas es una posición propagada, y el panel lo dice sin rodeos. Fuera de la cobertura declarada, la aplicación dice que el archivo no lo sabe en lugar de repetir el último punto en silencio. Obra del Gobierno de EE. UU., no sujeta a derechos de autor.',
    'NASA/JPL Small-Body Database (SBDB)': 'El grupo «Asteroides y cometas» de Explorar el espacio (data/small-bodies.json): 1.142 objetos. Los conjuntos masivos se definen por medida, no por gusto: todos los asteroides de 150 km o más, todos los objetos transneptunianos más brillantes que H 5,5, todos los cometas NUMERADOS (es decir, de retorno confirmado) y todos los asteroides potencialmente peligrosos más brillantes que H 18, más una lista explícitamente editorial de objetivos de misiones y cuerpos famosos, incluidos los tres objetos interestelares. Elementos heliocéntricos osculadores, propagados en el cliente como problema de dos cuerpos: elíptico desde el instante del perihelio, hiperbólico para e>1 y ecuación de Barker con e=1. ⚠ Los elementos osculadores describen la órbita en UNA época; las perturbaciones planetarias (y, en un cometa activo, las fuerzas no gravitatorias) apartan al cuerpo real de esa elipse con los años. Suficiente para ver dónde está un cuerpo en el sistema solar, insuficiente para apuntar un telescopio. SBDB no envía cabeceras CORS, así que se incluye en la compilación. Obra del Gobierno de EE. UU.',
    'SIMBAD — CDS, Strasbourg (deep-sky objects and their published distances)': 'El grupo «Más allá del sistema solar» de Explorar el espacio (data/deep-sky.json): 150 objetos — los 110 objetos Messier más el Grupo Local, las galaxias grandes más cercanas, el centro galáctico y los grupos de Virgo, Coma, Fornax y Sculptor. Posiciones y tipos de objeto de la tabla `basic` de SIMBAD; la distancia es la MEDIANA de todas las medidas de distancia que SIMBAD guarda para ese objeto (`mesDistance`), con el número de medidas y los cuartiles al lado. ⚠ Una distancia publicada es una medida con un método detrás, y los métodos discrepan: cefeidas, punta de la rama de gigantes rojas, Tully-Fisher, fluctuación de brillo superficial y corrimiento al rojo pueden diferir en decenas por ciento, que es lo que dicen los cuartiles. 131 de los 150 tienen distancia publicada; los otros 19 se dibujan sobre la esfera celeste SIN profundidad en vez de recibir una inventada. Esto fija también hasta dónde puede retroceder la cámara: el techo es el objeto medido más lejano (unos 72 Mpc), no un número arbitrario. Wenger et al. 2000, A&AS 143, 9 — cite a SIMBAD si lo reutiliza.',
    'REST Countries': 'Datos de referencia de países (capital, moneda, idiomas, países vecinos) para la página de información.',
    'NASA FIRMS': 'Incendios activos y anomalías térmicas.',
    'RainViewer': 'Radar de precipitación en vivo y nubes en infrarrojo.',
    'Open-Meteo': 'Elevación (incluida la malla Copernicus DEM para los resaltes de Atlas por encima/por debajo del nivel del mar), campo de viento, el globo de tiempo en vivo con clic derecho (condiciones actuales y previsión a 5 días) y lecturas en vivo de tiempo, calidad del aire, temperatura del mar y elevación para los widgets y el análisis integrado de Atlas; además del campo espaciotemporal de viento, temperatura y precipitación que impulsa la simulación de dispersión de Atlas.',
    'Open-Meteo Marine': 'Nivel del mar horario sobre el nivel medio para la capa de mareas y — (#R216/#R218) — la velocidad y la dirección de la corriente marina más la temperatura superficial del mar con las que la capa de corrientes integra sus líneas de corriente y las clasifica como cálidas o frías (la temperatura se compara con el mismo modelo unos 110 km aguas arriba).',
    'MET Norway (Locationforecast)': 'Respaldo automático del globo de tiempo puntual cuando Open-Meteo no está disponible (NLOD/CC-BY 4.0).',
    'OSRM (Open Source Routing Machine)': 'Indicaciones por carretera de Atlas: rutas paso a paso en coche, a pie o en bici sobre datos viarios de OpenStreetMap (servidores públicos de demostración router.project-osrm.org y routing.openstreetmap.de; ODbL).',
    'Transitous / MOTIS': 'Indicaciones de transporte público de Atlas: rutas reales de tren, metro, tranvía, autobús y ferri sobre datos GTFS abiertos de todo el mundo (api.transitous.org, motor MOTIS), devolviendo todos los itinerarios alternativos; se envían las coordenadas de origen y destino para calcularlo. Para el ferrocarril interurbano sin horario abierto (por ejemplo JR/Shinkansen en Japón), Atlas recurre a calcular la ruta sobre la red ferroviaria de OpenStreetMap mediante la API Overpass.',
    'Valhalla (FOSSGIS)': 'Isocronas y área alcanzable de Atlas («30 min en coche», «15 min a pie»): polígonos de tiempo sobre la red viaria de OpenStreetMap mediante el servicio público FOSSGIS Valhalla /isochrone sin clave (coche/a pie/bici); se envían la coordenada de origen y los minutos elegidos.',
    'Google Street View': 'Panorámicas incrustadas a pie de calle (el panel «Street View aquí» y la acción de Atlas) mediante la incrustación sin clave de maps.google.com, más la capa real de cobertura de Street View y el ajuste por clic usando las teselas de cobertura sin clave de Google (mts.google.com); imágenes y cobertura © Google.',
    'Global Watersheds (mghydro.com)': 'Delimitación de cuencas en vivo basada en HydroSHEDS para los resaltes de cuencas fluviales de Atlas (crédito: Global Watersheds, mghydro.com).',
    'GRDC / World Bank — Major River Basins of the World': 'Polígonos de las grandes cuencas alojados por nosotros (236 cuencas) para los resaltes de cuencas fluviales de Atlas (CC BY 4.0, incorpora datos de HydroSHEDS).',
    'OpenTopoMap': 'Una tesela de ejemplo como imagen de vista previa de la capa de curvas de nivel (CC-BY-SA).',
    'USGS Earthquake Hazards Program': 'Terremotos en vivo e históricos (capa del mapa, widget, comparación y análisis integrado de Atlas), y los eventos reales que el simulador de ondas sísmicas puede cargar como escenario.',
    'OpenStreetMap Overpass API': 'Cartografía de instalaciones y POI en Atlas: consultas en vivo por área para tipos de instalación con nombre (petróleo, centrales eléctricas, aeropuertos, militares…); y las vías de río o canal con nombre alrededor de una etiqueta fluvial pulsada, cuando Nominatim no puede responder por ese río (#R217) (ODbL).',
    'Wikidata Query Service': 'Cartografía de instalaciones y POI en Atlas: segunda fuente independiente (entidades curadas con coordenadas, fusionadas con los resultados de OSM; CC0). Además, los NOMBRES en ja/de/ru/es del nomenclátor mundial incluido, consultados en compilación por identificador GeoNames (P1566) porque la columna de nombres alternativos de GeoNames no lleva etiqueta de idioma; la consulta en vivo de los cargos actuales (jefe de Estado y de Gobierno) en que se apoyan las respuestas de Atlas sobre dirigentes; el grafo de empresas y participaciones tras la capa de red industrial; y los NOMBRES de las corrientes marinas del mundo con sus coordenadas publicadas (CC0).',
    'GeoNames': 'El nomenclátor mundial incluido data/gazetteer-world.json.gz: 147.924 lugares habitados en 242 países (coordenadas, población y país de la exportación cities1000; nombres en 18 idiomas de alternateNamesV2, que a diferencia de la columna en línea lleva un código de idioma ISO por nombre), comprimido a 3,9 MB y descomprimido en el navegador. Generado por scripts/build-gazetteer.mjs. Es lo que permite que la localización de noticias sin IA y el cuadro de búsqueda resuelvan lugares diez veces más lejos en la cola larga que la tabla curada por sí sola. CC BY 4.0.',
    'geoBoundaries': 'Límites administrativos (ADM1) para las composiciones de región de Atlas: fuente de respaldo de límites (CC BY 4.0).',
    'GDELT Project': 'Búsqueda mundial de noticias en vivo (últimas 72 h) que alimenta los informes y el análisis integrado de Atlas.',
    'Market data (fxratesapi / ER-API · gold-api · CoinGecko · alternative.me)': 'Tipos de cambio, oro y plata, precios de criptomonedas e indicadores de sentimiento: widgets y el teletipo inferior.',
    'Yahoo Finance': 'Cotizaciones de índices bursátiles para el teletipo inferior y precios de acciones en vivo para calcular la capitalización de mercado en la pestaña Empresas (valores cotizados en EE. UU.).',
    'Clearbit Logo API / Google favicons': 'Logotipos de empresas en la pestaña Empresas: se envía el dominio de la empresa para obtener su logotipo (con respaldo en los favicons de Google y después un monograma).',
    'Wikipedia (Wikimedia REST API)': 'Comprobación de artículos para los globos de lugar y resúmenes de contexto para el análisis de Atlas (CC BY-SA).',
    "Data centers — OpenStreetMap (telecom/man_made/building = data_center, Overpass API)": "Todos los centros de datos cartografiados en OpenStreetMap, consultados en vivo según la vista del mapa (ODbL). Cada punto lleva las etiquetas del propio objeto —operador, propietario, potencia, fecha de apertura— y las muestra sin cambios; no se infiere nada",
    "Diplomatic missions — OpenStreetMap (amenity=embassy / office=diplomatic, Overpass API)": "Embajadas, consulados y otras misiones diplomáticas de OpenStreetMap, consultadas en vivo para la vista actual del mapa (ODbL). Cada punto muestra las etiquetas del propio objeto y enlaza a él; nada se infiere",
    "Military sites — OpenStreetMap (military=*, Overpass API)": "Aeródromos, bases navales, cuarteles, campos de tiro y zonas peligrosas etiquetados `military` en OpenStreetMap, para la vista actual (ODbL). Solo el registro público — nada procede del análisis de imágenes ni se estima",
    "Power plants & grid — OpenStreetMap (power=plant/substation/generator, Overpass API)": "Centrales, subestaciones, aerogeneradores y plantas solares de OpenStreetMap, consultadas en vivo para la vista actual (ODbL). Potencia, combustible, tensión y operador salen de las etiquetas del objeto; nada se estima",
    "Mines, quarries & wells — OpenStreetMap (landuse=quarry, man_made=mineshaft/petroleum_well, Overpass API)": "Minas, canteras, pozos mineros y pozos de petróleo o gas de OpenStreetMap, en vivo para la vista actual (ODbL)",
    "Airports & air infrastructure — OpenStreetMap (aeroway=aerodrome/terminal/heliport, Overpass API)": "Aeropuertos, aeródromos, terminales, helipuertos y torres de control de OpenStreetMap, en vivo para la vista actual (ODbL). Código OACI/IATA, longitud de pista y altitud solo si el objeto los lleva",
    "Ports, harbours & terminals — OpenStreetMap (harbour, landuse=port, ferry terminals, Overpass API)": "Puertos, dársenas, terminales de ferry, de contenedores y de carga y grúas de OpenStreetMap, en vivo para la vista actual (ODbL)",
    "Water & wastewater plant — OpenStreetMap (man_made=water_works/wastewater_plant/pumping_station, Overpass API)": "Potabilizadoras, depuradoras, estaciones de bombeo, depósitos y torres de agua de OpenStreetMap, en vivo para la vista actual (ODbL)",
    "Universities & research institutes — OpenStreetMap (amenity=university/college/research_institute, Overpass API)": "Universidades, centros superiores, institutos de investigación, observatorios y bibliotecas de investigación de OpenStreetMap, en vivo para la vista actual (ODbL)",
    "Emergency services — OpenStreetMap (fire_station / police / ambulance_station, Overpass API)": "Parques de bomberos, comisarías, bases de ambulancias y puestos de rescate de montaña de OpenStreetMap, en vivo para la vista actual (ODbL)",
    "Spaceports & satellite ground stations — OpenStreetMap (aeroway=spaceport, man_made=launch_pad/satellite_dish, Overpass API)": "Rampas de lanzamiento, puertos espaciales, estaciones terrenas y radiotelescopios de OpenStreetMap, en vivo para la vista actual (ODbL)",
    "Health facilities — OpenStreetMap (amenity=hospital/clinic/doctors/pharmacy, Overpass API)": "Hospitales, clínicas, consultorios y farmacias de OpenStreetMap, para la vista actual (ODbL). Camas, especialidad, operador y horario solo cuando el objeto lleva la etiqueta",
    "Telecom & internet infrastructure — OpenStreetMap (telecom=*, communications towers, Overpass API)": "Puntos neutros, centrales telefónicas, mástiles y torres de comunicación de OpenStreetMap, para la vista actual (ODbL) — la planta física sobre la que funciona la red",
    "AWS Global Infrastructure — regions": "La lista oficial de regiones de AWS y sus ubicaciones, para los puntos de nube de la capa «Centros de datos e infraestructura de IA» (una región es la ubicación que publica el operador, no un edificio topografiado)",
    "Microsoft Azure — datacenter locations": "El mapa de regiones de centros de datos de la propia Microsoft, para los puntos de Azure de la misma capa",
    "Google Cloud — locations": "Las regiones publicadas y los campus propios de Google Cloud, para los puntos de Google de la misma capa",
    "Oracle Cloud — public cloud regions": "La lista publicada de regiones OCI de Oracle, para los puntos de Oracle de la misma capa",
    "Meta — data centers": "La lista de emplazamientos de centros de datos de la propia Meta, para los puntos de Meta de la misma capa",
    "TOP500 — supercomputer sites": "La lista TOP500 de los superordenadores más rápidos del mundo, para los puntos de HPC e investigación de la misma capa",
    'Live cameras — OpenStreetMap (Overpass API)': 'Puntos de webcams públicas de todo el mundo, consultados en vivo desde OSM según la vista del mapa (etiquetas contact:webcam / webcam, ODbL) y FILTRADOS a las cámaras que realmente muestran imagen dentro de la aplicación: imagen que se actualiza, directo de YouTube, Roundshot · Panomax 360° o vídeo (se descartan las que solo enlazan); la imagen fija se actualiza sola en el globo (sin clave de API).',
    'Transport for London — JamCams': 'Unas 880 cámaras de tráfico en vivo de Londres (API unificada de TfL sin clave, lugares «JamCam»): cada una un JPEG que se actualiza más un clip corto, mostrados con actualización automática en la capa de cámaras en vivo (Powered by TfL Open Data; contiene datos de OS © Crown copyright).',
    'Caltrans — California DOT CCTV': 'Unas 3.300 cámaras de tráfico en vivo de California (JSON abierto de estado de CCTV de los 12 distritos, sin clave): JPEG directos que se actualizan, mostrados en la capa de cámaras en vivo (© Departamento de Transporte de California).',
    'Fintraffic / Digitraffic — Finland road-weather cameras': '811 estaciones finlandesas de cámaras de carretera y meteorología / 2.272 vistas en vivo (API Digitraffic sin clave y con CORS abierto): JPEG directos y deterministas, con actualización automática y selector de vista por estación en la capa de cámaras en vivo (© Fintraffic, CC BY 4.0).',
    'OpenTrafficCamMap — US state DOT cameras': '1.815 cámaras de tráfico en vivo más de EE. UU. (DOT de Colorado, Indiana, Alaska y Arizona) del conjunto abierto OpenTrafficCamMap con licencia MIT, servido sin clave desde la CDN de jsDelivr (commit fijado); solo se muestran las fuentes cuyas imágenes admiten enlace directo comprobado. Imágenes © los respectivos DOT estatales.',
    'US / Canada DOT “511” traffic cameras': 'Unas 17.000 cámaras de tráfico en vivo más de 13 redes «511» de estados de EE. UU. y provincias de Canadá (Florida, Georgia, Nueva York, Pensilvania, Carolina del Norte, Nevada, Wisconsin, Idaho, Luisiana, Nueva Inglaterra, Ontario, Alberta, Yukón) sobre la plataforma común «511». La lista de cámaras de cada sitio se obtiene una vez mediante un relé CORS público (esos puntos no envían cabecera CORS); cada imagen se enlaza directamente y se actualiza sola en la capa de cámaras en vivo. Imágenes © los respectivos DOT estatales y provinciales.',
    'Mapzen / AWS Terrain Tiles — elevation model (DEM)': 'Teselas públicas de relieve RGB «terrarium» sin clave (AWS Open Data). Se decodifican en el cliente en un muestreador de elevación que alimenta el análisis de pendiente y orientación, la cuenca visual por línea de vista, la cobertura radioeléctrica, el simulador de modelado del relieve y encaminamiento del agua, el motor de sombras del terreno y horas anuales de sol, y la inundación por crecida y tsunami. Construido a partir de SRTM, ETOPO1 y fuentes nacionales de elevación; la atribución completa está en el registro.',
    'IASP91 reference Earth model — Kennett & Engdahl (1991)': 'El modelo radial de velocidades P y S por el que el simulador de ondas sísmicas traza rayos para obtener los tiempos de viaje P/S, las triplicaciones de la curva de tiempos y la zona de sombra del núcleo. Verificado contra las tablas IASP91 publicadas (P a 30°/60°/90° con unos pocos segundos de diferencia).',
    'Brune (1970) source model · Hanks & Kanamori (1979) · Boore stochastic method': 'La cadena de movimiento del suelo para fuente puntual en el simulador sísmico: momento sísmico a partir de la magnitud, frecuencia de esquina a partir de la caída de esfuerzos, espectro de campo lejano con dispersión geométrica trilineal, atenuación anelástica y amplificación de sitio de un cuarto de longitud de onda, convertidos a valores pico por teoría de vibraciones aleatorias.',
    'Wald, Quitoriano, Heaton & Kanamori (1999) — PGV → Modified Mercalli intensity': 'La relación con la que el simulador declara una intensidad (MMI = 3,47 log10 PGV + 2,35). Es MMI, no la escala shindo de la JMA, y solo se muestra dentro del rango sobre el que se ajustó la regresión.',
    'Wald & Allen (2007) — topographic slope → Vs30 site proxy': 'El indicador global de condiciones de sitio del USGS con el que el simulador pinta un campo de intensidad sensible al relieve: Vs30 estimada a partir de la pendiente topográfica del MDE real (tabla para zonas tectónicamente activas), que entra celda a celda en la amplificación de un cuarto de longitud de onda. Las celdas de mar y las que no tienen MDE se informan, no se pintan.',
    '気象庁「計測震度の算出方法」 (JMA instrumental seismic intensity)': 'El shindo de la JMA que muestra el simulador se calcula según la definición propia de la JMA y no se convierte desde PGV: se aplican al espectro de aceleración del modelo el filtro de periodo y los cortes en 10 Hz y 0,5 Hz, se resuelve por teoría de vibraciones aleatorias el nivel a₀ superado durante 0,3 s en TOTAL, y I = 2·log₁₀ a₀ + 0,94. Las tres componentes se isotropizan con V/H = 2/3 en lugar de simularse por separado, y el panel lo indica. Sustituye la regresión sobre PGV de Fujimoto y Midorikawa (2005) usada hasta #R191.',
    'Okada (1985) · Wells & Coppersmith (1994) · Atkinson & Silva (2000)': 'La solución cerrada de Okada para la deformación superficial de una dislocación rectangular da el desplazamiento cosísmico del fondo marino con el que arranca el modelo de propagación del tsunami (verificada contra el caso de prueba publicado antes de usarla); el escalado de falla inversa de Wells y Coppersmith da longitud, anchura y deslizamiento a partir de la magnitud; y el espectro de fuente de dos esquinas de Atkinson y Silva sustituyó a la única esquina de Brune, que subestimaba las frecuencias intermedias de los grandes terremotos. El campo de Okada se suma sobre una malla de subfallas 8×3 con atenuación en los bordes y se renormaliza para que el momento sísmico sea exactamente el que implica la magnitud.',
    'Kotani et al. (1998) — Manning roughness for tsunami run-up computation': 'El coeficiente de fricción de fondo que usa el modelo de propagación del tsunami (rugosidad de Manning n = 0,025 s·m^(−1/3) sobre fondo oceánico), el valor con el que se ejecutan los modelos operativos japoneses de onda larga. En aguas profundas la fricción es despreciable (escala como la profundidad total elevada a −7/3) y es lo que limita la ola sobre una plataforma continental, así que un modelo de onda larga sin fricción sobrestima la amplitud costera.',
    'Kasten & Young (1989) air mass · Meinel & Meinel clear-sky beam': 'La irradiancia directa normal en cielo despejado que hay detrás del motor de horas anuales de sol (1361 W/m² · 0,7^AM^0,678). Es una cifra de cielo despejado calculada a partir del horizonte real del terreno en ese punto: no es una previsión meteorológica ni una estimación de producción.',
    'GEBCO 2020': 'Batimetría oceánica (lectura de profundidad).',
    'AWS Terrain Tiles': 'Relieve 3D, sombreado y generación de curvas de nivel.',
    'Beck et al. Köppen-Geiger (2018)': 'Clasificación de zonas climáticas a 1 km.',
    'MarineRegions': 'Límites marítimos: ZEE y mar territorial.',
    'TeleGeography Submarine Cable Map': 'Trazados de cables submarinos de telecomunicaciones.',
    'NASA SEDAC GPW v4': 'Densidad de población en malla.',
    'UNDP / EIU / SIPRI / World Bank': 'IDH, índice de democracia, PIB, gasto militar, demografía.',
    'AISstream.io': 'Tráfico marítimo AIS en vivo (con su clave).',
    'airplanes.live': 'Tráfico aéreo en vivo (ADS-B comunitario; también proporciona la imagen de vista previa de la capa de aeronaves).',
    'CelesTrak': 'Conjuntos de elementos orbitales (GP/OMM, el sucesor moderno del conjunto de dos líneas) para la capa de satélites en vivo, por grupo de catálogo. Sin clave y con CORS abierto; gratuito para uso no comercial con atribución. NO se descargan posiciones, sino los conjuntos de elementos, una vez cada dos horas, y cada posición en pantalla se propaga localmente a partir de ellos con SGP4/SDP4 (satellite.js, MIT), de modo que desplazar el mapa o avanzar el tiempo no cuesta peticiones. TAMBIÉN SE INCLUYEN DOS COSAS CON LA APLICACIÓN, ambas regeneradas por CI desde esta misma fuente: data/tle/catalogue.tle, una instantánea real del catálogo `active` con época real, para que la capa siga dibujándose cuando celestrak.org no es accesible (la aplicación indica qué antigüedad tienen los elementos usados); y data/tle/groups.json, los números de catálogo NORAD de cada grupo de CelesTrak, para que una petición de una CATEGORÍA pueda responderse desde esa instantánea en vez de no dibujar nada. La pertenencia a un grupo no se deduce de un conjunto de elementos y nunca se infiere del nombre: un grupo cuyo listado no se pudo obtener se registra como ausente, no como vacío.',
    'satellite.js': 'El propagador orbital SGP4/SDP4 que hay detrás de cada posición de satélite, huella, traza terrestre, ángulo de observación y predicción de paso de la aplicación (licencia MIT). Verificado contra el vector de prueba canónico de Vallado con 7 micrómetros de error y contra los elementos reales de la ISS (436,6 km, 7,650 km/s, 92,96 min, 51,631°).',
    'Planespotters.net': 'Fotografía del avión concreto en la ficha de detalle, buscada por la dirección ICAO de 24 bits que informa el flujo ADS-B. API pública de fotos sin clave, gratuita para uso no comercial; cada foto se muestra con el crédito de su autor y enlaza al original: ninguna foto se almacena ni se rehospeda, y no se envía nada sobre usted (toda la petición es el código hex del avión).',
    'NOAA SWPC': 'Óvalo auroral (OVATION) e índice K planetario: la capa de auroras y su imagen de vista previa.',
    'Natural Earth': 'Fronteras y polígonos de países; límites de husos horarios (capa de husos horarios); y la máscara de tierra y mar incluida data/land-mask.png, los polígonos físicos de tierra a escala 1:50 M rasterizados por scripts/build-land-mask.mjs en una malla equirrectangular de 1 bit y 2048×1024, para que el campo de intensidad distinga tierra de mar sin preguntar a la red (antes leía teselas de relieve para esto y pintaba el océano siempre que llegaban demasiado pocas). Dominio público.',
    'AWS Terrain Tiles — the bundled global sea floor': 'data/bathymetry.png: los mismos datos públicos de elevación terrarium, leídos una vez en compilación para todo el mundo (scripts/build-bathymetry.mjs) y distribuidos como una malla de 1440×720 (0,25°) que lleva la profundidad media de las muestras marinas de cada celda y su fracción de mar. Es sobre lo que integra el modelo GLOBAL de propagación de tsunamis, de modo que cada celda del planeta tiene una profundidad medida antes del primer paso temporal, en lugar de que la aplicación pida mil teselas y modele las que lleguen. Batimetría de ETOPO1; atribución completa en el registro.',
    'Solar System Scope — planetary surface textures': 'Los mapas de superficie equirrectangulares con los que Explorar el espacio dibuja cada mundo (data/planets/*.jpg — todos menos la Tierra, que desde #R203 se dibuja con la propia data/world-basemap.jpg de la aplicación para que el explorador y el mapa muestren UNA sola Tierra), montados por Solar System Scope a partir de imágenes de NASA/JPL/USGS: MESSENGER para Mercurio, radar Magellan para Venus, LRO para la Luna, Viking/MOLA para Marte, Cassini y Voyager para los gigantes. Distribuidos byte a byte tal como se publicaron. Licencia CC BY 4.0. Plutón no está entre ellos y se dibuja con su color medido, no con una superficie inventada.',
    'USGS Gazetteer of Planetary Nomenclature': 'Los topónimos aprobados por la UAI en los demás mundos (data/planet-names.json): 2.772 formaciones en Mercurio, Venus, la Luna, Marte y Plutón con sus coordenadas centrales, diámetros y tipos publicados, de modo que un planeta se etiqueta igual que la Tierra. Dominio público; la autoridad de nomenclatura es la UAI.',
    'OpenRailwayMap / OpenSeaMap': 'Infraestructura ferroviaria mundial y señalización náutica como superposición (teselas ráster, beta).',
    'Wikipedia / Wikimedia': 'Fichas informativas e imágenes.',
    'Public CORS relays (allorigins.win, corsproxy.io, corsfix.com, codetabs.com)': 'NO es una fuente de datos, sino una forma de LLEGAR a una. El RSS de Google News, algunos índices de cámaras «511» y unas pocas fuentes más no envían la cabecera Access-Control-Allow-Origin, así que un navegador no puede leerlas directamente; estos relés públicos descargan el documento en el servidor y lo vuelven a servir con la cabecera. Lo que ve un relé es la URL solicitada (la dirección de una fuente pública) y la conexión en sí; jamás se envían por ahí cuentas, coordenadas ni datos personales. Los cuatro compiten con un plazo de 8 segundos cada uno y los perdedores se abortan, así que uno caído o lento no puede retener la página. ⚠ NO SON INTERCAMBIABLES SEGÚN EL DESTINO, y eso está medido, no supuesto: en esta compilación Google sirvió la edición de noticias de EE. UU. a través de corsproxy.io en 5 ms y respondió al MISMO proxy con su página de bloqueo «Sorry…» (503) para la edición japonesa, que es por lo que la fuente japonesa estaba vacía hasta que se añadió un cuarto relé. Donde se usa un relé, se indica en la entrada de la propia fuente.',
    'Google News': 'Titulares de noticias (RSS): descargados y geolocalizados en el servidor; también consultados en vivo desde el navegador para la búsqueda web de Atlas (se envía el nombre del tema). El MEDIO DE ORIGEN de cada pieza lo lleva la propia fuente (Google News lo añade al titular tras el último « - »), y de ahí sale la lista de Ajustes ▸ Medios de noticias: los medios ofrecidos son los que la fuente actual entrega realmente, contados, y no una lista mantenida aquí. Elegir medios filtra lo que se muestra; no cambia lo que se descarga, y nunca se infiere el nombre de un medio.',
    'Google Fonts (Noto Sans JP / SC / TC)': 'No es una fuente de datos, sino las tipografías para japonés, chino simplificado y chino tradicional. Google Fonts las divide en unos 120 subconjuntos por rango Unicode, así que una página descarga los ~30 KB de sus propios glifos en vez de una fuente de 5 MB. El servidor de fuentes sólo ve la petición del archivo y la conexión: ninguna cuenta, ninguna coordenada, ningún dato personal. Todas las demás se sirven desde este sitio (véase fonts/README.md).',
    'Inter / Pretendard (bundled, SIL OFL 1.1)': 'Las tipografías latina/cirílica y coreana, incluidas con el sitio — junto con los atlas de glifos SDF con los que se dibujan las etiquetas del mapa (ningún servidor público de glifos publica Inter). Licencias y atribución: fonts/README.md.',
    'OpenFreeMap / OpenMapTiles': 'Etiquetas vectoriales de lugares y huellas de edificios en 3D.',
    'ESA WorldCover': 'Clasificación global de cobertura del suelo a 10 m.',
    'RESOLVE / WWF Ecoregions 2017': 'Ecorregiones terrestres.',
    'Smithsonian GVP': 'Volcanes del Holoceno.',
    'DeepStateMap': 'Línea del frente en Ucrania (capa beta).',
    'historical-basemaps (aourednik)': 'Fronteras históricas: la capa beta de superposición y el respaldo automático de las fronteras de años pasados del propio mapa (la instantánea más cercana).',
    'CShapes 2.0 (Schvitz et al., ETH Zürich)': 'Fronteras internacionales anuales de 1886 a 2019 para la máquina del tiempo (cada cambio fechado por año; copia simplificada alojada por nosotros). Las fronteras de Alemania Oriental/Occidental/unificada de 1945 a 2019 se reconstruyeron a partir de los Länder modernos de referencia (deutschlandGeoJSON, © GeoBasis-DE / BKG) para que la frontera interalemana coincida con la realidad.',
    'Maddison Project Database 2020 (Bolt & van Zanden)': 'PIB real HISTÓRICO de referencia (dólares internacionales constantes de 2011) y población desde 1900 para la máquina del tiempo: la pestaña de países, los mapas coropléticos y la comparación de países al viajar antes del límite de 1960 del Banco Mundial y para Estados desaparecidos (la antigua URSS, Yugoslavia y Checoslovaquia son entidades propias en Maddison).',
    'World Bank Open Data': 'Series temporales de indicadores por país (gráficos de series, la comparación de hasta cinco países y la máquina del tiempo: toda la pestaña de países, las lecturas al pasar el cursor y los coropléticos muestran las cifras reales del año en que está puesto el reloj maestro).',
    'IMF World Economic Outlook': 'Relleno de huecos en la capa de deuda pública y fuente económica alternativa en la comparación de países (API DataMapper).',
    'WorldPop (University of Southampton)': 'Población dentro de un área dibujada, un círculo o el límite de un lugar: sumada de la malla global de población de unos 100 m mediante la API estadística de WorldPop.',
    'AI provider — OpenAI (Anthropic / Google selectable)': 'IA en el servidor (la clave se guarda en el servidor): asistente Atlas, geolocalización de noticias, funciones de IA dentro de la aplicación y búsqueda web para preguntas de actualidad.'
  }
});
