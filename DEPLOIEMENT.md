# Déploiement sur le VPS Contabo (Dokploy)

Serveur : `184.174.35.16` — Ubuntu 24.04, Docker 29, **Dokploy v0.27** (Traefik gère HTTPS sur 80/443).
L'application est ajoutée comme les autres projets Dokploy, sans toucher à l'existant.

Domaine prévu : **`facturation.vrboostagency.com`** .

## 1. DNS (Namecheap — serveurs dns1/dns2.registrar-servers.com)

Namecheap › Domain List › vrboostagency.com › **Manage** › **Advanced DNS** › *Add New Record* :
**A Record** · Host `facturation` · Value `184.174.35.16` · TTL Automatic.

## 2. Fichiers privés sur le serveur (depuis le Mac)

Le cachet, la signature et la police Lufga ne sont jamais dans GitHub ni dans l'image Docker.

```bash
ssh -i ~/.ssh/demosorec_deploy root@184.174.35.16 'mkdir -p /opt/vrboost-facturation/private && chmod 700 /opt/vrboost-facturation'
```

```bash
scp -i ~/.ssh/demosorec_deploy -r ~/vrboost-facturation/private/signature ~/vrboost-facturation/private/fonts root@184.174.35.16:/opt/vrboost-facturation/private/
```

```bash
ssh -i ~/.ssh/demosorec_deploy root@184.174.35.16 'chown -R 1001:1001 /opt/vrboost-facturation/private && chmod -R go-rwx /opt/vrboost-facturation/private'
```

(L'application tourne avec l'utilisateur `1001` dans le conteneur.)

## 3. Dokploy — projet et base de données

Ouvrir Dokploy (`http://184.174.35.16:3000` ou votre domaine Dokploy).

1. **Create Project** → `VR BOOST Facturation`.
2. Dans le projet : **Create Service → Database → PostgreSQL**
   - Name : `facturation-db`, Database : `vrboost`, User : `vrboost`, mot de passe : généré.
   - Version : `postgres:17`.
   - **Deploy**, puis copier l'**Internal Connection URL** (`postgresql://vrboost:…@…:5432/vrboost`).
   - Onglet **Backups** : activer une sauvegarde quotidienne (destination S3 si disponible).

## 4. Dokploy — application

1. **Create Service → Application** → Name : `facturation-app`.
2. **Provider : GitHub** → connecter le compte `Moufakkir` (GitHub App Dokploy) si ce n'est pas déjà fait,
   puis Repository `vrboost-facturation`, Branch `main`.
3. **Build Type : Dockerfile** (chemin `Dockerfile`, contexte `.`).
4. **Environment** — coller (en remplaçant les valeurs) :

```
DATABASE_URL=<Internal Connection URL de facturation-db>
APP_ENV=production
APP_URL=https://facturation.vrboostagency.com
SESSION_TTL_HOURS=12
PRIVATE_ASSETS_DIR=/secrets/vrboost
PDF_FONT=lufga
HUBSPOT_ACCESS_TOKEN=<clé de service pat-eu1-…>
HUBSPOT_DEAL_STATUS_PROPERTY=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=meryem.lasseri@vrboostagency.com
SMTP_PASSWORD=<mot de passe d'application Google>
MAIL_FROM=VR BOOST AGENCY <meryem.lasseri@vrboostagency.com>
```

5. **Advanced → Volumes / Mounts** → **Bind Mount** :
   Host path `/opt/vrboost-facturation/private` → Mount path `/secrets/vrboost`.
6. **Domains** → Add : host `facturation.vrboostagency.com`, **Container Port `3100`**, HTTPS activé,
   certificat **Let's Encrypt**.
7. **Deploy**. Les migrations de base sont appliquées automatiquement au démarrage.

## 5. Initialisation (terminal Dokploy de `facturation-app`, onglet *Terminal* / *Docker Terminal*)

```bash
npm run db:seed
```

Crée les paramètres société, le catalogue indicatif et les séquences 2026 (dernier numéro 454, **non confirmées**).

```bash
npm run user:create -- contact@vrboostagency.com "CEO — VR BOOST" CEO
```

```bash
npm run user:create -- meryem.lasseri@vrboostagency.com "Meryem Lasseri" SALES
```

(mot de passe saisi masqué, deux fois).

## 6. Mise en service (dans l'application, compte CEO)

1. **Paramètres › Numérotation** : confirmer DEVIS et FACTURES (prochains : `00455/2026`, `FAC-00455/26`).
2. **Paramètres › Validation comptable** : enregistrer le nom du comptable (l'émission est bloquée sans elle en
   `APP_ENV=production`).
3. Vérifier **Paramètres** : cachet & signature « Présents », police « Lufga », HubSpot « Connecté ».

## Mises à jour

Chaque `git push` sur `main` peut redéployer automatiquement (Dokploy → Application → *Auto Deploy*),
ou manuellement via **Deploy**. Les données (PostgreSQL) et les fichiers privés ne sont pas affectés.
