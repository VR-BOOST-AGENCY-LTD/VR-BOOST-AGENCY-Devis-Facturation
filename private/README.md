# Dossier privé — NE JAMAIS COMMITER NI SERVIR PUBLIQUEMENT

Ce dossier est ignoré par git (sauf ce README) et n'est jamais exposé par Next.js
(il n'est pas sous `public/`). Il est lu uniquement côté serveur lors de la génération
d'un PDF officiel approuvé par le CEO.

- `signature/cachet.png`    — cachet de la société (PNG transparent)
- `signature/signature.png` — signature du CEO (PNG transparent)
- `fonts/Lufga-*.otf`       — police Lufga (licence commerciale requise, voir README principal)

En production, déposer ces fichiers sur un volume privé et définir `PRIVATE_ASSETS_DIR`.
