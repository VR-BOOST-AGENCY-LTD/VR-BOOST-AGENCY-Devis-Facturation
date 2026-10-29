// Règle de comparaison du catalogue (partagée client / serveur) : deux prestations sont identiques
// si leurs désignations le sont, sans tenir compte de la casse, des accents ni des espaces.
export function catalogKey(designation: string): string {
  return designation
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
