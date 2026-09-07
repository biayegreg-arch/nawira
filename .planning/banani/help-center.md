# HelpCenter — Banani → Next.js/Tailwind

## Source
- Banani screen ID: `acguXQuGeGbU/screens/HelpCenter.jsx` (+ shared `HelpCenterSearch.jsx`, `HelpArticlesList.jsx`, `HelpSupportContact.jsx`)
- Fetched: 2026-09-07

## Decisions (confirmed with user)
- FAQ accordion with real, short, cautious answers — no separate article-detail route, no fake read-counts (`"1245 lectures"` etc. — same fake-social-proof reasoning as the landing page).
- Dropped the "Fertilité & Conception" category entirely — no fertility feature exists yet (E5), an FAQ about it would document a feature that doesn't exist.
- Dropped "Chat en direct" (no chat backend), "Réseaux sociaux" (no verified real account, same reasoning as the landing page footer), and the whole "Ressources utiles" block (`href="#"` dead links to a glossary/PDF guide/community that don't exist).
- Kept: real `mailto:support@nawira.app` link, and the medical-disclaimer info box (important, not decorative).
- Search is a real client-side filter over the FAQ titles (no backend needed, and doesn't misrepresent depth that doesn't exist).

## FAQ content (final copy — 4 categories, 2-3 questions each)

**Démarrage**
- *Créer mon compte NAWIRA* — Inscris-toi avec ton email et un mot de passe (ou connecte-toi avec Google). Un code de vérification à 8 caractères t'est envoyé par email pour confirmer ton adresse avant d'accéder à l'application.
- *Configurer mon premier cycle* — Lors de l'inscription, l'onboarding te demande la date de tes dernières règles ainsi que la durée habituelle de ton cycle et de tes règles, si tu les connais. NAWIRA affine ensuite ses estimations au fil de tes saisies.
- *Enregistrer mes règles au quotidien* — Sur l'écran Accueil, appuie sur « Mes règles ont commencé » le jour où elles débutent. NAWIRA reconstruit automatiquement tes cycles à partir de ces saisies.

**Cycle menstruel**
- *Comprendre les phases du cycle* — Un cycle se compte du premier jour des règles jusqu'à la veille des règles suivantes. Sa durée varie normalement entre 21 et 35 jours selon les personnes, et peut fluctuer d'un cycle à l'autre.
- *Pourquoi mon cycle peut sembler irrégulier* — De nombreux facteurs (stress, sommeil, poids, activité physique, certains traitements) peuvent faire varier la durée d'un cycle. Si l'irrégularité persiste sur plusieurs cycles, on te recommande d'en parler à un professionnel de santé.
- *Quelle est la durée normale d'un cycle ?* — La plupart des cycles durent entre 21 et 35 jours. NAWIRA affiche une estimation basée sur tes cycles précédemment enregistrés — plus tu as d'historique, plus l'estimation est fiable.

**Symptômes et bien-être**
- *Gérer les crampes menstruelles* — La chaleur (bouillotte), le repos et une activité physique douce peuvent aider à soulager l'inconfort. Si les douleurs sont intenses ou t'empêchent de mener tes activités habituelles, consulte un professionnel de santé.
- *Comprendre le syndrome prémenstruel (SPM)* — Le SPM regroupe des symptômes physiques et émotionnels (fatigue, sensibilité, changements d'humeur) qui peuvent apparaître avant les règles. NAWIRA ne pose pas de diagnostic — si ces symptômes affectent significativement ton quotidien, un professionnel de santé pourra t'accompagner.

**Compte et données**
- *Comment mes données sont-elles protégées ?* — Tes données sont chiffrées et hébergées de façon sécurisée. Elles ne sont jamais partagées à des fins commerciales.
- *Puis-je modifier mes informations de profil ?* — Pas encore dans cette version : tes informations (date de naissance, objectif, durée de cycle déclarée) sont affichées sur ton profil mais pas encore modifiables directement dans l'application. Cette fonctionnalité arrive prochainement.

## Component breakdown
- **NEW** `frontend/src/lib/help-content.ts` — the FAQ data above, typed `HelpCategory[]`, `{ title, icon, color, questions: { q, a }[] }`.
- **NEW** `frontend/src/components/help/HelpAccordion.tsx` — renders one category card with expandable Q/A rows (client component, local `openIndex` state per category).
- **NEW** `frontend/src/app/app/help/page.tsx` — search input (filters `help-content.ts` client-side by question text), renders `HelpAccordion` per category (only categories with ≥1 matching question when filtering), a support card (mailto link only), and the medical-disclaimer info box.
- **PRIMITIVE** none new — reuses existing icon/card conventions from the Home/Calendar screens.

## Token mapping
Already present.

## Responsive plan
- **375px**: search full-width, categories stacked single column, no two-column split.
- **1024px+**: two-column layout (`lg:grid-cols-[1fr_320px]`) — articles left, support+disclaimer sidebar right, matching Banani's `1fr 320px` grid.

## Interactions / state
- Accordion: click toggles one question open/closed within its category (multiple can be open at once — no accordion-exclusivity needed, Banani doesn't imply it).
- Search: instant client-side filter, no debounce needed (small static dataset).
- No loading/error states — fully static, no network call.

## Copy
All above, inline JSX / `help-content.ts`, French.

## Implementation checklist
- [ ] `help-content.ts`, `HelpAccordion.tsx`, `app/app/help/page.tsx`
- [ ] 375/768/1280 check, typecheck/lint/build

## Open questions for user
None outstanding — content approach confirmed above.
