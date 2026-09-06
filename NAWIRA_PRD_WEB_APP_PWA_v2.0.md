# NAWIRA --- Product Requirements Document

# 0. Identité de marque NAWIRA --- v2.0

**Marque :** NAWIRA\
**Domaine produit :** `nawira.app`\
**Signature :** **Comprends ton corps. Vis ta vie sereinement.**

NAWIRA est la marque ombrelle de la plateforme. Le produit ne doit pas
être limité visuellement ou verbalement aux menstruations : son
territoire doit pouvoir évoluer vers **Cycle → Projet Bébé → Grossesse →
Post-partum → Ménopause**.

## Direction visuelle

-   Identité premium, douce, contemporaine et panafricaine.
-   Symbole : monogramme **N** abstrait combiné à une fleur/cycle, sans
    représentation anatomique explicite.
-   Violet principal : `#6C43C1` environ, à confirmer dans le Design
    System final.
-   Violet clair : `#A78BE8` environ.
-   Rose poudré : `#F4CDD4` environ.
-   Crème : `#FFF7F3` environ.
-   Gris/bleu nuit : `#1F2937`.
-   Typographie UI : sans-serif moderne et très lisible.
-   Typographie éditoriale optionnelle : serif élégante pour les grandes
    accroches marketing uniquement.
-   Imagerie : femmes africaines contemporaines, naturelles, confiantes,
    sans clichés.
-   Ton : rassurant, simple, digne, non infantilisant.

## Architecture commerciale

-   **NAWIRA Gratuit** --- 0 FCFA.
-   **NAWIRA Plus** --- 1 000 FCFA/mois.
-   **Projet Bébé** --- 2 500 FCFA/mois.

## Règles de marque

-   Ne plus utiliser le nom ELOWA dans les nouvelles interfaces.
-   Ne pas utiliser Google Play/App Store comme CTA principal : NAWIRA
    est une Web App/PWA.
-   CTA principal public : **Commencer gratuitement**.
-   URL principale : `nawira.app`.
-   Espace connecté recommandé : `app.nawira.app`.

**PRD Web App/PWA v2.0 --- Cycle menstruel & Projet Bébé --- Afrique
francophone**

NAWIRA

PRODUCT REQUIREMENTS DOCUMENT

PRD Web App/PWA v2.0 --- Cycle menstruel & Projet Bébé Afrique
francophone

  -------------------------------------------------------------------------
  North Star produit En moins de 10 secondes, l'utilisatrice enregistre
  ce qu'elle ressent. NAWIRA transforme progressivement son historique en
  estimations, tendances et informations compréhensibles --- sans se
  substituer à un professionnel de santé.
  -------------------------------------------------------------------------

------------------------------------------------------------------------

  ---------------------------------------------------------------------
  Décision                           Valeur
  ---------------------------------- ----------------------------------
  Marque                             NAWIRA

  Marché pilote                      Sénégal

  Expansion                          Côte d'Ivoire → Cameroun

  Free                               0 FCFA

  NAWIRA Plus                        1 000 FCFA/mois

  NAWIRA Projet Bébé                 2 500 FCFA/mois

  Plateforme                         Web App/PWA responsive,
                                     mobile-first

  Positionnement                     Suivi, information, estimation et
                                     orientation ; aucun diagnostic ni
                                     contraception
  ---------------------------------------------------------------------

Version 2.0 --- 5 septembre 2026

# 1. Contexte, problème et vision

NAWIRA répond à quatre problèmes principaux : imprévisibilité perçue des
règles, difficulté à relier symptômes et cycle, manque d'historique
structuré, et besoin d'un accompagnement simple du projet de grossesse.
L'OMS rappelle qu'un cycle menstruel dure en moyenne 21 à 35 jours et
que les expériences menstruelles varient fortement ; NAWIRA doit donc
éviter les règles rigides et les fausses certitudes.

  -------------------------------------------------------------------------
  Vision Construire la référence FemTech francophone africaine, d'abord
  sur le cycle et la fertilité, puis étendre l'écosystème vers grossesse,
  post-partum et ménopause.
  -------------------------------------------------------------------------

------------------------------------------------------------------------

## 1.1 Objectifs business MVP

-   Prouver la rétention sur ≥3 cycles.

-   Valider NAWIRA Plus à 1 000 FCFA/mois.

-   Valider Projet Bébé à 2 500 FCFA/mois.

-   Mesurer CAC, conversion, churn et LTV avant expansion pays.

-   Construire une marque de confiance autour de la confidentialité. \##
    1.2 Non-objectifs

-   Diagnostiquer une pathologie.

-   Prescrire ou recommander un dosage médicamenteux.

-   Garantir une grossesse.

-   Servir de méthode contraceptive.

-   Remplacer une consultation médicale.

-   Créer une communauté/social network au MVP. \# 2. Segments et
    personas

  -----------------------------------------------------------------------
  Persona                 JTBD principal          Plan naturel
  ----------------------- ----------------------- -----------------------
  Aïcha, 20--24           Prévoir règles et       Free → Plus
                          suivre symptômes sans   
                          complexité.             

  Mariama, 25--34         Comprendre tendances,   Plus
                          douleur, humeur,        
                          énergie et régularité.  

  Fatou, 28--39, projet   Suivre fenêtre fertile  Projet Bébé
  bébé                    estimée et signes de    
                          fertilité.              
  -----------------------------------------------------------------------

# 3. Proposition de valeur & plans

  -----------------------------------------------------------------------
  Plan              Promesse          Prix              Valeur clé
  ----------------- ----------------- ----------------- -----------------
  Free              Suivre            0                 Règles,
                                                        calendrier,
                                                        estimation
                                                        basique,
                                                        symptômes
                                                        essentiels.

  NAWIRA Plus       Comprendre        1 000 FCFA/mois   Historique
                                                        illimité,
                                                        tendances, Cycle
                                                        Score, rapports,
                                                        assistant.

  Projet Bébé       Accompagner un    2 500 FCFA/mois   Plus + signaux de
                    objectif                            fertilité,
                                                        estimation
                                                        enrichie,
                                                        parcours
                                                        conception.
  -----------------------------------------------------------------------

