/** Erreur métier affichable à l'utilisateur. */
export class AppError extends Error {
  constructor(message: string, public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "UNAUTHENTICATED" = "INVALID") {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "Action non autorisée pour votre rôle") => new AppError(msg, "FORBIDDEN");
export const notFound = (msg = "Document introuvable") => new AppError(msg, "NOT_FOUND");
export const invalid = (msg: string) => new AppError(msg, "INVALID");
export const conflict = (msg: string) => new AppError(msg, "CONFLICT");
