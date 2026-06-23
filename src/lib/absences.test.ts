import { describe, it, expect } from "vitest";
import { cleanAbsences, detectDelimiter, parseTSV, toTSV } from "./absences";

// Fixture synthétique (aucune donnée réelle). Mêmes colonnes que l'export Lucca :
// pour chaque type, une colonne quantité CODE et une colonne dates CODE/L.
const HEADER = [
  "matricule", "(nom)", "(prenom)",
  "CPr", "CPr/L", "AbMa", "AbMa/L", "AbMaP", "AbMaP/L", "AbMaT", "AbMaT/L", "RTT", "RTT/L",
];
const idx = (name: string) => HEADER.indexOf(name);

/** Construit une ligne TSV en ne renseignant que les cellules fournies. */
function row(matricule: string, nom: string, prenom: string, cells: Record<string, string>): string {
  const r = HEADER.map(() => "");
  r[0] = matricule; r[1] = nom; r[2] = prenom;
  for (const [k, v] of Object.entries(cells)) r[idx(k)] = v;
  return r.join("\t");
}
const tsv = (...lines: string[]) => [HEADER.join("\t"), ...lines].join("\n");

/** Récupère une cellule de la ligne de sortie d'un matricule donné, par nom de colonne. */
function out(res: ReturnType<typeof cleanAbsences>, matricule: string, col: string): string {
  const line = res.rows.find((r) => r[0] === matricule);
  if (!line) throw new Error(`matricule ${matricule} absent du résultat`);
  return line[res.header.indexOf(col)];
}

describe("cleanAbsences — fusion par matricule", () => {
  it("somme les quantités et concatène les dates d'un même type", () => {
    const res = cleanAbsences(
      tsv(
        row("A1", "DUPONT", "Jean", { CPr: "1", "CPr/L": "01/05 01/05" }),
        row("A1", "DUPONT", "Jean", { CPr: "0.5", "CPr/L": "02/05 02/05" }),
      ),
    );
    expect(res.stats.collaborateurs).toBe(1);
    expect(res.stats.fusions).toBe(1);
    expect(out(res, "A1", "CPr")).toBe("1.5");
    expect(out(res, "A1", "CPr/L")).toBe("01/05 01/05, 02/05 02/05");
  });

  it("formate les quantités : entier sans décimale, demi-journée avec", () => {
    const res = cleanAbsences(
      tsv(
        row("A1", "X", "Y", { CPr: "1" }),
        row("A1", "X", "Y", { CPr: "1" }),
        row("B2", "Z", "W", { CPr: "0.5" }),
      ),
    );
    expect(out(res, "A1", "CPr")).toBe("2"); // 2.0 -> "2"
    expect(out(res, "B2", "CPr")).toBe("0.5");
  });

  it("gère les cellules vides matérialisées par une espace (comme l'export Lucca)", () => {
    const r = HEADER.map(() => " "); // toutes les cellules = " "
    r[0] = "A1"; r[1] = "X"; r[2] = "Y"; r[idx("RTT")] = "1"; r[idx("RTT/L")] = "07/05 07/05";
    const res = cleanAbsences([HEADER.join("\t"), r.join("\t")].join("\n"));
    expect(out(res, "A1", "RTT")).toBe("1");
    expect(out(res, "A1", "CPr")).toBe(""); // resté vide, pas "0"
  });
});

describe("cleanAbsences — regroupement maladie", () => {
  it("regroupe AbMa/AbMaP/AbMaT dans AbMa et vide les colonnes d'origine (collapse ON)", () => {
    const res = cleanAbsences(
      tsv(
        row("A1", "X", "Y", { AbMa: "1", "AbMa/L": "06/05 06/05", AbMaP: "1", "AbMaP/L": "05/05 05/05" }),
        row("A1", "X", "Y", { AbMaT: "2", "AbMaT/L": "03/05 04/05" }),
      ),
      true,
    );
    expect(out(res, "A1", "AbMa")).toBe("4"); // 1 + 1 + 2
    expect(out(res, "A1", "AbMaP")).toBe("");
    expect(out(res, "A1", "AbMaT")).toBe("");
  });

  it("conserve le détail quand collapse OFF", () => {
    const res = cleanAbsences(
      tsv(row("A1", "X", "Y", { AbMaT: "2", "AbMaT/L": "03/05 04/05" })),
      false,
    );
    expect(out(res, "A1", "AbMaT")).toBe("2");
    expect(out(res, "A1", "AbMa")).toBe("");
  });
});

