# VR BOOST AGENCY — Devis & Factures (V1)

Application interne de création, validation, émission et suivi des **devis** et **factures**
(acomptes, soldes, avoirs, paiements), avec PDF A4 fidèles aux modèles VR BOOST et intégration HubSpot.

| Rôle | Peut | Ne peut pas |
|---|---|---|
| **Meryem — Commerciale** (`SALES`) | Créer/modifier ses brouillons, saisir librement prestations et prix, choisir/créer les clients (dont import HubSpot), soumettre au CEO, marquer un devis envoyé/accepté/refusé, préparer les factures (acompte, solde, définitive) | Approuver, apposer cachet/signature, modifier une facture émise, toucher aux séquences, voir/modifier les paramètres, le journal d'audit, enregistrer des règlements, émettre des avoirs |
| **CEO — Administrateur** (`CEO`) | Tout, dont : approbation, numérotation définitive, cachet & signature, émission, avoirs, rectificatives, règlements, paramètres, numérotation, journal | — |

## Démarrage local

```bash
npm install
```

```bash
npm run db:local        # PostgreSQL local (Postgres.app) sur le port 54329, bases vrboost et vrboost_test
```

```bash
cp .env.example .env    # puis renseigner SEED_CEO_PASSWORD / SEED_SALES_PASSWORD (12 caractères min.)
```

```bash
npx prisma migrate deploy && npm run db:seed
```

```bash
npm run dev             # http://localhost:3100
```

Tests (base `vrboost_test`, jamais la base de dev) :

```bash
npm test
```

## Architecture

```
src/
  lib/          calc.ts (calculs en centimes, sans flottants) · numbering.ts (séquences transactionnelles)
                permissions.ts (matrice de rôles) · auth.ts (sessions) · audit.ts · validation.ts (zod)
  server/       quotes.ts · invoices.ts · payments.ts · clients.ts · admin.ts · hubspot.ts  ← logique métier
  pdf/          DocumentPdf.tsx (gabarit A4) · render.tsx (rendu + archivage) · assets.ts (actifs privés)
  app/          actions.ts (point d'entrée unique des mutations) · pages (App Router) · api/pdf
prisma/         schema.prisma · migrations (dont triggers d'immutabilité) · seed.ts
private/        cachet, signature, police Lufga — ignoré par git, jamais servi par HTTP
assets/brand/   en-tête officiel A4 (fond de page)
tests/          unit/ (calculs, permissions, PDF) · integration/ (workflow, concurrence, HubSpot simulé)
```

Stack : Next.js 16 (App Router, Server Actions) · TypeScript · PostgreSQL · Prisma 7 · @react-pdf/renderer · Tailwind 4 · Vitest.

## Workflows

**Devis** : Brouillon (Meryem) → Soumission → Approbation CEO (attribution du numéro, cachet/signature optionnels,
PDF officiel archivé) → Envoyé → Accepté / Refusé. Un devis approuvé est figé : toute modification passe par
« Nouvelle version » (même numéro, V2, V3…), qui doit être revalidée ; l'ancienne version passe à « Remplacé ».

**Facture** : Brouillon → Soumission → « Approuver et émettre » (CEO) → numéro définitif attribué **à l'émission
uniquement** → suivi des paiements (Émise → Partiellement payée → Payée ; « En retard » si échéance dépassée).