## 3.1 Matrice d'entitlements

  Capability           Free            Plus         Projet Bébé
  -------------------- --------------- ------------ --------------
  Historique cycles    3               Illimité     Illimité
  Prochaines règles    ✓               ✓ avancé     ✓ avancé
  Fenêtre fertile      Basique         Historique   Enrichie
  Symptômes            Essentiels      Complets     Complets
  Cycle Score          ---             ✓            ✓
  Rapport cycle        ---             ✓            ✓
  Assistant            Teaser/limité   ✓            ✓ spécialisé
  Température basale   ---             ---          ✓
  Glaire cervicale     ---             ---          ✓
  Test LH              ---             ---          ✓

# 4. Funnel produit

  Étape          Événement                     KPI
  -------------- ----------------------------- -------------------
  Acquisition    Visite / création de compte   CPI/CAC lead
  Activation     Onboarding + 1ère saisie      Activation rate
  Aha            1ère estimation affichée      Time-to-value
  Habitude       ≥3 journaux / cycle           Weekly engagement
  Rétention      2e puis 3e cycle enregistré   M2/M3 retention
  Monétisation   Paywall → paiement            Free→Paid
  Expansion      Passage Plus → Projet Bébé    Upgrade rate

# 5. Parcours onboarding --- spécification écran par écran

  ---------------------------------------------------------------------------------
  ID         Écran             Contenu                  CTA         Critères
  ---------- ----------------- ------------------------ ----------- ---------------
  OB01       Splash            Logo NAWIRA ; chargement Auto        \<1,5 s cible
                               local ; routage session.             hors cold start
                                                                    OS.

  OB02       Bienvenue         « Comprends ton cycle.   Commencer   CTA unique.
                               Apprends à connaître ton             
                               corps. »                             

  OB03       Objectif          Suivre mes règles /      Continuer   Choix
                               Comprendre mon cycle /               obligatoire ;
                               Projet bébé                          personnalise le
                                                                    parcours.

  OB04       Dernières règles  Calendrier + « Je ne     Continuer   Pas de blocage
                               sais pas »                           si inconnue.

  OB05       Durée règles      3,4,5,6,7+ / inconnue    Continuer   Valeur
                                                                    facultative.

  OB06       Durée cycle       26...32+, irrégulier,    Continuer   Ne jamais
                               inconnue                             imposer 28.

  OB07       À suivre          Douleur, humeur,         Continuer   Multi-select.
                               fatigue, sommeil, SPM,               
                               irrégularité,                        
                               ovulation...                         

  OB08       Projet Bébé       Si objectif bébé :       Continuer   Éducation
                               glaire/température/LH,               courte.
                               explication des                      
                               estimations.                         

  OB09       Confidentialité   Résumé clair +           Accepter /  Consentements
                               consentements            gérer       granulaires et
                               requis/facultatifs.                  versionnés.

  OB10       Notifications     Normales / discrètes /   Continuer   Opt-in OS
                               aucune.                              ensuite.

  OB11       Premier résultat  Jour du cycle,           Voir mon    Premier moment
                               prochaines règles,       tableau     WOW.
                               fertile si calculable.               
  ---------------------------------------------------------------------------------

# 6. Navigation principale

Bottom navigation : Aujourd'hui \| Calendrier \| + \| Analyses \|
Assistant. Avatar/Profil en haut à droite. Le bouton + est central et
accessible en un geste.

## 6.1 HOME01 --- Aujourd'hui

  -----------------------------------------------------------------------
  Bloc              Free              Plus              Projet Bébé
  ----------------- ----------------- ----------------- -----------------
  Header            Jour du cycle +   Idem              Idem
                    profil                              

  Hero              Règles estimées   Règles + Cycle    Règles + statut
                                      Score             Projet Bébé

  Fertilité         Fenêtre estimée   Estimation +      Estimation +
                    basique           contexte          signaux

  Insight           Conseil générique Tendance          Tendance
                                      personnalisée     conception

  CTA               Ajouter           Ajouter           Ajouter signaux
                    aujourd'hui       aujourd'hui       du jour
  -----------------------------------------------------------------------

-   Les estimations doivent afficher « estimé » et non « prévu avec
    certitude ».

-   Si données insuffisantes : expliquer ce qu'NAWIRA doit apprendre
    plutôt que fabriquer une date précise.

-   Si cycle très variable : élargir la plage et réduire la confiance.
    \## 6.2 CAL01 --- Calendrier

-   Vue mensuelle ; données observées et estimées visuellement
    distinctes.

-   Tap sur une date → journal du jour.

-   Long press non nécessaire au MVP.

-   Correction des règles passées autorisée.

-   Légende : règles enregistrées, règles estimées, fenêtre fertile
    estimée, ovulation estimée, symptômes. \## 6.3 LOG01 --- Ajouter

  Section       Entrée                                Interaction
  ------------- ------------------------------------- ----------------
  Saignement    aucun/spotting/léger/moyen/abondant   1 tap
  Douleur       0--10 + localisation                  slider + chips
  Humeur        5 états                               1 tap
  Énergie       5 niveaux                             1 tap
  Sommeil       qualité + durée facultative           chips
  Symptômes     liste multi-select                    chips
  Glaire        types simplifiés                      Projet Bébé
  Température   nombre + °C/°F                        Projet Bébé
  LH            négatif/positif/pic/inconclusif       Projet Bébé
  Note          texte facultatif                      champ

  ----------------------------------------------------------------------
  Critère UX Une saisie simple (ex. règles + humeur) doit pouvoir être
  terminée en moins de 10 secondes.
  ----------------------------------------------------------------------