describe("codes numériques Lucca → abréviation sPAIEctacle", () => {
  it("mappe les codes et fusionne les millésimes vers une seule colonne", () => {
    // 1124+1125 -> CPr ; 2 (accident travail) -> AbMaT -> AbMa (collapse) ; 1225 -> RTT
    const H = ["matricule", "(nom)", "(prenom)", "1124", "1124/L", "1125", "1125/L", "2", "2/L", "1225", "1225/L"];
    const r = (m: string, cells: Record<string, string>) => {
      const a = H.map(() => "");
      a[0] = m; a[1] = "NUM"; a[2] = "T";
      for (const [k, v] of Object.entries(cells)) a[H.indexOf(k)] = v;
      return a.join("\t");
    };
    const res = cleanAbsences(
      [
        H.join("\t"),
        r("z1", { "1124": "1", "1124/L": "01/01 01/01" }),
        r("z1", { "1125": "2", "1125/L": "02/01 03/01" }),
        r("z1", { "2": "1", "2/L": "10/01 10/01" }),
        r("z1", { "1225": "0.5", "1225/L": "15/01 15/01" }),
      ].join("\n"),
    );
    expect(out(res, "z1", "CPr")).toBe("3");
    expect(out(res, "z1", "CPr/L")).toBe("01/01 01/01, 02/01 03/01");
    expect(out(res, "z1", "AbMa")).toBe("1"); // accident travail regroupé
    expect(out(res, "z1", "RTT")).toBe("0.5");
    expect(res.warnings).toEqual([]);
  });

  it("sort toujours les colonnes sPAIEctacle canoniques, dans l'ordre", () => {
    const res = cleanAbsences(tsv(row("A1", "X", "Y", { CPr: "1" })));
    expect(res.header).toEqual([
      "matricule", "(nom)", "(prenom)",
      "CPr", "CPr/L", "AbMa", "AbMa/L", "AbMaP", "AbMaP/L",
      "AbJo", "AbJo/L", "AbMaT", "AbMaT/L", "RTT", "RTT/L", "JRS", "JRS/L",
    ]);
  });
});

describe("format Lucca verbeux (cellules vides = gabarit)", () => {
  it("ignore les gabarits vides et ne garde que les libellés des absences réelles", () => {
    const H = ["matricule", "(nom)", "(prenom)", "CPr", "CPr/L", "AbMa", "AbMa/L", "RTT", "RTT/L"];
    const r = (cells: Record<string, string>) => {
      const a = H.map(() => "");
      a[0] = "ros3"; a[1] = "ROUCH"; a[2] = "Shanti";
      // /L par défaut = gabarit "vide" non vide, comme Lucca
      a[H.indexOf("CPr/L")] = "Prise(s) de  CP entre le  et le ";
      a[H.indexOf("AbMa/L")] = "Prise(s) de  Maladie entre le  et le ";
      a[H.indexOf("RTT/L")] = "Prise(s) de  RTT entre le  et le ";
      for (const [k, v] of Object.entries(cells)) a[H.indexOf(k)] = v;
      return a.join("\t");
    };
    const res = cleanAbsences(
      [
        H.join("\t"),
        r({ CPr: "1", "CPr/L": "Prise(s) de 1 CP entre le 15/04 et le 15/04" }),
        r({ RTT: "1", "RTT/L": "Prise(s) de 1 RTT entre le 16/04 et le 16/04" }),
      ].join("\n"),
    );
    expect(out(res, "ros3", "CPr/L")).toBe("Prise(s) de 1 CP entre le 15/04 et le 15/04");
    expect(out(res, "ros3", "RTT/L")).toBe("Prise(s) de 1 RTT entre le 16/04 et le 16/04");
    expect(out(res, "ros3", "AbMa/L")).toBe(""); // aucun gabarit vide concaténé
    expect(out(res, "ros3", "AbMa")).toBe("");
  });
});

describe("parsing & garde-fous", () => {
  it("détecte le séparateur (tab, point-virgule, virgule)", () => {
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter("a,b,c")).toBe(",");
  });

  it("lit un CSV point-virgule comme un TSV", () => {
    const csv = [HEADER.join(";"), ["A1", "X", "Y", "1", "01/05 01/05"].concat(Array(HEADER.length - 5).fill("")).join(";")].join("\n");
    const rows = parseTSV(csv);
    expect(rows[0]).toEqual(HEADER);
    expect(rows[1][0]).toBe("A1");
  });

  it("avertit si la 1re colonne n'est pas « matricule »", () => {
    const bad = ["id\tCPr\tCPr/L", "A1\t1\t01/05 01/05"].join("\n");
    const res = cleanAbsences(bad);
    expect(res.warnings.some((w) => w.includes("matricule"))).toBe(true);
  });

  it("toTSV produit un fichier CRLF terminé par une fin de ligne", () => {
    const t = toTSV(["a", "b"], [["1", "2"]]);
    expect(t).toBe("a\tb\r\n1\t2\r\n");
  });
});
