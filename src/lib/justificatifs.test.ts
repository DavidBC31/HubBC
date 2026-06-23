import { describe, it, expect } from "vitest";
import {
  PLAFONDS,
  baseExport,
  validateMontant,
  buildJustificatifsCSV,
  type Submission,
} from "./justificatifs";

describe("téléphone — plafond 60 € et export à 50 %", () => {
  it("plafonne le téléphone à 60 €", () => {
    expect(PLAFONDS.TELEPHONE).toBe(60);
    expect(validateMontant("TELEPHONE", 60)).toBeNull();
    expect(validateMontant("TELEPHONE", 60.01)).toMatch(/plafonné à 60/);
  });

  it("n'exporte que 50 % du montant déclaré pour le téléphone", () => {
    expect(baseExport("TELEPHONE", 60)).toBe(30);
    expect(baseExport("TELEPHONE", 26.99)).toBeCloseTo(13.495, 3);
  });

  it("laisse les autres types à 100 %", () => {
    expect(baseExport("PASS_NAVIGO", 17.025)).toBe(17.025);
    expect(baseExport("TRANSPORT_COMMUN", 42)).toBe(42);
  });

  it("le CSV porte la base à 50 % (rubrique Ft50)", () => {
    const sub: Submission = {
      matricule: "B7038", nom: "BRETON", prenom: "Hugo", email: "h@bleucitron.net",
      type: "TELEPHONE", montant: 60, mois: "2026-06",
    };
    const csv = buildJustificatifsCSV([sub]);
    const ligne = csv.trim().split("\r\n")[1].split(";");
    // matricule;nom;prenom;mois;code_rubrique;libelle;quantite;base
    expect(ligne[4]).toBe("Ft50");
    expect(ligne[6]).toBe("1");
    expect(ligne[7]).toBe("30.00"); // 50 % de 60
  });
});