------------------------------------------------------------------------

## 6.4 INS01 --- Analyses

-   Durée moyenne et plage des cycles.
-   Durée moyenne des règles.
-   Variabilité descriptive.
-   Top symptômes et fréquence relative au cycle.
-   Comparaison cycle courant vs précédents.
-   Cycle Score : résumé non clinique des données auto-déclarées.
-   Rapport mensuel exportable pour plans payants. \## 6.5 AI01 ---
    Assistant NAWIRA

  -----------------------------------------------------------------------
  Type de question        Réponse autorisée       Interdit
  ----------------------- ----------------------- -----------------------
  Information cycle       Explication générale    Diagnostic
                          sourcée/validée         

  Mes données             « Sur tes 4 derniers    Causalité non prouvée
                          cycles, tu as           
                          enregistré... »         

  Retard règles           Information + test      Affirmer grossesse
                          grossesse selon         
                          contexte + orientation  

  Douleur                 Conseils généraux +     Prescrire
                          signes d'alerte         traitement/dose

  Contraception           Dire qu'NAWIRA n'est    Dire quels jours sont «
                          pas une contraception   sûrs »

  Projet bébé             Aider au suivi et à la  Garantir conception
                          compréhension           
  -----------------------------------------------------------------------

# 7. Moteur de cycle --- règles métier v1

## 7.1 Définitions

  ---------------------------------------------------------------------
  Terme                              Définition produit
  ---------------------------------- ----------------------------------
  Cycle                              Du premier jour d'une menstruation
                                     au jour précédant la suivante.

  Cycle observé                      Cycle calculé à partir de dates
                                     réellement saisies.

  Cycle attendu                      Estimation algorithmique, jamais
                                     une observation.

  Confiance                          Faible / moyenne / élevée selon
                                     quantité, récence et variabilité
                                     des données.

  Valeur aberrante                   Cycle très éloigné de l'historique
                                     ; ne pas l'exclure
                                     silencieusement.
  ---------------------------------------------------------------------

## 7.2 Algorithme règles v1

-   0 cycle complet : utiliser durée habituelle déclarée si disponible ;
    sinon aucune prédiction précise.
-   1--2 cycles complets : médiane/moyenne simple des cycles
    disponibles, confiance faible.
-   3--5 cycles : moyenne pondérée donnant plus de poids aux cycles
    récents ; calcul de variabilité.
-   ≥6 cycles : fenêtre glissante configurable (ex. 6 derniers cycles) +
    robustesse aux valeurs extrêmes.
-   Date centrale estimée = début dernières règles + durée de cycle
    estimée.
-   Intervalle = fonction de la variabilité historique ; plus la
    variance augmente, plus la plage s'élargit.
-   Ne jamais supprimer automatiquement un cycle atypique ; marquer et
    demander confirmation si nécessaire. \## 7.3 Pseudorègle de
    confiance

  ---------------------------------------------------------------------
  Condition                          Confiance
  ---------------------------------- ----------------------------------
  \<2 cycles complets ou durée       Faible
  seulement déclarée                 

  2--3 cycles, variabilité modérée   Faible à moyenne

  ≥4 cycles cohérents                Moyenne

  ≥6 cycles cohérents + peu de       Élevée
  corrections                        

  Cycles très variables / données    Faible, quel que soit le volume
  contradictoires                    
  ---------------------------------------------------------------------

# 8. Moteur fertilité/ovulation v1

  -------------------------------------------------------------------------
  Restriction réglementaire Le produit estime des périodes de fertilité
  pour compréhension/projet bébé. Il ne fournit jamais de « jours sans
  risque » et ne doit pas être commercialisé comme méthode contraceptive.
  Aux États-Unis, un logiciel qui prédit les jours fertiles pour prévenir
  une grossesse est classé dispositif médical de classe II par la FDA.
  -------------------------------------------------------------------------

------------------------------------------------------------------------

## 8.1 Free

-   Calculer une fenêtre fertile estimée uniquement si le cycle attendu
    est calculable.

-   Présenter une plage, pas une certitude ponctuelle.

-   Jour d'ovulation = estimation dérivée ; ne jamais généraliser « jour
    14 ».

-   Afficher confiance faible si peu d'historique ou forte variabilité.
    \## 8.2 Projet Bébé

-   Ajouter signaux : température basale, glaire cervicale, LH.

-   Les signaux peuvent modifier le niveau de confiance ou la fenêtre
    selon règles validées médicalement.

-   Conserver les données brutes et la version de l'algorithme.

-   Ne pas affirmer qu'une ovulation a eu lieu sur la seule base d'un
    signal utilisateur.

-   Prévoir un moteur de règles séparé et versionné pour permettre une
    validation clinique future. \# 9. Insights et Cycle Score

## 9.1 Insights

-   Exiger un minimum de données avant toute tendance personnalisée.
-   Formulation : « Tu as souvent enregistré X autour de Y » plutôt que
    « Y cause X ».
-   Afficher la période analysée et le nombre de cycles concernés.
-   Permettre « Ceci ne me ressemble pas » pour feedback qualité. \##
    9.2 Cycle Score

Le Cycle Score est un score d'expérience/journal, pas un score médical.
Version v1 : combinaison normalisée d'énergie, humeur, sommeil et charge
symptomatique lorsque disponibles. Si moins de deux dimensions sont
renseignées, ne pas afficher de score.

  Dimension           Poids initial à tester   Remarque
  ------------------- ------------------------ ------------------------
  Énergie             25 %                     Auto-déclaré
  Humeur              25 %                     Auto-déclaré
  Sommeil             25 %                     Auto-déclaré
  Symptômes/douleur   25 %                     Inversé ; non clinique

