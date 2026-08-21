/* ============================================================================
 *  IntMap · Reading pages — DEUTSCH  (#R218)
 *  Eine Datei je Sprache; Aufbau des Dokuments und die Kosten einer weiteren Sprache stehen
 *  im Kopf von js/page-i18n.js. Fehlende Schlüssel fallen einzeln auf Englisch zurück.
 * ========================================================================== */
/* ⚠ the one-line bootstrap: on sources.html / science.html js/page-i18n.js has already run and
   this is a no-op; inside the app (where that file is never loaded) it creates a minimal registry so
   the Sources dialog can lazily read this file for the translated source descriptions. */
window.IntMapPageI18N=window.IntMapPageI18N||{_d:{},define:function(c,d){this._d[c]=d;},doc:function(c){return this._d[c];}};
window.IntMapPageI18N.define('de', {

  common: {
    backToMap: 'Zurück zur Karte',
    contents: 'Inhalt',
    toScience: 'Wissenschaft & Logik',
    toSources: 'Datenquellen'
  },

  /* ══════════════════════════════════════════════════════════════════════════════════════════ */
  sources: {
    title: 'Datenquellen',
    meta: 'Jede Organisation, deren Daten IntMap zeigt: wo sie verwendet werden, wie sie abgerufen werden, ihre Lizenz und was das für Ihre Privatsphäre bedeutet.',
    sub: 'Jede Zahl, jede Linie und jedes Bild, das IntMap zeigt — und <b>woher es stammt</b>. Was daraus berechnet wird, steht auf der Seite <a href="./science.html">Wissenschaft &amp; Logik</a>.',
    footer: [
      'Diese Seite listet die <b>Datenanbieter</b> auf. Wie aus diesen Daten gerechnet wird, steht auf der Seite <a href="./science.html">Wissenschaft &amp; Logik</a>.<br>Wenn Sie hier einen Fehler finden, melden Sie ihn bitte über das Feedback-Formular in der App.'
    ],
    sections: [
      {
        id: 'what', nav: 'Über diese Seite', h: 'Über diese Seite',
        blocks: [
          ['tagline', 'Alles, was IntMap zeigt, wurde von einer externen Organisation gemessen und veröffentlicht. Diese Seite nennt diese Organisationen.'],
          ['p', 'IntMap erzeugt keine eigenen Daten. Die App holt, was Wetterdienste, die NASA, UN-Organisationen, Universitäten und die OpenStreetMap-Gemeinschaft veröffentlichen, und zeichnet es auf einer einzigen Karte. Wie verlässlich eine Zahl auf dem Bildschirm ist, hängt von der Organisation ab, die sie veröffentlicht hat — und hier können Sie nachsehen, welche das ist.'],
          ['p', 'Die Liste unten zeigt die Anbieter, die die App tatsächlich verwendet; sie wächst mit der Karte. Um etwas Bestimmtes zu finden, filtern Sie nach einem Ebenennamen (&ldquo;Gezeiten&rdquo;, &ldquo;Feldfrüchte&rdquo;) oder nach der Organisation.']
        ]
      },
      {
        id: 'live', nav: 'Wie aktuell die Daten sind', h: 'Wie aktuell die Zahlen sind',
        blocks: [
          ['tagline', 'Wie aktuell die Daten sind, hängt von der Ebene ab. Die Tabelle zeigt, welchen Zeitpunkt jede Art von Ebene darstellt.'],
          ['table',
            ['Art', 'Welchen Zeitpunkt Sie sehen', 'Beispiele'],
            [
              ['Beim Ansehen abgerufen', 'Den Moment, in dem Sie sie eingeschaltet haben. Erdbeben werden im Minutentakt aktualisiert, Warnungen etwa alle fünf Minuten neu gelesen', 'Erdbeben, Warnungen, Wetter, Flugzeuge, Satellitenbilder'],
              ['Jahresstatistik', 'Das zuletzt veröffentlichte Jahr — und die App schreibt immer dazu, welches Jahr das ist', 'Handel, Energiemix, Bevölkerung, Wirtschaftsindikatoren'],
              ['Ein Referenzjahr', 'Eine Beobachtung eines angegebenen Jahres; nichts danach ist enthalten', 'Feldfrüchte (2000, 2010), Klimazonen (1901&ndash;2020)'],
              ['Mit der App ausgeliefert', 'Beim letzten App-Update erfasst; dieselbe Antwort ganz ohne Netz', 'Grenzen, Küstenlinien, Meeresboden, Sternkatalog, Planetentexturen, Bahnelemente von Satelliten']
            ]
          ],
          ['lim', '<b>Gut zu wissen</b> — Manche Daten entfernen sich mit der Zeit von der Wirklichkeit; Bahnelemente von Satelliten sind das deutlichste Beispiel. Für solche Ebenen zeigt das Panel das Datum der Erfassung. Ältere Daten werden nie so dargestellt, als wären sie aktuell.']
        ]
      },
      {
        id: 'privacy', nav: 'Was eine Ebene sendet', h: 'Was beim Öffnen einer Ebene passiert',
        blocks: [
          ['tagline', 'Ihr Browser holt die Daten direkt beim Anbieter.'],
          ['p', 'IntMap verwendet fast keine Relay-Server: Kacheln, Wetter, Erdbeben und alles Übrige fordert Ihr Gerät direkt beim Anbieter an. In dessen Zugriffsprotokollen stehen daher <b>Ihre IP-Adresse und die angeforderten Kartenkacheln</b>, was ungefähr angibt, welchen Bereich Sie betrachtet haben. Das ist in anderen Kartenanwendungen genauso, wird hier aber der Klarheit halber gesagt.'],
          ['p', 'Ihr Standort wird nur auf Ihrem Gerät verwendet. Koordinaten verlassen es nur, wenn Sie etwas zu einem Ort fragen — eine Suche, eine Route, eine Vorhersage. Konten, KI-Funktionen und Monitore behandelt der Datenschutz-Dialog in der App.']
        ]
      },
      {
        id: 'licence', nav: 'Wer die Daten gemacht hat', h: 'Wer diese Daten gemacht hat, und die Bedingungen',
        blocks: [
          ['tagline', 'Die Namensnennung ist von diesen Lizenzen gefordert — und sie ist zugleich der Weg zu erkennen, wessen Arbeit eine Zahl ist.'],
          ['ul', [
            '<b>OpenStreetMap</b> (ODbL 1.0) &mdash; die von Freiwilligen gebaute Karte: Straßen, Schienen, Gebäude, Orte und Verwaltungsgrenzen, dazu die Basisdaten für das Routing. Auf der Karte durchgehend genannt.',
            '<b>Werke der US-Regierung</b> (NASA, NOAA, USGS, NWS &hellip;) &mdash; in der Regel gemeinfrei: Bilddaten, Erdbeben, Stadtlichter, Planetenpositionen. Logos und Hoheitszeichen der NASA sind es nicht.',
            '<b>Nationale Wetterdienste</b> &mdash; Warnungen werden so gezeigt, wie die herausgebende Stelle sie veröffentlicht hat, und die Stelle wird immer genannt.',
            '<b>Natural Earth</b> &mdash; gemeinfreie Grenzen und Küstenlinien.',
            '<b>Our World in Data</b> (CC BY 4.0) &mdash; Statistiken zu Strom, Energie und Feldfrüchten, jeweils mit dem ursprünglichen Ersteller (Ember, Energy Institute, FAO) daneben.',
            '<b>Weltbank</b>, <b>FAO</b>, <b>Wikipedia / Wikidata</b> &mdash; jeweils nach den eigenen Bedingungen des Anbieters, genannt in dem Panel, das sie verwendet.'
          ]],
          ['note', 'Jeder Eintrag verlinkt auf die Seite des Anbieters, wo der vollständige Lizenztext steht. Die Beschreibungen hier sind Zusammenfassungen und gehen diesem Text nicht vor.']
        ]
      },
      {
        id: 'limits', nav: 'Was eine Quelle nicht sagt', h: 'Was eine Quelle nicht sagt',
        blocks: [
          ['tagline', 'Eine genannte Quelle bedeutet für sich genommen nicht, dass die Daten genau, aktuell oder auf Ihren Standort anwendbar sind.'],
          ['ul', [
            '<b>Eine nationale Summe ist kein lokaler Wert.</b> Eine über ein Land gelegte Landesstatistik sagt nicht, woher im Land die Zahl kommt. Die Färbung wechselt an der Grenze; das beschriebene Phänomen meist nicht.',
            '<b>Wo es keinen Datenstrom gibt, sagt die App das in Worten.</b> Eine leere Karte ist keine Aussage darüber, dass keine Warnungen gelten.',
            '<b>Ein Simulationsergebnis ist keine Quelldatei.</b> Die Ergebnisse zu Erdbeben, Tsunami, Überflutung und Sonnenlicht werden aus den hier gelisteten Daten berechnet. Gleichungen, Annahmen und Grenzen stehen auf der Seite <a href="./science.html">Wissenschaft &amp; Logik</a>.',
            '<b>Folgen Sie im Notfall immer den offiziellen Behörden.</b> Was diese Anwendung zeigt, dient nur zur Orientierung.'
          ]]
        ]
      },
      {
        id: 'list', nav: 'Die Liste nach Thema', h: 'Die Liste, nach Thema', count: 'src-count',
        blocks: [
          ['tagline', 'Ein Eintrag ist ein Anbieter, mit Namen, der Verwendung in IntMap und einem Link auf seine eigene Seite.'],
          ['slot', 'src-panel']
        ]
      }
    ],
    filterPh: 'Filtern — Erdbeben, Gezeiten, NASA…',
    entries: 'Einträge',
    loading: 'Wird geladen…',
    loadFail: 'Die Liste konnte nicht geladen werden — bitte laden Sie die Seite neu.',
    noMatch: 'Keine Quelle passt zu diesem Filter.',
    groups: {
      base: 'Basiskarte, Gelände, Höhen',
      imagery: 'Bilddaten & Fernerkundung',
      weather: 'Wetter, Ozean, Klima',
      hazard: 'Erdbeben, Gefahren, Warnungen',
      space: 'Weltraum & Astronomie',
      econ: 'Wirtschaft, Statistik, Energie',
      geo: 'Länder, Grenzen, Ortsnamen',
      transit: 'Verkehr, Routing, Luftfahrt, Schifffahrt',
      news: 'Nachrichten & Nachschlagewerke',
      other: 'Sonstiges'
    }
  },

  /* ══════════════════════════════════════════════════════════════════════════════════════════ */
  science: {
    title: 'Wissenschaft &amp; Logik',
    meta: 'Welche Daten jede IntMap-Funktion und jede Simulation verwendet, mit welchen Gleichungen und unter welchen Annahmen.',
    sub: 'Was jede IntMap-Funktion tatsächlich berechnet, aus welchen Daten und unter welchen Annahmen. Getrennt von der Quellenliste: hier geht es um die <b>Methode</b>.',
    footer: [
      'Diese Seite dokumentiert die <b>Methode</b>. Die Liste der Datenanbieter steht auf der Seite <a href="./sources.html">Datenquellen</a>.<br>Wenn Sie hier einen Fehler finden, nutzen Sie bitte das Feedback in der App.'
    ],
    sections: [
      {
        id: 'principles', nav: 'Grundsätze', h: 'Grundsätze',
        blocks: [
          ['tagline', 'Vier Zusagen, die für jede Funktion unten gelten.'],
          ['h3', '① Keine Platzhalterdaten'],
          ['p', 'Jede Zahl ist gemessen, beobachtet oder veröffentlicht. Nichts wird erzeugt, damit es plausibel aussieht. Scheitert ein Abruf, <b>sagt die App, dass er gescheitert ist</b>, statt etwas Vernünftig-Aussehendes einzusetzen.'],
          ['h3', '② Jede Obergrenze wird genannt'],
          ['p', 'Berechnungen haben Budgets — Weglänge, Kachelzahl, Gittergröße. Ein erreichtes Budget stillschweigend als Ergebnis auszugeben, wäre die Behauptung, das Phänomen ende dort; ein angeschlagenes Budget steht deshalb immer in der Antwort.'],
          ['h3', '③ Keine Aussage feiner als die Daten'],
          ['p', 'Ein Gerinne schmaler als eine Höhenstichprobe oder eine Überflutung feiner als eine Solverzelle wird in der Auflösung der Daten gezeichnet, und die Anzahl solcher Fälle wird <b>berichtet</b>, nicht versteckt.'],
          ['h3', '④ Jedes Modell nennt, was es nicht beantwortet'],
          ['p', 'Das Wassermodell beantwortet „wo steht es und wohin fließt es ab“, nicht „wie schnell läuft die Front“. Jedes Panel sagt, welche Frage es nicht beantwortet.']
        ]
      },
      {
        id: 'elevation', nav: 'Höhendaten', h: 'Höhendaten — die Grundlage jeder Geländeberechnung',
        blocks: [
          ['p', 'Alle Geländefunktionen teilen sich einen Höhen-Sampler. Die Daten sind Terrarium-codierte RGB-Höhenkacheln, in denen die Pixelfarbe <em>die</em> Höhe ist.'],
          ['p', 'Die Höhe eines Punktes wird aus den vier umliegenden Stichproben <b>bilinear interpoliert</b> — der nächste Nachbar würde Kachelpixel in falsche Stufen verwandeln und Neigungs- und Abflussantworten verderben. Der Bodenabstand einer Stichprobe im Zoom z ist:'],
          ['tex', 'h \\;=\\; \\bigl(R \\cdot 256 + G + B/256\\bigr) - 32768 \\quad [\\mathrm{m}]'],
          ['tex', '\\Delta(z) \\;=\\; \\frac{40\\,075\\,017 \\, \\cos\\varphi}{2^{z} \\cdot 256} \\quad [\\mathrm{m\\;per\\;pixel}]'],
          ['table', ['z', 'Abstand in mittleren Breiten', 'Verwendet für'], [
            ['14', '~10 m', 'Gerinneanfang, Querprofile'],
            ['11', '~54 m', 'Weite Verfolgung flussabwärts'],
            ['7', '~860 m', '„Ist das das Meer oder eine geschlossene Senke?“']
          ]],
          ['lim', 'Lücken werden aus Nachbarn gefüllt, und die <b>Zahl der gefüllten Zellen wird immer gezeigt</b>. Fehlen mehr als 30 %, geht der Sampler eine Zoomstufe zurück und versucht es erneut; erst wenn auch die gröbste Stufe scheitert, meldet er einen Fehler — und benennt dabei das Netz, nicht den Ort.'],
          ['h3', 'Die vier St&uuml;tzpunkte und ihr Budget'],
          ['tex', 'h(x,y) \\;=\\; \\sum_{i,j\\in\\{0,1\\}} h_{ij}\\,\\bigl(1-|x-i|\\bigr)\\bigl(1-|y-j|\\bigr)'],
          ['p', 'Eine Kachel hat 256&times;256 Werte; eine Abfrage bei Zoom 14 kostet also eine HTTP-Anfrage je 2,4-km-Quadrat und wird f&uuml;r die Sitzung behalten. Jede Gel&auml;ndeberechnung nennt ihr Kachelbudget vorher &mdash; ein Intensit&auml;tsfeld fordert bis zu 1.600 Kacheln an, ein Telefon speichert 140 &mdash; deshalb werden die Kacheln einer laufenden Berechnung <b>festgehalten</b> und in einem <code>finally</code> wieder freigegeben. Sonst verdr&auml;ngt ein gro&szlig;es Feld seine eigenen Eingaben und holt sie erneut; genau daraus werden konzentrische Kreise.']
        ]
      },
      {
        id: 'water', nav: 'Gelände & Wasserführung', h: 'Geländeformung &amp; Wasserführung',
        blocks: [
          ['tagline', 'Wo das Wasser steht, wohin es abfließt und wo es überläuft — gelöst auf dem echten Höhenmodell.'],
          ['h3', '① Senkenfüllung — Priority Flood'],
          ['p', 'Barnes, Lehman &amp; Mulla (2014) — die moderne Form von Planchon–Darboux. Ein Min-Heap wächst vom Gitterrand nach innen und nimmt immer die niedrigste bisher erreichte Zelle. Die Entnahmereihenfolge ist eine topologische Ordnung des Entwässerungsnetzes: es braucht keinen separaten Fließrichtungs-Durchlauf, keinen Sonderfall für Senken, und Ebenen entwässern statt zu stocken. Jede Zelle liefert:'],
          ['ul', [
            '<b>filled</b> — der Stand, bis zu dem sich eine Senke füllt, bevor sie überläuft',
            '<b>parent</b> — der Nachbar, von dem aus sie erreicht wurde, also ihr Ausweg'
          ]],
          ['h3', '② Mengenverteilung — mehrere Fließrichtungen'],
          ['p', 'D8 presst den Abfluss an offenen Hängen in einzelne Zelllinien — sein bekanntes Artefakt. Stattdessen teilt jede Zelle ihr Wasser auf <b>alle tieferen Nachbarn</b> auf, gewichtet nach Gefälle und Konturbreite (Freeman 1991 / Quinn 1991):'],
          ['tex', 'w_i \\;\\propto\\; \\left(\\frac{\\Delta z_i}{L_i}\\right)^{1.1} \\! \\cdot C_i, \\qquad C = \\tfrac{1}{2}\\Delta \\ (\\text{face}), \\;\\; 0.354\\,\\Delta \\ (\\text{corner})'],
          ['p', 'Die Gewichtung ist überlinear im Gefälle, sodass Hänge von selbst streuen und Täler von selbst bündeln. Ein Anteil wandert nur zu einem echt kleineren <code>filled</code>, Zyklen sind also unmöglich.'],
          ['h3', '③ Seen halten, dann kaskadieren sie'],
          ['p', 'Sortiert man die Zellen einer Senke einmal nach Höhe, wird das gespeicherte Volumen zu einer Präfixsumme und der Stand zu einem gegebenen Volumen zu einer binären Suche. Füllt der Zufluss sie nicht, endet das Wasser dort; nur der <b>Überlauf</b> wird am Auslass eingespeist, den die Priority Flood bereits kennt. Ein leerer Speicher gibt also nicht seinen ganzen Zufluss nach unten weiter.'],
          ['h3', '④ Jenseits des Gitters — auf dem rohen Höhenmodell laufen'],
          ['p', 'Das Arbeitsgitter ist höchstens 60 km groß; ein Fluss ist es nicht. Außerhalb flutet die Verfolgung ein Fenster, folgt dessen <b>Talweg</b> (dem absteigenden Ast mit dem größten aufgesammelten Einzugsgebiet), verschiebt das Fenster dorthin, wo sie aufgehört hat, und wiederholt das. Es gibt genau zwei Enden:'],
          ['ul', [
            '<b>Das Meer</b> — 1,5 km durchgehender Boden auf oder unter 0 m. Die Höhe allein unterscheidet den Ozean nicht vom Toten Meer oder vom Death Valley, deshalb prüft der letzte Schritt, ob der Bereich ≤ 0 m mit dem Rand eines ~240-km-Fensters verbunden ist <em>und</em> ≥ 15 % davon einnimmt (offener Pazifik 100 %, Totes Meer 7 %).',
            '<b>Es endet</b> — ein Becken, das sich um mehr als 25 m füllen müsste, um herauszukommen. Das ist ein See, kein Rauschen im Höhenmodell.'
          ]],
          ['p', 'Ist der See breiter als das Fenster (der Biwa-See misst 63 km, das Fenster 15 km), gibt es in ihm nirgends einen absteigenden Nachbarn. Die Vorausschau weitet sich dann auf <b>3&times; → 9&times; → 27&times;</b> und fragt das Höhenmodell jeweils auf der Stufe, deren Abstand zu diesem Fenster passt. Bei 9&times; (~135 km) passt der Biwa mit Rand hinein und der Seta — der einzige Weg, auf dem der Spiegel fällt — wird sichtbar. <b>Die Schwelle wächst mit der Leiter nicht mit</b>: eine gröbere Stichprobe kann die nötige Füllung nur überschätzen, ein fester Wert macht den Test mit weiterem Fenster also strenger, und das ist die sichere Richtung.'],
          ['h3', '⑤ Breite und Tiefe, die gezeichnet werden'],
          ['p', 'An jedem Punkt wird das Höhenmodell <b>senkrecht</b> zur Achse bis ±1,8 km gelesen, und der Wasserspiegel steigt, bis die benetzte Fläche dem entspricht, was durchmuss. Diese Forderung kommt aus der Kontinuität:'],
          ['tex', 'A(s) \\;=\\; \\frac{C}{\\sqrt{S(s)}}, \\qquad v \\;=\\; K\\sqrt{S}, \\quad K = 40'],
          ['p', 'Dass die Geschwindigkeit wie &radic;Gefälle geht, ist der Reibungsgefälle-Term, den jede Freispiegelformel teilt; K = 40 ergibt 1,3 m/s bei 0,1 % Gefälle — mittlerer Bereich für einen echten Tieflandfluss. Steile Abschnitte werden schmal und schnell, flache breit und langsam. <b>Die einzige freie Zahl ist das Volumen (oder der Abfluss), das der Nutzer eingegeben hat.</b>'],
          ['lim', 'Dies ist ein <b>stationäres Routing-Modell</b>, kein Flachwasser-Solver: es beantwortet keine Ankunftszeit (dafür gibt es eine eigene Funktion). „Dauerhaftes Gießen“ wiederholt dieselbe stationäre Lösung mit wachsendem Volumen — eine quasistatische Füllfolge — und das Panel zeigt Simulationszeit, nie Uhrzeit.'],
          ['h3', 'Wie gro&szlig; ein Lauf ist und was ihn begrenzt'],
          ['tex', '\\text{priority flood: } O(n\\log n),\\qquad \\text{MFD: } w_i = \\frac{(\\Delta z_i/L_i)^{1.1}C_i}{\\sum_j (\\Delta z_j/L_j)^{1.1}C_j}'],
          ['table', ['Gr&ouml;&szlig;e', 'Wert', 'Warum dieser Wert'], [
              ['Arbeitsgitter', 'bis 60 km, &le; 512&times;512 Zellen', 'ein Telefon muss Heap, F&uuml;llung und Akkumulation gleichzeitig halten'],
              ['Heap-Operationen', 'O(n log n), n = Zellen', 'jede Zelle wird genau einmal eingef&uuml;gt und entnommen'],
              ['Lauf flussabw&auml;rts', 'Fenster 15 km, &times;3 &rarr; &times;9 &rarr; &times;27', 'ein See, der breiter ist als das Fenster, hat darin keinen tieferen Nachbarn'],
              ['Querschnitt', '&plusmn;1,8 km, 96 Proben', 'breit genug f&uuml;r einen Flachlandfluss, fein genug f&uuml;r eine Schlucht']
            ]],
          ['h3', 'Das Reibungsgesetz hinter K = 40'],
          ['tex', 'v \\;=\\; \\frac{1}{n}R_h^{2/3}S^{1/2}\\;\\;(\\text{Manning}), \\qquad K=\\frac{R_h^{2/3}}{n}\\;\\approx\\;40\\ \\text{for } R_h\\sim2\\,\\text{m},\\; n\\sim0.035'],
          ['p', 'Die Konstante ist nicht frei gew&auml;hlt: sie ist die Manning-Gleichung mit einem hydraulischen Radius von etwa 2 m und n = 0,035, also ein nat&uuml;rliches Gerinne mit etwas Bewuchs. Sie steht hier, damit man entscheiden kann, ob sie f&uuml;r den betrachteten Abschnitt gilt.']
        ]
      },
      {
        id: 'seismic', nav: 'Bodenbewegung', h: 'Bodenbewegung',
        blocks: [
          ['p', 'Die Quelle ist ein Brune-ω<sup>−2</sup>-Spektrum; alles dazwischen ist ein Produkt aus drei Dämpfungen mit publizierter Form und publizierten Konstanten.'],
          ['tex', '\\dot{M}(f) = \\dfrac{M_0}{1+(f/f_c)^2}, \\qquad f_c = 4.906\\times10^{6}\\,\\beta\\left(\\dfrac{\\Delta\\sigma}{M_0}\\right)^{1/3}'],
          ['tex', 'A(f) = \\underbrace{\\dfrac{R_{\\theta\\phi}\\,F\\,V}{4\\pi\\rho\\beta^{3}}}_{\\text{source}}\\; \\dot{M}(f)\\; \\underbrace{G(r)}_{\\text{spreading}}\\; \\underbrace{e^{-\\pi f r/(Q(f)\\beta)}}_{\\text{anelastic}}\\; \\underbrace{e^{-\\pi\\kappa f}}_{\\text{near-surface}}'],
          ['tex', 'G(r) = \\begin{cases} r^{-1.3} & r \\le 70\\ \\text{km}\\\\ r^{+0.2} & 70 < r \\le 140\\ \\text{km}\\\\ r^{-0.5} & r > 140\\ \\text{km}\\end{cases} \\qquad Q(f) = Q_0 f^{\\eta},\\;\\; \\kappa = 0.035\\ \\text{s}'],
          ['tex', '\\log_{10} h_{\\text{eff}} = -0.405 + 0.235\\,M'],
          ['p', 'Ein Spektrum ist keine Spitze. Die Spitze eines Zufallsprozesses folgt aus dem Peak-Faktor von Cartwright &amp; Longuet-Higgins mit N<sub>z</sub> Nulldurchgängen in der Dauer T<sub>d</sub>.'],
          ['tex', 'y_{\\max} = \\sqrt{2\\ln N_z}\\left(1+\\dfrac{0.5772}{2\\ln N_z}\\right)\\sqrt{\\dfrac{1}{T_d}\\int_0^{\\infty}\\!\\!|Y(f)|^{2}df}'],
          ['p', 'Der Standortterm ist das Gelände: V<sub>S30</sub> aus der Hangneigung, gemessen über den eigenen Rasterabstand des DEM, dann Viertelwellenlängen-Verstärkung. Kommen die Höhenkacheln nicht an, fällt das Feld auf eine einzige Standortklasse zurück und sagt es — eine Intensität mit einheitlicher Verstärkung ist nur eine Funktion der Entfernung, also konzentrische Kreise.'],
          ['tex', '\\text{slope} = \\dfrac{\\lVert\\nabla h\\rVert}{\\Delta s},\\quad \\Delta s = \\max\\!\\bigl(900\\,\\text{m},\\,1.25\\,\\Delta(z)\\bigr) \\;\\longrightarrow\\; V_{S30} \\;\\longrightarrow\\; A_{qwl} = \\sqrt{\\dfrac{\\rho_r\\beta_r}{\\overline{\\rho\\beta}(\\lambda/4)}}'],
          ['tex', '\\mathrm{MMI} = 3.78 + 1.47\\log_{10}\\mathrm{PGV}\\;\\;(\\mathrm{PGV}>0.76\\ \\text{cm/s}) \\qquad I_{\\mathrm{JMA}} = 2\\log_{10}a_0 + 0.94'],
          ['p', 'Ankunftszeiten werden durch die <b>IASP91</b>-Geschwindigkeitsstruktur strahlverfolgt — der Abstrahlwinkel wird für Herdtiefe und Epizentraldistanz gelöst und der Weg integriert, statt aus einer Tabelle gelesen. Das ergibt die P- und S-Einsätze.'],
          ['p', 'Die Amplitude ist eine empirische Distanzabnahme mal einem <b>frequenzabhängigen Q</b> (anelastische Dämpfung) mal einer <b>Untergrundverstärkung</b>. Die Untergrundklasse wird nicht angenommen: sie folgt aus der Hangneigung, gemessen im eigenen Stichprobenabstand des Höhenmodells an diesem Punkt (steil = Fels, flach = Lockergestein).'],
          ['lim', 'Unterhalb der untersten Stufe der Intensitätsskala <b>extrapoliert</b> das Feld und sagt das auch. Das Epizentrum liegt dort, wo der Nutzer es gesetzt hat; eine von der KI geratene Koordinate wird nie verwendet.'],
          ['h3', 'Vom Spektrum zur Zahl auf dem Bildschirm'],
          ['p', 'Das Fourier-Amplitudenspektrum wird an 64 logarithmisch verteilten Frequenzen zwischen 0,1 und 20 Hz ausgewertet; alles Weitere ist das obige Spitzenfaktor-Integral, nach der Trapezregel &uuml;ber diese 64 Punkte. Die Wegdauer ist T<sub>d</sub> = T<sub>Quelle</sub> + 0,05&thinsp;r (Standardform nach Boore).'],
          ['p', 'Das Feld wird auf einem Gitter gel&ouml;st, dessen Weite aus der Magnitude folgt (512 m unter M 6, 1&ndash;2 km dar&uuml;ber) und danach <b>nur f&uuml;r die Darstellung</b> interpoliert. Nichts wird feiner gezeichnet als das Gitter, auf dem es gel&ouml;st wurde.']
        ]
      },
      {
        id: 'tsunami', nav: 'Tsunami', h: 'Tsunami',
        blocks: [
          ['p', 'Die Ausbreitung sind die nichtlinearen Flachwassergleichungen mit Manning-Sohlreibung, explizit auf einem versetzten Gitter gelöst. Der Zeitschritt folgt aus der schnellsten Zelle.'],
          ['tex', '\\dfrac{\\partial\\eta}{\\partial t} + \\nabla\\!\\cdot\\!\\bigl[(h+\\eta)\\mathbf{u}\\bigr] = 0, \\qquad \\dfrac{\\partial\\mathbf{u}}{\\partial t} + g\\nabla\\eta + \\dfrac{g\\,n^{2}\\lVert\\mathbf{u}\\rVert\\mathbf{u}}{(h+\\eta)^{4/3}} = 0'],
          ['tex', 'c = \\sqrt{g\\,h}, \\qquad \\Delta t \\le \\dfrac{\\mathrm{CFL}\\,\\Delta x}{\\max\\sqrt{g\\,h}}, \\qquad \\dfrac{H_2}{H_1} = \\left(\\dfrac{h_1}{h_2}\\right)^{1/4}'],
          ['p', 'Die Anfangsauslenkung ist die Okada-(1985)-Verschiebung des gezeichneten Bruchs im elastischen Halbraum — die Welle startet also von einer Verwerfung mit Länge, Breite, Tiefe, Einfallen und Versatz.'],
          ['tex', '\\eta_0(x,y) = u_z^{\\,\\text{Okada}}\\bigl(x,y;\\,L,\\,W,\\,d,\\,\\delta,\\,\\lambda,\\,\\bar{D}\\bigr), \\qquad M_0 = \\mu\\,L\\,W\\,\\bar{D}'],
          ['p', 'Die anfängliche Verschiebung der Meeresoberfläche ist die Lösung von <b>Okada (1985)</b> für eine rechteckige Bruchfläche im elastischen Halbraum. Zwei Umsetzungspunkte sind wichtig:'],
          ['ul', [
            'Der Arkustangens muss der <b>Hauptwert</b> sein — mit <code>atan2</code> entsteht hinter der Bruchfläche eine falsche Senkungskeule.',
            'Ein abgeschnittenes Rechenfenster hinterlässt eine Stufe, und die Stufe läuft als <b>falsche Wellenfront</b> weiter. Das Fenster wird geweitet, bis die Verschiebung vernachlässigbar ist.'
          ]],
          ['p', 'Die Ausbreitung ist die <b>lineare Langwellengleichung</b> über gemessener Bathymetrie, Phasengeschwindigkeit <span class="pg-eq pg-eq-inline">c = &radic;(gh)</span> — etwa 200 m/s über 4 000 m Wasser (Verkehrsflugzeug-Tempo), langsamer und steiler werdend, wenn die Tiefe abnimmt. Sie läuft in einem Web Worker, damit die Karte bedienbar bleibt.'],
          ['h3', 'Die Diskretisierung, ausgeschrieben'],
          ['p', 'Versetztes Arakawa-C-Gitter, Leapfrog in der Zeit: der Wasserstand &eta; in den Zellmitten, die beiden Volumenfl&uuml;sse M und N auf den Fl&auml;chen dazwischen, um einen halben Schritt zeitversetzt. Das ist das Schema jedes operationellen Langwellencodes &mdash; und es steht hier, weil &bdquo;Flachwassergleichungen&ldquo; allein nicht sagt, <b>wie</b> gel&ouml;st wurde.'],
          ['tex', '\\eta^{\\,t+1}_{i,j} = \\eta^{\\,t}_{i,j} - \\frac{\\Delta t}{\\Delta x}\\Bigl[(M^{\\,t+\\frac12}_{i+\\frac12,j}-M^{\\,t+\\frac12}_{i-\\frac12,j}) + (N^{\\,t+\\frac12}_{i,j+\\frac12}-N^{\\,t+\\frac12}_{i,j-\\frac12})\\Bigr]'],
          ['tex', 'M^{\\,t+\\frac12}_{i+\\frac12,j} = M^{\\,t-\\frac12}_{i+\\frac12,j} - g\\,D\\,\\frac{\\Delta t}{\\Delta x}\\bigl(\\eta^{\\,t}_{i+1,j}-\\eta^{\\,t}_{i,j}\\bigr) - \\frac{g\\,n^{2}}{D^{7/3}}\\lVert\\mathbf{M}\\rVert M\\,\\Delta t'],
          ['h3', 'Stabilit&auml;t, R&auml;nder und trockenes Land'],
          ['tex', '\\frac{\\partial \\eta}{\\partial t} \\pm c\\,\\frac{\\partial \\eta}{\\partial x} = 0 \\quad\\text{(Sommerfeld, at the open edge)}, \\qquad D = h+\\eta > \\varepsilon_{\\text{dry}} = 0.01\\ \\text{m}'],
          ['p', 'Der Zeitschritt folgt der CFL-Bedingung der <b>tiefsten</b> Zelle des Gebiets (0,45 der Grenze) &mdash; eine Folge der Bathymetrie, keine Einstellung. Offene R&auml;nder strahlen ab statt zu reflektieren; eine Zelle gilt erst ab 1 cm Wassertiefe als nass, was verhindert, dass der Reibungsterm an der Uferlinie durch eine verschwindende Tiefe teilt.'],
          ['lim', 'Der L&ouml;ser ist <b>nicht dispersiv</b> (Langwelle): die Dispersion der Leitwelle einer sehr kurzen Quelle wird nicht wiedergegeben, ebenso wenig Brechen oder Auflauf &uuml;ber Rauigkeit. Seine Antwort sind Ankunftszeiten und der erste Wellenberg; die &Uuml;berflutungstiefe an Land ist eine Badewannen-Schranke, keine Auflaufrechnung.']
        ]
      },
      {
        id: 'sealevel', nav: 'Meeresspiegel & Überflutung', h: 'Meeresspiegel &amp; Überflutung',
        blocks: [
          ['p', 'Boden auf oder unter dem gewählten Stand wird schattiert — eine Badewannenfüllung. Der Farbton ist die <b>Tiefe selbst</b>, und die Auflösung der Höhendaten ist unmittelbar die Auflösung des Überflutungsrandes.'],
          ['lim', 'Deiche, Tore und Entwässerung sind nicht modelliert, und eine Verbindung zum Meer wird standardmäßig nicht verlangt. Die Aussage lautet also <b>„dieser Boden liegt unter jenem Stand“</b>, nicht „das würde überflutet“.'],
          ['h3', 'Verbundenheit, wenn danach gefragt wird'],
          ['p', 'Die Standardantwort gilt je Zelle: liegt dieser Boden auf oder unter jenem Niveau. Mit eingeschalteter Verbundenheit l&auml;uft eine F&uuml;llung vom Meer aus &uuml;ber dasselbe Gitter, und nur von dort erreichbare Zellen werden schattiert &mdash; das entfernt geschlossene Senken unter dem Meeresspiegel (Qattara-Senke, Death Valley), die die Badewannen-Antwort einschlie&szlig;t. Die Tafel sagt, welche Antwort gezeigt wird.']
        ]
      },
      {
        id: 'tides', nav: 'Gezeiten', h: 'Gezeiten',
        blocks: [
          ['p', 'Die Reihe ist das globale Gezeitenmodell von Open-Meteo Marine — stündlicher Meeresspiegel über MSL. Hoch- und Niedrigwasser sind seine <b>lokalen Extrema</b>, wobei die Zeit durch eine Parabel durch die drei Stichproben um jeden Umschlag verfeinert wird; die Antwort hängt also nicht an der Stunde, in der das Modell abgetastet wird.'],
          ['tex', 't^{*} \\;=\\; t_i + \\tfrac{1}{2}\\,\\frac{a-c}{a-2b+c}\\,\\Delta t'],
          ['p', 'Beim Einschalten der Ebene wird die Küste im Bild abgetastet und das Modell für alle diese Punkte auf einmal gefragt. Die ganze sichtbare Küste trägt daher ihren Stand, ihre Phase und ihren nächsten Umschlag, <b>bevor irgendetwas angetippt wurde</b> — und der Boden auf oder unter diesem Stand ist aus denselben Höhendaten wie in §6 schattiert. Ein Antippen ersetzt die Übersicht durch die eigene Tabelle dieses Punktes, für seine eigenen Koordinaten abgefragt.'],
          ['p', '„Wie weit das Wasser kommt“ verwendet genau die Konstruktion aus §6, mit dem aktuellen Gezeitenstand als Wasserstand. Über Minuten bis Stunden ist eine Stillwasserfüllung eine faire Näherung — ein Auflaufmodell ist es nicht.']
        ]
      },
      {
        id: 'currents', nav: 'Meeresströmungen', h: 'Meeresströmungen',
        blocks: [
          ['p', 'Das mitgelieferte Feld ist geostrophische Strömung aus Altimetrie plus der winderzeugte Ekman-Anteil; jede benannte Strömung wird dann durch dieses gemessene Feld integriert.'],
          ['tex', 'u_g = -\\dfrac{g}{f}\\dfrac{\\partial\\eta}{\\partial y}, \\qquad v_g = \\dfrac{g}{f}\\dfrac{\\partial\\eta}{\\partial x}, \\qquad f = 2\\Omega\\sin\\varphi'],
          ['tex', '\\lVert\\mathbf{u}_{ek}\\rVert = \\dfrac{B}{\\sqrt{|f|}}\\dfrac{\\lVert\\boldsymbol{\\tau}\\rVert}{\\rho_w},\\quad B = 0.065\\ \\text{s}^{-1/2}, \\qquad \\theta = \\theta_{\\tau} - \\operatorname{sgn}(\\varphi)\\,55^{\\circ}'],
          ['tex', '\\mathbf{x}_{n+1} = \\mathbf{x}_n + \\Delta s\\,\\hat{\\mathbf{u}}\\!\\left(\\mathbf{x}_n + \\tfrac{\\Delta s}{2}\\hat{\\mathbf{u}}(\\mathbf{x}_n)\\right), \\qquad \\Delta s = 25\\ \\text{km}'],
          ['p', 'Warm oder kalt wird <b>gemessen</b>, nicht aus der Strömungsrichtung erschlossen: die eigene Oberflächentemperatur gegen das zonale Mittel derselben Breite. Innerhalb ±0,6 K wird grau gezeichnet.'],
          ['tex', '\\overline{\\Delta T} = \\dfrac{1}{N}\\sum_{i=1}^{N}\\Bigl[T(\\mathbf{x}_i)-\\langle T\\rangle_{\\varphi_i}\\Bigr] \\quad \\begin{cases}>+0.6\\ \\text{K} & \\text{warm}\\\\ <-0.6\\ \\text{K} & \\text{cold}\\\\ \\text{otherwise} & \\text{zonal}\\end{cases}'],
          ['tagline', 'Ein Strömungsfeld, gezeichnet als Stromlinien des Wassers, das sich tatsächlich bewegt.'],
          ['p', 'Das Geschwindigkeitsfeld sind <code>ocean_current_velocity</code> und <code>ocean_current_direction</code> von Open-Meteo Marine — dasselbe schlüsselfreie Modell, das die Gezeiten nutzen. Ein Gitter über das Bild wird in einer Anfrage geholt, Landzellen werden über die mitgelieferte Landmaske übersprungen, und die Antworten werden bilinear zu einem stetigen Feld interpoliert.'],
          ['p', 'Durch dieses Feld wird von jedem Saatpunkt aus mit einem Runge-Kutta-Schritt vierter Ordnung eine <b>Stromlinie</b> vorwärts und rückwärts integriert. Eine Linie ist damit ein Weg, den das Wasser wirklich nimmt, und kein für sich stehender Pfeil. Die Linienbreite ist die Geschwindigkeit, Pfeilspitzen entlang der Linie sagen die Richtung.'],
          ['eq', 'x<sub>n+1</sub> = x<sub>n</sub> + (h/6)(k<sub>1</sub> + 2k<sub>2</sub> + 2k<sub>3</sub> + k<sub>4</sub>), &nbsp; k<sub>i</sub> = u(x)/|u| &nbsp; (Einheitsgeschwindigkeit: der Schritt ist eine Strecke)'],
          ['p', 'Warm oder kalt wird <b>gemessen, nicht angenommen</b>. Eine warme Strömung ist eine Aussage darüber, was das Wasser mitbringt, deshalb wird jede Stromlinie mit der Meeresoberflächentemperatur rund 110 km <b>stromaufwärts</b> auf ihrem eigenen Weg verglichen. Ist es dort wärmer, bringt die Strömung Wärme (rot); ist es dort kälter, bringt sie Kälte (blau).'],
          ['lim', 'Liegt der Unterschied unter 0,25 K — innerhalb des Eigenrauschens des Modells —, ist die Linie <b>grau</b> und die Legende sagt „weder noch“. Eine Strömung, die keinen Temperaturkontrast trägt, darf nicht so gefärbt werden, als täte sie es. Die Namen stammen von Wikidata (CC0) und stehen an der für jede Strömung veröffentlichten Koordinate; ein Name ist ein Punkt auf der Karte und behauptet nicht, dass die Linie daneben diese Strömung ist.'],
          ['h3', 'Das Feld: was gemittelt wurde, und wor&uuml;ber'],
          ['p', 'Das mitgelieferte Feld ist eine <b>Klimatologie</b>: 36 Geschwindigkeitsfelder, gleichm&auml;&szlig;ig &uuml;ber den gesamten Datensatz (2015&rarr;heute) verteilt, plus 24 Windschubfelder, auf dem 0,25&deg;-Gitter der Quelle. Ein Mittel &uuml;ber 36 Felder senkt die mesoskalige (Wirbel-)Varianz um etwa den Faktor sechs &mdash; deshalb ist eine verfolgte Bahn eine Str&ouml;mung und kein Ring.'],
          ['tex', '\\mathbf{u}_{\\text{tot}} \\;=\\; \\underbrace{\\frac{g}{f}\\,\\hat{\\mathbf{k}}\\times\\nabla\\eta}_{\\text{geostrophic (altimetry)}} \\;+\\; \\underbrace{\\frac{B}{\\sqrt{|f|}}\\frac{\\boldsymbol{\\tau}}{\\rho_w}\\,\\mathcal{R}\\bigl(-\\operatorname{sgn}\\varphi\\cdot55^{\\circ}\\bigr)}_{\\text{Ekman (wind stress)}}'],
          ['h3', 'Wie die Linie einer benannten Str&ouml;mung entsteht'],
          ['tex', '\\mathbf{x}_{n+1} = \\mathbf{x}_n + \\Delta s\\;\\hat{\\mathbf{u}}\\!\\left(\\mathbf{x}_n + \\tfrac{\\Delta s}{2}\\,\\hat{\\mathbf{u}}(\\mathbf{x}_n)\\right), \\qquad \\Delta s = 25\\ \\text{km}'],
          ['p', 'Jede der 108 benannten Str&ouml;mungen wird von einem ver&ouml;ffentlichten Startpunkt auf ihrem Kern aus vorw&auml;rts und r&uuml;ckw&auml;rts bis zu 5.000 km durch dieses gemessene Feld integriert. Drei Regeln beenden einen Lauf: eine Zelle, die mehr als 12 Schritte sp&auml;ter erneut betreten wird (geschlossener Wirbel), eine R&uuml;ckkehr auf 60 km an den Startpunkt nach echter Wegstrecke, oder ein Budget von 12 aufeinanderfolgenden Zellen unter 2,2 cm/s. Eine Bahn, die sich unter 1.500 km schlie&szlig;t, wird <b>verworfen</b> und der Startpunkt aus dem Ring um ihn herum neu versucht.'],
          ['h3', 'Die Datei, die der Browser liest'],
          ['tex', 's_{\\text{byte}} = \\left\\lfloor 255\\sqrt{\\frac{\\min(s,\\,2.5)}{2.5}} \\right\\rceil, \\qquad b_{\\text{byte}} = \\left\\lfloor \\frac{255\\,\\theta}{360^{\\circ}} \\right\\rceil'],
          ['tex', '\\text{stride} = \\min\\Bigl\\{\\,2^{k} \\;:\\; \\frac{\\Delta\\lambda_{\\text{view}}}{0.25^{\\circ}2^{k}}\\cdot\\frac{\\Delta\\varphi_{\\text{view}}}{0.25^{\\circ}2^{k}} \\le N_{\\max}\\Bigr\\},\\qquad N_{\\max}=4\\,200\\ (\\text{phone}),\\;9\\,000'],
          ['p', 'Das Feld kommt als regul&auml;res Gitter (1.440 &times; 720 Zellen, je ein Byte Geschwindigkeit und Richtung) statt als Pfeilliste, denn eine Liste legt den Abstand schon beim Bauen fest. Der Client schreitet stattdessen &uuml;ber das Gitter und w&auml;hlt die gr&ouml;bste Schrittweite, die den Ausschnitt mit h&ouml;chstens N<sub>max</sub> Marken f&uuml;llt; jede Zelle ist das <b>Vektormittel</b> ihres Blocks. Die Geschwindigkeit ist &uuml;ber eine Wurzel quantisiert, damit die Aufl&ouml;sung am unteren Ende 0,05 cm/s betr&auml;gt.'],
          ['h3', 'Die zw&ouml;lf Monate'],
          ['p', 'Eine zweite Datei tr&auml;gt zw&ouml;lf monatliche Klimatologien bei 0,5&deg; (je sechs Jahre desselben Kalendermonats gemittelt) und wird nur geholt, wenn ein Monat gew&auml;hlt wird. Jede benannte Str&ouml;mung f&uuml;hrt ihre zw&ouml;lf Monatsgeschwindigkeiten und die mittlere Projektion der Monatsstr&ouml;mung <b>auf ihre eigene Bahn</b> mit; wechselt diese Projektion das Vorzeichen, kehrt sich die Str&ouml;mung mit der Jahreszeit um, und die Liste sagt es. Die Bahnen selbst werden nicht monatlich neu verfolgt.']
        ]
      },
      {
        id: 'atmosphere', nav: 'Atmosphäre & Himmel', h: 'Atmosphäre und Himmelsfarbe',
        blocks: [
          ['tagline', 'Welche Farbe der Himmel aus dieser Höhe, bei diesem Sonnenstand, in diese Richtung hat — integriert, nicht gewählt.'],
          ['p', 'Zwei Hexfarben zu interpolieren stimmt mit dem echten Himmel bei genau einem Sonnenstand und einer Kamerahöhe überein. Diese App fliegt von der Straße bis in den niedrigen Orbit und reist durch die Zeit, also wird der Himmel <b>marschiert</b>: der Sichtstrahl wird bis zur Atmosphärengrenze integriert, und bei jedem Schritt auch der Strahl zur Sonne. Ein Schritt, dessen Sonnenstrahl von der Erde verdeckt ist, trägt nichts bei — daher fällt die Dämmerung vom Boden aufwärts.'],
          ['h3', 'Der tatsächlich marschierte Strahlungstransport'],
          ['tex', 'L(\\mathbf{x},\\boldsymbol{\\omega}) \\;=\\; \\int_{0}^{t_{\\max}} T(\\mathbf{x},\\mathbf{p})\\,\\Bigl[\\, \\sigma_s^{R}(\\mathbf{p})\\,p_R(\\mu)\\,T(\\mathbf{p},\\mathbf{p}_{\\odot})\\,E_\\odot \\;+\\; \\sigma_s^{M}(\\mathbf{p})\\,p_M(\\mu)\\,T(\\mathbf{p},\\mathbf{p}_{\\odot})\\,E_\\odot \\;+\\; \\sigma_s(\\mathbf{p})\\,\\Psi_{ms}(h,\\theta_\\odot) \\Bigr]\\,dt'],
          ['tex', 'T(\\mathbf{a},\\mathbf{b}) \\;=\\; \\exp\\!\\left[-\\!\\int_{\\mathbf{a}}^{\\mathbf{b}}\\!\\bigl(\\beta_R\\,e^{-h/H_R} + 1.1\\,\\beta_M\\,e^{-h/H_M} + \\beta_{O_3}\\,\\Lambda(h)\\bigr)ds\\right]'],
          ['tex', 'p_R(\\mu) = \\frac{3}{16\\pi}\\bigl(1+\\mu^{2}\\bigr), \\qquad p_M(\\mu) = \\frac{3}{8\\pi}\\,\\frac{(1-g^{2})(1+\\mu^{2})}{(2+g^{2})\\,(1+g^{2}-2g\\mu)^{3/2}}, \\quad g = 0.76'],
          ['h3', 'Ozon, und warum die Dämmerung blau ist'],
          ['p', 'Ozon <b>absorbiert und streut nicht</b>, steht also in der optischen Tiefe beider Strahlen und in keiner Phasenfunktion. Es macht die blaue Stunde blau: bei Sonne unter dem Horizont verläuft die Sichtlinie durch 10–40 km, wo Rayleigh kaum noch etwas entfernt, und das Chappuis-Band bei 600 nm nimmt das restliche Gelbrot heraus.'],
          ['tex', '\\Lambda(h) \\;=\\; \\max\\!\\left(0,\\; 1 - \\frac{|h - 25\\,\\mathrm{km}|}{15\\,\\mathrm{km}}\\right), \\qquad \\beta_{O_3} = (0.650,\\,1.881,\\,0.085)\\times10^{-6}\\ \\mathrm{m^{-1}}'],
          ['h3', 'Mehrfachstreuung'],
          ['p', 'Einfachstreuung zählt ein Photon einmal. Im Blauen ist die Luft dick genug, dass das meiste Licht mehrfach gestreut ankommt, und jede Streuung löscht die Richtung — der mehrfach gestreute Anteil ist also <b>isotrop</b> und hat gar keine Phasenfunktion. Das Schließen der geometrischen Reihe ergibt einen Term nur von Höhe und Sonnenstand, tabelliert mit 16 × 24 Stützstellen.'],
          ['tex', '\\Psi_{ms} \\;=\\; \\frac{L^{(2)}}{1 - f}, \\qquad f = \\frac{1}{4\\pi}\\oint \\sigma_s\\,T\\,d\\omega \\;<\\; 1'],
          ['tex', 'C \\;=\\; \\Bigl[\\,1 - e^{-L\\,\\varepsilon}\\,\\Bigr]^{1/2.2}, \\qquad \\varepsilon = 0.7'],
          ['lim', 'Ein Aerosolprofil für den ganzen Planeten, keine Wolken, kein Nachthimmelleuchten, kein Sternenlicht — tiefe Nacht integriert daher zu Schwarz und wird auf eine gemessene Nachtfarbe begrenzt. Der Limbus aus dem Weltraum ist der eigene Streudurchgang des Renderers, nicht dieses Integral.'],
          ['h3', 'Der Marsch und was er kostet'],
          ['tex', 'L=\\sum_{i=1}^{16} T(\\mathbf{x},\\mathbf{p}_i)\\bigl[\\sigma_s^R p_R + \\sigma_s^M p_M\\bigr]T(\\mathbf{p}_i,\\odot)E_\\odot\\,\\Delta t \\;+\\;\\sum_{i}\\sigma_s\\Psi_{ms}\\Delta t,\\quad T \\text{ from } M=8 \\text{ sun steps}'],
          ['p', 'Sechzehn Schritte entlang des Sehstrahls, acht entlang des Sonnenstrahls an jedem davon, dazu eine 16&times;24-Tabelle der Mehrfachstreuung, zweimal je Probe interpoliert. Rund 300 Exponentialfunktionen je Farbe, ausgewertet nur wenn Sonne oder Kamera sich wirklich bewegt haben &mdash; h&ouml;chstens ein paar Mal je Sekunde. Genau deshalb darf es ein Integral sein und kein Verlauf.'],
          ['h3', 'Von au&szlig;en gesehen: der Horizontbogen'],
          ['tex', '\\theta_{\\text{limb}}(h_t) \\;=\\; \\arcsin\\!\\frac{R_\\oplus+h_t}{R_\\oplus+h_{\\text{eye}}} \\;-\\; 90^{\\circ}, \\qquad \\ell(h_t)\\;\\approx\\;2\\sqrt{2R_\\oplus H}\\,e^{-h_t/2H}'],
          ['p', 'Aus dem Orbit steht die Atmosph&auml;re nicht &uuml;ber uns, sondern quer: ein Strahl mit 6 km geringstem Abstand durchquert etwa 800 km Luft, einer mit 55 km fast keine. Beide Enden des gezeichneten Verlaufs sind genau diese zwei Strahlen &mdash; blau-wei&szlig; unten auf der Tagseite, rot durch den Terminator, schwarz auf der Nachtseite, in jeder H&ouml;he. Keine dieser Farben ist gew&auml;hlt.'],
          ['lim', 'Ein Aerosolprofil f&uuml;r den ganzen Planeten, keine Wolken, kein Nachthimmelsleuchten, kein Sternenlicht: eine tiefe Nacht integriert zu Schwarz und wird auf eine gemessene Nachtfarbe angehoben.']
        ],
      },
      {
        id: 'sun', nav: 'Sonne, Schatten, Sichtbarkeit', h: 'Sonne, Schatten und Sichtbarkeitsbereich',
        blocks: [
          ['p', 'Die Sonnenposition kommt aus dem üblichen astronomischen Verfahren — Deklination und Stundenwinkel zu Azimut und Höhe. Geprüft ist, dass es zur Tagundnachtgleiche 0° Deklination und zur Sonnenwende die Schiefe der Ekliptik liefert.'],
          ['p', 'Die Jahreseinstrahlung tastet das umgebende Höhenmodell nach Azimut ab, um das <b>echte Horizontprofil</b> des Punktes zu bauen, und integriert dann die Sonnenbahn dagegen. Der Sichtbarkeitsbereich antwortet <b>je Rasterzelle</b> statt je Peilung, weil eine Peilungsabtastung in der Ferne Zellen auslässt.'],
          ['h3', 'Der Horizont, und das Jahr dagegen integriert'],
          ['tex', 'H(\\alpha) = \\max_{r\\le R_{\\max}}\\arctan\\frac{z(r,\\alpha)-z_0}{r}, \\qquad E = \\int_{\\text{year}} I_0\\,\\cos\\theta_i\\,\\bigl[\\,\\gamma_s(t)>H(\\alpha_s(t))\\,\\bigr]\\,dt'],
          ['p', 'Das umliegende Gel&auml;nde wird in 1&deg;-Schritten bis 25 km abgetastet; der gr&ouml;&szlig;te gefundene H&ouml;henwinkel je Richtung ist deren Horizont. Die Sonnenbahn des ganzen Jahres wird dann in 10-Minuten-Schritten dagegen integriert und nur gez&auml;hlt, solange sie dar&uuml;ber steht. Deshalb kommt ein nordexponierter Steilhang bei einem Bruchteil des Flachlandwerts heraus.'],
          ['p', 'Die Sichtbarkeitsanalyse antwortet <b>je Rasterzelle</b>, nicht je Richtung: eine Richtungsabtastung l&auml;sst L&uuml;cken, die mit der Entfernung wachsen.']
        ]
      },
      {
        id: 'sats', nav: 'Satelliten', h: 'Satelliten',
        blocks: [
          ['p', 'Bahnen werden aus TLEs mit <b>SGP4/SDP4</b> propagiert. Ein TLE verliert mit dem Alter an Güte und — entscheidend — <b>divergiert stillschweigend</b>. Deshalb gibt es eine harte Grenze für das Alter des Elementsatzes, und alles darüber wird nicht gezeichnet.'],
          ['p', 'Der Katalog ist ein mitgelieferter Stand plus ein Live-Abruf. Eine Kategorie ohne Liste wird <b>weggelassen, nicht leer gezeigt</b> — ein leeres Feld wäre die Behauptung, die Kategorie habe keine Satelliten.'],
          ['h3', 'SGP4 und warum das Alter eines Elementsatzes eine harte Grenze ist'],
          ['tex', 'n\'\' = n_0\\bigl[1 + \\tfrac{3}{2}k_2\\tfrac{(3\\cos^2 i-1)}{a^{2}(1-e^{2})^{3/2}}\\bigr],\\qquad \\sigma_{\\text{pos}} \\sim 1\\text{–}3\\ \\mathrm{km/day}\\ \\text{after epoch}'],
          ['p', 'Ein TLE ist keine Position, sondern ein Satz mittlerer Elemente, der zu einer bestimmten analytischen Theorie passt &mdash; lesbar nur mit SGP4/SDP4. Sein Fehler w&auml;chst im niedrigen Orbit um etwa 1&ndash;3 km pro Tag nach der Epoche, und zwar <b>lautlos</b>. Deshalb verweigert der Propagator zu alte Elementss&auml;tze, statt einen plausiblen Punkt an der falschen Stelle zu zeichnen.']
        ]
      },
      {
        id: 'space', nav: 'Weltraum & Körper', h: 'Weltraum &amp; Himmelskörper',
        blocks: [
          ['p', 'Planeten- und Mondpositionen sind keplersch, aus Bahnelementen. Körper werden vergrößert gezeichnet (im wahren Maßstab wären sie kleiner als ein Pixel), aber die <b>Obergrenze der Vergrößerung ist Geometrie, kein Geschmack</b>: sie folgt aus der Forderung, dass der Mond selbst im Perigäum frei von der Erde bleibt.'],
          ['p', 'Die Monde der anderen Planeten stammen aus der JPL-Tabelle mittlerer Bahnelemente für 177 Satelliten zu einer angegebenen Epoche, jeweils auf die Uhr propagiert. Die Elemente liegen nicht alle in einer Ebene — ein naher Mond eines Riesenplaneten nennt die lokale <b>Laplace-Ebene</b> seines Planeten, deren Pol die Tabelle als Rektaszension und Deklination angibt — und dieses Bezugssystem wird mitgeführt statt als Ekliptik gelesen.'],
          ['p', 'Im Modellmaßstab wird ein Mond nach demselben Kompressionsgesetz platziert wie der Erdmond und dann <b>über seinen Hauptkörper hinausgeschoben</b>: eine Strecke und einen Radius mit verschiedenen Exponenten zu komprimieren, kann einen inneren Mond sonst in den Planeten legen, den er umkreist. Im wahren Maßstab wird nichts verschoben, weil es nichts zu komprimieren gibt.'],
          ['p', 'Sterne kommen aus einem mitgelieferten Katalog heller Sterne des ganzen Himmels, an ihren echten Positionen und Helligkeiten; die Farbe folgt aus dem B&minus;V-Index, also aus der echten Farbtemperatur.'],
          ['h3', 'Positionen'],
          ['tex', 'M = E - e\\sin E \\;\\Longrightarrow\\; E_{k+1}=E_k-\\frac{E_k-e\\sin E_k-M}{1-e\\cos E_k}, \\qquad \\tan\\frac{\\nu}{2}=\\sqrt{\\tfrac{1+e}{1-e}}\\tan\\frac{E}{2}'],
          ['p', 'Planeten und Monde stammen aus mittleren Elementen zu einer genannten Epoche: die mittlere Anomalie wird fortgeschrieben, die Kepler-Gleichung mit Newton-Raphson gel&ouml;st (vier Iterationen erreichen 10<sup>&minus;12</sup> f&uuml;r e &lt; 0,9), daraus folgt die wahre Anomalie. Ein innerer Riesenplanetenmond nennt die lokale <b>Laplace-Ebene</b> seines Planeten als Bezugsebene, und dieser Rahmen wird mitgef&uuml;hrt.'],
          ['h3', 'Die zwei Ma&szlig;st&auml;be und was zwischen ihnen erhalten bleibt'],
          ['tex', 'r_{\\text{model}} = 26\\,\\mathrm{AU}^{0.42}, \\qquad R_{\\text{model}} = 0.12\\left(\\frac{R}{R_\\oplus}\\right)^{1/3}, \\qquad d\' = \\frac{\\mathcal{P}\'\\bigl(\\mathcal{P}^{-1}(d\\tan\\tfrac{\\phi}{2})\\bigr)}{\\tan\\frac{\\phi}{2}}'],
          ['p', 'Der Modellma&szlig;stab staucht Bahnradien mit der Potenz 0,42 und K&ouml;rperradien mit der dritten Wurzel &mdash; also zwei Gesetze, und keine Umrechnung der Kameradistanz kann beide halten. &Uuml;bertragen wird deshalb der <b>reale Radius am Bildrand</b>: mit dem Gesetz des alten Ma&szlig;stabs heraus, mit dem des neuen wieder hinein. F&uuml;llt ein K&ouml;rper das Bild, wird stattdessen seine scheinbare Gr&ouml;&szlig;e erhalten, im Logarithmus &uuml;berblendet.']
        ]
      },
      {
        id: 'flight', nav: 'Flugmodell', h: 'Flugmodell',
        blocks: [
          ['p', 'Schub und Auftrieb fallen mit der Luftdichte, deshalb ist die <b>Dienstgipfelhöhe keine Wand</b>: ein oberhalb gestartetes Flugzeug sinkt, bis die Luft es tragen kann, statt festgehalten zu werden.'],
          ['p', 'Die Kamera sitzt <em>am</em> Flugzeug und ist keine nachträglich korrigierte Verfolgeransicht.'],
          ['h3', 'Die Kr&auml;fte'],
          ['tex', 'L=\\tfrac12\\rho V^{2}S\\,C_L(\\alpha),\\quad D=\\tfrac12\\rho V^{2}S\\bigl(C_{D0}+\\tfrac{C_L^{2}}{\\pi e A\\!R}\\bigr),\\quad T=T_0\\left(\\frac{\\rho}{\\rho_0}\\right)^{0.7}'],
          ['p', 'C<sub>L</sub>(&alpha;) ist bis zum &Uuml;berziehwinkel linear, danach folgt ein modellierter Abfall; der induzierte Widerstand ist der Standardterm 1/(&pi;eAR). Der Schub f&auml;llt mit der Dichte hoch 0,7 &mdash; daraus ergibt sich die Dienstgipfelh&ouml;he, ohne eine Regel, die &bdquo;hier ist Schluss&ldquo; sagt.'],
          ['h3', 'Die Luft, durch die geflogen wird'],
          ['tex', '\\rho(h)=\\rho_0\\left(1-\\frac{Lh}{T_0}\\right)^{\\frac{g}{RL}-1},\\quad L=6.5\\ \\mathrm{K/km};\\qquad \\rho=\\rho_{11}e^{-\\frac{g(h-11\\,\\mathrm{km})}{R\\,T_{11}}}\\ (h>11\\ \\mathrm{km})'],
          ['p', 'Die Internationale Standardatmosph&auml;re in zwei St&uuml;cken: Troposph&auml;re mit linearem Temperaturgradienten, dar&uuml;ber ab 11 km isotherme Stratosph&auml;re. Die Fluggeschwindigkeit ist deshalb zwei verschiedene Zahlen, und das HUD sagt welche.'],
          ['h3', 'Die Integration'],
          ['tex', '\\mathbf{y}_{n+1}=\\mathbf{y}_n+\\Delta t\\,\\mathbf{f}(\\mathbf{y}_n),\\quad \\Delta t=\\min\\!\\left(\\tfrac{1}{30}\\ \\mathrm{s},\\,\\Delta t_{\\text{frame}}\\right)\\ \\text{sub-stepped so } \\Delta t\\le \\tfrac{1}{120}\\ \\mathrm{s}'],
          ['p', 'Explizite Integration mit begrenztem, unterteiltem Schritt, damit ein langer Frame nicht zu einem langen Zeitschritt wird. Die Kamera sitzt <em>am</em> Flugzeug, nicht als nachtr&auml;glich korrigierte Verfolgeransicht.']
        ]
      },
      {
        id: 'routing', nav: 'Routing & Erreichbarkeit', h: 'Routing &amp; Erreichbarkeit',
        blocks: [
          ['p', 'Straßenrouten kommen von OSRM über das OpenStreetMap-Netz, Alternativen aus derselben Engine. Das Bahnrouting läuft auf echten OSM-Gleisen und <b>rastet auf der größten Zusammenhangskomponente ein</b> — ein Einrasten auf einem isolierten Abstellgleis machte das Ziel unerreichbar. Der öffentliche Verkehr nutzt echte Fahrpläne über MOTIS/Transitous.'],
          ['p', 'Eine Isochrone ist die Menge der Punkte, die ein Zeitbudget erreicht, umhüllt von einer Hülle. Die Hülle dient der Darstellung — <b>die Erreichbarkeit selbst wird auf dem Netz entschieden</b>, nicht von der Hülle.'],
          ['h3', 'Was eine Isochrone wirklich l&ouml;st'],
          ['p', 'Ein Zeitbudget wird vom Start &uuml;ber das Stra&szlig;ennetz ausgebreitet &mdash; eine K&uuml;rzeste-Wege-Suche, kein Kreis &mdash; und die erreichten Knoten werden f&uuml;r die Darstellung in eine konkave H&uuml;lle gefasst. <b>Erreichbarkeit wird im Netz entschieden</b>; die H&uuml;lle ist nur das Bild der Antwort.']
        ]
      },
      {
        id: 'trade', nav: 'Handelsströme', h: 'Handelsströme',
        blocks: [
          ['p', 'Bilateraler Warenhandel aus BACI (CEPII) über OEC — Meldeland &times; Partner &times; HS-Abschnitt &times; Jahr, 1995–2024.'],
          ['p', '<b>Die Linienbreite ist proportional zur Quadratwurzel des Werts.</b> Zwei Gründe: der größte Partner eines Landes ist routinemäßig 500&times; so groß wie sein hundertster, lineare Breiten löschen also alles unterhalb der ersten drei; und ein Logarithmus lässt einen Strom von 200 Mio. $ ein Drittel so breit erscheinen wie einen von 200 Mrd. $, was in die andere Richtung lügt. Mit &radic; folgt die <b>Fläche</b> eines Strichs (Breite &times; Länge) der Menge — die Konvention der Flusskarte.'],
          ['eq', 'w = 1,2 + 11,8 &middot; &radic;(v / v<sub>max</sub>) &nbsp;px'],
          ['lim', 'Komprimiert wird nur das <b>Bild</b>. Beim Überfahren erscheinen die Kurzform (<code>$141.6B</code>) und die <b>exakte, ungerundete Zahl</b> (<code>$141,585,432,101</code>). Nichts in dieser App skaliert einen Wert um, um ihn anzuzeigen.']
        ]
      },
      {
        id: 'energy', nav: 'Energiemix', h: 'Energiemix',
        blocks: [
          ['p', 'Der Strommix stammt von Ember, die Primärenergie aus dem Review des Energy Institute, beides über Our World in Data, je Land und Jahr. Die Karte trägt die <b>eine Zahl, die Länder ordnet</b> (kohlenstoffarmer Anteil am Strom / fossiler Anteil an der Primärenergie); die Zusammensetzung selbst ist ein <b>gestapelter Balken</b>, weil neun Quellen keine Farbe sind.'],
          ['p', 'Eine Zeitreise liest <b>die Zeilen jenes Jahres</b> neu, statt zu interpolieren. Hat ein Land für dieses Jahr keine Zeile, wird die jüngste Beobachtung an oder vor diesem Jahr verwendet — und das tatsächlich verwendete Jahr wird genannt.']
        ]
      },
      {
        id: 'crops', nav: 'Feldfrüchte', h: 'Feldfrüchte',
        blocks: [
          ['p', 'Das Raster ist FAO GAEZ v4 — Anbaufläche, Ertrag oder Produktion für eine Kultur, zu einem angegebenen Referenzjahr, in der Auflösung gezeichnet, die der Dienst für den Bildausschnitt liefert.'],
          ['p', 'Eine Zelle mit Daten ist <b>deckend</b>: die Farbrampe sagt, wie groß die Zahl ist, also sagt Transparenz nichts und gehört ganz der Deckkraft-Steuerung. Eine Zelle ohne Kultur bleibt transparent, denn das ist ein Fehlen von Daten und kein kleiner Wert.'],
          ['lim', 'Das ist ein Referenzjahr-Gitter, kein Live-Gitter, und das Panel nennt das Jahr. Eine nationale Statistik ist keine Feldkarte: wo Sie die physische Ausdehnung bebauten Bodens brauchen, steht die 10-m-Ackerlandklasse von ESA WorldCover getrennt bereit, und <b>beide werden nie zu einem Bild vermischt</b>.']
        ]
      },
      {
        id: 'alerts', nav: 'Warnungen', h: 'Wetter- &amp; Katastrophenwarnungen',
        blocks: [
          ['p', 'Japan liest den Echtzeit-Datenstrom der JMA <b>in der Einheit, für die die Warnung ausgegeben wird</b> — er trägt sowohl eine Präfektur- als auch eine Gemeindeebene. Die Karte wird auf Präfekturebene gefärbt, die Gemeindezeilen werden beim Antippen aufgelistet. Die Farbe ist die höchste tatsächlich geltende Stufe (Notfallwarnung = violett, Warnung = rot, Hinweis = gelb). Die USA nutzen den NWS-Datenstrom aktiver Warnungen, der seine eigene Geometrie mitbringt.'],
          ['lim', 'Nichts gezeichnet ist <b>nicht</b> dasselbe wie nichts in Kraft. Beim Antippen eines Landes, dessen Dienst nicht angebunden ist, sagt die App das in Worten — diese Anwendung stellt keine Sicherheitsbehauptung mit einer leeren Karte auf.']
        ]
      },
      {
        id: 'news', nav: 'Verortung von Nachrichten', h: 'Verortung von Nachrichten',
        blocks: [
          ['p', 'Einen Artikel auf der Karte zu platzieren, erledigt <b>deterministischer Code</b>, kein Modell: Extraktion, Abgleich und Auflösung von Mehrdeutigkeit sind Regeln und Ortsverzeichnisse, und die KI erklärt nur Bedeutung. Auch das Clustering ist deterministisch, mit CJK-Bigrammen für japanische Schlagzeilen.'],
          ['p', 'Das Datum eines Artikels ist <b>nicht</b> das Datum des Ereignisses, und beide werden auseinandergehalten.']
        ]
      },
      {
        id: 'time', nav: 'Uhr & Zeitmaschine', h: 'Uhr &amp; Zeitmaschine',
        blocks: [
          ['p', 'Es gibt in der App genau eine Uhr. Der Tag-Nacht-Terminator, die Positionen der Himmelskörper, das Jahr der Statistiken, das Jahr des Handels und der Abrufzeitpunkt der Warnungen hängen alle an ihr, sodass der Wechsel zwischen „jetzt“ und einem vergangenen Moment eine einzige Änderung ist, die jede Funktion erreicht.'],
          ['p', 'Eine Reise in ein vergangenes Jahr zeichnet auch <b>die Grenzen jener Zeit</b> (die nächstgelegene historische Momentaufnahme an oder vor dem Jahr). Was nur jahrweise existiert, wird nicht interpoliert, damit es täglich aussieht.']
        ]
      },
      {
        id: 'labels', nav: 'Schriftgrößen', h: 'Größe der Beschriftungen',
        blocks: [
          ['p', 'Jede Schriftgröße auf der Karte leitet sich aus einer Leiter ab, deren Spezifikation eine <b>Beziehung</b> ist und kein Wert: eine Nicht-Ortsbeschriftung ist kleiner als eine Ortsbeschriftung. Der Bezugswert für Nicht-Ortsbeschriftungen wird getrennt gehalten, damit ein höheres Limit für Ländernamen nicht stillschweigend Meeres-, POI- und Gitterbeschriftungen mit aufbläht.']
        ]
      },
      {
        id: 'ai', nav: 'Was die KI nicht entscheidet', h: 'Was die KI nicht entscheiden darf',
        blocks: [
          ['p', 'Atlas (die KI-Konsole) ist für <b>Bedeutung</b> zuständig, der Code für <b>Ausführung</b>. Konkret:'],
          ['ul', [
            'Die KI schreibt nie <b>Koordinaten</b>. Sie benennt Orte als strukturierte Ziele (ISO-Codes, Ortsnamen), die gegen echte Datensätze aufgelöst werden.',
            'Ein nicht auflösbares Ziel wird weder stillschweigend gerettet noch stillschweigend verworfen — das Scheitern wird als Tatsache zurückgegeben.',
            'Ob sich etwas geändert hat, entscheidet der <b>Code</b>; die KI schreibt nur die Erklärung (Monitore und Alarme).',
            'Die KI kann keine Aktion melden, die sie nicht ausgeführt hat; ein Teillauf wird im Ergebnis als Teillauf gekennzeichnet.'
          ]]
        ]
      }
    ]
  },

  /* ── die Beschreibungen der Registry-Einträge (#R218) ────────────────────────────────────────
     Die Registry selbst (js/reference-data.js) trägt Englisch und Japanisch; die übrigen Sprachen
     stehen hier, nach dem Namen des Eintrags geschlüsselt. Ein Eintrag ohne Übersetzung fällt
     Eintrag für Eintrag auf Englisch zurück — genau wie die Prosa oben. */
  sourceUse: {
    "CRUST1.0 — global crustal model": "Mit der App ausgeliefert (data/crust1.bin.gz): das globale 1°-Krustenmodell — Sedimente, kristalline Kruste und oberster Mantel mit jeweils eigener Scherwellengeschwindigkeit, Dichte und Schichttiefe. Der Erdbebensimulator baut daraus das Geschwindigkeitsprofil jedes Standorts unterhalb von 30 m; nur so kann ein Becken lange Perioden verstärken.",
    "USGS Slab2 — subduction zone geometry": "Mit der App ausgeliefert (data/slab2.bin.gz): Tiefe, Streichen und Einfallen aller 27 aktiven Subduktionszonen. Der Erdbebensimulator unterscheidet damit ein Interface-Beben von einem Beben in der abtauchenden Platte — überall auf der Erde nach derselben Regel.",
    "Bird (2003) PB2002 plate boundaries": "Mit der App ausgeliefert (data/tectonics.bin.gz): Entfernung zur nächsten Plattengrenze, deren Klasse und die Orogen-Polygone diffuser Deformation. Bestimmt die tektonische Einordnung eines Bebens und damit die veröffentlichten Bodenbewegungsparameter.",
    "USGS ShakeMap station lists": "Aufgezeichnete Spitzenbeschleunigung und -geschwindigkeit an echten Messstationen, um das Erdbebenmodell gegen Beobachtungen zu bewerten (scripts/seismic-validate.mjs). Wird nur bei dieser Offline-Prüfung abgerufen, nie von der App im Browser.",
    'CARTO basemaps': 'Vektorkacheln der Basiskarte (hell/dunkel)',
    'MapLibre GL JS': 'Die Standard-Renderengine der Karte (BSD-3-Clause). Zeichnet jede 2-D-/3-D-Ansicht, die Globusprojektion und das Geländenetz.',
    'CesiumJS': 'Optionale zweite Renderengine (Apache-2.0), wählbar unter Einstellungen ▸ Kartenverhalten ▸ Karten-Engine. Wird nur bei Auswahl geladen. Verwendet KEINE Cesium-Ion-Assets und kein Zugriffstoken — sie zeichnet dieselben Esri-Satellitenbilder und dieselben AWS-Terrarium-Höhendaten wie die Standard-Engine.',
    'Twemoji (Twitter Emoji)': 'Selbst gehostete Flaggen-Webfont (TwemojiCountryFlags.woff2), damit Flaggen-Emoji auch auf Systemen ohne eigene Flaggenglyphen (z. B. Windows) erscheinen. Grafiken unter CC-BY 4.0.',
    'Esri World Imagery': 'Satellitenbilder und Ortsbeschriftungen; Referenzkacheln World Hillshade und World Transportation (Schummerungsebene und Vorschaubild der Straßenebene).',
    'OpenStreetMap': 'Ortssuche und Umrisse von Orten/Regionen (Nominatim), der tatsächliche Lauf eines Flusses beim Klick auf seinen Namen und die Basiskartendaten.',
    'NASA GIBS / Worldview': 'Temperatur, Niederschlag, Meeresoberflächentemperatur, Meereiskonzentration und SST-Anomalie, Schnee, Aerosol- und UV-Aerosolindex, Kohlenmonoxid, Bodenfeuchte, Feuer, Vegetation (NDVI) und Farbrelief',
    'NASA Blue Marble (via NASA EOSDIS GIBS)': 'Das mitgelieferte Gesamtbild der Erde (data/world-basemap.jpg — Blue Marble: Shaded Relief and Bathymetry, 2048×1024 äquidistant). Es liegt UNTER den Satellitenkacheln, damit der Globus beim Laden nie leer ist, und dient — da äquidistant und nicht Web-Mercator — in der Cesium-Engine zugleich als Offline-Grundlage für die Polkappen jenseits ±85,05°, die Mercator-Kacheln nicht erreichen. Darüber werden die Kappen aus dem gekachelten EPSG:4326-Dienst der NASA GIBS gezeichnet (Blue Marble: Shaded Relief and Bathymetry, 500 m), weil ein einzelnes äquidistantes Bild für die obersten 0,176° Breite nur EINE Pixelzeile hat und diese über die ganze Kappe verschmiert. In der MapLibre-Engine, wo sich ein äquidistantes Einzelbild gar nicht über den Globus legen lässt, wird dasselbe Bild eine Stufe gröber genutzt: die DURCHSCHNITTSFARBE seiner Polzeilen wird zur Laufzeit gemessen und als unterste Ebene gemalt, damit die Kappen jenseits ±85,05° Eis sind und nicht die Löschfarbe des Renderers. Diese Farbe ist eine Messung an diesem Bild, kein gewählter Wert. Neu erzeugt von scripts/build-world-basemap.mjs.',
    'NOAA sea-surface currents, wind stress and temperature (CoastWatch / PolarWatch ERDDAP)': 'Der mitgelieferte Datensatz der Meeresströmungen (data/ocean-currents.json) — 5.484 Pfeile und 26 benannte Strömungen. ⚠ Pfeile UND Verläufe sind gemessen: ein Mittel aus acht Fünf-Tage-Kompositen des globalen 1/3°-Oberflächenströmungsfeldes, wobei jede benannte Strömung von einem veröffentlichten Startpunkt auf ihrem Kern aus numerisch durch dieses Feld integriert wird. Nur der NAME und der Startpunkt sind redaktionell; keine Geometrie ist von einer Karte abgezeichnet. Auch warm/kalt ist abgeleitet — die mittlere polwärtige Komponente entlang des verfolgten Weges —, sodass eine wirklich zonale Strömung (Antarktischer Zirkumpolarstrom, die äquatorialen Strahlströme) als „weder noch“ herauskommt und grau gezeichnet wird. Werk der US-Regierung, gemeinfrei. Neu erzeugt von scripts/build-ocean-currents.mjs.',
    'JPL Solar System Dynamics — planetary satellites': 'Die 177 Monde, die um die anderen Planeten gezeichnet werden (data/moons.json) — mittlere Bahnelemente EINSCHLIESSLICH der mittleren Anomalie zur Epoche 2000-01-01.5 TDB, der Zahl, die aus der Position eines Mondes eine Antwort statt einer Anordnung macht, dazu die jeweils eigene Bezugsebene (die Ekliptik oder die lokale Laplace-Ebene des Planeten mit ihrem Pol). Mittlere Radien aus der begleitenden Tabelle physikalischer Parameter. Neu erzeugt von scripts/build-moons.mjs.',
    'Hipparcos Catalog (ESA 1997) — CDS I/239': 'Die 98.887 Sterne hinter dem Globus im dunklen Modus (data/stars.bin — Rektaszension, Deklination, V-Helligkeit, Farbindex B−V und die gemessene Parallaxe, bis V 9,5). Die Positionen werden von J2000 auf die Uhr der Karte präzediert und um die mittlere Sternzeit von Greenwich gedreht, der Himmel ist also der echte Himmel für diesen Augenblick; Größen folgen aus den gemessenen Helligkeiten, Farben aus dem gemessenen B−V. So weit über die Grenze des bloßen Auges hinauszugehen, ist auch das, was die Milchstraße zeichnet: dieses Band ist kein gemalter Verlauf, sondern der Ort, an dem die Sterne tatsächlich stehen. Bereitgestellt vom Centre de Données astronomiques de Strasbourg (CDS); der Bright Star Catalog (Hoffleit & Warren 1991, Harvard–Smithsonian TDC) bleibt die Ersatzquelle des Builds. Neu erzeugt von scripts/build-star-catalog.mjs.',
    'NASA/JPL Horizons — interplanetary spacecraft trajectories': 'Die Gruppe „Raumsonden“ in „Weltraum erkunden“ (data/spacecraft.json): 17 Fahrzeuge — Voyager 1 und 2, Pioneer 10 und 11, New Horizons, Parker Solar Probe, Solar Orbiter, Juno, JUICE, Europa Clipper, Lucy, Psyche, BepiColombo, Hayabusa2, OSIRIS-APEX, JWST und Gaia. Heliozentrische Position UND Geschwindigkeit im J2000-Ekliptiksystem, je Sonde unterschiedlich abgetastet (90 Tage bei Voyager, 3 Tage bei Parker), im Browser mit kubischer Hermite-Interpolation verbunden, damit der rekonstruierte Weg wiedergegeben und nicht durch Sehnen ersetzt wird. ⚠ Horizons antwortet ohne CORS-Header, daher wird dies zur BUILD-Zeit geholt und mitgeliefert; und ⚠ eine Bahn ist keine Telemetrie — Pioneer 10 und 11 verstummten 2003 und 1995, Gaia wurde 2025 passiviert, gezeichnet wird also eine propagierte Position, was das Panel auch sagt. Außerhalb der angegebenen Abdeckung sagt die App, dass die Datei es nicht weiß, statt den letzten Punkt stillschweigend zu wiederholen. Werk der US-Regierung — nicht urheberrechtlich geschützt. Neu erzeugt von scripts/build-spacecraft.mjs.',
    'NASA/JPL Small-Body Database (SBDB)': 'Die Gruppe „Asteroiden und Kometen“ in „Weltraum erkunden“ (data/small-bodies.json): 1.142 Objekte. Die Massenauswahl ist durch Messung definiert, nicht durch Geschmack — jeder Asteroid ab 150 km Durchmesser, jedes transneptunische Objekt heller als H 5,5, jeder NUMMERIERTE (also als wiederkehrend bestätigte) Komet und jeder potenziell gefährliche Asteroid heller als H 18 — dazu eine ausdrücklich redaktionelle Liste von Sondenzielen und bekannten Körpern, einschließlich der drei interstellaren Objekte. Oskulierende heliozentrische Elemente, im Browser als Zweikörperproblem propagiert: elliptisch ab dem Perihelzeitpunkt, hyperbolisch für e>1 und Barkers Gleichung bei e=1. ⚠ Oskulierende Elemente beschreiben die Bahn zu EINER Epoche; planetare Störungen (und bei einem aktiven Kometen nichtgravitative Kräfte) verschieben den echten Körper über Jahre von dieser Ellipse. Gut genug, um zu sehen, wo ein Körper im Sonnensystem steht, nicht gut genug, um ein Teleskop auszurichten. SBDB sendet keine CORS-Header, daher zur Build-Zeit mitgeliefert. Werk der US-Regierung. Neu erzeugt von scripts/build-smallbodies.mjs.',
    'SIMBAD — CDS, Strasbourg (deep-sky objects and their published distances)': 'Die Gruppe „Jenseits des Sonnensystems“ in „Weltraum erkunden“ (data/deep-sky.json): 150 Objekte — alle 110 Messier-Objekte plus die Lokale Gruppe, die nächsten großen Galaxien, das galaktische Zentrum sowie die Gruppen in Virgo, Coma, Fornax und Sculptor. Positionen und Objekttypen aus SIMBADs `basic`-Tabelle; die Entfernung ist der MEDIAN aller Entfernungsmessungen, die SIMBAD für dieses Objekt führt (`mesDistance`), mit der Zahl der Messungen und den Quartilen daneben. ⚠ Eine veröffentlichte Entfernung ist eine Messung mit einer Methode dahinter, und die Methoden widersprechen einander — Cepheiden, die Spitze des Roten-Riesen-Astes, Tully-Fisher, Flächenhelligkeitsfluktuation und Rotverschiebung können sich um Dutzende Prozent unterscheiden, und genau das sagen die Quartile. 131 der 150 haben eine veröffentlichte Entfernung; die übrigen 19 werden ohne Tiefe auf die Himmelskugel gezeichnet, statt eine erfundene zu bekommen. Das legt auch fest, wie weit die Kamera zurückweichen darf: die Grenze ist das entfernteste gemessene Objekt (rund 72 Mpc), keine willkürliche Zahl. Wenger et al. 2000, A&AS 143, 9 — bitte SIMBAD zitieren.',
    'REST Countries': 'Länderbasisdaten (Hauptstadt, Währung, Sprachen, Nachbarländer) für die Infoseite.',
    'NASA FIRMS': 'Aktive Brände / Wärmeanomalien.',
    'RainViewer': 'Live-Niederschlagsradar und Infrarotwolken.',
    'Open-Meteo': 'Höhen (einschließlich des Copernicus-DEM-Gitters für Atlas-Hervorhebungen unter/über dem Meeresspiegel), Windfeld, das Live-Wetter-Popup per Rechtsklick (aktuelle Lage + 5-Tage-Vorhersage) sowie Live-Werte für Wetter, Luftqualität, Meerestemperatur und Höhe in Widgets und in der integrierten Atlas-Analyse; dazu das raum-zeitliche Wind-, Temperatur- und Niederschlagsfeld, das die Atlas-Ausbreitungssimulation antreibt.',
    'Open-Meteo Marine': 'Stündlicher Meeresspiegel über MSL für die Gezeitenebene und — Geschwindigkeit und Richtung der Meeresströmung plus die Meeresoberflächentemperatur, aus denen die Ebene „Meeresströmungen“ ihre Stromlinien integriert und warm/kalt bestimmt (verglichen wird mit demselben Modell rund 110 km stromaufwärts).',
    'MET Norway (Locationforecast)': 'Automatischer Ersatz für das Punktwetter-Popup, wenn Open-Meteo nicht erreichbar ist (NLOD/CC-BY 4.0).',
    'OSRM (Open Source Routing Machine)': 'Atlas-Straßennavigation — Abbiegehinweise für Auto, Fuß und Rad auf OpenStreetMap-Straßendaten (öffentliche Demo-Server router.project-osrm.org und routing.openstreetmap.de; ODbL).',
    'Transitous / MOTIS': 'Atlas-Fahrplanauskunft — echte Routen für Bahn, U-Bahn, Tram, Bus und Fähre auf weltweiten offenen GTFS-Daten (api.transitous.org, MOTIS-Engine), inklusive aller Alternativen; für die Berechnung werden Start- und Zielkoordinaten übermittelt. Für Fernverkehr ohne offenen Fahrplan (z. B. JR/Shinkansen in Japan) weicht Atlas auf das OpenStreetMap-Schienennetz über die Overpass-API aus.',
    'Valhalla (FOSSGIS)': 'Atlas-Isochronen / Erreichbarkeit („30 Minuten mit dem Auto“, „15 Minuten zu Fuß“) — Zeit-Isolinien auf dem Straßennetz von OpenStreetMap über das schlüsselfreie öffentliche FOSSGIS-Valhalla /isochrone (Auto/Fuß/Rad); übermittelt werden die Startkoordinate und die gewählte Minutenzahl.',
    'Google Street View': 'Eingebettete Panoramen auf Straßenebene (Panel „Street View hier“ und die Atlas-Aktion) über die schlüsselfreie maps.google.com-Einbettung, dazu die echte Street-View-Abdeckung und das Einrasten per Klick über Googles schlüsselfreie Abdeckungskacheln (mts.google.com); Bilder und Abdeckung © Google.',
    'Global Watersheds (mghydro.com)': 'Live-Abgrenzung von Einzugsgebieten auf HydroSHEDS-Basis für die Flusseinzugs-Hervorhebungen in Atlas (Quelle: Global Watersheds, mghydro.com).',
    'GRDC / World Bank — Major River Basins of the World': 'Selbst gehostete Polygone der großen Einzugsgebiete (236 Becken) für die Flusseinzugs-Hervorhebungen in Atlas (CC BY 4.0, enthält HydroSHEDS-Daten).',
    'OpenTopoMap': 'Eine Beispielkachel als Vorschaubild der Höhenlinien-Ebene (CC-BY-SA).',
    'USGS Earthquake Hazards Program': 'Erdbeben in Echtzeit und historisch (Kartenebene, Widget, Vergleich und integrierte Atlas-Analyse) sowie die realen Ereignisse, die der Erdbebensimulator als Szenario laden kann.',
    'OpenStreetMap Overpass API': 'Atlas-Kartierung von Anlagen und POIs — Live-Abfragen benannter Anlagentypen in einem Gebiet (Öl, Kraftwerke, Flughäfen, Militär …); dazu die benannten Fluss-/Kanalwege um ein angeklicktes Flussetikett, wenn Nominatim für diesen Fluss nicht antworten kann (ODbL).',
    'Wikidata Query Service': 'Atlas-Kartierung von Anlagen und POIs — zweite, unabhängige Quelle (kuratierte Objekte mit Koordinaten, mit den OSM-Ergebnissen zusammengeführt; CC0). Außerdem die NAMEN in ja/de/ru/es im mitgelieferten Weltverzeichnis der Orte, zur Build-Zeit über die GeoNames-ID (P1566) nachgeschlagen, weil die GeoNames-Spalte der Alternativnamen kein Sprachkennzeichen trägt; die Live-Abfrage der aktuellen Amtsinhaber (Staats- und Regierungschefs), auf die sich Atlas-Antworten zu Staatsführungen stützen; der Unternehmens- und Beteiligungsgraph hinter der Ebene „Branchennetz“; und die NAMEN der Meeresströmungen der Welt mit ihren veröffentlichten Koordinaten (CC0).',
    'GeoNames': 'Das mitgelieferte Weltverzeichnis der Orte data/gazetteer-world.json.gz — 147.924 bewohnte Orte in 242 Ländern (Koordinaten, Einwohnerzahl und Land aus dem cities1000-Export; Namen in 18 Sprachen aus alternateNamesV2, das anders als die Inline-Spalte je Namen einen ISO-Sprachcode führt), auf 3,9 MB gzip-komprimiert und im Browser entpackt. Erzeugt von scripts/build-gazetteer.mjs. Erst dadurch lösen die KI-freie Nachrichtenverortung und das Suchfeld Orte zehnmal weiter im langen Ende auf als mit der kuratierten Tabelle allein. CC BY 4.0.',
    'geoBoundaries': 'Verwaltungsgrenzen (ADM1/ADM2) — Atlas-Regionszusammensetzungen und die letzte Rückfallebene der Warnkarte für Warngebiete, die in keinem anderen Grenzdatensatz stehen (CC BY 4.0).',
    'GDELT Project': 'Weltweite Live-Nachrichtensuche (letzte 72 Std.) hinter Atlas-Briefings und der integrierten Analyse.',
    'Market data (fxratesapi / ER-API · gold-api · CoinGecko · alternative.me)': 'Wechselkurse, Gold und Silber, Kryptopreise und Stimmungsindizes — Widgets und die Laufleiste am unteren Rand.',
    'Yahoo Finance': 'Kurse der Aktienindizes für die Laufleiste und Live-Aktienkurse zur Berechnung der Marktkapitalisierung im Reiter „Unternehmen“ (in den USA notierte Titel).',
    'Clearbit Logo API / Google favicons': 'Firmenlogos im Reiter „Unternehmen“ — der Domainname des Unternehmens wird gesendet, um sein Logo zu holen (Ersatz: Google-Favicons, danach ein Monogramm).',
    'Wikipedia (Wikimedia REST API)': 'Artikelprüfung für Orts-Popups und Hintergrundzusammenfassungen für die Atlas-Analyse (CC BY-SA).',
    "Data centers — OpenStreetMap (telecom/man_made/building = data_center, Overpass API)": "Alle in OpenStreetMap erfassten Rechenzentren, live nach Kartenausschnitt abgefragt (ODbL). Jeder Punkt trägt die Tags des Objekts selbst (Betreiber, Eigentümer, Leistung, Eröffnung) und gibt sie unverändert wieder; nichts wird abgeleitet",
    "Diplomatic missions — OpenStreetMap (amenity=embassy / office=diplomatic, Overpass API)": "In OpenStreetMap erfasste Botschaften und Konsulate (ODbL). Ein globaler Stand aller 17.423 ist mitgeliefert, damit die Ebene bei jedem Zoom zeichnet; hineingezoomt wird der Ausschnitt live abgefragt und ersetzt ihn. Nichts wird geschätzt",
    "Military sites — OpenStreetMap (military=*, Overpass API)": "Flugplätze, Marinestützpunkte, Kasernen, Übungsplätze und Sperrgebiete mit `military`-Tag aus OpenStreetMap, live für den Ausschnitt abgefragt (ODbL). Nur der öffentliche Datenbestand — nichts aus Bildauswertung, nichts geschätzt",
    "Power plants & grid — OpenStreetMap (power=plant/substation/generator, Overpass API)": "Kraftwerke, Umspannwerke, Windräder und Solarparks aus OpenStreetMap, live für den aktuellen Ausschnitt abgefragt (ODbL). Leistung, Brennstoff, Spannung und Betreiber stammen aus den Tags des Objekts; nichts wird geschätzt",
    "Mines, quarries & wells — OpenStreetMap (landuse=quarry, man_made=mineshaft/petroleum_well, Overpass API)": "Bergwerke, Steinbrüche, Schächte sowie Öl- und Gasbohrungen aus OpenStreetMap, live für den aktuellen Ausschnitt (ODbL)",
    "Airports & air infrastructure — OpenStreetMap (aeroway=aerodrome/terminal/heliport, Overpass API)": "Flughäfen, Flugplätze, Terminals, Hubschrauberlandeplätze und Tower aus OpenStreetMap, live für den aktuellen Ausschnitt (ODbL). ICAO/IATA-Code, Bahnlänge und Höhe nur, wo das Objekt sie führt",
    "Ports, harbours & terminals — OpenStreetMap (harbour, landuse=port, ferry terminals, Overpass API)": "Häfen, Fährterminals, Container- und Frachtterminals sowie Kräne aus OpenStreetMap, live für den aktuellen Ausschnitt (ODbL)",
    "Water & wastewater plant — OpenStreetMap (man_made=water_works/wastewater_plant/pumping_station, Overpass API)": "Wasserwerke, Kläranlagen, Pumpwerke, Wassertürme und Speicher aus OpenStreetMap, live für den aktuellen Ausschnitt (ODbL)",
    "Universities & research institutes — OpenStreetMap (amenity=university/college/research_institute, Overpass API)": "Universitäten, Hochschulen, Forschungsinstitute, Sternwarten und Forschungsbibliotheken aus OpenStreetMap, live für den aktuellen Ausschnitt (ODbL)",
    "Emergency services — OpenStreetMap (fire_station / police / ambulance_station, Overpass API)": "Feuerwachen, Polizeiwachen, Rettungswachen und Bergrettungsstationen aus OpenStreetMap, live für den aktuellen Ausschnitt (ODbL)",
    "Spaceports & satellite ground stations — OpenStreetMap (aeroway=spaceport, man_made=launch_pad/satellite_dish, Overpass API)": "Startrampen, Raumfahrtbahnhöfe, Satelliten-Bodenstationen und Radioteleskope aus OpenStreetMap (ODbL). Ein globaler Stand aller 13.310 ist mitgeliefert — es gibt etwa dreißig Raumfahrtbahnhöfe auf der Erde — und der Ausschnitt wird beim Hineinzoomen live abgefragt",
    "Health facilities — OpenStreetMap (amenity=hospital/clinic/doctors/pharmacy, Overpass API)": "Krankenhäuser, Kliniken, Arztpraxen und Apotheken aus OpenStreetMap, live für den Ausschnitt abgefragt (ODbL). Betten, Fachrichtung, Betreiber und Öffnungszeiten nur, wenn das Objekt sie trägt",
    "Telecom & internet infrastructure — OpenStreetMap (telecom=*, communications towers, Overpass API)": "Internet-Knoten, Vermittlungsstellen, Funkmasten und Türme aus OpenStreetMap, live für den Ausschnitt abgefragt (ODbL) — die physische Infrastruktur des Netzes",
    "AWS Global Infrastructure — regions": "Die offizielle Liste der AWS-Regionen und ihrer Standorte, für die Cloud-Punkte der Ebene „Rechenzentren & KI-Infrastruktur“ (eine Region ist der vom Betreiber veröffentlichte Ort, kein vermessenes Gebäude)",
    "Microsoft Azure — datacenter locations": "Microsofts eigene Rechenzentrums-Regionskarte, für die Azure-Punkte derselben Ebene",
    "Google Cloud — locations": "Die veröffentlichten Regionen und eigenen Campus-Standorte von Google Cloud, für die Google-Punkte derselben Ebene",
    "Oracle Cloud — public cloud regions": "Oracles veröffentlichte OCI-Regionsliste, für die Oracle-Punkte derselben Ebene",
    "Meta — data centers": "Metas eigene Liste der Rechenzentrums-Standorte, für die Meta-Punkte derselben Ebene",
    "TOP500 — supercomputer sites": "Die TOP500-Liste der schnellsten Supercomputer, für die HPC-/Forschungspunkte derselben Ebene",
    'Live cameras — OpenStreetMap (Overpass API)': 'Öffentliche Webcam-Punkte weltweit, live aus OSM nach Kartenausschnitt abgefragt (Tags contact:webcam / webcam, ODbL) und GEFILTERT auf Kameras, die in der App tatsächlich Live-Bilder zeigen — sich aktualisierende Bilder, YouTube-Live, Roundshot · Panomax 360° oder Video (reine Link-Kameras entfallen); das Standbild aktualisiert sich im Popup automatisch (kein API-Schlüssel).',
    'Transport for London — JamCams': 'Rund 880 Londoner Live-Verkehrskameras (schlüsselfreie TfL Unified API, „JamCam“-Orte) — je ein sich aktualisierendes JPEG plus kurzer Clip, automatisch aktualisiert in der Ebene „Live-Kameras“ (Powered by TfL Open Data; enthält OS-Daten © Crown copyright).',
    'Caltrans — California DOT CCTV': 'Rund 3.300 Live-Verkehrskameras in Kalifornien (schlüsselfreies offenes CCTV-Status-JSON über alle 12 Distrikte) — je ein direktes, sich aktualisierendes JPEG in der Ebene „Live-Kameras“ (© California Department of Transportation).',
    'Fintraffic / Digitraffic — Finland road-weather cameras': '811 finnische Straßenwetter-Kamerastationen / 2.272 Live-Ansichten (schlüsselfreie, CORS-offene Digitraffic-API) — deterministische direkte JPEGs, automatisch aktualisiert mit Ansichtsumschalter je Station in der Ebene „Live-Kameras“ (© Fintraffic, CC BY 4.0).',
    'OpenTrafficCamMap — US state DOT cameras': '1.815 weitere US-Live-Verkehrskameras (DOTs von Colorado, Indiana, Alaska und Arizona) aus dem MIT-lizenzierten offenen Datensatz OpenTrafficCamMap, schlüsselfrei über das jsDelivr-CDN geliefert (fixierter Commit); gezeigt werden nur Quellen, deren Bilder nachweislich direkt einbindbar sind. Bilder © die jeweiligen State DOTs.',
    'US / Canada DOT “511” traffic cameras': 'Rund 17.000 weitere Live-Verkehrskameras aus 13 „511“-Netzen von US-Bundesstaaten und kanadischen Provinzen (Florida, Georgia, New York, Pennsylvania, North Carolina, Nevada, Wisconsin, Idaho, Louisiana, Neuengland, Ontario, Alberta, Yukon) auf der gemeinsamen „511“-Kartenplattform. Die Kameraliste jeder Seite wird einmal über ein öffentliches CORS-Relay geholt (die Endpunkte senden keinen CORS-Header); jedes Bild wird direkt eingebunden und aktualisiert sich in der Ebene „Live-Kameras“. Bilder © die jeweiligen State/Provincial DOTs.',
    'Mapzen / AWS Terrain Tiles — elevation model (DEM)': 'Schlüsselfreie öffentliche „terrarium“-Gelände-RGB-Kacheln (AWS Open Data). Im Browser zu einem Höhen-Sampler dekodiert, der Neigungs- und Expositionsanalyse, die Sichtlinien-Auswertung, die Funkabdeckung, den Simulator für Geländeformung und Wasserführung, die Gelände-Schatten- und Jahressonnenstunden-Engine sowie Überflutung durch Hochwasser und Tsunami antreibt. Aufgebaut aus SRTM, ETOPO1 und nationalen Höhenquellen — vollständige Nennung in der Registry.',
    'IASP91 reference Earth model — Kennett & Engdahl (1991)': 'Das radiale P- und S-Geschwindigkeitsmodell, durch das der Erdbebensimulator Strahlen verfolgt, um P-/S-Laufzeiten, die Triplikationen der Laufzeitkurve und die Kernschattenzone zu erhalten. Gegen veröffentlichte IASP91-Tabellen geprüft (P bei 30°/60°/90° auf wenige Sekunden genau).',
    'Brune (1970) source model · Hanks & Kanamori (1979) · Boore stochastic method': 'Die Kette der Punktquellen-Bodenbewegung im Erdbebensimulator: seismisches Moment aus der Magnitude, Eckfrequenz aus dem Spannungsabfall, Fernfeldspektrum mit trilinearer geometrischer Abnahme, anelastischer Dämpfung und Viertelwellenlängen-Untergrundverstärkung, per Zufallsschwingungstheorie in Spitzenwerte umgerechnet.',
    'Wald, Quitoriano, Heaton & Kanamori (1999) — PGV → Modified Mercalli intensity': 'Die Beziehung, mit der der Erdbebensimulator eine Intensität angibt (MMI = 3,47 log10 PGV + 2,35). MMI, nicht die JMA-Shindo-Skala; nur innerhalb des Bereichs gezeigt, auf dem die Regression beruht.',
    'Wald & Allen (2007) — topographic slope → Vs30 site proxy': 'Der globale USGS-Untergrund-Proxy, mit dem der Erdbebensimulator ein geländeabhängiges Intensitätsfeld malt: Vs30 aus der Hangneigung des echten Höhenmodells geschätzt (Tabelle für aktiv-tektonische Gebiete) und Zelle für Zelle in die Viertelwellenlängen-Verstärkung eingesetzt. Meereszellen und Zellen ohne Höhenmodell werden gezählt, nicht gemalt.',
    '気象庁「計測震度の算出方法」 (JMA instrumental seismic intensity)': 'Das vom Simulator gezeigte JMA-Shindo wird nach der eigenen Definition der JMA berechnet und nicht aus PGV umgerechnet: Periodenfilter, 10-Hz-Hochschnitt und 0,5-Hz-Tiefschnitt werden auf das Beschleunigungsspektrum des Modells angewandt, der insgesamt 0,3 s überschrittene Pegel a₀ wird per Zufallsschwingungstheorie bestimmt, und I = 2·log₁₀ a₀ + 0,94. Die drei Komponenten werden mit V/H = 2/3 isotropisiert statt einzeln simuliert, was das Panel angibt. Ersetzt die zuvor verwendete PGV-Regression von Fujimoto & Midorikawa (2005).',
    'Okada (1985) · Wells & Coppersmith (1994) · Atkinson & Silva (2000)': 'Okadas geschlossene Lösung der Oberflächendeformation einer rechteckigen Versetzung liefert die koseismische Meeresbodenverschiebung, mit der die Tsunami-Ausbreitung beginnt (vor der Verwendung gegen den veröffentlichten Testfall geprüft); die Skalierung für Aufschiebungen nach Wells & Coppersmith liefert Länge, Breite und Versatz des Bruchs aus der Magnitude; und das Zwei-Ecken-Quellspektrum von Atkinson & Silva ersetzte die einzelne Brune-Ecke, die die mittleren Frequenzen großer Beben unterschätzte. Das Okada-Feld wird über ein verjüngtes 8×3-Teilbruchgitter summiert und so normiert, dass das seismische Moment genau dem der Magnitude entspricht.',
    'Kotani et al. (1998) — Manning roughness for tsunami run-up computation': 'Der Bodenreibungsbeiwert, mit dem das Tsunami-Ausbreitungsmodell rechnet (Manning n = 0,025 s·m^(−1/3) über Meeresboden), also der Wert, mit dem die japanischen operationellen Langwellenmodelle laufen. In der Tiefsee ist Reibung vernachlässigbar (sie skaliert mit der Gesamttiefe hoch −7/3) und begrenzt die Welle erst über dem Schelf; ein reibungsfreies Langwellenmodell überschätzt daher die Küstenamplitude.',
    'Kasten & Young (1989) air mass · Meinel & Meinel clear-sky beam': 'Die Direktnormalstrahlung bei klarem Himmel hinter der Jahressonnenstunden-Engine (1361 W/m² · 0,7^AM^0,678). Ein Klarhimmelwert, berechnet aus dem eigenen Geländehorizont des Ortes — keine Wettervorhersage und keine Ertragsschätzung.',
    'GEBCO 2020': 'Bathymetrie der Ozeane (Tiefenanzeige).',
    'AWS Terrain Tiles': '3-D-Gelände, Schummerung und Erzeugung von Höhenlinien.',
    'Beck et al. Köppen-Geiger (2018)': 'Klimazonen-Klassifikation mit 1 km Auflösung.',
    'MarineRegions': 'Seegrenzen: AWZ und Küstenmeer.',
    'TeleGeography Submarine Cable Map': 'Verläufe der untersee-Telekommunikationskabel.',
    'NASA SEDAC GPW v4': 'Gerasterte Bevölkerungsdichte.',
    'UNDP / EIU / SIPRI / World Bank': 'HDI (Zeitreihe 1990–2022), Demokratieindex, BIP, Militärausgaben, Demografie.',
    'AISstream.io': 'Live-AIS-Schiffsverkehr (Ihr Schlüssel).',
    'airplanes.live': 'Live-Flugverkehr (Community-ADS-B; liefert auch das Vorschaubild der Flugzeugebene).',
    'CelesTrak': 'Bahnelementsätze (GP/OMM, der moderne Nachfolger des Zwei-Zeilen-Elementsatzes) für die Live-Satellitenebene, nach Katalogruppe. Schlüsselfrei und CORS-offen; für nichtkommerzielle Nutzung mit Namensnennung frei. Heruntergeladen werden NICHT Positionen, sondern die Elementsätze, alle zwei Stunden; jede Position auf dem Bildschirm wird lokal mit SGP4/SDP4 daraus propagiert (satellite.js, MIT), sodass Schwenken und Zeitlauf keine Anfragen kosten. ZWEI DINGE WERDEN ZUDEM MITGELIEFERT, beide von der CI aus derselben Quelle erzeugt: data/tle/catalogue.tle, eine echte Momentaufnahme des `active`-Katalogs mit echter Epoche, damit die Ebene auch zeichnet, wenn celestrak.org nicht erreichbar ist (die App sagt, wie alt die verwendeten Elemente sind); und data/tle/groups.json, die NORAD-Katalognummern je CelesTrak-Gruppe, damit eine Anfrage nach einer KATEGORIE aus dieser Momentaufnahme beantwortet werden kann, statt nichts zu zeichnen. Die Gruppenzugehörigkeit lässt sich aus einem Elementsatz nicht ableiten und wird nie aus dem Namen erschlossen — eine Gruppe, deren Liste nicht geholt werden konnte, wird als fehlend und nicht als leer vermerkt.',
    'satellite.js': 'Der SGP4/SDP4-Bahnpropagator hinter jeder Satellitenposition, jedem Fußabdruck, jeder Bodenspur, jedem Blickwinkel und jeder Überflugvorhersage der App (MIT-Lizenz). Gegen Vallados kanonischen Testvektor auf 7 Mikrometer und gegen die aktuellen ISS-Elemente geprüft (436,6 km, 7,650 km/s, 92,96 min, 51,631°).',
    'Planespotters.net': 'Foto des konkreten Flugzeugs auf der Detailkarte, nachgeschlagen über die 24-Bit-ICAO-Adresse aus dem ADS-B-Datenstrom. Schlüsselfreie öffentliche Foto-API, für nichtkommerzielle Nutzung frei; jedes Foto erscheint mit Nennung des Fotografen und verlinkt auf das Original — nichts wird zwischengespeichert oder neu gehostet, und über Sie wird nichts gesendet (die gesamte Anfrage ist der Hex-Code des Flugzeugs).',
    'NOAA SWPC': 'Polarlichtoval (OVATION) und planetarer K-Index — die Polarlichtebene und ihr Vorschaubild.',
    'Natural Earth': 'Ländergrenzen und Länderpolygone; Zeitzonengrenzen (Zeitzonenebene); und die mitgelieferte Land-/Meer-Maske data/land-mask.png — die physischen Landpolygone im Maßstab 1:50 Mio., von scripts/build-land-mask.mjs zu einem 1-Bit-Gitter mit 2048×1024 äquidistanten Zellen gerastert, damit das Intensitätsfeld Land von Meer unterscheiden kann, ohne das Netz zu fragen (früher las es dafür Geländekacheln und malte den Ozean, sobald zu wenige ankamen). Gemeinfrei.',
    'AWS Terrain Tiles — the bundled global sea floor': 'data/bathymetry.png — dieselben öffentlichen terrarium-Höhendaten, zur Build-Zeit einmal für die ganze Welt gelesen (scripts/build-bathymetry.mjs) und als Gitter mit 1440×720 Zellen (0,25°) mitgeliefert, das die mittlere Tiefe der Meeresproben jeder Zelle und deren Meeresanteil trägt. Darüber integriert das GLOBALE Tsunami-Ausbreitungsmodell, sodass jede Zelle des Planeten schon vor dem ersten Zeitschritt eine gemessene Tiefe hat, statt dass die App tausend Kacheln holt und nur mit den angekommenen rechnet. Bathymetrie aus ETOPO1; vollständige Nennung in der Registry.',
    'Solar System Scope — planetary surface textures': 'Die äquidistanten Oberflächenkarten, mit denen „Weltraum erkunden“ jede Welt zeichnet (data/planets/*.jpg — jede Welt außer der Erde, die mit der app-eigenen data/world-basemap.jpg gezeichnet wird, damit Weltraumansicht und Karte EINE Erde zeigen), von Solar System Scope aus NASA-/JPL-/USGS-Bildern zusammengesetzt — MESSENGER für Merkur, Magellan-Radar für Venus, LRO für den Mond, Viking/MOLA für Mars, Cassini und Voyager für die Riesen. Byte für Byte so mitgeliefert, wie veröffentlicht. Lizenz CC BY 4.0. Pluto ist nicht dabei und wird in seiner gemessenen Farbe statt mit einer erfundenen Oberfläche gezeichnet.',
    'USGS Gazetteer of Planetary Nomenclature': 'Die von der IAU genehmigten Ortsnamen auf den anderen Welten (data/planet-names.json) — 2.772 Strukturen auf Merkur, Venus, Mond, Mars und Pluto mit veröffentlichten Mittelpunktkoordinaten, Durchmessern und Strukturtypen, sodass ein Planet so beschriftet wird wie die Erde. Gemeinfrei; die Namensautorität ist die IAU.',
    'OpenRailwayMap / OpenSeaMap': 'Weltweite Bahninfrastruktur und nautische Seezeichen als Overlay (Rasterkacheln, Beta).',
    'Wikipedia / Wikimedia': 'Infokarten und Bildmaterial.',
    'Public CORS relays (allorigins.win, corsproxy.io, corsfix.com, codetabs.com)': 'KEINE Datenquelle — ein Weg, eine zu ERREICHEN. Google-News-RSS, einige „511“-Kameraverzeichnisse und ein paar weitere Feeds senden keinen Access-Control-Allow-Origin-Header, ein Browser kann sie also nicht direkt lesen; diese öffentlichen Relays holen das Dokument serverseitig und liefern es mit Header erneut aus. Ein Relay sieht die angefragte URL (die Adresse eines öffentlichen Feeds) und die Verbindung selbst; niemals gehen Konten, Koordinaten oder personenbezogene Daten hindurch. Alle vier laufen mit je 8 Sekunden Frist gegeneinander, die Verlierer werden abgebrochen, sodass ein ausgefallenes oder langsames Relay die Seite nicht aufhalten kann. ⚠ SIE SIND JE ZIEL NICHT AUSTAUSCHBAR, und das ist gemessen und nicht angenommen: in diesem Build lieferte Google die US-Nachrichtenausgabe über corsproxy.io in 5 ms und antwortete DEMSELBEN Proxy für die japanische Ausgabe mit seiner „Sorry…“-Bot-Seite (503) — deshalb blieb der japanische Feed leer, bis ein viertes Relay hinzukam. Wo ein Relay verwendet wird, steht es beim Eintrag der Quelle selbst.',
    'Google News': 'Nachrichtenüberschriften (RSS) — serverseitig geholt und verortet; für die Atlas-Websuche auch live aus dem Browser abgefragt (der Themenname wird gesendet). Das HERAUSGEBENDE MEDIUM jedes Beitrags trägt der Feed selbst (Google News hängt es nach dem letzten „ - “ an die Überschrift), und daher stammt die Liste unter Einstellungen ▸ Nachrichtenquellen: angeboten werden die Medien, die der aktuelle Feed tatsächlich liefert, gezählt statt hier gepflegt. Die Auswahl filtert nur die Anzeige; sie ändert nicht, was geholt wird, und kein Medienname wird je erschlossen.',
    'Google Fonts (Noto Sans JP / SC / TC)': 'Keine Datenquelle, sondern die Schriften für Japanisch, Vereinfachtes und Traditionelles Chinesisch. Google Fonts liefert jede in rund 120 Unicode-Bereichen, sodass eine Seite die ~30 KB ihrer eigenen Glyphen lädt statt einer 5-MB-Schrift. Der Schriftserver sieht nur die Anfrage nach einer Datei und die Verbindung — kein Konto, keine Koordinaten, keine personenbezogenen Daten. Alle übrigen Schriften kommen von dieser Website (siehe fonts/README.md).',
    'Inter / Pretendard (bundled, SIL OFL 1.1)': 'Die lateinisch/kyrillische und die koreanische Schrift, mit der Website ausgeliefert — einschließlich der SDF-Glyph-Atlanten, aus denen die Beschriftungen der Karte gezeichnet werden (kein öffentlicher Glyph-Server veröffentlicht Inter). Lizenzen und Nennung: fonts/README.md.',
    'OpenFreeMap / OpenMapTiles': 'Vektorbasierte Ortsbeschriftungen und 3-D-Gebäudegrundrisse.',
    'ESA WorldCover': 'Globale Landbedeckungsklassifikation mit 10 m Auflösung.',
    'RESOLVE / WWF Ecoregions 2017': 'Terrestrische Ökoregionen.',
    'Smithsonian GVP': 'Vulkane des Holozäns.',
    'DeepStateMap': 'Frontlinie in der Ukraine (Beta-Ebene).',
    'historical-basemaps (aourednik)': 'Historische Grenzen — die Beta-Overlay-Ebene und der automatische Ersatz für die Grenzen vergangener Jahre der Karte selbst (nächstgelegene Momentaufnahme).',
    'CShapes 2.0 (Schvitz et al., ETH Zürich)': 'Jährliche Staatsgrenzen 1886–2019 für die Zeitmaschine (jede Grenzänderung auf das Jahr datiert; vereinfachte, selbst gehostete Kopie). Die Grenzen Ost-/West-/vereintes Deutschland 1945–2019 wurden aus den maßgeblichen heutigen Bundesländern neu aufgebaut (deutschlandGeoJSON, © GeoBasis-DE / BKG), damit die innerdeutsche Grenze der Wirklichkeit entspricht.',
    'Maddison Project Database 2020 (Bolt & van Zanden)': 'Maßgebliches HISTORISCHES reales BIP (konstante internationale Dollar von 2011) und Bevölkerung zurück bis 1900 für die Zeitmaschine — der Länderreiter, die Choroplethen und der Ländervergleich, wenn man vor die Untergrenze der Weltbank (1960) reist, sowie für aufgelöste Staaten (die frühere UdSSR, Jugoslawien und die Tschechoslowakei sind eigenständige Maddison-Einheiten).',
    'World Bank Open Data': 'Zeitreihenindikatoren je Land (Zeitreihendiagramme, der Vergleich von bis zu fünf Ländern und die Zeitmaschine — der gesamte Länderreiter, die Hover-Anzeigen und die Länder-Choroplethen zeigen die echten Zahlen für das Jahr, auf das die Hauptuhr gestellt ist).',
    'IMF World Economic Outlook': 'Lückenfüllung für die Staatsschulden-Ebene und die alternative Wirtschaftsquelle im Ländervergleich (DataMapper-API).',
    'WorldPop (University of Southampton)': 'Bevölkerung innerhalb eines gezeichneten Gebiets, Kreises oder Ortsumrisses — summiert aus dem globalen Bevölkerungsraster mit rund 100 m Auflösung über die WorldPop-Statistik-API.',
    'AI provider — OpenAI (Anthropic / Google selectable)': 'Serverseitige KI (der Schlüssel liegt auf dem Server): Atlas-Assistent, Verortung von Nachrichten, KI-Funktionen in der App und Websuche für Fragen zum aktuellen Geschehen.',
    "Annual precipitation, 1981–2010 normal — CHELSA V2.1 bio12 (30 arc-seconds, ~1 km)": "Mitgeliefert: mittlerer Jahresniederschlag 1981–2010 in 30 Bogensekunden (~1 km am Äquator), in denselben Web-Mercator-Rahmen wie die Köppen-Raster projiziert und auf Land maskiert. 16-Bit-Sättigung bei 6.553 mm.",
    "Annual precipitation by year, 1981–2020 — GPCC Full Data Monthly V2022, Deutscher Wetterdienst (0.5°, gauge analysis over land)": "Mitgeliefert: die zwölf Monatssummen jedes Jahres zu einer Jahressumme addiert, auf der 0,5°-Stationsanalyse des Deutschen Wetterdienstes über Land, 1981–2020. Über dem Meer sagt eine Stationsanalyse nichts.",
    "Religion and language composition by country — CIA World Factbook (US Government work, public domain)": "Mitgeliefert: die Felder „Religions“ und „Languages“ des Factbook, in Anteile je Gruppe und Land zerlegt (202 bzw. 196 Länder). Wo das Factbook die Konfessionen nicht trennt, trennt die Karte sie auch nicht.",
    "気象警報・注意報 — 気象庁 (Japan Meteorological Agency, bulletin list r8, by municipality)": "Live für die Warnebene gelesen: die Meldungsliste des JMA, die Datei, die seine eigene Warnseite anfordert. Sie ist eine Momentaufnahme und kein Verlauf — eine Zeile je Amt UND je Meldungsart, und jede Art ist eine andere Gefahrenfamilie —, der geltende Stand ist also die Vereinigung aller. Japan wird auf Gemeindeebene (class20) gezeichnet, der Einheit, für die der JMA warnt.",
    "気象庁の警報階級と配色 (JMA warning levels 20/30/40/50 and their published colours)": "Die Stufentabelle des JMA und die Farben, die seine Warnseite dafür veröffentlicht — von dieser Seite gelesen, nicht aus dem Gedächtnis geschrieben.",
    "行政区域データ（市区町村界）— 国土交通省 国土数値情報 N03 (via smartnews-smri/japan-topography)": "Japans Gemeindegrenzen aus den amtlichen Landesdaten des Ministeriums für Land. Die Warnebene schlüsselt sie über den JIS-Code — die ersten fünf Ziffern eines JMA-class20-Codes. Die landesweite Datei ist der Boden; eine Präfektur, die im Bild ist, wird auf die präfekturweise Datei desselben Herausgebers hochgestuft, die etwa elfmal so viele Stützpunkte hat.",
    "Weather warnings, United States — NOAA National Weather Service (api.weather.gov, CAP)": "Live gelesen: alle derzeit geltenden Warnungen des US-Wetterdienstes mit eigenen Polygonen, im Tap nach Bundesstaat. Direkt vom Browser abgerufen.",
    "Warnungen — Deutscher Wetterdienst GeoServer (Warnungen_Landkreise, WFS)": "Live gelesen: die Warnungen des DWD MIT den Landkreis-Gebieten. MeteoAlarm liefert dieselben Warnungen ohne Geometrie, daher wird Deutschland beim eigenen Dienst gelesen.",
    "Farevarsler — MET Norway MetAlerts 2.0": "Live gelesen: MET Norway veröffentlicht seine CAP-Meldungen als GeoJSON mit dem betroffenen Gebiet je Warnung.",
    "Avisos meteorológicos — INMET (Instituto Nacional de Meteorologia, Brazil)": "Live gelesen: die geltenden Warnungen des INMET mit eigenen Gebieten, im Tap nach Bundesstaat.",
    "Weather warnings, Australia — Bureau of Meteorology": "Live gelesen: die Warnliste des australischen Bureau of Meteorology. Ohne Geometrie — gezeichnet wird der Bundesstaat, unter dem das BoM sie führt.",
    "Weather warnings, Hong Kong — Hong Kong Observatory Open Data (warnsum)": "Live gelesen: die derzeit geltenden Warnsignale des Hongkonger Observatoriums. Sie gelten gebietsweit — das Gebiet IST die Einheit.",
    "Weather advisories, the Philippines — PAGASA-DOST public alert feed (CAP)": "Live gelesen: der öffentliche CAP-Index der PAGASA. Die Hochwasserhinweise führen je PROVINZ ein Gebiet mit echtem Polygon.",
    "災害告警 — 中央氣象署 CWA (Taiwan), via the NCDR CAP aggregator": "Live gelesen: die Meldungen der taiwanischen Wetterbehörde CWA, aus dem CAP-Aggregator des NCDR gefiltert. Gebiete mit Polygon werden so gezeichnet; die übrigen nennen eine Gemeinde.",
    "Weather warnings, New Zealand — MetService public CAP alerts": "Live gelesen: der öffentliche CAP-Index des MetService. Beim Anschluss war er LEER — ein Zustand, kein Fehler.",
    "Weather warnings, Canada — Environment and Climate Change Canada (OGC API — Features)": "Live gelesen: die derzeit gültigen Warnungen von Environment and Climate Change Canada mit eigenen Polygonen, im Tap nach Provinz gruppiert. Direkt vom Browser abgerufen, da der Dienst den CORS-Header selbst sendet.",
    "Weather warnings, Europe — MeteoAlarm (EUMETNET), 35 national services": "Live gelesen: die geltenden Warnungen der europäischen Wetterdienste, wie MeteoAlarm sie veröffentlicht, im Tap nach Region gruppiert. MeteoAlarm sendet keinen CORS-Header und ein Länderfeed ist rund zehn Megabyte groß, daher holt und verdichtet der eigene Relay des Programms sie serverseitig.",
    "Weather warnings, China — China Meteorological Administration public warning list": "Live gelesen: die öffentliche Warnliste der China Meteorological Administration. Sie enthält keine Geometrie, daher wird das Land nach der höchsten geltenden Stufe eingefärbt und der Tap listet nach Provinz. Über den eigenen Relay abgerufen, da kein CORS-Header gesendet wird.",
    "Weather warnings worldwide — national meteorological services via the WMO Severe Weather Information Centre (CAP)": "Live gelesen für die Warnebene, für jedes Land ohne eigenen Feed oben: die Warnungen des jeweiligen nationalen Wetterdienstes selbst — mit dessen Polygon, dessen Wortlaut und dessen CAP-Schweregrad, von der WMO unverändert weiterveröffentlicht. Die WMO ist der Transportweg, nicht der Urheber; das Panel nennt den herausgebenden Dienst.",
    "WMO Members and their CAP implementation status (which national service files CAP, and which does not)": "Einmal je Sitzung gelesen: das Verzeichnis der WMO darüber, welches Mitglied CAP vollständig umgesetzt hat. Nur diese Länder gelten als abgedeckt.",
  }
});
