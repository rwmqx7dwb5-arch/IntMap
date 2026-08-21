/* ============================================================================
 *  IntMap · Reading pages — fr   (#R239)
 * ----------------------------------------------------------------------------
 *  Written string-by-string into a copy of pages.en.js by scripts/i18n-pages-apply.mjs, so the
 *  document's STRUCTURE is English's exactly — block kinds, section ids and array shapes cannot
 *  drift from the source. Anything still in English falls back to English at run time, per key.
 *      node scripts/i18n-pages-audit.mjs --missing fr
 * ========================================================================== */
window.IntMapPageI18N=window.IntMapPageI18N||{_d:{},define:function(c,d){this._d[c]=d;},doc:function(c){return this._d[c];}};
window.IntMapPageI18N.define('fr', {

  common: {
    backToMap: "Retour à la carte",
    contents: "Sommaire",
    toScience: "Science et logique",
    toSources: "Sources des données"
  },

  /* ══════════════════════════════════════════════════════════════════════════════════════════ */
  sources: {
    title: "Sources des données",
    meta: "Chaque organisme dont IntMap affiche les données, où elles sont utilisées, comment elles sont récupérées, leur licence, et ce que cela signifie pour votre vie privée.",
    sub: "Chaque chiffre, chaque ligne et chaque image qu'affiche IntMap, et <b>d'où ils viennent</b>. Ce qui en est calculé se trouve sur la page <a href=\"./science.html\">Science &amp; logique</a>.",
    footer: [
      "Cette page recense les <b>fournisseurs de données</b>. La façon dont ces données sont utilisées dans les calculs figure sur la page <a href=\"./science.html\">Science &amp; logique</a>.<br>Si vous trouvez une erreur sur cette page, signalez-la-nous via le formulaire de retour intégré à l'application."
    ],
    sections: [
      {
        id: 'what', nav: "À propos de cette page", h: "À propos de cette page",
        blocks: [
          ['tagline', "Tout ce qu'affiche IntMap a été mesuré et publié par un organisme extérieur. Cette page recense ces organismes."],
          ['p', "IntMap ne produit aucune donnée propre. L'application récupère ce que publient les agences météorologiques, la NASA, les organismes des Nations unies, les universités et la communauté OpenStreetMap, et le dessine sur une seule carte. La confiance que l'on peut accorder à un chiffre affiché dépend de l'organisme qui l'a publié, et cette page est l'endroit où vérifier de quel organisme il s'agit."],
          ['p', "La liste ci-dessous montre les fournisseurs que l'application utilise réellement, et elle s'allonge à mesure que la carte s'enrichit. Pour trouver un élément précis, filtrez par nom de calque (&ldquo;marées&rdquo;, &ldquo;cultures&rdquo;) ou par organisme."]
        ]
      },
      {
        id: 'live', nav: "Fraîcheur des données", h: "À quel point ces chiffres sont récents",
        blocks: [
          ['tagline', "La fraîcheur des données dépend du calque. Le tableau ci-dessous indique quel moment représente chaque type de calque."],
          ['table',
            ["Type", "Quel moment vous voyez", "Exemples"],
            [
              ["Récupéré à l'instant où vous regardez", "Le moment où vous l'avez activé. Les séismes se mettent à jour en quelques minutes ; les alertes sont relues environ toutes les cinq", "Séismes, alertes, météo, aéronefs, imagerie satellite"],
              ["Statistiques annuelles", "L'année publiée la plus récente, et l'application indique toujours de quelle année il s'agit", "Commerce, mix énergétique, population, indicateurs économiques"],
              ["Une année de référence", "Une observation d'une année donnée ; rien de postérieur n'est inclus", "Cultures (2000, 2010), zones climatiques (1901&ndash;2020)"],
              ["Livré avec l'application", "Capturé lors de la dernière mise à jour de l'application ; la même réponse même sans réseau", "Frontières, littoraux, fond marin, catalogue d'étoiles, textures planétaires, éléments orbitaux des satellites"]
            ]
          ],
          ['lim', "<b>Bon à savoir</b> — Certaines données s'éloignent de la réalité en vieillissant ; les éléments orbitaux des satellites en sont l'exemple le plus net. Pour ces calques, le panneau affiche la date à laquelle la donnée a été captée. Une donnée ancienne n'est jamais présentée comme si elle était actuelle."]
        ]
      },
      {
        id: 'privacy', nav: "Ce qu'un calque envoie", h: "Ce qui se passe quand vous ouvrez un calque",
        blocks: [
          ['tagline', "Votre navigateur récupère les données directement auprès du fournisseur."],
          ['p', "IntMap n'utilise presque aucun serveur relais : les tuiles, la météo, les séismes et le reste sont demandés par votre appareil directement au fournisseur. Leurs journaux d'accès contiendront donc <b>votre adresse IP et les tuiles de carte que vous avez demandées</b>, ce qui indique approximativement la zone que vous consultiez. C'est le cas dans les autres applications cartographiques également, mais cela est précisé ici par souci de clarté."],
          ['p', "Votre position n'est utilisée que sur votre appareil. Les coordonnées ne sont transmises que lorsque vous posez une question sur un lieu — une recherche, un itinéraire ou une prévision. Les comptes, les fonctions d'IA et les surveillances sont traités dans la fenêtre Confidentialité de l'application."]
        ]
      },
      {
        id: 'licence', nav: "Qui l'a produite, et à quelles conditions", h: "Qui a produit ces données, et à quelles conditions",
        blocks: [
          ['tagline', "L'attribution est exigée par ces licences, et c'est aussi ce qui vous permet de savoir de qui vient un chiffre."],
          ['ul', [
            "<b>OpenStreetMap</b> (ODbL 1.0) &mdash; la carte construite par des bénévoles : routes, voies ferrées, bâtiments, lieux et limites administratives, ainsi que les données de base pour le calcul d'itinéraires. Créditée en permanence sur la carte.",
            "<b>Œuvres du gouvernement des États-Unis</b> (NASA, NOAA, USGS, NWS &hellip;) &mdash; dans le domaine public en règle générale : imagerie, séismes, lumières urbaines, positions planétaires. Les logos et emblèmes de la NASA ne le sont pas.",
            "<b>Agences météorologiques nationales</b> &mdash; les alertes sont montrées telles que l'agence émettrice les a publiées, et l'agence est toujours nommée.",
            "<b>Natural Earth</b> &mdash; frontières et littoraux dans le domaine public.",
            "<b>Our World in Data</b> (CC BY 4.0) &mdash; statistiques d'électricité, d'énergie et de cultures, avec le compilateur en amont (Ember, l'Energy Institute, la FAO) nommé à côté.",
            "<b>La Banque mondiale</b>, <b>la FAO</b>, <b>Wikipédia / Wikidata</b> &mdash; selon les conditions propres à chaque fournisseur, nommé dans le panneau qui l'utilise."
          ]],
          ['note', "Chaque entrée renvoie à la page du fournisseur, où figure le texte complet de la licence. Les descriptions données ici sont des résumés et ne priment pas sur ce texte."]
        ]
      },
      {
        id: 'limits', nav: "Ce qu'une source ne vous dit pas", h: "Ce qu'une source ne vous dit pas",
        blocks: [
          ['tagline', "Une source citée ne garantit pas à elle seule que la donnée est exacte, actuelle, ou applicable à l'endroit où vous vous trouvez."],
          ['ul', [
            "<b>Un total national n'est pas une valeur locale.</b> Une statistique nationale peinte sur tout un pays ne dit pas d'où, à l'intérieur, provient le chiffre. La teinte change à la frontière ; le phénomène qu'elle décrit, généralement pas.",
            "<b>Là où aucun flux n'est disponible, l'application le dit en toutes lettres.</b> Une carte vide n'affirme pas qu'aucune alerte n'est en vigueur.",
            "<b>Un résultat de simulation n'est pas une donnée source.</b> Les résultats de séisme, de tsunami, d'inondation et d'ensoleillement sont calculés à partir des données listées ici. Les équations, les hypothèses et les limites figurent sur la page <a href=\"./science.html\">Science &amp; logique</a>.",
            "<b>En cas d'urgence, suivez toujours les autorités officielles.</b> Ce que montre cette application n'est donné qu'à titre indicatif."
          ]]
        ]
      },
      {
        id: 'list', nav: "La liste, par thème", h: "La liste, par thème", count: 'src-count',
        blocks: [
          ['tagline', "Chaque entrée correspond à un fournisseur, avec son nom, l'endroit où IntMap l'utilise, et un lien vers sa propre page."],
          ['slot', 'src-panel']
        ]
      }
    ],
    filterPh: "Filtrer — séismes, marées, NASA…",
    entries: "entrées",
    loading: "Chargement…",
    loadFail: "La liste n'a pas pu être chargée — veuillez recharger la page.",
    noMatch: "Aucune source ne correspond à ce filtre.",
    groups: {
      base: "Fond de carte, relief, altitude",
      imagery: "Imagerie et télédétection",
      weather: "Météo, océan, climat",
      hazard: "Séismes, risques, alertes",
      space: "Espace et astronomie",
      econ: "Économie, statistiques, énergie",
      geo: "Pays, limites, noms de lieux",
      transit: "Transport, itinéraires, aéronefs, navires",
      news: "Actualités et références",
      other: "Autres"
    }
  },

  /* ══════════════════════════════════════════════════════════════════════════════════════════ */
  science: {
    title: "Science &amp; logique",
    meta: "Quelles données chaque fonction et chaque simulation d'IntMap utilise, selon quelles équations et sous quelles hypothèses.",
    sub: "Ce que chaque fonction d'IntMap calcule réellement, à partir de quelles données et sous quelles hypothèses. Distinct de la liste des sources : cette page traite de la <b>méthode</b>.",
    footer: [
      "Cette page documente la <b>méthode</b>. La liste des fournisseurs de données se trouve sur la page <a href=\"./sources.html\">Sources des données</a>.<br>Si vous y trouvez une erreur, utilisez le formulaire de retour intégré à l'application."
    ],
    sections: [
      {
        id: 'principles', nav: "Principes", h: "Principes",
        blocks: [
          ['tagline', "Quatre engagements valables pour toutes les fonctions ci-dessous."],
          ['h3', "① Aucune donnée de remplissage"],
          ['p', "Chaque chiffre est mesuré, observé ou publié. Rien n'est fabriqué pour paraître plausible. Lorsqu'une récupération échoue, l'application <b>dit qu'elle a échoué</b> au lieu de substituer quelque chose de vraisemblable."],
          ['h3', "② Toute limite est annoncée"],
          ['p', "Les calculs ont des budgets — longueur de trajet, nombre de tuiles, taille de grille. Atteindre un budget et présenter le résultat tronqué en silence reviendrait à affirmer que le phénomène s'arrête là : un budget entamé est donc toujours mentionné dans la réponse."],
          ['h3', "③ Aucune affirmation plus fine que la donnée"],
          ['p', "Un chenal plus étroit qu'un échantillon d'altitude, ou une inondation plus fine qu'une maille du solveur, est dessiné à la résolution propre de la donnée, et le nombre de tels cas est <b>indiqué</b>, pas dissimulé."],
          ['h3', "④ Chaque modèle dit ce à quoi il ne répond pas"],
          ['p', "Le modèle hydraulique répond à « où l'eau stagne-t-elle et par où repart-elle », pas à « à quelle vitesse le front avance-t-il ». Chaque panneau précise la question à laquelle il ne répond pas."]
        ]
      },
      {
        id: 'elevation', nav: "Données d'altitude", h: "Données d'altitude — la base de tout calcul de relief",
        blocks: [
          ['p', "Toutes les fonctions de relief partagent un même échantillonneur d'altitude. Les données sont des tuiles d'altitude RGB au codage Terrarium, où la couleur du pixel <em>est</em> la hauteur."],
          ['tex', 'h \\;=\\; \\bigl(R \\cdot 256 + G + B/256\\bigr) - 32768 \\quad [\\mathrm{m}]'],
          ['p', "L'altitude d'un point est <b>interpolée bilinéairement</b> à partir des quatre échantillons qui l'entourent — le plus proche voisin transformerait les pixels des tuiles en fausses marches et fausserait les réponses de pente et d'écoulement. L'espacement au sol d'un échantillon au zoom z vaut :"],
          ['tex', '\\Delta(z) \\;=\\; \\frac{40\\,075\\,017 \\, \\cos\\varphi}{2^{z} \\cdot 256} \\quad [\\mathrm{m\\;per\\;pixel}]'],
          ['table', ["z", "Espacement aux latitudes moyennes", "Utilisé pour"], [
            ["14", "~10 m", "Tête de chenal, profils en travers"],
            ["11", "~54 m", "Suivi vers l'aval sur de longues distances"],
            ["7", "~860 m", "« Est-ce la mer ou un bassin endoréique ? »"]
          ]],
          ['lim', "Les lacunes sont comblées à partir des voisins, et le <b>nombre de mailles ainsi comblées est toujours affiché</b>. Si plus de 30 % manquent, l'échantillonneur descend d'un niveau de zoom et réessaie ; ce n'est que si le niveau le plus grossier échoue lui aussi qu'il signale un échec — en nommant alors le réseau, pas le lieu."],
          ['h3', "Les quatre échantillons, et le budget dont ils viennent"],
          ['tex', 'h(x,y) \\;=\\; \\sum_{i,j\\in\\{0,1\\}} h_{ij}\\,\\bigl(1-|x-i|\\bigr)\\bigl(1-|y-j|\\bigr)'],
          ['p', "Une tuile fait 256&times;256 échantillons ; une requête au zoom 14 coûte donc une requête HTTP par carré de 2,4 km et est mise en cache pour la session. Un calcul de relief annonce son propre budget de tuiles avant de démarrer &mdash; un champ d'intensité en demande jusqu'à 1 600 et un téléphone en garde 140 &mdash; aussi les tuiles qu'un calcul utilise sont-elles <b>épinglées</b> pour sa durée et libérées dans un <code>finally</code>. Sans cela, un grand champ évince ses propres entrées et les redemande, ce qui est précisément ce qui transforme un champ en cercles concentriques."]
        ]
      },
      {
        id: 'water', nav: "Relief et écoulement de l'eau", h: "Modelage du relief &amp; écoulement de l'eau",
        blocks: [
          ['tagline', "Où l'eau stagne, par où elle repart et où elle déborde — résolu sur le MNT réel."],
          ['h3', "① Remplissage des dépressions — priority flood"],
          ['p', "Barnes, Lehman &amp; Mulla (2014) — la forme moderne de Planchon–Darboux. Un tas-min progresse vers l'intérieur depuis le bord de la grille, en prenant toujours la maille la plus basse atteinte jusque-là. L'ordre de dépilement est un ordre topologique du réseau de drainage : il n'y a donc pas de passe séparée pour les directions d'écoulement, pas de cas particulier pour les cuvettes, et les zones plates s'écoulent au lieu de bloquer. Chaque maille en ressort avec :"],
          ['ul', [
            "<b>filled</b> — le niveau auquel se remplit la dépression qui la contient avant de déborder",
            "<b>parent</b> — le voisin depuis lequel elle a été atteinte, c'est-à-dire son exutoire"
          ]],
          ['h3', "② Routage du volume — directions d'écoulement multiples"],
          ['p', "D8 réduit l'écoulement à des lignes d'une maille de large sur un versant ouvert — son artefact caractéristique. Ici, chaque maille répartit son eau entre <b>tous ses voisins plus bas</b>, pondérés par la pente et la largeur de contour (Freeman 1991 / Quinn 1991) :"],
          ['tex', 'w_i \\;\\propto\\; \\left(\\frac{\\Delta z_i}{L_i}\\right)^{1.1} \\! \\cdot C_i, \\qquad C = \\tfrac{1}{2}\\Delta \\ (\\text{face}), \\;\\; 0.354\\,\\Delta \\ (\\text{corner})'],
          ['p', "La pondération est super-linéaire en pente : les versants dispersent et les vallées convergent d'elles-mêmes. Une part ne se déplace que vers un <code>filled</code> strictement inférieur, si bien que les cycles sont impossibles."],
          ['h3', "③ Les lacs retiennent, puis débordent en cascade"],
          ['p', "Trier une fois les mailles d'une dépression par altitude fait du volume stocké une somme préfixe, et du niveau correspondant à un volume donné une recherche dichotomique. Si l'apport ne la remplit pas, l'eau s'y arrête ; seul le <b>débordement</b> est injecté à l'exutoire que le priority flood a déjà identifié. Un réservoir vide ne transmet donc pas la totalité de son apport vers l'aval."],
          ['h3', "④ Au-delà de la grille — parcourir le MNT brut"],
          ['p', "La grille de travail fait au plus 60 km ; un fleuve, non. Au-delà, le tracé inonde une fenêtre, suit le <b>talweg</b> de cette fenêtre (la branche descendante au bassin versant cumulé le plus grand), déplace la fenêtre là où il s'est arrêté, et recommence. Il n'y a exactement que deux fins possibles :"],
          ['ul', [
            "<b>La mer</b> — 1,5 km de terrain continu à 0 m ou au-dessous. L'altitude seule ne distingue pas l'océan de la mer Morte ou de la Vallée de la Mort : la dernière étape vérifie donc que la région ≤ 0 m est connectée au bord d'une fenêtre d'environ 240 km <em>et</em> qu'elle en couvre ≥ 15 % (Pacifique ouvert 100 %, mer Morte 7 %).",
            "<b>Elle s'arrête</b> — un bassin qui devrait se remplir de plus de 25 m pour repartir. C'est un lac, pas du bruit de MNT."
          ]],
          ['p', "Lorsque le lac est plus large que la fenêtre (le lac Biwa fait 63 km ; la fenêtre, 15 km), il n'existe nulle part à l'intérieur de voisin descendant. La visée s'élargit alors à <b>3&times; → 9&times; → 27&times;</b>, chacune interrogeant le MNT au niveau dont l'espacement propre correspond à cette fenêtre. À 9&times; (~135 km), Biwa tient largement et la Seta — le seul endroit par où le niveau baisse — devient visible. <b>Le seuil ne grandit pas avec l'échelle</b> : un échantillon plus grossier ne peut que surestimer le remplissage nécessaire, si bien que garder le nombre fixe rend le test plus strict à mesure que la fenêtre s'élargit, ce qui est le sens prudent."],
          ['h3', "⑤ La largeur et la profondeur effectivement dessinées"],
          ['p', "En chaque point, le MNT est lu sur la <b>perpendiculaire</b> jusqu'à ±1,8 km, et la surface de l'eau est relevée jusqu'à ce que la section mouillée corresponde à ce qui doit passer. Cette exigence vient de la continuité :"],
          ['tex', 'A(s) \\;=\\; \\frac{C}{\\sqrt{S(s)}}, \\qquad v \\;=\\; K\\sqrt{S}, \\quad K = 40'],
          ['p', "Une vitesse en &radic;pente est le terme de pente de frottement commun à toutes les formules d'écoulement à surface libre ; K = 40 donne 1,3 m/s sur une pente de 0,1 %, valeur médiane pour une vraie rivière de plaine. Les tronçons raides ressortent étroits et rapides, les tronçons plats larges et lents. <b>Le seul nombre libre est le volume (ou le débit) saisi par l'utilisateur.</b>"],
          ['lim', "Il s'agit d'un <b>modèle de routage en régime permanent</b>, pas d'un solveur en eau peu profonde : il ne répond pas au temps d'arrivée (une autre fonction s'en charge). Le « versement continu » répète la même résolution permanente à mesure que le volume croît — une séquence de remplissage quasi statique — et le panneau affiche un temps simulé, jamais l'heure réelle."],
          ['h3', "La taille d'un calcul, et ce qui la borne"],
          ['tex', '\\text{priority flood: } O(n\\log n),\\qquad \\text{MFD: } w_i = \\frac{(\\Delta z_i/L_i)^{1.1}C_i}{\\sum_j (\\Delta z_j/L_j)^{1.1}C_j}'],
          ['table', ["Grandeur", "Valeur", "Pourquoi cette valeur"], [
              ["Grille de travail", "jusqu'à 60 km, &le; 512&times;512 mailles", "un téléphone doit contenir en même temps le tas, le remplissage et l'accumulation"],
              ["Opérations sur le tas", "O(n log n), n = mailles", "chaque maille est empilée et dépilée exactement une fois"],
              ["Parcours vers l'aval", "fenêtres de 15 km, élargies &times;3 &rarr; &times;9 &rarr; &times;27", "un lac plus large que la fenêtre n'a aucun voisin descendant à l'intérieur"],
              ["Profil en travers", "&plusmn;1,8 km, 96 échantillons", "assez large pour une rivière de plaine, assez fin pour des gorges"]
            ]],
          ['h3', "La loi de frottement derrière K = 40"],
          ['tex', 'v \\;=\\; \\frac{1}{n}R_h^{2/3}S^{1/2}\\;\\;(\\text{Manning}), \\qquad K=\\frac{R_h^{2/3}}{n}\\;\\approx\\;40\\ \\text{for } R_h\\sim2\\,\\text{m},\\; n\\sim0.035'],
          ['p', "La constante n'est pas libre : c'est l'équation de Manning avec un rayon hydraulique d'environ 2 m et n = 0,035, c'est-à-dire un chenal naturel un peu végétalisé. Elle est indiquée ici pour qu'un lecteur puisse juger si elle s'applique au tronçon qu'il regarde."]
        ]
      },
      {
        id: 'seismic', nav: "Secousses sismiques", h: "Secousses sismiques",
        blocks: [
          ['p', "La source est un spectre de Brune en ω<sup>−2</sup> ; tout ce qui la sépare du sol est un produit de trois atténuations, chacune de forme publiée et de constante publiée."],
          ['tex', '\\dot{M}(f) = \\dfrac{M_0}{1+(f/f_c)^2}, \\qquad f_c = 4.906\\times10^{6}\\,\\beta\\left(\\dfrac{\\Delta\\sigma}{M_0}\\right)^{1/3}'],
          ['tex', 'A(f) = \\underbrace{\\dfrac{R_{\\theta\\phi}\\,F\\,V}{4\\pi\\rho\\beta^{3}}}_{\\text{source}}\\; \\dot{M}(f)\\; \\underbrace{G(r)}_{\\text{spreading}}\\; \\underbrace{e^{-\\pi f r/(Q(f)\\beta)}}_{\\text{anelastic}}\\; \\underbrace{e^{-\\pi\\kappa f}}_{\\text{near-surface}}'],
          ['tex', 'G(r) = \\begin{cases} r^{-1.3} & r \\le 70\\ \\text{km}\\\\ r^{+0.2} & 70 < r \\le 140\\ \\text{km}\\\\ r^{-0.5} & r > 140\\ \\text{km}\\end{cases} \\qquad Q(f) = Q_0 f^{\\eta},\\;\\; \\kappa = 0.035\\ \\text{s}'],
          ['tex', '\\log_{10} h_{\\text{eff}} = -0.405 + 0.235\\,M'],
          ['p', "Un spectre n'est pas un pic. Le pic d'un processus aléatoire ayant ce spectre découle du facteur de crête de Cartwright &amp; Longuet-Higgins, avec N<sub>z</sub> le nombre de passages par zéro pendant la durée de trajet T<sub>d</sub> — c'est pourquoi un même spectre donne un pic plus faible pour un trajet long et diffusant que pour un trajet court."],
          ['tex', 'y_{\\max} = \\sqrt{2\\ln N_z}\\left(1+\\dfrac{0.5772}{2\\ln N_z}\\right)\\sqrt{\\dfrac{1}{T_d}\\int_0^{\\infty}\\!\\!|Y(f)|^{2}df}'],
          ['p', "Le terme de site, c'est le relief : V<sub>S30</sub> déduit de la pente topographique, mesurée au pas d'échantillonnage propre du MNT plutôt qu'à un fictif 900 m, puis amplification en quart d'onde. Là où les tuiles d'altitude n'arrivent pas, le champ retombe sur une classe de site unique partout, et le panneau le dit — une intensité calculée avec une seule amplification n'est fonction que de la distance, ce qui se dessine en cercles concentriques."],
          ['tex', '\\text{slope} = \\dfrac{\\lVert\\nabla h\\rVert}{\\Delta s},\\quad \\Delta s = \\max\\!\\bigl(900\\,\\text{m},\\,1.25\\,\\Delta(z)\\bigr) \\;\\longrightarrow\\; V_{S30} \\;\\longrightarrow\\; A_{qwl} = \\sqrt{\\dfrac{\\rho_r\\beta_r}{\\overline{\\rho\\beta}(\\lambda/4)}}'],
          ['tex', '\\mathrm{MMI} = 3.78 + 1.47\\log_{10}\\mathrm{PGV}\\;\\;(\\mathrm{PGV}>0.76\\ \\text{cm/s}) \\qquad I_{\\mathrm{JMA}} = 2\\log_{10}a_0 + 0.94'],
          ['p', "Les temps d'arrivée sont obtenus par tracé de rais dans la structure de vitesses <b>IASP91</b> — l'angle de départ est résolu pour la profondeur du foyer et la distance épicentrale, puis le trajet est intégré, au lieu d'être lu dans une table. Cela donne les arrivées P et S."],
          ['p', "L'amplitude est une décroissance empirique avec la distance, multipliée par un <b>Q dépendant de la fréquence</b> (atténuation anélastique) et par une <b>amplification de site</b>. La classe de site n'est pas supposée : elle vient de la pente mesurée au pas d'échantillonnage propre du MNT en ce point (raide = rocher, plat = alluvions)."],
          ['lim', "Au-delà du bas de l'échelle d'intensité, le champ <b>extrapole</b>, et le dit. L'épicentre est là où l'utilisateur l'a placé ; aucune coordonnée devinée par une IA n'est jamais utilisée."],
          ['h3', "D'un spectre à un nombre à l'écran"],
          ['p', "Le spectre d'amplitude de Fourier est évalué en 64 fréquences réparties logarithmiquement entre 0,1 et 20 Hz. Tout le reste est l'intégrale du facteur de crête ci-dessus, évaluée par la méthode des trapèzes sur ces 64 points ; la durée de trajet vaut T<sub>d</sub> = T<sub>source</sub> + 0,05&thinsp;r, la forme standard de Boore."],
          ['p', "Le champ est résolu sur une grille dont le pas est choisi d'après la magnitude &mdash; 512 m pour M &lt; 6, 1 à 2 km au-dessus &mdash; puis <b>interpolé pour l'affichage seulement</b>. Rien n'est dessiné plus fin que la grille sur laquelle il a été résolu."]
        ]
      },
      {
        id: 'tsunami', nav: "Tsunami", h: "Tsunami",
        blocks: [
          ['p', "La propagation suit les équations non linéaires en eau peu profonde avec frottement de fond de Manning, résolues explicitement sur une grille décalée. Le pas de temps est borné par la maille la plus rapide ; il n'est pas choisi."],
          ['tex', '\\dfrac{\\partial\\eta}{\\partial t} + \\nabla\\!\\cdot\\!\\bigl[(h+\\eta)\\mathbf{u}\\bigr] = 0, \\qquad \\dfrac{\\partial\\mathbf{u}}{\\partial t} + g\\nabla\\eta + \\dfrac{g\\,n^{2}\\lVert\\mathbf{u}\\rVert\\mathbf{u}}{(h+\\eta)^{4/3}} = 0'],
          ['tex', 'c = \\sqrt{g\\,h}, \\qquad \\Delta t \\le \\dfrac{\\mathrm{CFL}\\,\\Delta x}{\\max\\sqrt{g\\,h}}, \\qquad \\dfrac{H_2}{H_1} = \\left(\\dfrac{h_1}{h_2}\\right)^{1/4}'],
          ['p', "La surface initiale est le déplacement d'Okada (1985) en demi-espace élastique produit par la rupture dessinée — l'onde part donc d'une faille ayant une longueur, une largeur, une profondeur, un pendage et un glissement, pas d'une bosse."],
          ['tex', '\\eta_0(x,y) = u_z^{\\,\\text{Okada}}\\bigl(x,y;\\,L,\\,W,\\,d,\\,\\delta,\\,\\lambda,\\,\\bar{D}\\bigr), \\qquad M_0 = \\mu\\,L\\,W\\,\\bar{D}'],
          ['p', "Le déplacement initial de la surface de la mer est la solution d'<b>Okada (1985)</b> en demi-espace élastique pour une faille rectangulaire. Deux points d'implémentation comptent :"],
          ['ul', [
            "L'arc tangente doit être la <b>valeur principale</b> — utiliser <code>atan2</code> produit un faux lobe de subsidence derrière la faille.",
            "Tronquer la fenêtre de calcul laisse une marche, et cette marche se propage comme un <b>faux front d'onde</b>. La fenêtre est élargie jusqu'à ce que le déplacement y soit négligeable."
          ]],
          ['p', "La propagation est l'équation des <b>ondes longues linéaires</b> sur une bathymétrie mesurée, avec une célérité <span class=\"pg-eq pg-eq-inline\">c = &radic;(gh)</span> — environ 200 m/s sous 4 000 m d'eau (la vitesse d'un avion de ligne), qui ralentit et se raidit à mesure que la profondeur diminue. Elle s'exécute dans un Web Worker pour que la carte reste réactive."],
          ['h3', "La discrétisation, écrite en toutes lettres"],
          ['p', "Grille décalée d'Arakawa C, saute-mouton en temps : la surface &eta; vit au centre des mailles et les deux flux volumiques M, N sur les faces qui les séparent, décalés d'un demi-pas dans le temps. C'est le schéma qu'utilise tout code opérationnel d'ondes longues, et il est écrit ici parce que « équations en eau peu profonde » ne dit pas à soi seul comment elles ont été résolues."],
          ['tex', '\\eta^{\\,t+1}_{i,j} = \\eta^{\\,t}_{i,j} - \\frac{\\Delta t}{\\Delta x}\\Bigl[(M^{\\,t+\\frac12}_{i+\\frac12,j}-M^{\\,t+\\frac12}_{i-\\frac12,j}) + (N^{\\,t+\\frac12}_{i,j+\\frac12}-N^{\\,t+\\frac12}_{i,j-\\frac12})\\Bigr]'],
          ['tex', 'M^{\\,t+\\frac12}_{i+\\frac12,j} = M^{\\,t-\\frac12}_{i+\\frac12,j} - g\\,D\\,\\frac{\\Delta t}{\\Delta x}\\bigl(\\eta^{\\,t}_{i+1,j}-\\eta^{\\,t}_{i,j}\\bigr) - \\frac{g\\,n^{2}}{D^{7/3}}\\lVert\\mathbf{M}\\rVert M\\,\\Delta t'],
          ['h3', "Stabilité, bords et terre émergée"],
          ['tex', '\\frac{\\partial \\eta}{\\partial t} \\pm c\\,\\frac{\\partial \\eta}{\\partial x} = 0 \\quad\\text{(Sommerfeld, at the open edge)}, \\qquad D = h+\\eta > \\varepsilon_{\\text{dry}} = 0.01\\ \\text{m}'],
          ['p', "Le pas de temps est tiré de la condition CFL sur la maille la <b>plus profonde</b> du domaine (0,45 de la limite) : c'est donc une conséquence de la bathymétrie, pas un réglage. Les bords ouverts rayonnent au lieu de réfléchir &mdash; un bord fermé renverrait une fausse onde dans le domaine en un seul temps de traversée &mdash; et une maille n'est mouillée qu'au-dessus d'une profondeur de 1 cm, ce qui empêche le terme de frottement de diviser par une profondeur qui s'annule au trait de côte."],
          ['lim', "Le solveur est <b>non dispersif</b> (ondes longues) : il ne reproduit donc pas la dispersion de l'onde de tête d'une source très courte, et il ne modélise ni le déferlement ni le jet de rive sur une rugosité. Les temps d'arrivée et la première crête sont sa réponse ; la hauteur d'eau à terre est une borne « en baignoire », pas un calcul de jet de rive."]
        ]
      },
      {
        id: 'sealevel', nav: "Niveau de la mer et submersion", h: "Niveau de la mer &amp; submersion",
        blocks: [
          ['p', "Le sol situé au niveau choisi ou en dessous est ombré — un remplissage en baignoire. La teinte représente la <b>hauteur d'eau elle-même</b>, et la résolution des données d'altitude est directement la résolution du trait de submersion."],
          ['lim', "Les digues, vannes et réseaux de drainage ne sont pas modélisés, et la connectivité à la mer n'est pas exigée par défaut. L'affirmation est donc <b>« ce sol est sous ce niveau »</b>, et non « voici ce qui serait inondé »."],
          ['h3', "La connectivité, quand elle est demandée"],
          ['p', "La réponse par défaut est maille par maille : ce sol est-il au niveau indiqué ou en dessous. Avec la connectivité activée, un remplissage par diffusion part de la mer sur la même grille et seules les mailles qu'il atteint sont ombrées &mdash; ce qui retire les dépressions fermées sous le niveau de la mer (la dépression de Qattara, la Vallée de la Mort) que la réponse en baignoire inclut. Les deux réponses ne diffèrent que par ces bassins, et le panneau indique laquelle est affichée."]
        ]
      },
      {
        id: 'tides', nav: "Marées", h: "Marées",
        blocks: [
          ['p', "La série provient du modèle de marée mondial d'Open-Meteo Marine — niveau de la mer horaire au-dessus du niveau moyen. Les pleines et basses mers en sont les <b>extrema locaux</b>, l'heure étant affinée en ajustant une parabole sur les trois échantillons entourant chaque renverse, si bien que la réponse n'est pas calée sur l'heure ronde à laquelle le modèle est échantillonné."],
          ['tex', 't^{*} \\;=\\; t_i + \\tfrac{1}{2}\\,\\frac{a-c}{a-2b+c}\\,\\Delta t'],
          ['p', "Activer le calque échantillonne le trait de côte visible et interroge le modèle pour tous ces points d'un coup : toute la côte à l'écran porte donc son niveau, sa phase et sa prochaine renverse avant même qu'on touche quoi que ce soit — et le sol situé à ce niveau ou en dessous est ombré à partir des mêmes données d'altitude qu'au §6. Toucher une côte remplace la vue d'ensemble par le tableau propre à ce point, demandé sur ses propres coordonnées."],
          ['p', "« Jusqu'où monte l'eau » utilise exactement la construction du §6, avec le niveau de marée courant comme niveau d'eau. À l'échelle de quelques minutes à quelques heures, un remplissage en eau calme est une approximation honnête — mais ce n'est pas un modèle de jet de rive."]
        ]
      },
      {
        id: 'currents', nav: "Courants marins", h: "Courants marins",
        blocks: [
          ['p', "Le champ embarqué est l'écoulement géostrophique déduit de l'altimétrie satellitaire, augmenté de la composante d'Ekman entraînée par le vent ; chaque courant nommé est ensuite intégré dans ce champ mesuré à partir d'un point d'amorce publié sur son axe."],
          ['tex', 'u_g = -\\dfrac{g}{f}\\dfrac{\\partial\\eta}{\\partial y}, \\qquad v_g = \\dfrac{g}{f}\\dfrac{\\partial\\eta}{\\partial x}, \\qquad f = 2\\Omega\\sin\\varphi'],
          ['tex', '\\lVert\\mathbf{u}_{ek}\\rVert = \\dfrac{B}{\\sqrt{|f|}}\\dfrac{\\lVert\\boldsymbol{\\tau}\\rVert}{\\rho_w},\\quad B = 0.065\\ \\text{s}^{-1/2}, \\qquad \\theta = \\theta_{\\tau} - \\operatorname{sgn}(\\varphi)\\,55^{\\circ}'],
          ['tex', '\\mathbf{x}_{n+1} = \\mathbf{x}_n + \\Delta s\\,\\hat{\\mathbf{u}}\\!\\left(\\mathbf{x}_n + \\tfrac{\\Delta s}{2}\\hat{\\mathbf{u}}(\\mathbf{x}_n)\\right), \\qquad \\Delta s = 25\\ \\text{km}'],
          ['p', "Chaud ou froid est <b>mesuré</b>, et non déduit de la direction de l'écoulement : c'est la température de surface propre au courant comparée à la moyenne zonale à la même latitude. À ±0,6 K près, le courant est dessiné en gris, car les courants équatoriaux et circumpolaires suivent réellement leurs propres isothermes."],
          ['tex', '\\overline{\\Delta T} = \\dfrac{1}{N}\\sum_{i=1}^{N}\\Bigl[T(\\mathbf{x}_i)-\\langle T\\rangle_{\\varphi_i}\\Bigr] \\quad \\begin{cases}>+0.6\\ \\text{K} & \\text{warm}\\\\ <-0.6\\ \\text{K} & \\text{cold}\\\\ \\text{otherwise} & \\text{zonal}\\end{cases}'],
          ['tagline', "Un champ d'écoulement, dessiné comme les lignes de courant de l'eau qui bouge réellement."],
          ['p', "Le champ de vitesse provient de <code>ocean_current_velocity</code> et <code>ocean_current_direction</code> d'Open-Meteo Marine — le même modèle sans clé que celui des marées. Une grille couvrant la vue est demandée en une seule requête, les mailles terrestres sont écartées grâce au masque de terres embarqué, et les réponses sont interpolées bilinéairement en un champ continu."],
          ['p', "Une <b>ligne de courant</b> est ensuite intégrée dans ce champ depuis chaque point d'amorce par un pas de Runge–Kutta d'ordre 4, vers l'avant et vers l'arrière : une ligne est donc un chemin que l'eau emprunte réellement, et non une flèche isolée. L'épaisseur du trait donne la vitesse ; les pointes le long de la ligne indiquent le sens."],
          ['eq', 'x<sub>n+1</sub> = x<sub>n</sub> + (h/6)(k<sub>1</sub> + 2k<sub>2</sub> + 2k<sub>3</sub> + k<sub>4</sub>), &nbsp; k<sub>i</sub> = u(x)/|u| &nbsp; (unit-speed, so the step is a distance)'],
          ['p', "Chaud ou froid est <b>mesuré, pas supposé</b>. 暖流 / 寒流 est une affirmation sur ce que l'eau transporte : chaque ligne de courant est donc comparée à la température de surface relevée environ 110 km <b>en amont</b> le long de son propre chemin. Un amont plus chaud qu'ici signifie que le courant apporte de la chaleur (rouge) ; un amont plus froid, qu'il apporte du froid (bleu)."],
          ['lim', "Là où l'écart est inférieur à 0,25 K — dans le bruit propre du modèle — la ligne est <b>grise</b> et la légende indique « ni l'un ni l'autre ». Un courant qui ne transporte pas de contraste thermique ne doit pas être coloré comme s'il le faisait. Les noms viennent de Wikidata (CC0) et sont placés à la coordonnée publiée pour chaque courant ; un nom est un point sur la carte et n'affirme pas que la ligne voisine est ce courant."],
          ['h3', "Le champ : ce qui est moyenné, et sur quoi"],
          ['p', "Le champ embarqué est une <b>climatologie</b> : 36 champs de vitesse répartis uniformément sur tout l'enregistrement servi (2015&rarr;aujourd'hui) plus 24 champs de tension du vent, sur la grille 0,25&deg; de la source. Une moyenne sur 36 champs réduit la variance mésoéchelle (les tourbillons) d'environ un facteur six, et c'est ce qui fait d'un chemin tracé un courant plutôt qu'un anneau."],
          ['tex', '\\mathbf{u}_{\\text{tot}} \\;=\\; \\underbrace{\\frac{g}{f}\\,\\hat{\\mathbf{k}}\\times\\nabla\\eta}_{\\text{geostrophic (altimetry)}} \\;+\\; \\underbrace{\\frac{B}{\\sqrt{|f|}}\\frac{\\boldsymbol{\\tau}}{\\rho_w}\\,\\mathcal{R}\\bigl(-\\operatorname{sgn}\\varphi\\cdot55^{\\circ}\\bigr)}_{\\text{Ekman (wind stress)}}'],
          ['h3', "Comment est produite la ligne d'un courant nommé"],
          ['tex', '\\mathbf{x}_{n+1} = \\mathbf{x}_n + \\Delta s\\;\\hat{\\mathbf{u}}\\!\\left(\\mathbf{x}_n + \\tfrac{\\Delta s}{2}\\,\\hat{\\mathbf{u}}(\\mathbf{x}_n)\\right), \\qquad \\Delta s = 25\\ \\text{km}'],
          ['p', "Chacun des 108 courants nommés est intégré vers l'avant et vers l'arrière depuis un point d'amorce publié sur son axe, jusqu'à 5 000 km de chaque côté, à travers ce champ mesuré. Trois règles arrêtent un parcours : une maille traversée deux fois à plus de 12 pas d'écart (un tourbillon fermé), un retour à moins de 60 km de l'amorce après un vrai trajet (un gyre qui se referme), ou un budget de 12 mailles consécutives sous 2,2 cm/s. Un tracé qui se referme en moins de 1 500 km est <b>rejeté</b> et l'amorce est réessayée depuis l'anneau qui l'entoure &mdash; une position d'axe publiée peut tomber dans une recirculation stationnaire à côté du courant."],
          ['h3', "Le fichier que lit le navigateur"],
          ['tex', 's_{\\text{byte}} = \\left\\lfloor 255\\sqrt{\\frac{\\min(s,\\,2.5)}{2.5}} \\right\\rceil, \\qquad b_{\\text{byte}} = \\left\\lfloor \\frac{255\\,\\theta}{360^{\\circ}} \\right\\rceil'],
          ['tex', '\\text{stride} = \\min\\Bigl\\{\\,2^{k} \\;:\\; \\frac{\\Delta\\lambda_{\\text{view}}}{0.25^{\\circ}2^{k}}\\cdot\\frac{\\Delta\\varphi_{\\text{view}}}{0.25^{\\circ}2^{k}} \\le N_{\\max}\\Bigr\\},\\qquad N_{\\max}=4\\,200\\ (\\text{phone}),\\;9\\,000'],
          ['p', "Le champ est livré comme une grille régulière &mdash; 1 440 &times; 720 mailles, un octet de vitesse et un de cap &mdash; plutôt que comme une liste de flèches, car une liste fige l'espacement au moment de la construction. Le client parcourt la grille par pas, en choisissant le pas le plus grossier qui remplisse encore la vue avec au plus N<sub>max</sub> marques, et chaque maille ainsi échantillonnée est la <b>moyenne vectorielle</b> de son bloc (moyenner des caps comme des nombres transformerait 350&deg; et 10&deg; en 180&deg;). La vitesse est stockée via une racine carrée, si bien que la résolution est de 0,05 cm/s dans le bas de l'échelle, là où se trouvent les courants de bord est."],
          ['h3', "Les douze mois"],
          ['p', "Un second fichier porte douze climatologies mensuelles à 0,5&deg; &mdash; six années de chaque mois civil moyennées &mdash; et n'est récupéré que si un mois est choisi. Chaque courant nommé porte aussi ses douze vitesses mensuelles et la projection moyenne de l'écoulement de ce mois <b>sur son propre chemin</b> ; là où cette projection change de signe d'un mois à l'autre, le courant s'inverse avec la saison et la liste le signale. Les chemins eux-mêmes ne sont pas retracés chaque mois : un champ à 0,5&deg; ne peut pas soutenir douze géométries différentes, et une ligne qui changerait de forme tous les mois serait une affirmation sur le tracé que la donnée ne fait pas."]
        ]
      },
      {
        id: 'atmosphere', nav: "Atmosphère et ciel", h: "Atmosphère et couleur du ciel",
        blocks: [
          ['tagline', "De quelle couleur est le ciel, depuis cette hauteur, sous cet angle solaire, en regardant dans cette direction — intégré plutôt que choisi."],
          ['p', "Un moteur de rendu qui choisit deux couleurs hexadécimales et les interpole ne coïncide avec le vrai ciel que pour une seule élévation solaire et une seule hauteur de caméra. Ici, on vole d'une rue à l'orbite basse et on voyage dans le temps : le ciel est donc <b>marché pas à pas</b> — le rayon de vue est intégré jusqu'au sommet de l'atmosphère et, à chaque pas, le rayon vers le Soleil est intégré lui aussi. Un pas dont le rayon solaire est masqué par la Terre ne contribue à rien — c'est ce qui fait tomber le crépuscule du sol vers le haut, et qui donne le crépuscule sans aucun terme de crépuscule."],
          ['h3', "Le transfert radiatif réellement intégré"],
          ['tex', 'L(\\mathbf{x},\\boldsymbol{\\omega}) \\;=\\; \\int_{0}^{t_{\\max}} T(\\mathbf{x},\\mathbf{p})\\,\\Bigl[\\, \\sigma_s^{R}(\\mathbf{p})\\,p_R(\\mu)\\,T(\\mathbf{p},\\mathbf{p}_{\\odot})\\,E_\\odot \\;+\\; \\sigma_s^{M}(\\mathbf{p})\\,p_M(\\mu)\\,T(\\mathbf{p},\\mathbf{p}_{\\odot})\\,E_\\odot \\;+\\; \\sigma_s(\\mathbf{p})\\,\\Psi_{ms}(h,\\theta_\\odot) \\Bigr]\\,dt'],
          ['tex', 'T(\\mathbf{a},\\mathbf{b}) \\;=\\; \\exp\\!\\left[-\\!\\int_{\\mathbf{a}}^{\\mathbf{b}}\\!\\bigl(\\beta_R\\,e^{-h/H_R} + 1.1\\,\\beta_M\\,e^{-h/H_M} + \\beta_{O_3}\\,\\Lambda(h)\\bigr)ds\\right]'],
          ['tex', 'p_R(\\mu) = \\frac{3}{16\\pi}\\bigl(1+\\mu^{2}\\bigr), \\qquad p_M(\\mu) = \\frac{3}{8\\pi}\\,\\frac{(1-g^{2})(1+\\mu^{2})}{(2+g^{2})\\,(1+g^{2}-2g\\mu)^{3/2}}, \\quad g = 0.76'],
          ['h3', "L'ozone, et pourquoi le crépuscule est bleu"],
          ['p', "L'ozone <b>absorbe et ne diffuse pas</b> : il apparaît donc dans l'épaisseur optique des deux rayons et dans aucune fonction de phase. C'est lui qui rend l'heure bleue bleue : le Soleil sous l'horizon, la ligne de visée traverse 10 à 40 km d'altitude, où la diffusion Rayleigh n'a plus grand-chose à retirer, et ce qui ôte le jaune-rouge résiduel est la bande de Chappuis vers 600 nm."],
          ['tex', '\\Lambda(h) \\;=\\; \\max\\!\\left(0,\\; 1 - \\frac{|h - 25\\,\\mathrm{km}|}{15\\,\\mathrm{km}}\\right), \\qquad \\beta_{O_3} = (0.650,\\,1.881,\\,0.085)\\times10^{-6}\\ \\mathrm{m^{-1}}'],
          ['h3', "La diffusion multiple"],
          ['p', "La diffusion simple ne compte un photon qu'une fois. Dans le bleu, l'air est assez épais optiquement pour que l'essentiel de ce qui atteint l'œil ait rebondi plusieurs fois, et chaque rebond efface la direction — la part diffusée plusieurs fois est donc <b>isotrope</b> et apparaît sans aucune fonction de phase. La sommation de la série géométrique donne un terme qui ne dépend que de la hauteur et de l'élévation solaire : il est donc tabulé (16 hauteurs × 24 élévations) et interpolé deux fois par échantillon."],
          ['tex', '\\Psi_{ms} \\;=\\; \\frac{L^{(2)}}{1 - f}, \\qquad f = \\frac{1}{4\\pi}\\oint \\sigma_s\\,T\\,d\\omega \\;<\\; 1'],
          ['tex', 'C \\;=\\; \\Bigl[\\,1 - e^{-L\\,\\varepsilon}\\,\\Bigr]^{1/2.2}, \\qquad \\varepsilon = 0.7'],
          ['lim', "Un seul profil d'aérosols pour toute la planète, aucun nuage, aucune luminescence nocturne et aucune lumière stellaire — une nuit profonde s'intègre donc à du noir et est plancher-née à une couleur de nuit mesurée plutôt qu'affichée telle que le modèle la renvoie. Le limbe vu de l'espace est la passe de diffusion propre au moteur de rendu, pas cette intégrale ; ce modèle décide de la couleur vers laquelle cette passe est mélangée."],
          ['h3', "La marche, et son coût"],
          ['tex', 'L=\\sum_{i=1}^{16} T(\\mathbf{x},\\mathbf{p}_i)\\bigl[\\sigma_s^R p_R + \\sigma_s^M p_M\\bigr]T(\\mathbf{p}_i,\\odot)E_\\odot\\,\\Delta t \\;+\\;\\sum_{i}\\sigma_s\\Psi_{ms}\\Delta t,\\quad T \\text{ from } M=8 \\text{ sun steps}'],
          ['p', "Seize pas le long du rayon de vue, huit le long du rayon solaire à chacun d'eux, et une table 16 &times; 24 de valeurs de diffusion multiple interpolée deux fois par échantillon. Cela fait environ 300 exponentielles par couleur, évaluées quand le Soleil ou la caméra a réellement bougé &mdash; quelques fois par seconde tout au plus, ce qui permet d'en faire une intégrale plutôt qu'un dégradé."],
          ['h3', "Vu de l'extérieur : le limbe"],
          ['tex', '\\theta_{\\text{limb}}(h_t) \\;=\\; \\arcsin\\!\\frac{R_\\oplus+h_t}{R_\\oplus+h_{\\text{eye}}} \\;-\\; 90^{\\circ}, \\qquad \\ell(h_t)\\;\\approx\\;2\\sqrt{2R_\\oplus H}\\,e^{-h_t/2H}'],
          ['p', "Depuis l'orbite, l'atmosphère n'est pas au-dessus de la tête, elle est vue par la tranche : un rayon dont l'approche minimale passe à 6 km au-dessus de la surface traverse environ 800 km d'air, un autre à 55 km n'en traverse presque pas. Les deux extrémités du dégradé dessiné sont ces deux rayons : la bande est donc blanc-bleu en bas côté jour, rouge à travers le terminateur et noire côté nuit, quelle que soit l'altitude de la caméra. Rien là-dedans n'est une couleur choisie."],
          ['lim', "Un seul profil d'aérosols pour toute la planète, aucun nuage, aucune luminescence nocturne et aucune lumière stellaire : une nuit profonde s'intègre donc à du noir et est plancher-née à une couleur de nuit mesurée. Le halo dessiné autour du globe est la passe de diffusion propre au moteur de rendu ; ce modèle décide des couleurs vers lesquelles elle est mélangée."]
        ],
      },
      {
        id: 'sun', nav: "Soleil, ombre, visibilité", h: "Soleil, ombre et bassin de visibilité",
        blocks: [
          ['p', "La position du Soleil vient de l'algorithme astronomique standard — déclinaison et angle horaire convertis en azimut et hauteur. Il est vérifié qu'il donne une déclinaison de 0° à un équinoxe et l'obliquité à un solstice."],
          ['p', "L'insolation annuelle balaie le MNT environnant par azimut pour construire le <b>profil d'horizon réel</b> du point, puis intègre la course du Soleil face à lui. Le bassin de visibilité répond <b>maille par maille</b> plutôt que par azimut, car un balayage par azimut manque des mailles à distance."],
          ['h3', "L'horizon, et l'année intégrée face à lui"],
          ['tex', 'H(\\alpha) = \\max_{r\\le R_{\\max}}\\arctan\\frac{z(r,\\alpha)-z_0}{r}, \\qquad E = \\int_{\\text{year}} I_0\\,\\cos\\theta_i\\,\\bigl[\\,\\gamma_s(t)>H(\\alpha_s(t))\\,\\bigr]\\,dt'],
          ['p', "Le relief environnant est balayé par azimut par pas de 1&deg; jusqu'à 25 km, et le plus grand angle d'élévation trouvé le long de chaque direction constitue l'horizon de cette direction. La course du Soleil pour l'année entière est ensuite intégrée face à ce profil par pas de 10 minutes, en ne comptant que les instants où il se tient au-dessus &mdash; c'est pourquoi un versant alpin exposé au nord ressort à une fraction de la valeur en terrain plat, et non au cosinus de sa latitude."],
          ['p', "Le bassin de visibilité répond <b>maille par maille</b> plutôt que par azimut : un balayage par azimut laisse des trous qui grandissent avec la distance, si bien qu'à 20 km les deux méthodes diffèrent de crêtes entières."]
        ]
      },
      {
        id: 'sats', nav: "Satellites", h: "Satellites",
        blocks: [
          ['p', "Les orbites sont propagées à partir des TLE avec <b>SGP4/SDP4</b>. Un TLE se dégrade en vieillissant et — c'est important — <b>diverge en silence</b> : il y a donc une limite stricte sur l'âge du jeu d'éléments, et tout ce qui la dépasse n'est pas dessiné."],
          ['p', "Le catalogue est un instantané embarqué complété par une récupération en direct. Une catégorie sans liste est <b>omise, pas affichée vide</b> — un tableau vide affirmerait que la catégorie ne contient aucun satellite."],
          ['h3', "SGP4, et pourquoi l'âge d'un jeu d'éléments est une limite stricte"],
          ['tex', 'n\'\' = n_0\\bigl[1 + \\tfrac{3}{2}k_2\\tfrac{(3\\cos^2 i-1)}{a^{2}(1-e^{2})^{3/2}}\\bigr],\\qquad \\sigma_{\\text{pos}} \\sim 1\\text{–}3\\ \\mathrm{km/day}\\ \\text{after epoch}'],
          ['p', "Un TLE n'est pas une position : c'est un jeu d'éléments moyens ajustés à une théorie analytique précise, et seul SGP4/SDP4 sait le lire. Son erreur croît d'environ 1 à 3 km par jour après l'époque pour une orbite basse, et elle le fait <b>en silence</b> &mdash; rien dans la donnée ne signale que la réponse est devenue fausse. Le propagateur refuse donc les jeux d'éléments au-delà d'un âge annoncé plutôt que de dessiner un point plausible au mauvais endroit."]
        ]
      },
      {
        id: 'space', nav: "Espace et corps célestes", h: "Espace &amp; corps célestes",
        blocks: [
          ['p', "Les positions des planètes et des lunes sont képlériennes, calculées à partir d'éléments orbitaux. Les corps sont dessinés grossis (à l'échelle réelle ils font moins d'un pixel), mais le <b>plafond de grossissement relève de la géométrie, pas du goût</b> : il découle de l'exigence que la Lune reste dégagée de la Terre même au périgée."],
          ['p', "Les satellites des autres planètes viennent de la table d'éléments moyens du JPL pour 177 lunes à une époque donnée, chacune propagée jusqu'à l'horloge. Les éléments ne sont pas tous dans un même plan &mdash; un satellite proche d'une planète géante se réfère au <b>plan de Laplace</b> local de sa planète, dont la table donne le pôle en ascension droite et déclinaison &mdash; et ce repère est propagé tel quel plutôt que lu comme s'il s'agissait de l'écliptique."],
          ['p', "À l'échelle du modèle, un satellite est placé par la même loi de compression que la Lune, puis <b>écarté pour dégager sa primaire</b> : comprimer une distance et un rayon par des puissances différentes peut sinon placer une lune intérieure à l'intérieur de la planète qu'elle orbite. À l'échelle réelle rien n'est déplacé, car il n'y a rien à comprimer."],
          ['p', "Les étoiles proviennent d'un catalogue embarqué d'étoiles brillantes couvrant tout le ciel, à leurs positions et magnitudes réelles ; la couleur est dérivée de l'indice B&minus;V, c'est-à-dire d'une vraie température de couleur."],
          ['h3', "Positions"],
          ['tex', 'M = E - e\\sin E \\;\\Longrightarrow\\; E_{k+1}=E_k-\\frac{E_k-e\\sin E_k-M}{1-e\\cos E_k}, \\qquad \\tan\\frac{\\nu}{2}=\\sqrt{\\tfrac{1+e}{1-e}}\\tan\\frac{E}{2}'],
          ['p', "Les planètes et les lunes viennent d'éléments moyens à une époque donnée : l'anomalie moyenne est avancée, l'équation de Kepler est résolue par Newton&ndash;Raphson (quatre itérations atteignent 10<sup>&minus;12</sup> pour e &lt; 0,9), et l'anomalie vraie en découle. Un satellite proche d'une planète géante se réfère au <b>plan de Laplace</b> local de sa planète plutôt qu'à l'écliptique, et ce repère est propagé au lieu d'être lu comme s'il en était un autre."],
          ['h3', "Les deux échelles, et ce qui est conservé entre elles"],
          ['tex', 'r_{\\text{model}} = 26\\,\\mathrm{AU}^{0.42}, \\qquad R_{\\text{model}} = 0.12\\left(\\frac{R}{R_\\oplus}\\right)^{1/3}, \\qquad d\' = \\frac{\\mathcal{P}\'\\bigl(\\mathcal{P}^{-1}(d\\tan\\tfrac{\\phi}{2})\\bigr)}{\\tan\\frac{\\phi}{2}}'],
          ['p', "L'échelle du modèle comprime les rayons orbitaux par une puissance 0,42 et les rayons des corps par une racine cubique : ce n'est donc pas une échelle mais deux, et aucune conversion unique de la distance caméra ne peut satisfaire les deux. Ce qui est transporté d'un mode à l'autre est donc le <b>rayon en espace réel au bord de l'image</b> &mdash; convertissez-le hors des anciennes unités par la loi propre à cette échelle, puis de nouveau dedans par la nouvelle, et les mêmes planètes restent aux mêmes places. Lorsqu'un corps occupe toute l'image, l'invariant devient sa taille apparente, mélangée en espace logarithmique sur la plage où l'image cesse de parler du système pour parler du corps."]
        ]
      },
      {
        id: 'flight', nav: "Modèle de vol", h: "Modèle de vol",
        blocks: [
          ['p', "La poussée et la portance décroissent avec la densité de l'air : le <b>plafond pratique n'est donc pas un mur</b> — un appareil démarré au-dessus descend jusqu'à ce que l'air puisse le porter, au lieu d'être bloqué."],
          ['p', "La caméra se trouve <em>sur</em> l'appareil plutôt que d'être une vue poursuivante corrigée après coup."],
          ['h3', "Les forces"],
          ['tex', 'L=\\tfrac12\\rho V^{2}S\\,C_L(\\alpha),\\quad D=\\tfrac12\\rho V^{2}S\\bigl(C_{D0}+\\tfrac{C_L^{2}}{\\pi e A\\!R}\\bigr),\\quad T=T_0\\left(\\frac{\\rho}{\\rho_0}\\right)^{0.7}'],
          ['p', "La portance est un C<sub>L</sub>(&alpha;) linéaire jusqu'à l'angle de décrochage, suivi d'une chute post-décrochage modélisée ; la traînée induite est le terme classique en 1/(&pi;eAR), si bien qu'une aile de faible allongement paie réellement sa portance. La poussée décroît avec la densité à la puissance 0,7, ce qui donne un plafond pratique sans règle disant « arrêtez-vous ici » : un appareil démarré au-dessus de son plafond descend jusqu'à ce que l'air puisse le porter."],
          ['h3', "L'air dans lequel il vole"],
          ['tex', '\\rho(h)=\\rho_0\\left(1-\\frac{Lh}{T_0}\\right)^{\\frac{g}{RL}-1},\\quad L=6.5\\ \\mathrm{K/km};\\qquad \\rho=\\rho_{11}e^{-\\frac{g(h-11\\,\\mathrm{km})}{R\\,T_{11}}}\\ (h>11\\ \\mathrm{km})'],
          ['p', "L'atmosphère standard internationale, en deux morceaux : une troposphère à gradient linéaire et une stratosphère isotherme au-dessus de 11 km. La vitesse est donc deux nombres différents &mdash; la vitesse vraie et la vitesse équivalente que ressent la cellule &mdash; et le HUD indique de laquelle il s'agit."],
          ['h3', "L'intégration"],
          ['tex', '\\mathbf{y}_{n+1}=\\mathbf{y}_n+\\Delta t\\,\\mathbf{f}(\\mathbf{y}_n),\\quad \\Delta t=\\min\\!\\left(\\tfrac{1}{30}\\ \\mathrm{s},\\,\\Delta t_{\\text{frame}}\\right)\\ \\text{sub-stepped so } \\Delta t\\le \\tfrac{1}{120}\\ \\mathrm{s}'],
          ['p', "Intégration explicite en sous-pas bornés : une image longue ne devient pas un grand pas de temps qui ferait traverser le sol à l'appareil. La caméra se trouve <em>sur</em> l'appareil plutôt que d'être une vue poursuivante corrigée après coup, et le relief sous elle est échantillonné à partir des mêmes données d'altitude que toutes les autres fonctions de relief de cette page."]
        ]
      },
      {
        id: 'routing', nav: "Itinéraires et accessibilité", h: "Itinéraires &amp; accessibilité",
        blocks: [
          ['p', "Les itinéraires routiers viennent d'OSRM sur le réseau OpenStreetMap, les variantes du même moteur. Le calcul ferroviaire s'exécute sur des voies OSM réelles et <b>se rattache à la plus grande composante connexe</b> — se rattacher à une voie de garage isolée rendrait la destination inaccessible. Les transports en commun utilisent de vrais horaires via MOTIS/Transitous."],
          ['p', "Une isochrone est l'ensemble des points qu'un budget de temps permet d'atteindre, enveloppé dans une coque. La coque sert à l'affichage — <b>l'accessibilité elle-même est décidée sur le réseau</b>, pas par la coque."],
          ['h3', "Ce qu'une isochrone résout réellement"],
          ['p', "Un budget de temps est propagé sur le réseau routier depuis l'origine &mdash; une recherche de plus courts chemins « plusieurs vers un », pas un cercle &mdash; puis les nœuds atteints sont enveloppés dans une coque concave pour le dessin. <b>L'accessibilité est décidée sur le réseau</b> ; la coque est une image de la réponse et n'est jamais consultée pour la produire. Là où le réseau est clairsemé, la coque a l'air visiblement fausse et la réponse qu'elle recouvre reste juste."]
        ]
      },
      {
        id: 'trade', nav: "Flux commerciaux", h: "Flux commerciaux",
        blocks: [
          ['p', "Commerce bilatéral de marchandises d'après BACI (CEPII) via l'OEC — déclarant &times; partenaire &times; section SH &times; année, 1995–2024."],
          ['p', "<b>L'épaisseur du trait est proportionnelle à la racine carrée de la valeur.</b> Deux raisons. Le premier partenaire d'un pays vaut couramment 500&times; le centième : des épaisseurs linéaires effaceraient donc tout au-delà des trois premiers ; et un logarithme ferait paraître un flux de 200 M$ trois fois moins large qu'un flux de 200 Md$, ce qui ment dans l'autre sens. Avec la &radic;, l'<b>aire</b> d'un trait (épaisseur &times; longueur) suit la quantité — c'est la convention des cartes de flux."],
          ['eq', 'w = 1.2 + 11.8 &middot; &radic;(v / v<sub>max</sub>) &nbsp;px'],
          ['lim', "Seule l'<b>image</b> est comprimée. Le survol affiche à la fois la forme abrégée (<code>141,6 Md$</code>) et le <b>chiffre exact, non arrondi</b> (<code>141 585 432 101 $</code>). Rien dans cette application ne rééchelonne une valeur pour l'afficher."]
        ]
      },
      {
        id: 'energy', nav: "Mix énergétique", h: "Mix énergétique",
        blocks: [
          ['p', "Mix électrique d'après Ember, énergie primaire d'après la revue de l'Energy Institute, tous deux via Our World in Data, par pays et par année. La carte porte le <b>seul chiffre qui classe les pays</b> (part bas-carbone de l'électricité / part fossile de l'énergie primaire) ; la composition elle-même est une <b>barre empilée</b>, car neuf sources ne tiennent pas dans une couleur."],
          ['p', "Voyager dans le temps relit <b>les lignes de cette année-là</b> plutôt que d'interpoler. Si un pays n'a pas de ligne pour cette année, l'observation la plus récente à cette date ou avant est utilisée — et l'année réellement employée est indiquée."]
        ]
      },
      {
        id: 'crops', nav: "Cultures", h: "Cultures",
        blocks: [
          ['p', "Le raster est celui de la FAO GAEZ v4 — surface récoltée, rendement ou production pour une culture, à une année de référence donnée, dessiné à la résolution que le service renvoie pour la zone affichée."],
          ['p', "Une maille porteuse de données est <b>opaque</b> : la rampe de couleurs dit ce qu'est le nombre, la transparence ne dit donc rien et appartient entièrement au réglage d'opacité. Une maille sans culture reste transparente, car il s'agit d'une absence de donnée et non d'une petite valeur."],
          ['lim', "C'est une grille d'année de référence, pas une grille en direct, et le panneau indique l'année. Une statistique nationale n'est pas une carte de terrain : lorsque vous avez besoin de l'étendue physique des terres cultivées, la classe « terres cultivées » à 10 m d'ESA WorldCover est proposée séparément, et <b>les deux ne sont jamais fondues en une seule image</b>."]
        ]
      },
      {
        id: 'alerts', nav: "Alertes", h: "Alertes météo &amp; catastrophes",
        blocks: [
          ['p', "Pour le Japon, le flux temps réel de la JMA est lu <b>à l'échelle pour laquelle l'alerte est émise</b> — il porte à la fois un niveau préfectoral et un niveau municipal. La carte est peinte à la préfecture et les lignes municipales sont listées au toucher. La couleur correspond au niveau le plus élevé réellement en vigueur (alerte d'urgence = violet, alerte = rouge, avis = jaune). Les États-Unis utilisent le flux d'alertes actives du NWS, qui porte sa propre géométrie."],
          ['lim', "Rien de dessiné n'est <b>pas</b> la même chose que rien en vigueur. Toucher un pays dont l'agence n'est pas raccordée le dit en toutes lettres — cette application ne fera pas une affirmation de sécurité avec une carte vide."]
        ]
      },
      {
        id: 'news', nav: "Géolocalisation des actualités", h: "Géolocalisation des actualités",
        blocks: [
          ['p', "Placer un article sur la carte est fait par du <b>code déterministe</b>, pas par un modèle : l'extraction, l'appariement et la levée d'ambiguïté sont des règles et des répertoires géographiques, et l'IA n'explique jamais que le sens. Le regroupement est déterministe lui aussi, avec des bigrammes CJC pour les titres japonais."],
          ['p', "La date d'un article n'est <b>pas</b> la date de l'événement, et les deux sont tenues séparées."]
        ]
      },
      {
        id: 'time', nav: "Horloge et machine à remonter le temps", h: "Horloge &amp; machine à remonter le temps",
        blocks: [
          ['p', "Il n'y a qu'une seule horloge dans l'application. Le terminateur jour-nuit, les positions des corps célestes, l'année des statistiques, l'année du commerce et l'heure de récupération des alertes y sont tous abonnés : passer de « maintenant » à un instant passé est donc un changement unique qui atteint toutes les fonctions."],
          ['p', "Voyager vers une année passée dessine aussi <b>les frontières de cette époque</b> (l'instantané historique le plus proche à cette année ou avant). Rien de ce qui n'existe qu'à l'année n'est interpolé pour paraître quotidien."]
        ]
      },
      {
        id: 'labels', nav: "Taille des étiquettes", h: "Taille des étiquettes",
        blocks: [
          ['p', "Toutes les tailles de texte de la carte dérivent d'une même échelle dont la spécification est une <b>relation</b>, pas une valeur : une étiquette qui n'est pas un lieu est plus petite qu'une étiquette de lieu. La référence des étiquettes hors lieux est tenue à part, si bien que relever le plafond des noms de pays ne gonfle pas silencieusement avec lui les étiquettes de mers, de points d'intérêt et de grille."]
        ]
      },
      {
        id: 'ai', nav: "Ce que l'IA ne décide pas", h: "Ce que l'IA n'a pas le droit de décider",
        blocks: [
          ['p', "Atlas (la console d'IA) est responsable du <b>sens</b> ; le code est responsable de l'<b>exécution</b>. Concrètement :"],
          ['ul', [
            "L'IA n'écrit jamais de <b>coordonnées</b>. Elle nomme des lieux sous forme de cibles structurées (codes ISO, noms de lieux) qui sont résolues contre des jeux de données réels.",
            "Une cible non résolue n'est ni rattrapée en silence ni abandonnée en silence — l'échec est renvoyé comme un fait.",
            "Le fait qu'une chose ait changé est décidé par le <b>code</b> ; l'IA n'écrit que l'explication (surveillances et alertes).",
            "L'IA ne peut pas rapporter une action qu'elle n'a pas effectuée ; une exécution partielle est marquée comme partielle dans le résultat."
          ]]
        ]
      }
    ]
  }
,

  /* ── les descriptions des entrées du registre (#R246) ────────────────────────────────────────
     Traduit depuis `sourceUse` de pages.en.js, qui porte l'original anglais. Chaque entrée est
     indexée par le NOM du registre (js/reference-data.js) ; une entrée absente retombe sur
     l'anglais, clé par clé, exactement comme la prose ci-dessus. */
  sourceUse: {
    "CRUST1.0 — global crustal model": "Fourni avec l'application (data/crust1.bin.gz) : le modèle global de croûte à 1° — sédiments, croûte cristalline et manteau supérieur, chaque couche avec sa vitesse de cisaillement, sa densité et sa profondeur. Le simulateur sismique en construit le profil de vitesses de chaque site sous 30 m, ce qui permet à un bassin d'amplifier les longues périodes.",
    "USGS Slab2 — subduction zone geometry": "Fourni avec l'application (data/slab2.bin.gz) : profondeur, direction et pendage des 27 zones de subduction actives. Le simulateur distingue ainsi un séisme d'interface d'un séisme intraplaque plongeante — la même question et la même réponse partout sur Terre.",
    "Bird (2003) PB2002 plate boundaries": "Fourni avec l'application (data/tectonics.bin.gz) : distance à la limite de plaques la plus proche, sa classe et les polygones d'orogènes (déformation diffuse). Classe le contexte tectonique du séisme et donc les paramètres publiés de mouvement du sol.",
    "USGS ShakeMap station lists": "Accélération et vitesse maximales enregistrées par de vrais instruments, pour noter le modèle sismique face aux observations (scripts/seismic-validate.mjs). Téléchargées uniquement lors de cette validation hors ligne, jamais par l'application dans votre navigateur.",
    "CARTO basemaps": "Tuiles vectorielles de fond de carte (clair/sombre)",
    "MapLibre GL JS": "Le moteur de rendu cartographique par défaut (BSD-3-Clause). Il dessine toutes les vues 2D/3D, la projection du globe et le maillage du relief.",
    "CesiumJS": "Second moteur de rendu facultatif (Apache-2.0), sélectionnable dans Réglages ▸ Comportement de la carte ▸ Moteur de carte. Téléchargé uniquement s'il est choisi. Il n'utilise AUCUN actif Cesium Ion ni jeton d'accès — il affiche la même imagerie Esri et les mêmes données d'altitude AWS terrarium que le moteur par défaut.",
    "Twemoji (Twitter Emoji)": "Police web de drapeaux hébergée sur ce site (TwemojiCountryFlags.woff2) afin que les emoji de drapeau s'affichent sur les plateformes dépourvues de glyphes natifs (Windows, par exemple). Graphismes sous licence CC-BY 4.0.",
    "Esri World Imagery": "Imagerie satellite et étiquettes de référence ; tuiles de référence World Hillshade et World Transportation (couche d'ombrage du relief et image d'aperçu de la couche routière)",
    "OpenStreetMap": "Recherche de lieux et contours de lieux/régions (Nominatim), le tracé réel d'un cours d'eau lorsqu'on clique sur son nom sur la carte, et les données du fond de carte",
    "NASA GIBS / Worldview": "Température, précipitations, température de surface de la mer, concentration de glace de mer et anomalie de TSM, neige, aérosols et indice UV d’aérosols, monoxyde de carbone, humidité du sol, feux, végétation (NDVI) et relief en couleur ainsi que l’imagerie infrarouge des nuages depuis les satellites géostationnaires (Himawari, GOES-East, GOES-West)",
    "NASA Blue Marble (via NASA EOSDIS GIBS)": "L'image de base de la Terre entière fournie avec l'application (data/world-basemap.jpg — Blue Marble : Shaded Relief and Bathymetry, 2048×1024, équirectangulaire). Elle est dessinée SOUS les tuiles satellite, de sorte que le globe n'est jamais vide pendant leur chargement, et — parce qu'elle est équirectangulaire et non en Web Mercator — elle sert aussi de plancher HORS LIGNE pour les calottes polaires au-delà de ±85,05° dans le moteur Cesium, là où les tuiles Mercator n'existent pas. Au-dessus d'elle, les calottes sont dessinées à partir du service EPSG:4326 en tuiles de NASA GIBS (Blue Marble : Shaded Relief and Bathymetry, 500 m), car une image équirectangulaire unique ne possède qu'UNE seule ligne de pixels pour ses 0,176° de latitude les plus hauts et étire cette ligne en une bavure radiale sur toute la calotte. Les deux suivent le fond satellite. Dans le moteur MapLibre, où une image équirectangulaire unique ne peut pas être drapée sur le globe, la même image est utilisée un cran plus grossièrement : la COULEUR MOYENNE de ses lignes polaires est mesurée à l'exécution et peinte comme couche la plus basse, si bien que les calottes au-delà de ±85,05° sont de la glace plutôt que la couleur de fond du moteur. Cette couleur est une mesure de cette imagerie, pas une valeur choisie. Régénérée par scripts/build-world-basemap.mjs.",
    "NOAA sea-surface currents, wind stress and temperature (CoastWatch / PolarWatch ERDDAP)": "La couche des courants océaniques — 108 courants nommés (data/ocean-currents.json) plus le champ d'écoulement sous forme de GRILLE et non de liste de flèches : data/ocean-currents-field.bin.gz est la maille de 0,25° de la source elle-même, 1 440 × 720 cellules dont 466 007 portent un écoulement, un octet de vitesse et un de cap, le client choisissant son propre pas selon la vue. data/ocean-currents-months.bin.gz ajoute douze climatologies mensuelles à 0,5° (six ans pour chaque mois calendaire), téléchargées seulement si un mois est choisi. Régénéré à partir des mêmes trois produits NOAA. ⚠ Les flèches ET les tracés sont mesurés : une moyenne CLIMATOLOGIQUE de champs répartis sur tout l'enregistrement fourni, conservée sur la grille de 0,25° de la source, chaque courant nommé étant suivi dans ce champ par intégration numérique (RK2, pas de 25 km, détection de boucle et de fermeture) à partir d'une amorce publiée sur son axe. Seuls le NOM et l'amorce relèvent d'un choix éditorial ; aucune géométrie n'est copiée d'une carte. La vitesse est le courant de surface GÉOSTROPHIQUE mélangé de NOAA CoastWatch, issu de l'altimétrie satellitaire multi-missions (Sentinel-3A/B, CryoSat-2, Jason-2/3, SARAL), et la part due au vent est ajoutée à partir de la tension de vent mélangée de NOAA NCEI via la relation ajustée sur bouées dérivantes de Ralph & Niiler (1999) — |u| = B·|τ|/(ρ√f), 55° cum sole, atténuée à moins de 2,5° de l'équateur, soit la décomposition même dont OSCAR est issu. ⚠ CHAUD OU FROID EST DÉSORMAIS MESURÉ, et non déduit de l'écoulement : c'est la TSM propre à chaque courant comparée à la moyenne zonale à la même latitude (NOAA OISST v2.1) — la définition des manuels — et c'est ce qui place les Canaries (−2,9 K), la Californie (−2,3 K), le Pérou (−3,1 K) et le Benguela (−1,2 K) du côté froid, là où la déduction précédente en donnait trois chauds ou neutres. À moins de ±0,6 K, le courant est dessiné en gris, car les courants équatoriaux et circumpolaires suivent réellement leurs propres isothermes. Les trois produits sont des œuvres du gouvernement des États-Unis, dans le domaine public ; le produit altimétrique est généré avec AVISO+. Régénéré par scripts/build-ocean-currents.mjs.",
    "JPL Solar System Dynamics — planetary satellites": "Les 177 lunes dessinées autour des autres planètes (data/moons.json) — éléments orbitaux moyens INCLUANT l'anomalie moyenne à l'époque 2000-01-01,5 TDB, le nombre qui fait de la position d'une lune une réponse plutôt qu'un arrangement, ainsi que le plan de référence propre à chaque satellite (l'écliptique, ou le plan de Laplace local de la planète avec son pôle). Rayons moyens issus de la table de paramètres physiques associée. Régénéré par scripts/build-moons.mjs.",
    "Hipparcos Catalog (ESA 1997) — CDS I/239": "Les 98 887 étoiles visibles derrière le globe en mode sombre (data/stars.bin — ascension droite, déclinaison, magnitude V, indice de couleur B−V et la parallaxe mesurée, jusqu'à V 9,5). Les positions sont précessées de J2000 vers l'horloge de la carte puis tournées du temps sidéral moyen de Greenwich, si bien que le ciel est le ciel réel de cet instant ; les tailles proviennent des magnitudes mesurées et les couleurs du B−V mesuré. Aller aussi loin au-delà de la limite de visibilité à l'œil nu est aussi ce qui dessine la Voie lactée : cette bande n'est pas un dégradé peint, c'est l'endroit où les étoiles se trouvent réellement. Servi par le Centre de données astronomiques de Strasbourg (CDS) ; le Bright Star Catalog (Hoffleit & Warren 1991, Harvard–Smithsonian TDC) reste la source de repli de la génération. Régénéré par scripts/build-star-catalog.mjs.",
    "NASA/JPL Horizons — interplanetary spacecraft trajectories": "La population « Sondes » de l'explorateur spatial (data/spacecraft.json) : 17 engins — Voyager 1 et 2, Pioneer 10 et 11, New Horizons, Parker Solar Probe, Solar Orbiter, Juno, JUICE, Europa Clipper, Lucy, Psyché, BepiColombo, Hayabusa2, OSIRIS-APEX, JWST et Gaia. Position ET vitesse héliocentriques (écliptique J2000) échantillonnées à un pas propre à chaque sonde (90 jours pour Voyager, 3 jours pour Parker), interpolées côté client par une spline d'Hermite cubique, de sorte que la trajectoire est reproduite et non approchée par des cordes. ⚠ Horizons répond sans en-têtes CORS : les données sont donc récupérées à la CONSTRUCTION et embarquées ; et ⚠ une trajectoire n'est pas de la télémétrie — Pioneer 10 et 11 ont cessé de répondre en 2003 et 1995 et Gaia a été passivée en 2025, si bien que ce qui est dessiné pour elles est une position propagée, ce que le panneau indique explicitement. Au-delà de la couverture déclarée d'un noyau, l'application dit que le fichier ne sait pas, plutôt que de répéter silencieusement le dernier point. Œuvre du gouvernement des États-Unis — non soumise au droit d'auteur. Régénéré par scripts/build-spacecraft.mjs.",
    "NASA/JPL Small-Body Database (SBDB)": "La population « Astéroïdes et comètes » de l'explorateur spatial (data/small-bodies.json) : 1 142 objets. Les ensembles de masse sont définis par la mesure, non par le goût — tout astéroïde d'au moins 150 km, tout objet transneptunien plus brillant que H 5,5, toute comète NUMÉROTÉE (c'est-à-dire à retour confirmé) et tout astéroïde potentiellement dangereux plus brillant que H 18 — auxquels s'ajoute une liste explicitement éditoriale de cibles de sondes et de corps célèbres, dont les trois objets interstellaires. Éléments héliocentriques osculateurs, propagés en problème à deux corps côté client : elliptique depuis l'instant du périhélie, hyperbolique pour e>1 et équation de Barker pour e=1. ⚠ Des éléments osculateurs décrivent l'orbite à UNE époque ; les perturbations planétaires (et, pour une comète active, le dégazage non gravitationnel) écartent le corps réel de cette ellipse au fil des ans. Assez juste pour voir où se trouve un corps dans le Système solaire, pas assez pour pointer un télescope. SBDB n'a pas d'en-têtes CORS : les données sont donc embarquées à la construction. Œuvre du gouvernement des États-Unis. Régénéré par scripts/build-smallbodies.mjs.",
    "SIMBAD — CDS, Strasbourg (deep-sky objects and their published distances)": "La population « Au-delà du Système solaire » de l'explorateur spatial (data/deep-sky.json) : 150 objets — les 110 objets de Messier plus le Groupe local, les grandes galaxies les plus proches, le Centre galactique et les groupes de la Vierge, de la Chevelure de Bérénice, du Fourneau et du Sculpteur. Positions et types d'objets issus de la table `basic` de SIMBAD ; la distance est la MÉDIANE de toutes les mesures de distance que SIMBAD porte pour cet objet (`mesDistance`), le nombre de mesures et les quartiles étant conservés à côté. ⚠ Une distance publiée est une mesure adossée à une méthode, et les méthodes divergent — céphéides, sommet de la branche des géantes rouges, Tully-Fisher, fluctuation de brillance de surface et décalage vers le rouge peuvent différer de plusieurs dizaines de pour cent, ce que disent les quartiles. 131 des 150 ont une distance publiée ; les 19 autres sont dessinés sur la sphère céleste SANS profondeur plutôt que de s'en voir attribuer une inventée. C'est aussi ce qui fixe le recul maximal de la caméra : le plafond est l'objet mesuré le plus lointain (environ 72 Mpc), et non un nombre arbitraire. Wenger et al. 2000, A&AS 143, 9 — merci de citer SIMBAD en cas de réutilisation. Régénéré par scripts/build-deepsky.mjs.",
    "REST Countries": "Données de référence par pays (capitale, monnaie, langues, frontières) pour la page d'informations",
    "NASA FIRMS": "Incendies actifs / anomalies thermiques",
    "RainViewer": "Radar de précipitations en temps réel — les deux dernières heures, toutes les 10 min, animables",
    "Open-Meteo": "Altitude (y compris la grille Copernicus-DEM pour les mises en évidence Atlas au-dessus/au-dessous du niveau de la mer), champ de vent, fenêtre météo en direct au clic droit (conditions actuelles + prévision à 5 jours) et relevés météo / qualité de l'air / température de la mer / altitude en direct pour les widgets et l'analyse intégrée d'Atlas ; le champ vent/température/précipitations en espace et en temps qui alimente la simulation Atlas de dispersion radiologique. Le champ de vent animé et les couches météo ECMWF lisent en revanche les tuiles ECMWF IFS HRES d’Open-Meteo (≈9 km) — la couleur, les particules et la valeur ponctuelle proviennent toutes de la même sortie de modèle et de la même heure de validité",
    "Open-Meteo Marine": "Niveau de la mer horaire au-dessus du niveau moyen pour la couche Marées et — la vitesse et la direction du courant océanique ainsi que la température de surface de la mer à partir desquelles la couche Courants océaniques dessine ses flèches et les classe en chaudes/froides (la température est comparée avec le même modèle à environ 110 km en amont le long de l'écoulement)",
    "MET Norway (Locationforecast)": "Repli automatique de la fenêtre météo ponctuelle lorsque Open-Meteo est indisponible (NLOD/CC-BY 4.0)",
    "OSRM (Open Source Routing Machine)": "Itinéraires routiers d'Atlas — trajets virage par virage en voiture/à pied/à vélo sur les données routières OpenStreetMap (serveurs de démonstration publics router.project-osrm.org et routing.openstreetmap.de ; ODbL)",
    "Transitous / MOTIS": "Itinéraires en transports en commun d'Atlas — routage réel train/métro/tram/bus/ferry sur les flux GTFS ouverts du monde entier (api.transitous.org, moteur MOTIS), renvoyant chaque itinéraire alternatif ; les coordonnées de départ et d'arrivée sont transmises pour calculer l'itinéraire. Pour le rail interurbain sans horaires ouverts (par exemple JR/Shinkansen au Japon), Atlas se rabat sur un routage du réseau ferroviaire OpenStreetMap via l'API Overpass",
    "Valhalla (FOSSGIS)": "Isochrones / zones accessibles d'Atlas (« 30 min en voiture », « 15 min à pied ») — polygones d'isochrones sur le réseau routier OpenStreetMap via l'API publique et sans clé FOSSGIS Valhalla /isochrone (voiture/marche/vélo) ; la coordonnée d'origine et le nombre de minutes choisi sont transmis pour calculer la zone",
    "Google Street View": "Panoramas au niveau de la rue intégrés (le panneau « Street View ici » et l'action street-view d'Atlas) via l'intégration sans clé maps.google.com, plus la couche de couverture réelle de Street View et le clic-pour-caler à partir des tuiles de couverture sans clé de Google (mts.google.com) ; imagerie et couverture © Google",
    "Global Watersheds (mghydro.com)": "Délimitation de bassins versants en direct, fondée sur HydroSHEDS, pour les mises en évidence de bassins d'Atlas (crédit : Global Watersheds, mghydro.com)",
    "GRDC / World Bank — Major River Basins of the World": "Polygones des grands bassins hébergés sur ce site (236 bassins) pour les mises en évidence de bassins d'Atlas (CC BY 4.0, incorpore des données HydroSHEDS)",
    "OpenTopoMap": "Une tuile d'exemple servant d'image d'aperçu à la couche des courbes de niveau (CC-BY-SA)",
    "USGS Earthquake Hazards Program": "Séismes en direct et historiques (couche cartographique, widget, comparaison et analyse intégrée d'Atlas), ainsi que les événements réels que le simulateur d'ondes sismiques peut charger comme scénario",
    "OpenStreetMap Overpass API": "Cartographie d'installations/POI par Atlas — requêtes de zone en direct pour des types d'installations nommés (pétrole, centrales, aéroports, sites militaires, …) ; et les cours d'eau/canaux nommés autour d'une étiquette de rivière cliquée, lorsque Nominatim ne peut pas répondre pour ce cours d'eau (ODbL)",
    "Wikidata Query Service": "Cartographie d'installations/POI par Atlas — deuxième source d'installations, indépendante (entités sélectionnées avec coordonnées, fusionnées avec les résultats OSM ; CC0) — les NOMS ja/de/ru/es du répertoire mondial embarqué, recherchés par identifiant GeoNames (P1566) à la construction, parce que la colonne des noms alternatifs de GeoNames ne porte aucune étiquette de langue — la recherche en direct du titulaire actuel d'une fonction (chef d'État / chef de gouvernement) qui étaye les réponses d'Atlas sur les dirigeants nationaux, le graphe entreprises/participations derrière la couche Réseau industriel, et les NOMS des courants océaniques du monde avec leurs coordonnées publiées (CC0)",
    "GeoNames": "Le répertoire mondial embarqué data/gazetteer-world.json.gz — 147 924 lieux habités dans 242 pays (coordonnées, population et pays issus de l'export cities1000 ; noms en 18 langues issus d'alternateNamesV2, qui, contrairement à la colonne intégrée, porte un code de langue ISO par nom), compressé à 3,9 Mo et décompressé dans le navigateur. Construit par scripts/build-gazetteer.mjs. C'est ce qui permet au localisateur d'actualités non-IA et au champ de recherche de résoudre un lieu dix fois plus loin dans la traîne que la table sélectionnée seule. CC BY 4.0.",
    "geoBoundaries": "Limites administratives (ADM1/ADM2) — compositions de régions d'Atlas, et dernier recours de la couche d'alertes pour une zone d'alerte absente de tout autre jeu de limites (CC BY 4.0)",
    "GDELT Project": "Recherche mondiale d'actualités en direct (72 dernières heures) alimentant les synthèses et l'analyse intégrée d'Atlas",
    "Market data (fxratesapi / ER-API · gold-api · CoinGecko · alternative.me)": "Taux de change, or et argent, cours et sentiment des cryptomonnaies — widgets et bandeau inférieur",
    "Yahoo Finance": "Cours des indices boursiers pour le bandeau inférieur, et cours des actions en direct servant à calculer les capitalisations boursières en temps réel dans l'onglet Entreprises (valeurs cotées aux États-Unis)",
    "Clearbit Logo API / Google favicons": "Logos d'entreprise dans l'onglet Entreprises — le nom de domaine de l'entreprise est transmis pour récupérer son logo (repli sur les favicons de Google, puis sur un monogramme)",
    "Wikipedia (Wikimedia REST API)": "Vérification des articles pour les fenêtres de lieux et résumés de contexte pour l'analyse d'Atlas (CC BY-SA)",
    "Data centers — OpenStreetMap (telecom/man_made/building = data_center, Overpass API)": "Tous les centres de données cartographiés dans OpenStreetMap, interrogés en direct selon la vue de la carte (ODbL). Chaque point porte les balises de l’objet lui-même — exploitant, propriétaire, puissance, date d’ouverture — et les affiche telles quelles ; rien n’est déduit",
    "Diplomatic missions — OpenStreetMap (amenity=embassy / office=diplomatic, Overpass API)": "Ambassades et consulats cartographiés dans OpenStreetMap (ODbL). Un instantané mondial des 17 423 est fourni avec l’application, la couche s’affiche donc à tout niveau de zoom ; en zoomant, la vue courante est interrogée en direct et le remplace. Rien n’est déduit",
    "Military sites — OpenStreetMap (military=*, Overpass API)": "Aérodromes, bases navales, casernes, champs de tir et zones dangereuses marqués `military` dans OpenStreetMap, pour la vue actuelle (ODbL). Uniquement le registre public — rien issu de l’analyse d’images, rien d’estimé",
    "Power plants & grid — OpenStreetMap (power=plant/substation/generator, Overpass API)": "Centrales, postes électriques, éoliennes et parcs solaires d’OpenStreetMap, interrogés en direct pour la vue actuelle (ODbL). Puissance, combustible, tension et exploitant proviennent des tags de l’objet ; rien n’est estimé",
    "Mines, quarries & wells — OpenStreetMap (landuse=quarry, man_made=mineshaft/petroleum_well, Overpass API)": "Mines, carrières, puits de mine et puits de pétrole ou de gaz d’OpenStreetMap, en direct pour la vue actuelle (ODbL)",
    "Airports & air infrastructure — OpenStreetMap (aeroway=aerodrome/terminal/heliport, Overpass API)": "Aéroports, aérodromes, terminaux, héliports et tours de contrôle d’OpenStreetMap, en direct pour la vue actuelle (ODbL). Code OACI/IATA, longueur de piste et altitude uniquement lorsque l’objet les porte",
    "Ports, harbours & terminals — OpenStreetMap (harbour, landuse=port, ferry terminals, Overpass API)": "Ports, darses, terminaux de ferry, de conteneurs et de fret et grues d’OpenStreetMap, en direct pour la vue actuelle (ODbL)",
    "Water & wastewater plant — OpenStreetMap (man_made=water_works/wastewater_plant/pumping_station, Overpass API)": "Usines d’eau potable, stations d’épuration, stations de pompage, châteaux d’eau et réservoirs d’OpenStreetMap, en direct pour la vue actuelle (ODbL)",
    "Universities & research institutes — OpenStreetMap (amenity=university/college/research_institute, Overpass API)": "Universités, écoles supérieures, instituts de recherche, observatoires et bibliothèques de recherche d’OpenStreetMap, en direct pour la vue actuelle (ODbL)",
    "Emergency services — OpenStreetMap (fire_station / police / ambulance_station, Overpass API)": "Casernes de pompiers, commissariats, bases d’ambulances et postes de secours en montagne d’OpenStreetMap, en direct pour la vue actuelle (ODbL)",
    "Spaceports & satellite ground stations — OpenStreetMap (aeroway=spaceport, man_made=launch_pad/satellite_dish, Overpass API)": "Pas de tir, ports spatiaux, stations terriennes et radiotélescopes cartographiés dans OpenStreetMap (ODbL). Un instantané mondial des 13 310 est fourni — il existe une trentaine de ports spatiaux sur Terre — et la vue courante est interrogée en direct une fois zoomée",
    "Health facilities — OpenStreetMap (amenity=hospital/clinic/doctors/pharmacy, Overpass API)": "Hôpitaux, cliniques, cabinets et pharmacies d’OpenStreetMap, pour la vue actuelle (ODbL). Lits, spécialité, exploitant et horaires seulement lorsque l’objet porte l’étiquette",
    "Telecom & internet infrastructure — OpenStreetMap (telecom=*, communications towers, Overpass API)": "Points d’échange Internet, centraux téléphoniques, pylônes et tours de communication d’OpenStreetMap, pour la vue actuelle (ODbL) — les installations physiques du réseau",
    "AWS Global Infrastructure — regions": "La liste officielle des régions AWS et de leurs emplacements, pour les points « région de nuage » de la couche « Centres de données et infrastructure d’IA » (une région est le lieu publié par l’exploitant, pas un bâtiment relevé)",
    "Microsoft Azure — datacenter locations": "La carte des régions de centres de données publiée par Microsoft, pour les points Azure de la même couche",
    "Google Cloud — locations": "Les régions publiées et les campus propres de Google Cloud, pour les points Google de la même couche",
    "Oracle Cloud — public cloud regions": "La liste publiée des régions OCI d’Oracle, pour les points Oracle de la même couche",
    "Meta — data centers": "La liste des sites de centres de données publiée par Meta, pour les points Meta de la même couche",
    "TOP500 — supercomputer sites": "La liste TOP500 des superordinateurs les plus rapides du monde, pour les points HPC et recherche de la même couche",
    "Live cameras — OpenStreetMap (Overpass API)": "Points de webcams publiques dans le monde entier, interrogés en direct dans OSM selon la vue (balises contact:webcam / webcam, ODbL) et FILTRÉS pour ne garder que les caméras qui affichent réellement des images en direct dans l'application (image rafraîchie / direct YouTube / Roundshot · Panomax 360° / vidéo — les caméras qui ne font que renvoyer vers un lien sont écartées) ; l'image fixe se rafraîchit automatiquement dans la fenêtre (sans clé d'API)",
    "Transport for London — JamCams": "Environ 880 caméras de circulation en direct à Londres (API unifiée TfL sans clé, lieux « JamCam ») — chacune un JPEG rafraîchi plus un court clip, affichés en rafraîchissement automatique dans la couche Caméras en direct (Powered by TfL Open Data ; contient des données OS © Crown copyright)",
    "Caltrans — California DOT CCTV": "Environ 3 300 caméras de circulation en direct en Californie (JSON ouvert d'état des CCTV, sans clé, pour les 12 districts) — chacune un JPEG rafraîchi en direct, affiché en rafraîchissement automatique dans la couche Caméras en direct (© California Department of Transportation)",
    "Fintraffic / Digitraffic — Finland road-weather cameras": "811 stations finlandaises de caméras routières et météo / 2 272 vues en direct (API Digitraffic sans clé et ouverte au CORS) — JPEG directs et déterministes, affichés en rafraîchissement automatique avec un sélecteur de vue par station dans la couche Caméras en direct (© Fintraffic, CC BY 4.0)",
    "OpenTrafficCamMap — US state DOT cameras": "1 815 caméras de circulation américaines supplémentaires (DOT du Colorado, de l'Indiana, de l'Alaska et de l'Arizona) issues du jeu de données ouvert OpenTrafficCamMap sous licence MIT, servi sans clé depuis le CDN jsDelivr (commit épinglé) ; seuls les flux dont les images se laissent effectivement afficher directement sont montrés. Imagerie © les DOT respectifs",
    "US / Canada DOT “511” traffic cameras": "Environ 17 000 caméras de circulation en direct supplémentaires sur 13 réseaux « 511 » de DOT d'États américains et de provinces canadiennes (Floride, Géorgie, New York, Pennsylvanie, Caroline du Nord, Nevada, Wisconsin, Idaho, Louisiane, Nouvelle-Angleterre, Ontario, Alberta, Yukon) sur la plateforme cartographique « 511 » commune. La liste des caméras de chaque site est récupérée une fois via un relais CORS public (ces points d'accès n'envoient aucun en-tête CORS) ; chaque image est chargée directement et se rafraîchit automatiquement dans la couche Caméras en direct. Imagerie © les DOT d'État ou de province respectifs",
    "Mapzen / AWS Terrain Tiles — elevation model (DEM)": "Tuiles « terrarium » de relief en RVB, publiques et sans clé (AWS Open Data). Décodées côté client en un échantillonneur d'altitude qui alimente l'analyse de pente et d'exposition, le bassin de visibilité en ligne de vue, la couverture radio, le simulateur de modelage du terrain et d'écoulement de l'eau, le moteur d'ombres du relief et d'heures d'ensoleillement annuel, ainsi que la submersion par crue et tsunami. Construites à partir de SRTM, ETOPO1 et de sources d'altitude nationales — voir le registre pour l'attribution complète",
    "IASP91 reference Earth model — Kennett & Engdahl (1991)": "Le modèle radial de vitesses P et S dans lequel le simulateur d'ondes sismiques trace ses rais pour obtenir les temps de trajet P/S, les triplications de la courbe hodochrone et la zone d'ombre du noyau. Vérifié par rapport aux tables IASP91 publiées (P à 30°/60°/90° à quelques secondes près)",
    "Brune (1970) source model · Hanks & Kanamori (1979) · Boore stochastic method": "La chaîne de mouvement du sol à source ponctuelle du simulateur sismique : moment sismique à partir de la magnitude, fréquence coin à partir de la chute de contrainte, spectre en champ lointain avec étalement géométrique trilinéaire, atténuation anélastique et amplification de site en quart d'onde, converti en valeurs de pic par la théorie des vibrations aléatoires",
    "Wald, Quitoriano, Heaton & Kanamori (1999) — PGV → Modified Mercalli intensity": "La relation que le simulateur sismique utilise pour énoncer une intensité (MMI = 3,47 log10 PGV + 2,35). MMI, et non l'échelle shindo de la JMA ; affichée seulement à l'intérieur de la plage sur laquelle la relation a été régressée",
    "Wald & Allen (2007) — topographic slope → Vs30 site proxy": "L'indicateur mondial de conditions de site de l'USGS que le simulateur sismique utilise pour peindre un champ d'intensité tenant compte du terrain : Vs30 estimé à partir de la pente topographique d'un MNT réel (table des régions tectoniquement actives), entrant cellule par cellule dans l'amplification de site en quart d'onde. Les cellules marines et celles sans MNT sont signalées, pas peintes",
    "気象庁「計測震度の算出方法」 (JMA instrumental seismic intensity)": "Le shindo JMA que le simulateur affiche est calculé selon la définition propre de la JMA plutôt que converti depuis la PGV : les filtres d'effet de période, coupe-haut à 10 Hz et coupe-bas à 0,5 Hz sont appliqués au spectre d'accélération du modèle, le niveau a₀ dépassé pendant un TOTAL de 0,3 s est résolu par la théorie des vibrations aléatoires, et I = 2·log₁₀ a₀ + 0,94. Les trois composantes sont isotropisées à V/H = 2/3 plutôt que simulées séparément, ce que le panneau indique. Cela remplace la régression sur PGV de Fujimoto & Midorikawa (2005) utilisée auparavant.",
    "Okada (1985) · Wells & Coppersmith (1994) · Atkinson & Silva (2000)": "La déformation de surface en forme close d'Okada pour une dislocation rectangulaire donne le déplacement cosismique du plancher océanique dont part le modèle de propagation du tsunami (vérifiée sur le cas-test publié avant usage) ; la loi d'échelle de Wells & Coppersmith pour failles inverses donne la longueur, la largeur et le glissement de la rupture à partir de la magnitude ; et le spectre source à deux fréquences coin d'Atkinson & Silva a remplacé la fréquence coin unique de Brune dans la chaîne de mouvement du sol, qui sous-estimait les fréquences intermédiaires des grands séismes. Le champ d'Okada est désormais sommé sur une grille de sous-failles 8 × 3 avec effilement, renormalisée pour que le moment sismique soit exactement celui qu'implique la magnitude.",
    "Kotani et al. (1998) — Manning roughness for tsunami run-up computation": "Le coefficient de frottement de fond qu'utilise le modèle de propagation du tsunami (Manning n = 0,025 s·m^(−1/3) sur un fond océanique), la valeur avec laquelle les modèles japonais opérationnels d'ondes longues sont exécutés. Le frottement est négligeable en eau profonde (il varie comme la profondeur totale à la puissance −7/3) et c'est lui qui limite la vague sur un plateau continental : un modèle d'onde longue sans frottement surestime donc l'amplitude côtière.",
    "Kasten & Young (1989) air mass · Meinel & Meinel clear-sky beam": "L'irradiance normale directe par ciel clair derrière le moteur d'heures d'ensoleillement annuel (1361 W/m² · 0,7^AM^0,678). Une valeur par ciel clair calculée à partir de l'horizon propre au site — ni prévision météo, ni estimation de production",
    "GEBCO 2020": "Bathymétrie océanique (relevé de profondeur)",
    "AWS Terrain Tiles": "Relief 3D, ombrage et génération des courbes de niveau",
    "Beck et al. Köppen-Geiger (2018)": "Classification des zones climatiques à 1 km",
    "MarineRegions": "Limites maritimes : ZEE et mer territoriale",
    "TeleGeography Submarine Cable Map": "Tracés des câbles de télécommunication sous-marins",
    "NASA SEDAC GPW v4": "Densité de population en grille",
    "UNDP / EIU / SIPRI / World Bank": "IDH (série annuelle 1990–2022), indice de démocratie, PIB, dépenses militaires, démographie",
    "AISstream.io": "Trafic maritime AIS en direct (avec votre clé)",
    "airplanes.live": "Trafic aérien en direct (ADS-B communautaire ; sert aussi à échantillonner l'image d'aperçu de la couche des aéronefs)",
    "CelesTrak": "Jeux d'éléments orbitaux (GP/OMM, successeur moderne du jeu à deux lignes) pour la couche des satellites en direct, par groupe de catalogue. Sans clé et ouvert au CORS ; libre d'usage non commercial avec attribution. Les positions ne sont PAS téléchargées — les jeux d'éléments le sont, une fois toutes les deux heures, et chaque position à l'écran est propagée localement à partir d'eux par SGP4/SDP4 (satellite.js, MIT), de sorte que déplacer la carte ou le temps ne coûte aucune requête. DEUX CHOSES SONT AUSSI LIVRÉES AVEC L'APPLICATION, toutes deux régénérées depuis cette même source par l'intégration continue : data/tle/catalogue.tle, un instantané réel du catalogue `active` avec une époque réelle, afin que la couche s'affiche encore lorsque celestrak.org est injoignable (l'application indique l'âge des éléments utilisés) ; et data/tle/groups.json, les numéros de catalogue NORAD appartenant à chaque groupe CelesTrak, afin qu'une demande portant sur une CATÉGORIE puisse être satisfaite depuis cet instantané au lieu de ne rien afficher. L'appartenance à un groupe ne se déduit pas d'un jeu d'éléments et n'est jamais inférée du nom d'un objet — un groupe dont la liste n'a pas pu être récupérée est enregistré comme absent, et non comme vide",
    "satellite.js": "Le propagateur d'orbite SGP4/SDP4 derrière chaque position de satellite, empreinte au sol, trace au sol, angle de visée et prédiction de passage de l'application (licence MIT). Vérifié à 7 micromètres près sur le vecteur de test canonique de Vallado et sur les éléments en direct de l'ISS (436,6 km, 7,650 km/s, 92,96 min, 51,631°)",
    "Planespotters.net": "Photographie de l'appareil précis sur la fiche détaillée d'un aéronef en vol, recherchée par l'adresse ICAO 24 bits que rapporte le flux ADS-B. API photo publique sans clé, libre d'usage non commercial ; chaque photo est affichée avec le crédit de son auteur et renvoie à l'original — aucune photo n'est mise en cache ni réhébergée, et rien vous concernant n'est transmis (le code hexadécimal de l'appareil constitue toute la requête)",
    "NOAA SWPC": "Ovale auroral (OVATION) et indice K planétaire — la couche des aurores et son image d'aperçu",
    "Natural Earth": "Frontières et polygones des pays ; limites des fuseaux horaires (couche Fuseaux horaires) ; et le masque terre/mer embarqué data/land-mask.png — les polygones physiques de terres au 1:50 m rastérisés en une grille équirectangulaire 1 bit de 2048×1024 par scripts/build-land-mask.mjs, afin que le champ d'intensité distingue la terre de la mer sans interroger le réseau (il lisait auparavant des tuiles de relief pour cela, et peignait l'océan dès que trop peu d'entre elles arrivaient). Domaine public.",
    "AWS Terrain Tiles — the bundled global sea floor": "data/bathymetry.png — les mêmes données publiques d'altitude terrarium, lues une seule fois à la construction sur le monde entier (scripts/build-bathymetry.mjs) et livrées sous forme de grille 1440×720 (0,25°) portant la profondeur moyenne des échantillons marins de chaque cellule et la fraction marine de cette cellule. C'est ce sur quoi le modèle GLOBAL de propagation de tsunami intègre, de sorte que chaque cellule de la planète possède une profondeur mesurée avant le premier pas de temps, au lieu que l'application aille chercher un millier de tuiles et modélise celles qui sont arrivées. Bathymétrie issue d'ETOPO1 ; voir le registre pour l'attribution complète.",
    "Solar System Scope — planetary surface textures": "Les cartes de surface équirectangulaires avec lesquelles l'explorateur spatial dessine chaque monde (data/planets/*.jpg — tous sauf la Terre, qui est dessinée avec le data/world-basemap.jpg propre à l'application, afin que l'explorateur spatial et la carte montrent UNE seule Terre), assemblées par Solar System Scope à partir d'imagerie NASA/JPL/USGS — MESSENGER pour Mercure, le radar de Magellan pour Vénus, LRO pour la Lune, Viking/MOLA pour Mars, Cassini et Voyager pour les géantes. Livrées telles que publiées, octet pour octet. Sous licence CC BY 4.0. Pluton n'en fait PAS partie et est dessinée dans sa couleur mesurée plutôt qu'avec une surface inventée.",
    "USGS Gazetteer of Planetary Nomenclature": "Les noms de lieux approuvés par l'UAI sur les autres mondes (data/planet-names.json) — 2 772 formations sur Mercure, Vénus, la Lune, Mars et Pluton, avec leurs coordonnées centrales publiées, leurs diamètres et leurs types, afin qu'une planète soit étiquetée comme l'est la Terre. Domaine public ; l'UAI est l'autorité de nommage.",
    "OpenRailwayMap / OpenSeaMap": "Superpositions mondiales des infrastructures ferroviaires et des amers maritimes (tuiles raster, bêta)",
    "Wikipedia / Wikimedia": "Fiches d'information et illustrations",
    "Public CORS relays (allorigins.win, corsproxy.io, corsfix.com, codetabs.com)": "PAS une source de données — un moyen d'en ATTEINDRE une. Le flux RSS de Google Actualités, certains index de caméras de circulation « 511 » et quelques autres flux n'envoient aucun en-tête Access-Control-Allow-Origin, si bien qu'un navigateur ne peut pas les lire directement ; ces relais publics récupèrent le document côté serveur et le re-servent avec l'en-tête. Ce qu'un relais voit, c'est l'URL demandée (l'adresse d'un flux public) et la connexion elle-même ; aucun compte, aucune coordonnée et aucune donnée personnelle n'y transitent jamais. Les quatre sont mis en concurrence avec un délai de 8 secondes chacun et les perdants sont abandonnés, de sorte qu'un relais en panne ou lent ne peut pas bloquer la page. ⚠ ILS NE SONT PAS INTERCHANGEABLES SELON LA CIBLE, et c'est mesuré plutôt que supposé : sur cette version, Google a servi l'édition d'actualités en-US via corsproxy.io en 5 ms et a répondu au MÊME relais par sa page anti-robot « Sorry… » (503) pour l'édition ja-JP — ce qui explique pourquoi le flux japonais restait vide jusqu'à l'ajout d'un quatrième relais. Là où un relais est utilisé, cela est indiqué dans l'entrée de la source elle-même.",
    "Google News": "Titres d'actualité (RSS) — récupérés et géolocalisés côté serveur ; également interrogés en direct depuis le navigateur pour la recherche web d'Atlas (le nom du sujet est transmis). Le MÉDIA D'ORIGINE de chaque article est porté par le flux lui-même (Google Actualités l'ajoute au titre après le dernier « - »), et c'est de là que vient la liste Réglages ▸ Médias : les médias proposés sont ceux que le flux actuel livre réellement, comptés, et non une liste tenue à jour ici. Choisir des médias filtre ce qui est affiché ; cela ne change pas ce qui est récupéré, et aucun nom de média n'est jamais deviné",
    "OpenFreeMap / OpenMapTiles": "Étiquettes de lieux vectorielles et emprises de bâtiments en 3D",
    "Google Fonts (Noto Sans JP / SC / TC)": "PAS une source de données — les POLICES japonaise, chinoise simplifiée et chinoise traditionnelle avec lesquelles l'application dessine son texte lorsque l'interface est dans l'une de ces langues. Google Fonts découpe chacune d'elles en environ 120 sous-ensembles par plage Unicode, si bien qu'une page ne télécharge que les ~30 Ko de glyphes dont elle a besoin plutôt qu'une police de 5 Mo ; embarquer les trois entières représenterait environ 25 Mo dans le dépôt et 5 à 10 Mo pour chaque lecteur CJC. Ce que voit le serveur de polices, c'est la requête d'un fichier de police et la connexion elle-même — aucun compte, aucune coordonnée, aucune donnée personnelle. Toutes les autres polices utilisées (Inter pour le latin et le cyrillique, Pretendard pour le coréen, et les atlas de glyphes Inter propres à la carte) sont servies depuis ce site et n'atteignent aucun tiers ; voir fonts/README.md.",
    "Inter / Pretendard (bundled, SIL OFL 1.1)": "Les polices latine/cyrillique et coréenne, livrées avec le site — y compris les atlas de glyphes SDF avec lesquels sont dessinées les étiquettes de la CARTE elle-même, générés à partir d'Inter par scripts/build-glyphs.mjs (aucun serveur de glyphes public ne publie Inter). Licences et attribution : fonts/README.md.",
    "ESA WorldCover": "Classification mondiale de l'occupation du sol à 10 m",
    "RESOLVE / WWF Ecoregions 2017": "Écorégions terrestres",
    "Smithsonian GVP": "Volcans de l'Holocène",
    "DeepStateMap": "Ligne de front en Ukraine (couche bêta)",
    "historical-basemaps (aourednik)": "Frontières historiques — la couche de superposition bêta, ainsi que le repli automatique pour les frontières d'années passées de la carte elle-même (instantané le plus proche)",
    "CShapes 2.0 (Schvitz et al., ETH Zürich)": "Frontières internationales annuelles de 1886 à 2019 pour la machine à remonter le temps (chaque changement de frontière daté à l'année ; copie simplifiée hébergée sur ce site). Les frontières de l'Allemagne de l'Est, de l'Ouest et réunifiée entre 1945 et 2019 ont été reconstruites à partir des Länder modernes faisant autorité (deutschlandGeoJSON, © GeoBasis-DE / BKG), afin que la frontière interallemande corresponde à la réalité.",
    "Maddison Project Database 2020 (Bolt & van Zanden)": "PIB réel HISTORIQUE de référence (en dollars internationaux constants de 2011) et population depuis 1900 pour la machine à remonter le temps — l'onglet Pays, les aplats et la comparaison de pays lorsqu'on voyage avant le plancher de 1960 de la Banque mondiale, ainsi que pour les États disparus (ex-URSS, Yougoslavie et Tchécoslovaquie sont des entités Maddison à part entière)",
    "World Bank Open Data": "Indicateurs chronologiques par pays (graphiques temporels, comparaison de 5 pays et machine à remonter le temps — tout l'onglet Pays, les relevés au survol et les aplats par pays affichent les chiffres réels de l'année sur laquelle l'horloge maîtresse est réglée)",
    "IMF World Economic Outlook": "Complément de la couche dette publique et source économique alternative dans la comparaison de pays (API DataMapper)",
    "WorldPop (University of Southampton)": "Population à l'intérieur d'une zone, d'un cercle ou d'une limite de lieu dessinés — sommée depuis la grille mondiale de population à ~100 m via l'API statistique de WorldPop",
    "AI provider — OpenAI (Anthropic / Google selectable)": "IA côté serveur (la clé est conservée côté serveur) : l'assistant Atlas, la géolocalisation des actualités, les fonctions d'IA dans l'application et la recherche web pour les questions d'actualité",
    "Annual precipitation, 1981–2010 normal — CHELSA V2.1 bio12 (30 arc-seconds, ~1 km)": "Fourni avec l’application : précipitations annuelles moyennes 1981–2010 à 30 secondes d’arc (environ 1 km à l’équateur), reprojetées dans le même repère Web Mercator que les rasters de Köppen et limitées aux terres. Saturation 16 bits à 6 553 mm.",
    "Annual precipitation by year, 1981–2020 — GPCC Full Data Monthly V2022, Deutscher Wetterdienst (0.5°, gauge analysis over land)": "Fourni : la somme des douze totaux mensuels de chaque année, sur l’analyse pluviométrique à 0,5° du service météorologique allemand sur les terres, 1981–2020. Une analyse pluviométrique ne dit rien de l’océan.",
    "Religion and language composition by country — CIA World Factbook (US Government work, public domain)": "Fourni : les champs « Religions » et « Languages » du Factbook, convertis en part par groupe et par pays (202 et 196 pays). Là où le Factbook ne sépare pas les confessions, la carte ne les sépare pas non plus.",
    "気象警報・注意報 — 気象庁 (Japan Meteorological Agency, bulletin list r8, by municipality)": "Lu en direct pour la couche d’alertes : la liste de bulletins de la JMA elle-même, le fichier que demande sa propre page d’alertes. C’est un instantané et non un journal — une ligne par bureau ET par type de bulletin, chaque type étant une famille de dangers différente —, l’état en vigueur est donc l’union de toutes. Le Japon est dessiné à la commune (class20), l’unité pour laquelle la JMA émet.",
    "気象庁の警報階級と配色 (JMA warning levels 20/30/40/50 and their published colours)": "Le tableau de niveaux de la JMA et les couleurs que publie sa page d’alertes — lus sur cette page, non écrits de mémoire.",
    "行政区域データ（市区町村界）— 国土交通省 国土数値情報 N03 (via smartnews-smri/japan-topography)": "Les limites communales du Japon, du ministère du Territoire. La couche d’alertes les relie par le code JIS — les cinq premiers chiffres d’un code class20 de la JMA. La version nationale sert de socle ; une préfecture présente à l’écran passe à la version par préfecture du même éditeur, qui compte environ onze fois plus de sommets.",
    "Weather warnings, United States — NOAA National Weather Service (api.weather.gov, CAP)": "Lu en direct : toutes les alertes en vigueur du service météorologique national des États-Unis, avec leurs polygones, groupées par État au toucher. Récupéré directement par le navigateur.",
    "Warnungen — Deutscher Wetterdienst GeoServer (Warnungen_Landkreise, WFS)": "Lu en direct : les avertissements du DWD AVEC les polygones d’arrondissement. MeteoAlarm relaie les mêmes avertissements sans géométrie ; l’Allemagne est donc lue chez son propre service.",
    "Farevarsler — MET Norway MetAlerts 2.0": "Lu en direct : MET Norway publie ses messages CAP en GeoJSON, avec le polygone concerné sur chaque alerte.",
    "Avisos meteorológicos — INMET (Instituto Nacional de Meteorologia, Brazil)": "Lu en direct : les avertissements en vigueur de l’INMET, avec leurs polygones, groupés par État au toucher.",
    "Weather warnings, Australia — Bureau of Meteorology": "Lu en direct : la liste d’avertissements du Bureau of Meteorology. Sans géométrie — c’est l’État sous lequel le BoM les classe qui est dessiné.",
    "Weather warnings, Hong Kong — Hong Kong Observatory Open Data (warnsum)": "Lu en direct : les signaux en vigueur de l’Observatoire de Hong Kong. Ils couvrent tout le territoire : le territoire EST l’unité.",
    "Weather advisories, the Philippines — PAGASA-DOST public alert feed (CAP)": "Lu en direct : l’index CAP public de la PAGASA. Ses avis de crue portent une zone par PROVINCE avec un vrai polygone.",
    "災害告警 — 中央氣象署 CWA (Taiwan), via the NCDR CAP aggregator": "Lu en direct : les bulletins de la CWA de Taïwan, filtrés depuis l’agrégateur CAP du NCDR. Les zones avec polygone sont dessinées telles quelles ; les autres nomment un canton.",
    "Weather warnings, New Zealand — MetService public CAP alerts": "Lu en direct : l’index CAP public du MetService. Il était VIDE au moment du raccordement — un état, pas une panne.",
    "Weather warnings, Canada — Environment and Climate Change Canada (OGC API — Features)": "Lu en direct : les avertissements en vigueur d’Environnement et Changement climatique Canada, avec leurs propres polygones, groupés par province au toucher. Récupéré directement par le navigateur, ce service envoyant lui-même l’en-tête CORS.",
    "Weather warnings, Europe — MeteoAlarm (EUMETNET), 35 national services": "Lu en direct : les avertissements en vigueur des services météorologiques européens tels que MeteoAlarm les publie, groupés par région au toucher. MeteoAlarm n’envoie pas d’en-tête CORS et le flux d’un pays pèse une dizaine de mégaoctets ; le relais de l’application le récupère et le résume côté serveur.",
    "Weather warnings, China — China Meteorological Administration public warning list": "Lu en direct : la liste publique des avertissements en vigueur de l’Administration météorologique chinoise. Elle ne comporte pas de géométrie : le pays est coloré au niveau le plus élevé en vigueur et le toucher les groupe par province. Récupéré via le relais de l’application, ce service n’envoyant pas d’en-tête CORS.",
    "Weather warnings worldwide — national meteorological services via the WMO Severe Weather Information Centre (CAP)": "Lu en direct pour la couche d’alertes, pour chaque pays sans flux propre ci-dessus : les alertes du service météorologique national lui-même, avec son polygone, ses mots et sa sévérité CAP, republiées telles quelles par l’OMM. L’OMM est le transport, pas l’auteur ; le panneau nomme le service émetteur.",
    "WMO Members and their CAP implementation status (which national service files CAP, and which does not)": "Lu une fois par session : le registre de l’OMM indiquant quels Membres ont achevé leur implémentation CAP. Seuls ces pays sont dessinés comme couverts.",
  }
});