# 10. Paywalls & billing

  -----------------------------------------------------------------------
  PW                Déclencheur       Message           CTA
  ----------------- ----------------- ----------------- -----------------
  PW01 Plus         Après premier     « Comprends les   Essayer NAWIRA
                    insight           tendances de ton  Plus
                    verrouillé /      cycle »           
                    analyses                            

  PW02 Baby         Choix Projet Bébé « Suis davantage  Démarrer Projet
                    / fonctionnalité  de signes de      Bébé
                    LH-température    fertilité »       

  PW03 Upgrade      Utilisatrice Plus Valeur            Passer à Projet
                    choisit Projet    incrémentale      Bébé
                    Bébé              claire            
  -----------------------------------------------------------------------

-   Toujours afficher prix, périodicité et renouvellement.
-   Tester essai 7 vs 14 jours.
-   Gérer Mobile Money via couche fournisseur abstraite.
-   Webhooks idempotents ; accès premium uniquement après confirmation
    serveur.
-   États : trialing, active, grace, past_due, cancelled, expired.
    \# 11. Notifications

  -----------------------------------------------------------------------
  Code              Déclencheur       Copie normale     Copie discrète
  ----------------- ----------------- ----------------- -----------------
  N01               Règles estimées   Tes règles sont   Ton rappel
                    J-3               estimées dans     personnel est
                                      environ 3 jours.  disponible.

  N02               Journal           Comment te        Un rappel NAWIRA
                                      sens-tu           est disponible.
                                      aujourd'hui ?     

  N03               Résumé            Ton résumé de     Ton nouveau
                                      cycle est prêt.   résumé est
                                                        disponible.

  N04               Fertilité         Ta fenêtre        Un rappel Projet
                                      fertile estimée   Bébé est
                                      approche.         disponible.
  -----------------------------------------------------------------------

Toutes les notifications sont opt-in, configurables et sensibles au
fuseau horaire. Aucun symptôme ou statut intime ne doit apparaître sur
écran verrouillé en mode discret.

# 12. Privacy, consentement et sécurité

Les données concernant la santé sont des données sensibles bénéficiant
d'une protection spécifique sous le RGPD. NAWIRA doit appliquer
privacy-by-design, consentement explicite lorsque requis, minimisation
et contrôle utilisateur.

  -----------------------------------------------------------------------
  Consent ID              Finalité                Requis ?
  ----------------------- ----------------------- -----------------------
  C01                     Créer et gérer le       Oui selon base légale
                          compte                  retenue

  C02                     Traiter les données de  Oui / condition
                          cycle/santé pour        juridique à valider
                          fournir le service      

  C03                     Utiliser historique     Facultatif séparé
                          dans Assistant NAWIRA   

  C04                     Notifications           Facultatif

  C05                     Analytics produit       À cadrer ; pas de
                          privacy-safe            données santé dans
                                                  adtech

  C06                     Marketing               Facultatif séparé
  -----------------------------------------------------------------------

-   PIN/biométrie facultatifs.
-   TLS ; chiffrement au repos ; stockage local chiffré.
-   MFA obligatoire pour back-office.
-   RBAC et moindre privilège.
-   Aucune vente de données menstruelles.
-   Aucune donnée de santé dans pixels publicitaires/SDK marketing.
-   Export et suppression accessibles dans l'app.
-   Journal d'audit des accès sensibles.
-   Plan incident + pentest avant production. \# 13. Architecture
    logique

  Composant              Responsabilité
  ---------------------- --------------------------------------------------------
  Web Client/PWA         UI, cache local, offline queue, notifications locales.
  API Gateway            Auth, rate limiting, routage.
  Cycle Service          Cycles, règles, prédictions.
  Fertility Service      Signaux et estimations Projet Bébé.
  Insight Service        Agrégations et tendances.
  AI Gateway             Guardrails, contexte autorisé, fournisseur LLM.
  Billing Service        Plans, entitlements, webhooks.
  Notification Service   Scheduling et préférences.
  Content Service        Éducation validée et localisation.
  Privacy Service        Consentements, export, suppression.
  Admin                  Support, contenus, feature flags, audit.

## 13.1 Offline sync

-   Chaque mutation locale reçoit UUID, version, updated_at, sync_state.
-   File d'attente persistante ; retry exponentiel.
-   Saisie locale considérée réussie avant réseau.
-   Conflit simple : dernière modification utilisateur avec horodatage
    serveur/client normalisé.
-   Les recalculs serveur retournent prediction_version ; l'app invalide
    l'ancienne prédiction. \# 14. Modèle de données détaillé

  ---------------------------------------------------------------------
  Table                              Champs v1
  ---------------------------------- ----------------------------------
  users                              id UUID PK; country_code;
                                     language; timezone; status;
                                     created_at; deleted_at

  profiles                           user_id FK; goal;
                                     usual_cycle_length;
                                     usual_period_length;
                                     irregular_flag; onboarding_version

  consents                           id; user_id; consent_type;
                                     policy_version; status;
                                     captured_at; revoked_at

  period_events                      id; user_id; date; flow; spotting;
                                     source; created_at; updated_at

  daily_logs                         id; user_id; date; mood; energy;
                                     sleep_quality; sleep_minutes;
                                     note_encrypted

  symptom_logs                       id; daily_log_id; symptom_code;
                                     intensity; location_code

  fertility_signals                  id; user_id; date; mucus_code;
                                     bbt_value; bbt_unit; lh_result

  cycles                             id; user_id; start_date; end_date;
                                     length; completeness; anomaly_flag

  predictions                        id; user_id; type; start_date;
                                     center_date; end_date; confidence;
                                     algorithm_version; created_at

  insights                           id; user_id; insight_type;
                                     period_start; period_end;
                                     evidence_count; content_key;
                                     created_at

  subscriptions                      id; user_id; plan; status;
                                     provider; provider_ref; start_at;
                                     renew_at; end_at

  payment_events                     id; subscription_id;
                                     provider_event_id UNIQUE; type;
                                     amount; currency; status;
                                     occurred_at

  notification_preferences           user_id; category; enabled;
                                     discreet; preferred_time

  ai_conversations                   id; user_id; consent_snapshot;
                                     created_at; retention_class

  audit_events                       id; actor_type; actor_id; action;
                                     target_type; target_id; result;
                                     created_at
  ---------------------------------------------------------------------

