import { describe, expect, it } from "vitest";
import { assertNotSelfApproval, can, type Actor, type Permission } from "@/lib/permissions";

const meryem: Actor = { id: "m", role: "SALES" };
const ceo: Actor = { id: "c", role: "CEO" };

describe("Permissions", () => {
  it("Meryem : brouillons, prix libres, soumission", () => {
    for (const p of ["quote.create", "quote.editDraft", "quote.submit", "invoice.create", "invoice.submit", "client.edit"] as Permission[]) {
      expect(can(meryem, p)).toBe(true);
    }
  });
  it("Meryem ne peut ni approuver, ni signer, ni toucher aux séquences ou paramètres", () => {
    for (const p of ["quote.approve", "invoice.approveAndIssue", "signature.apply", "sequence.edit", "settings.view", "settings.edit", "terms.edit", "payment.record", "invoice.creditNote", "audit.view"] as Permission[]) {
      expect(can(meryem, p)).toBe(false);
    }
  });
  it("le CEO a tous les droits", () => {
    expect(can(ceo, "quote.approve") && can(ceo, "sequence.edit") && can(ceo, "signature.apply")).toBe(true);
  });
  it("auto-approbation interdite hors CEO", () => {
    expect(() => assertNotSelfApproval(meryem, "m")).toThrow();
    expect(() => assertNotSelfApproval(ceo, "c")).not.toThrow();
  });
});
