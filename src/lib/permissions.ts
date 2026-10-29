// Matrice de permissions. Toute action serveur passe par assertCan().
import type { Role } from "@/generated/prisma/enums";
import { forbidden } from "./errors";

export type Actor = { id: string; role: Role; name?: string };

export type Permission =
  | "quote.create"
  | "quote.editDraft"
  | "quote.submit"
  | "quote.approve"
  | "quote.markSent"
  | "quote.markOutcome"
  | "quote.revise"
  | "quote.cancel"
  | "quote.delete"
  | "invoice.create"
  | "invoice.editDraft"
  | "invoice.submit"
  | "invoice.approveAndIssue"
  | "invoice.creditNote"
  | "invoice.delete"
  | "payment.record"
  | "payment.cancel"
  | "signature.apply"
  | "terms.edit"
  | "settings.view"
  | "settings.edit"
  | "sequence.edit"
  | "audit.view"
  | "catalog.edit"
  | "client.edit"
  | "hubspot.write"
  | "document.send"
  | "users.manage";

const SALES: Permission[] = [
  "quote.create",
  "quote.editDraft",
  "quote.submit",
  "quote.markSent",
  "quote.markOutcome",
  "quote.revise",
  "invoice.create",
  "invoice.editDraft",
  "invoice.submit",
  "client.edit",
  "catalog.edit",
  "hubspot.write",
  "document.send",
];

const MATRIX: Record<Role, Set<Permission>> = {
  CEO: new Set<Permission>([
    ...SALES,
    "quote.approve",
    "quote.cancel",
    "quote.delete",
    "invoice.approveAndIssue",
    "invoice.creditNote",
    "invoice.delete",
    "payment.record",
    "payment.cancel",
    "signature.apply",
    "terms.edit",
    "settings.view",
    "settings.edit",
    "sequence.edit",
    "audit.view",
    "users.manage",
  ]),
  SALES: new Set<Permission>(SALES),
};

export function can(actor: Actor, perm: Permission): boolean {
  return MATRIX[actor.role]?.has(perm) ?? false;
}

export function assertCan(actor: Actor, perm: Permission): void {
  if (!can(actor, perm)) throw forbidden();
}

/** Séparation des tâches : personne ne valide un document dont il est l'auteur, sauf le CEO. */
export function assertNotSelfApproval(actor: Actor, authorId: string): void {
  if (actor.role !== "CEO" && actor.id === authorId) {
    throw forbidden("Vous ne pouvez pas approuver votre propre document");
  }
}