# 15. API contract v1 --- endpoints

  Méthode   Endpoint                           But
  --------- ---------------------------------- -----------------------
  POST      /v1/auth/register                  Créer compte
  POST      /v1/auth/login                     Connexion
  GET       /v1/me                             Profil
  PATCH     /v1/me/preferences                 Préférences
  POST      /v1/consents                       Consentement
  GET       /v1/cycles                         Historique
  POST      /v1/period-events                  Saisie règles
  POST      /v1/daily-logs                     Journal
  POST      /v1/fertility-signals              Projet Bébé
  GET       /v1/predictions/current            Estimations courantes
  GET       /v1/insights                       Tendances
  GET       /v1/reports/{period}               Rapport
  GET       /v1/plans                          Plans/prix pays
  POST      /v1/subscriptions                  Initier abonnement
  POST      /v1/payments/webhooks/{provider}   Webhook
  POST      /v1/assistant/messages             Assistant
  POST      /v1/privacy/export                 Demande export
  POST      /v1/privacy/delete                 Suppression

  --------------------------------------------------------------------
  API standard OpenAPI 3.x obligatoire avant implémentation finale ;
  erreurs structurées, pagination, idempotency-key pour mutations
  sensibles et versionnement /v1.
  --------------------------------------------------------------------

------------------------------------------------------------------------

# 16. Events analytics

  Event                      Propriétés autorisées
  -------------------------- --------------------------------
  onboarding_started         source,country
  goal_selected              goal
  onboarding_completed       duration_sec
  period_logged              offline_flag
  daily_log_saved            fields_count,duration_sec
  prediction_viewed          type,confidence
  insight_viewed             type,evidence_count
  paywall_viewed             paywall_id,plan
  checkout_started           plan,provider
  subscription_activated     plan,provider
  subscription_cancelled     plan,reason
  third_cycle_completed      months_since_signup
  assistant_used             intent_category,no_health_text
  privacy_export_requested   ---
  account_delete_requested   ---

Ne jamais inclure le texte libre, les symptômes précis, les dates de
règles, le statut grossesse/fertilité ou les réponses intimes dans les
événements marketing/analytics génériques.

# 17. KPIs et seuils de validation

  -----------------------------------------------------------------------
  KPI                     Cible pilote indicative Action si faible
  ----------------------- ----------------------- -----------------------
  Activation              ≥65 %                   Réduire onboarding

  D7                      ≥35 %                   Améliorer
                                                  time-to-value/rappels

  D30                     ≥20 %                   Renforcer boucle cycle

  3 cycles enregistrés    ≥25 % des activées à    Améliorer valeur
                          maturité                historique

  Free→Plus               Tester vers ≥3--5 %     Revoir valeur/paywall

  Projet Bébé             Tester vers ≥1--3 %     Revoir
                          total                   ciblage/packaging

  Churn payant mensuel    À minimiser ; baseline  Cohortes + raisons
                          pilote                  annulation

  Saisie simple           médiane \<10 s          Simplifier LOG01
  -----------------------------------------------------------------------

Ces seuils sont des hypothèses de pilotage, pas des benchmarks garantis.
Les décisions seront prises par cohortes pays/objectif.

# 18. Back-office

-   CMS contenus validés.

-   Plans/prix par pays.

-   Feature flags.

-   Recherche compte support par identifiant sécurisé.

-   Masquage par défaut des données sensibles.

-   Gestion export/suppression.

-   Vue paiements et webhooks.

-   Versions algorithmes.

-   Audit accès admin.

-   Dashboard incidents. \# 19. Accessibilité & localisation

-   Cible WCAG 2.2 AA lorsque applicable.

-   Zones tactiles ≥44×44 px.

-   Support taille texte système.

-   Labels lecteurs d'écran.

-   Ne pas dépendre uniquement de la couleur pour distinguer
    règles/estimations.

-   Toutes les chaînes externalisées.

-   Français v1 ; architecture wolof/anglais prête.

-   Formats date/nombre/fuseau selon locale. \# 20. QA & cas limites
    obligatoires

  Cas                       Résultat attendu
  ------------------------- ------------------------------------------------
  Cycle 28j régulier        Prédiction stable, confiance croissante
  Cycles 24/35/27/40        Plage élargie, confiance basse
  Une seule règle saisie    Pas de fausse précision
  Correction date passée    Cycles + prédictions recalculés
  Offline 5 jours           Aucune perte ; sync au retour
  Double webhook paiement   Pas de double activation/débit logique
  Fuseau changé             Dates de cycle non décalées par UTC
  Suppression compte        Données supprimées/anonymisées selon politique
  Question contraception    Refus de « jours sûrs »
  Douleur sévère            Orientation selon protocole validé
  Notification discrète     Aucune donnée intime sur lockscreen

