# VR BOOST — Devis & Factures : image de production (Node LTS, utilisateur non-root)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# URL factice : prisma.config.ts l'exige pour générer le client ; aucune connexion n'a lieu au build
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build NEXT_TELEMETRY_DISABLED=1
RUN rm -rf private/* .env* && npx prisma generate && npx next build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production APP_ENV=production PRIVATE_ASSETS_DIR=/secrets/vrboost NEXT_TELEMETRY_DISABLED=1
RUN useradd --system --uid 1001 app
COPY --from=build --chown=app /app/package.json /app/package-lock.json /app/prisma.config.ts ./
COPY --from=build --chown=app /app/node_modules ./node_modules
COPY --from=build --chown=app /app/.next ./.next
COPY --from=build --chown=app /app/public ./public
COPY --from=build --chown=app /app/assets ./assets
COPY --from=build --chown=app /app/prisma ./prisma
COPY --from=build --chown=app /app/src/generated ./src/generated
# Scripts d'administration (comptes, mots de passe) exécutables depuis le terminal Dokploy
COPY --from=build --chown=app /app/scripts ./scripts
COPY --from=build --chown=app /app/tsconfig.json ./tsconfig.json
USER app
EXPOSE 3100
# Migrations appliquées au démarrage (idempotent), puis serveur
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p 3100"]
