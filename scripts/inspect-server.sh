#!/usr/bin/env bash
# Inspection en LECTURE SEULE d'un serveur avant déploiement (aucune modification).
# Usage : ssh UTILISATEUR@SERVEUR 'bash -s' < scripts/inspect-server.sh
echo "== Système"
. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"
echo "Noyau : $(uname -r) | CPU : $(nproc) | $(free -h | awk 'NR==2{print "RAM : "$2" (libre "$7")"}')"
df -h / | awk 'NR==2{print "Disque / : "$2" (libre "$4", utilisé "$5")"}'

echo; echo "== Docker"
docker --version 2>&1 | head -1
docker compose version 2>&1 | head -1

echo; echo "== Conteneurs en cours"
docker ps --format '{{.Names}} | {{.Image}} | {{.Ports}}' 2>&1 | head -20

echo; echo "== Ports occupés (80, 443, 3100, 5432)"
ss -ltnp 2>/dev/null | awk 'NR==1 || /:(80|443|3100|5432) /'

echo; echo "== Proxy web"
for s in nginx caddy traefik apache2; do
  st=$(systemctl is-active "$s" 2>/dev/null); [ "$st" = "active" ] && echo "$s : actif"
done
[ -d /etc/nginx/sites-enabled ] && echo "Sites Nginx : $(ls /etc/nginx/sites-enabled | tr '\n' ' ')"

echo; echo "== Outils installés sur l'hôte"
echo "node : $(node -v 2>/dev/null || echo absent) | psql : $(psql --version 2>/dev/null || echo absent) | git : $(git --version 2>/dev/null || echo absent)"
echo; echo "== Fin de l'inspection (rien n'a été modifié)"