# 21. Backlog de développement --- Epics

  Epic   Nom                    Scope                                           Priorité
  ------ ---------------------- ----------------------------------------------- ----------
  E1     Fondations             Repo, CI/CD, env, auth, observabilité           P0
  E2     Onboarding & consent   OB01--OB11                                      P0
  E3     Cycle core             Règles, cycles, calendrier, prédiction          P0
  E4     Journal & offline      LOG01, stockage local, sync                     P0
  E5     Fertilité              Fenêtre, signaux Projet Bébé                    P0
  E6     Analyses               Insights, Cycle Score, rapports                 P0/P1
  E7     Billing                Plans, Mobile Money abstraction, entitlements   P0
  E8     Privacy & security     Export, delete, audit, hardening                P0
  E9     Notifications          Règles, journal, résumé, fertilité              P0
  E10    Assistant              AI Gateway + guardrails                         P1
  E11    Admin                  CMS, support, pricing, audit                    P1
  E12    Analytics              Events privacy-safe + dashboards                P0

# 22. Plan de sprints recommandé

  ---------------------------------------------------------------------
  Sprint                             Livrable
  ---------------------------------- ----------------------------------
  Sprint 0 --- 2 sem.                Architecture, threat model, design
                                     system, OpenAPI skeleton, règles
                                     médicales, conformité.

  Sprint 1 --- 2 sem.                Auth, onboarding 1--6, modèle
                                     User/Profile/Consent, stockage
                                     local.

  Sprint 2 --- 2 sem.                Règles, cycles, calendrier, moteur
                                     prédiction règles v1.

  Sprint 3 --- 2 sem.                Journal, symptômes, offline sync,
                                     notifications de base.

  Sprint 4 --- 2 sem.                Home, analyses basiques,
                                     confiance, corrections
                                     historiques.

  Sprint 5 --- 2 sem.                Projet Bébé : signaux, fenêtre
                                     fertile v1, UX sécurité.

  Sprint 6 --- 2 sem.                Billing, plans, entitlements,
                                     provider sandbox.

  Sprint 7 --- 2 sem.                Privacy export/delete, admin
                                     minimum, analytics.

  Sprint 8 --- 2 sem.                Assistant P1, rapports, hardening.

  Sprint 9 --- 2 sem.                QA E2E, performance, sécurité,
                                     bêta fermée.
  ---------------------------------------------------------------------

# 23. Definition of Done

-   User story + critères d'acceptation validés.

-   Tests unitaires et intégration verts.

-   Cas offline testé si concerné.

-   Aucune donnée sensible dans logs/analytics.

-   Accessibilité de base vérifiée.

-   Traductions externalisées.

-   Observabilité/erreurs instrumentées.

-   Security review pour auth, billing, privacy, IA.

-   QA sur navigateurs et appareils cibles.

-   Documentation API/architecture mise à jour. \# 24. Gates avant bêta
    publique

-   Revue médicale des contenus, alertes et formulations.

-   Revue juridique pays pilote.

-   DPIA/évaluation privacy si requise.

-   Pentest sans critique/haute ouverte.

-   Test restauration sauvegarde.

-   Export/suppression E2E.

-   Test paiement succès/échec/timeout/webhook doublé.

-   Test cycles irréguliers et données insuffisantes.

-   Assistant testé contre diagnostic, prescription et contraception.

-   Politique incident/support publiée en interne. \# 25. Décisions
    ouvertes à valider pendant Sprint 0

  -----------------------------------------------------------------------
  Sujet                   Options                 Décision attendue
  ----------------------- ----------------------- -----------------------
  Framework mobile        Flutter / React Native  Choisir selon équipe et
                                                  performance offline

  Backend                 Node/Nest /             Choisir stack
                          Python/FastAPI / autre  maintenable

  DB locale               SQLite chiffré /        Bench Android bas de
                          solution framework      gamme

  Paiement Sénégal        Agrégateur /            Coût, couverture,
                          intégrations directes   webhooks

  LLM                     Fournisseur(s) via      Privacy, coût, latence,
                          gateway                 région

  Hébergement             Région et fournisseur   Données, conformité,
                                                  coût

  Âge minimum             Politique adulte /      Décision juridique +
                          adolescentes            produit

  Cycle Score             Poids/nom final         Test utilisateur ;
                                                  éviter interprétation
                                                  médicale
  -----------------------------------------------------------------------

# 26. Références de sécurité produit

• OMS, Menstrual health, 18 juin 2026 : cycle moyen 21--35 jours,
importance d'informations exactes et de l'accès aux soins. • Commission
européenne : les données concernant la santé sont des catégories
particulières de données protégées par le RGPD ; le consentement
explicite est l'une des conditions possibles de traitement selon le
contexte. • FDA : une application utilisée comme contraception en
prédisant les jours fertiles est un logiciel médical ; la classification
PYT est classe II aux États-Unis. • OMS, guideline infertility 2025 :
les recommandations sur l'infertilité doivent être fondées sur les
preuves ; NAWIRA Projet Bébé reste un outil de suivi/information au MVP.

# 27. Résultat attendu du MVP

  -------------------------------------------------------------------------
  MVP réussi Une utilisatrice peut installer NAWIRA, comprendre sa valeur
  en moins de 2 minutes, enregistrer son cycle en quelques secondes,
  utiliser l'app malgré un réseau instable, obtenir des estimations
  clairement qualifiées, accumuler un historique utile et --- si la
  valeur est suffisante --- passer à Plus ou Projet Bébé avec un paiement
  local.
  -------------------------------------------------------------------------

------------------------------------------------------------------------

# 28. Addendum v2.0 --- Architecture Web App / PWA

## 28.1 Décision produit

NAWIRA est une **Web App responsive avec capacités PWA**, conçue en
priorité pour le smartphone mais pleinement exploitable sur tablette et
ordinateur.

L'expérience doit respecter trois contextes :

  -----------------------------------------------------------------------
  Contexte                Navigation              Usage
  ----------------------- ----------------------- -----------------------
  Smartphone              Bottom navigation +     Usage quotidien
                          bouton `+` central      principal

  Tablette                Navigation compacte +   Usage personnel
                          contenu élargi          

  Desktop                 Sidebar gauche + zone   Analyses, rapports,
                          centrale + panneau      gestion du profil
                          contextuel éventuel     
  -----------------------------------------------------------------------