**Depuis un devis accepté** :
- *Facture d'acompte* (50 % par défaut) — une ligne par taux de TVA, exigible à l'émission (avant démarrage).
- *Facture de solde* — reprend toutes les prestations puis **déduit les acomptes émis** (nets d'avoirs), chacun une
  seule fois ; « Net à payer » = solde. Impossible tant qu'un acompte est en brouillon.
- *Facture définitive (100 %)* — seulement s'il n'y a pas d'acompte (sinon refus pour éviter le double comptage).

**Avoirs / rectification** : une facture émise n'est jamais modifiée ni supprimée. « Créer un avoir » produit un avoir
total en brouillon (réduire ses lignes pour un avoir partiel), plafonné au montant restant créditable. « Facture
rectificative » crée l'avoir total + une copie corrigeable, qui ne peut être émise qu'après l'avoir. Un avoir total
passe la facture d'origine à « Annulée (avoir) ». Les avoirs utilisent la série FACTURES.

## Numérotation

- Deux séries indépendantes et annuelles : **DEVIS** et **FACTURES** (avoirs inclus).
- Formats configurables (Paramètres) : devis `00455/2026`, factures `FAC-00455/26`, avoirs `AV-00456/26`
  (`{n}` numéro, `{yyyy}` / `{yy}` année).
- Préconfigurées sur le dernier numéro communiqué, **00454/2026** → prochains numéros **00455/2026** dans chaque série.
- **Aucune émission possible tant que le CEO n'a pas confirmé** les derniers numéros réellement émis
  (Paramètres › Numérotation). On ne peut jamais redescendre sous un numéro déjà attribué.
- Attribution par `UPDATE … RETURNING` dans la transaction d'émission (verrou de ligne PostgreSQL) + contraintes
  `UNIQUE` : testé avec 20 approbations simultanées (aucun doublon, aucun trou).
- Nouvelle année : la série repart à 1 automatiquement une fois activée l'année précédente.

## Sécurité

- Sessions serveur (jeton aléatoire 256 bits en cookie `httpOnly`/`Secure`/`SameSite=Lax`, seul le SHA-256 est stocké),
  bcrypt (coût 12), verrouillage 15 min après 5 échecs, réponse à temps constant.
- Toute mutation passe par une Server Action qui ré-authentifie, puis par un service qui vérifie la permission
  (`assertCan`) : l'interface n'est jamais la seule barrière. Protection CSRF native des Server Actions.
- **Garde-fous en base (triggers)** : journal d'audit et archives PDF en ajout seul ; factures émises non
  modifiables/non supprimables ; lignes figées ; paiements non supprimables (annulation tracée) ; devis approuvés
  figés ; séquences jamais décrémentées.
- Cachet et signature : stockés hors du dossier public, lus uniquement côté serveur, incorporés **seulement** au PDF
  officiel d'un document approuvé par le CEO avec l'option cochée. Brouillons : filigrane « BROUILLON — NON VALABLE ».
- PDF officiel archivé une seule fois (empreinte SHA-256, en-tête `X-Document-SHA256`) et resservi à l'identique.
- Instantané client figé à l'émission : modifier une fiche client n'altère pas l'historique.
- En-têtes : `X-Frame-Options: SAMEORIGIN`, CSP `frame-ancestors 'self'`, HSTS, `nosniff`, pas d'indexation.

## HubSpot

Jeton **côté serveur uniquement** (`HUBSPOT_ACCESS_TOKEN`) : clé de service / application privée (`pat-…`, utilisée
telle quelle) ou clé d'accès personnelle (échangée automatiquement contre un jeton temporaire). Scopes :
`crm.objects.companies.read`, `crm.objects.companies.write`, `crm.objects.contacts.read`, `crm.objects.deals.read`,
`crm.objects.deals.write` (si propriété de statut), `files`.

- Recherche entreprises/contacts, import en fiche client (préremplissage), liaison d'un client existant.
- Choix de la transaction (deal) associée dans l'éditeur.
- À l'approbation/émission : note sur l'entreprise **et** la transaction, avec le PDF officiel en pièce jointe privée.
- **Aucun écrasement** : création uniquement (entreprise inexistante — refus si homonyme —, notes, fichiers).
  La seule écriture sur un objet existant est la propriété personnalisée optionnelle `HUBSPOT_DEAL_STATUS_PROPERTY`.
- Une panne HubSpot ne bloque jamais le workflow ; elle est journalisée (`hubspot.error`).

## Envoi par e-mail

Bouton « Envoyer par e-mail » sur un devis approuvé et sur une facture émise : destinataire prérempli (e-mail de la
fiche client), objet et message modifiables, **PDF officiel archivé joint**. Un devis approuvé passe à « Envoyé ».
Chaque envoi est journalisé (destinataires, empreinte du PDF). Configuration SMTP dans `.env` (`SMTP_*`, `MAIL_FROM`) ;
Google Workspace : `smtp.gmail.com:465` avec un mot de passe d'application **du compte indiqué dans `SMTP_USER`**.

## Mise en service (remise à zéro des données de test)

```bash
npm run db:prepare-production -- --last-quote 454 --last-invoice 454 --confirm REINITIALISER
```

Sauvegarde complète (`backups/`), suppression des devis, factures, paiements, archives et journal de test ;
conservation des comptes, paramètres, clients et catalogue ; séquences remises au dernier numéro réellement émis,
à confirmer ensuite par le CEO dans Paramètres › Numérotation.

## Police Lufga — licence

Licence achetée par VR BOOST AGENCY (confirmé le 27/10/2026) : `PDF_FONT=lufga`. Les `.otf` restent dans
`private/fonts/` (jamais publics). Sans cette variable, les PDF utilisent Helvetica.

## Déploiement

```bash
docker compose up -d --build
```

- `Dockerfile` multi-étapes, utilisateur non-root, `prisma migrate deploy` au démarrage.
- Monter `private/` (cachet, signature, polices) en lecture seule sur `/secrets/vrboost` — jamais dans l'image.
- Exposer derrière un reverse proxy HTTPS ; PostgreSQL managé avec sauvegardes chiffrées quotidiennes recommandé
  (conservation légale des pièces comptables : 10 ans).
- `APP_ENV=production` active le blocage d'émission tant que le comptable n'a pas validé les modèles (Paramètres).
- Environnement de recette : `APP_ENV=staging` (mêmes règles, émission possible pour les tests).
- Changer un mot de passe : `npm run user:password -- email@domaine.com` (révoque les sessions).

## Avant l'émission réelle (bloquant)

1. **Confirmer les derniers numéros émis** (00454/2026 dans chaque série ?) et le **format** : les modèles montrent
   `000187/2026` (6 chiffres) et `FAC-00335/26` ; l'application utilise `00455/2026` comme demandé.
2. **Validation du comptable** : taux de TVA par prestation, mentions légales obligatoires (ICE client, pénalités de
   retard — loi 69-21), traitement des acomptes/soldes, série commune factures/avoirs. À enregistrer dans Paramètres.
3. **Licence Lufga** (voir ci-dessus) — sinon Helvetica.
4. **Jeton HubSpot** (Private App) et, si souhaitée, la propriété de transaction dédiée au statut.
5. **Comptes réels** (e-mails CEO et Meryem) et mots de passe définis hors chat.
6. **Hébergement** : domaine, PostgreSQL de production, sauvegardes.
7. **Envoi au client** : la V1 marque le devis « Envoyé » et fournit le PDF ; l'envoi automatique par e-mail
   nécessite un service SMTP/transactionnel (non fourni).
8. Le devis de référence Yakeey mentionne 40 % / 60 % ; l'application applique **50 % / 50 %** comme demandé
   (modifiable par le CEO dans Paramètres).