La landing page marketing et l'espace authentifié sont deux surfaces
distinctes mais appartiennent au même produit Web.

## 28.2 Routes Web proposées

  Route                     Fonction
  ------------------------- ---------------------------
  `/`                       Landing page
  `/signup`                 Création de compte
  `/login`                  Connexion
  `/onboarding`             Onboarding
  `/app/today`              Aujourd'hui
  `/app/calendar`           Calendrier
  `/app/log`                Saisie rapide
  `/app/insights`           Analyses
  `/app/baby`               Projet Bébé
  `/app/assistant`          Assistant NAWIRA
  `/app/profile`            Profil
  `/app/settings/privacy`   Confidentialité
  `/app/billing`            Abonnement et facturation

Les routes privées doivent exiger une session authentifiée et respecter
les entitlements du plan.

## 28.3 Responsive design

### Mobile

-   Largeur de référence UX : 360--430 px.
-   Bottom navigation fixe.
-   Bouton `+` accessible au pouce.
-   Cartes empilées.
-   Calendrier optimisé tactile.
-   Paywalls en page ou bottom sheet selon contexte.

### Tablette

-   Breakpoint indicatif à définir dans le design system.
-   Navigation latérale compacte possible.
-   Analyses sur deux colonnes lorsque l'espace le permet.

### Desktop

-   Sidebar persistante.
-   Largeur de contenu maîtrisée pour éviter les interfaces
    excessivement étirées.
-   Dashboard en grille.
-   Calendrier et analyses peuvent utiliser davantage d'espace
    horizontal.
-   Profil, confidentialité et facturation accessibles depuis la
    sidebar.
-   La saisie rapide doit rester accessible en un clic.

## 28.4 PWA

Le MVP doit prévoir :

-   Web App Manifest.
-   Icônes NAWIRA adaptées.
-   `display: standalone` lorsque supporté.
-   Service Worker.
-   Cache de l'application shell.
-   Écran offline explicite.
-   File locale des saisies non synchronisées.
-   Mise à jour contrôlée du Service Worker.
-   Détection de nouvelle version avec message non intrusif.
-   Installation sur écran d'accueil lorsque le navigateur le permet.

L'installation PWA est une commodité, **pas une condition
d'utilisation**.

## 28.5 Offline

Les fonctionnalités suivantes doivent rester disponibles après
chargement initial et authentification valide :

-   consultation du calendrier déjà synchronisé ;
-   consultation de l'historique local autorisé ;
-   création/modification d'un journal quotidien ;
-   enregistrement de règles ;
-   enregistrement de symptômes ;
-   enregistrement des signaux Projet Bébé.

Nécessitent une connexion :

-   paiement ;
-   assistant IA ;
-   synchronisation multi-appareils ;
-   génération serveur de certains rapports ;
-   récupération de nouveaux contenus ;
-   opérations de compte sensibles selon politique de sécurité.

La Web App doit afficher clairement l'état : `Hors ligne`,
`Synchronisation…`, `Synchronisé`, `Échec de synchronisation`.

## 28.6 Stockage navigateur

La stratégie recommandée est :

-   IndexedDB pour données structurées offline ;
-   Cache Storage pour assets PWA ;
-   mémoire/session sécurisée pour les éléments d'authentification
    lorsque possible ;
-   éviter de stocker des données sensibles en clair dans
    `localStorage`.

Une revue de sécurité doit déterminer quelles données de santé peuvent
être conservées localement et sous quelle forme. Le cache doit être
minimisé sur appareils partagés.

## 28.7 Authentification Web

Le système doit prendre en charge :

-   inscription ;
-   connexion ;
-   déconnexion de toutes les sessions ;
-   récupération de compte ;
-   expiration de session ;
-   protection CSRF selon architecture ;
-   cookies `Secure`, `HttpOnly`, `SameSite` lorsque l'authentification
    repose sur cookies ;
-   limitation de tentatives ;
-   MFA pour administrateurs.

Une option « appareil partagé » pourra empêcher la persistance locale de
données sensibles.

## 28.8 Paiement Web

Le checkout est intégré au Web et ne dépend pas des stores.

Priorités :

1.  Mobile Money adapté au pays ;
2.  Wave / Orange Money lorsque disponibles via le prestataire choisi ;
3.  MTN MoMo / Moov Money selon expansion ;
4.  carte bancaire.

Le Billing Service reste indépendant du fournisseur.

Flux :

`Paywall → choix offre → choix paiement → redirection/modal fournisseur → confirmation serveur → webhook → entitlement → retour NAWIRA`.

Ne jamais accorder définitivement l'accès payant sur la seule base d'un
retour navigateur : le serveur doit confirmer le paiement.

## 28.9 Landing page corrigée

Le CTA principal devient :

**Commencer gratuitement**

Le CTA secondaire peut être :

**Découvrir NAWIRA**

À supprimer :

-   « Télécharger l'app » ;
-   badges Google Play ;
-   badge App Store ;
-   toute formulation laissant entendre qu'un store est nécessaire.

Hero recommandé :

**Comprends ton corps. Vis ton cycle plus sereinement.**

NAWIRA t'aide à suivre tes règles, comprendre les tendances de ton cycle
et mieux connaître ta fertilité --- dans une expérience simple,
confidentielle et pensée pour les femmes africaines.

CTA : **Commencer gratuitement**

Microcopy : **Aucune installation nécessaire.**

## 28.10 Dashboard desktop

Structure recommandée :

**Sidebar gauche** - Logo NAWIRA - Aujourd'hui - Calendrier - Ajouter -
Analyses - Projet Bébé - Assistant - séparateur - Profil - Paramètres

**Zone centrale** - Bonjour + jour du cycle - grande carte Cycle -
prochaines règles - fenêtre fertile estimée - insight du jour - CTA de
saisie - mini calendrier / tendances

**Colonne contextuelle desktop** - résumé hebdomadaire ; - prochain
événement ; - conseil éducatif ; - upgrade contextualisé si pertinent.

La version desktop ne doit pas devenir un logiciel médical dense : elle
conserve la douceur et la simplicité du mobile.

## 28.11 Stack Web recommandée à arbitrer au Sprint 0

Une architecture possible :

  ---------------------------------------------------------------------
  Couche                             Option recommandée
  ---------------------------------- ----------------------------------
  Frontend                           Next.js / React + TypeScript

  Styling                            Tailwind CSS ou design system
                                     équivalent

  PWA                                Service Worker + Manifest +
                                     stratégie de cache maîtrisée

  Offline DB                         IndexedDB via couche d'abstraction

  Backend                            API séparée ou backend
                                     TypeScript/Python selon équipe

  Database                           PostgreSQL

  Jobs                               Queue/worker

  Auth                               Solution sécurisée compatible Web

  Storage                            Object storage chiffré

  Monitoring                         Frontend + API + jobs

  Deployment                         CDN/edge pour assets + région
                                     backend conforme au cadrage
                                     juridique
  ---------------------------------------------------------------------

Le choix final de stack doit privilégier la maintenabilité, la sécurité,
les compétences de l'équipe et le coût, plutôt qu'un framework à la
mode.

## 28.12 SEO et performance de la partie publique

La landing page doit être rendue de manière favorable au SEO.

Exigences :

-   balises title/meta uniques ;
-   Open Graph ;
-   sitemap ;
-   robots.txt ;
-   données structurées pertinentes ;
-   pages légales indexables selon stratégie ;
-   images optimisées ;
-   chargement différé ;
-   Core Web Vitals suivis ;
-   aucune dépendance à l'IA pour afficher la landing page.

L'espace `/app/*` privé n'a pas vocation à être indexé.

## 28.13 Analytics Web

Événements supplémentaires :

  Event                        Usage
  ---------------------------- --------------------------------
  `landing_viewed`             Entrée marketing
  `hero_cta_clicked`           Conversion landing → signup
  `signup_started`             Début inscription
  `pwa_install_prompt_shown`   Mesure disponibilité
  `pwa_installed`              Adoption PWA
  `offline_mode_entered`       Qualité réseau / usage offline
  `sync_completed`             Fiabilité
  `sync_failed`                Monitoring

Les règles de minimisation des données sensibles restent inchangées.

## 28.14 Critères d'acceptation Web supplémentaires

-   Aucun scroll horizontal à 320 px.
-   Les fonctionnalités cœur sont utilisables au clavier sur desktop.
-   Focus visible.
-   Navigation responsive sans perte de fonctionnalité.
-   Le rafraîchissement d'une route privée ne casse pas la session.
-   Une saisie offline survit à la fermeture/réouverture du navigateur
    dans les limites de sécurité définies.
-   Les conflits de synchronisation ne provoquent pas de perte
    silencieuse.
-   Le checkout fonctionne sur navigateur mobile.
-   La landing page ne contient aucun CTA de store.
-   L'installation PWA n'est jamais obligatoire.
-   Les pages privées comportent une protection contre l'indexation.
-   Les données sensibles ne sont pas écrites en clair dans les logs
    navigateur.

## 28.15 Mise à jour du plan de sprints

  ---------------------------------------------------------------------
  Sprint                             Correction Web/PWA
  ---------------------------------- ----------------------------------
  Sprint 0                           Architecture Web, responsive
                                     breakpoints, threat model
                                     navigateur, PWA strategy

  Sprint 1                           Auth Web, onboarding responsive,
                                     session

  Sprint 2                           Dashboard + calendrier responsive

  Sprint 3                           Journal + IndexedDB + offline
                                     queue

  Sprint 4                           Analyses desktop/mobile +
                                     synchronisation

  Sprint 5                           Projet Bébé responsive

  Sprint 6                           Checkout Web + Mobile Money

  Sprint 7                           Privacy, profil, admin, SEO
                                     landing

  Sprint 8                           Assistant + rapports

  Sprint 9                           Cross-browser QA, PWA,
                                     performance, pentest
  ---------------------------------------------------------------------

## 28.16 Navigateurs cibles MVP

Support prioritaire :

-   Chrome Android récent ;
-   Safari iOS récent ;
-   Chrome desktop ;
-   Edge desktop ;
-   Firefox desktop récent.

La matrice exacte de versions doit être figée au Sprint 0 à partir des
analytics du marché pilote.

## 28.17 Nouvelle Definition of Done Web

En plus de la DoD générale :

-   responsive mobile/tablette/desktop validé ;
-   clavier et focus testés ;
-   états loading/error/empty/offline implémentés ;
-   route directe et refresh testés ;
-   cache PWA testé ;
-   aucune donnée sensible exposée dans URL/query string ;
-   test réseau lent ;
-   test navigateur mobile réel ;
-   Lighthouse/performance suivi sans considérer un score unique comme
    critère absolu ;
-   sécurité XSS/CSRF/CSP examinée selon architecture.

# 29. Décision finale v2.0

**NAWIRA = Web App/PWA responsive, mobile-first.**

Le MVP est accessible directement par URL. L'utilisatrice peut créer son
compte et utiliser NAWIRA sans installer d'application native. La PWA
apporte ensuite une expérience proche d'une application installée
lorsque le navigateur et l'appareil le permettent.

Cette décision remplace toute ancienne hypothèse faisant d'Android ou
des stores la plateforme principale du MVP.
