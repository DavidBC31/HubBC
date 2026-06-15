#!/usr/bin/env python3
"""
Nettoyeur d'absences Lucca -> format d'import sPAIEctacle (GHS).

PROBLÈME RÉSOLU
---------------
sPAIEctacle exige UNE seule ligne par collaborateur et par type d'absence.
L'export Lucca génère une ligne par période (ex: une pour le 04/05, une autre
pour le 05/05). Ce script fusionne ces lignes : il somme les quantités (jours)
et concatène les dates bout à bout selon la règle stricte "Début Fin, Début Fin".

FORMAT D'ENTRÉE (TSV, tel qu'exporté par Lucca)
-----------------------------------------------
    matricule | (nom) | (prenom) | CPr | CPr/L | AbMa | AbMa/L | ... | JRS | JRS/L
Pour chaque type d'absence, deux colonnes :
    - CODE      -> nombre de jours (ex: "1.5", "0.5")
    - CODE/L    -> dates de la période (ex: "04/05 05/05")
Les colonnes portent déjà les codes sPAIEctacle (le mapping Lucca->Spaiectacle
est appliqué à la configuration de l'export Lucca). Voir MAPPING ci-dessous pour
la correspondance officielle, utile si un export en codes bruts apparaît un jour.

FORMAT DE SORTIE
----------------
Même structure de colonnes, mais une seule ligne par matricule :
    - quantités sommées
    - dates concaténées avec ", " -> "04/05 05/05, 05/06 06/06"
Prêt à importer dans sPAIEctacle en un clic.

Usage:
    python3 scripts/absences_clean.py <export_lucca.tsv> [sortie.tsv]
    # défaut sortie : data/absences_spaiectacle.tsv  (+ data/absences.json)
"""
import sys
import os
import csv
import json
import datetime

# Correspondance officielle (Google Sheet « Correspondance Lucca x Spaiectacle »).
# Source de vérité — DIVERGE du mapping inline du CdC SI-PRO16.2 (cf. README/notes).
# Sert au cas où un export Lucca arriverait avec les libellés bruts plutôt que les
# colonnes déjà mappées. "" / None => ne pas exporter.
MAPPING_LUCCA_SPAIECTACLE = {
    "Accident de trajet": None,
    "Accident de travail": None,
    "Invalidité 1ère catégorie": None,
    "Invalidité 2ème catégorie": None,
    "Maladie avec maintien": "AbMaP",
    "Maladie professionnelle": "AbMaT",
    "Maladie sans maintien": "AbMa",
    "Maternité": "AbMaT",
    "Paternité": "AbMaT",
    "Absence autorisée non payée": "AbJo",
    "Absence autorisée payée": None,
    "Absence injustifiée": "AbJo",
    "Congé parental": None,
    "Congé sans solde": "AbJo",
    "Ecole": None,
    "Mi-temps thérapeutique": None,
    "Récupération": None,
    "Solde de tout compte": None,
    "Congés Payés": "CPr",
    "RTT": "RTT",
    "JRS": "JRS",
}

# Colonnes d'identité (ne sont pas des types d'absence).
ID_COLS = ("matricule", "(nom)", "(prenom)", "nom", "prenom")

# Décision métier (David, 2026-06-15) : en V1 on ne distingue PAS les sous-types
# de maladie/accident (carence, forfait, maladie pro, maternité…). Tout est
# regroupé dans le code le plus global « AbMa », Azaïs corrige à la main si besoin.
# Réversible : mettre COLLAPSE_MALADIE = False pour conserver les colonnes d'origine
# quand les règles fines (CdC §7) seront fournies.
COLLAPSE_MALADIE = True
MALADIE_FAMILY = ("AbMa", "AbMaP", "AbMaT")
MALADIE_TARGET = "AbMa"


def remap_code(code: str) -> str:
    if COLLAPSE_MALADIE and code in MALADIE_FAMILY:
        return MALADIE_TARGET
    return code


def is_label_col(name: str) -> bool:
    return name.endswith("/L")


def parse_qty(v: str) -> float:
    """'1.5' / '0,5' / '' -> float. Vide ou non numérique -> 0."""
    s = (v or "").strip().replace(",", ".")
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def fmt_qty(x: float) -> str:
    """Réécrit proprement : 2.0 -> '2', 1.5 -> '1.5'."""
    if x == 0:
        return ""
    return str(int(x)) if x == int(x) else str(x)


def merge(rows, header):
    """Fusionne les lignes par matricule. Retourne (lignes_fusionnées, stats)."""
    # Indices des colonnes de type : code -> (idx_qty, idx_dates)
    type_cols = {}
    for i, h in enumerate(header):
        if h in ID_COLS or is_label_col(h):
            continue
        code = h
        lbl_idx = header.index(code + "/L") if (code + "/L") in header else None
        type_cols[code] = (i, lbl_idx)

    groups = {}          # matricule -> agrégat
    order = []           # préserve l'ordre d'apparition
    for r in rows:
        mat = (r[0] or "").strip()
        if not mat:
            continue
        if mat not in groups:
            groups[mat] = {
                "matricule": mat,
                "nom": (r[1] if len(r) > 1 else "").strip(),
                "prenom": (r[2] if len(r) > 2 else "").strip(),
                # buckets indexés par code APRÈS remap (maladie regroupée)
                "types": {remap_code(c): {"qty": 0.0, "dates": []} for c in type_cols},
                "rows_fusionnees": 0,
            }
            order.append(mat)
        g = groups[mat]
        g["rows_fusionnees"] += 1
        # Complète nom/prénom si une ligne ultérieure les renseigne mieux
        if not g["nom"] and len(r) > 1:
            g["nom"] = (r[1] or "").strip()
        if not g["prenom"] and len(r) > 2:
            g["prenom"] = (r[2] or "").strip()
        for code, (qi, li) in type_cols.items():
            tgt = remap_code(code)
            q = parse_qty(r[qi] if qi < len(r) else "")
            d = (r[li].strip() if (li is not None and li < len(r) and r[li]) else "")
            if q:
                g["types"][tgt]["qty"] += q
            if d:
                g["types"][tgt]["dates"].append(d)

    # Reconstruit les lignes au format de sortie identique à l'entrée
    out = [header]
    for mat in order:
        g = groups[mat]
        line = [g["matricule"], g["nom"], g["prenom"]]
        # On régénère selon l'ordre exact du header
        for h in header[3:]:
            code = h[:-2] if is_label_col(h) else h
            tgt = remap_code(code)
            # Colonne d'une famille regroupée mais qui n'est pas la cible -> vidée
            if tgt != code:
                line.append("")
                continue
            if is_label_col(h):
                line.append(", ".join(g["types"][tgt]["dates"]))
            else:
                line.append(fmt_qty(g["types"][tgt]["qty"]))
        out.append(line)

    stats = {
        "lignes_entree": len(rows),
        "collaborateurs": len(order),
        "fusions": sum(1 for m in order if groups[m]["rows_fusionnees"] > 1),
    }
    return out, groups, order, stats, type_cols


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    here = os.path.dirname(__file__)
    out_tsv = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        here, "..", "data", "absences_spaiectacle.tsv")
    out_json = os.path.join(here, "..", "data", "absences.json")

    with open(src, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f, delimiter="\t"))
    header, body = rows[0], rows[1:]

    out, groups, order, stats, type_cols = merge(body, header)

    os.makedirs(os.path.dirname(out_tsv), exist_ok=True)
    with open(out_tsv, "w", encoding="utf-8", newline="") as f:
        csv.writer(f, delimiter="\t").writerows(out)

    # JSON normalisé pour un futur dashboard Next.js
    payload = {
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "source_file": os.path.basename(src),
        "stats": stats,
        "collaborateurs": [
            {
                "matricule": groups[m]["matricule"],
                "nom": groups[m]["nom"],
                "prenom": groups[m]["prenom"],
                "absences": {
                    c: {
                        "jours": round(v["qty"], 2),
                        "dates": ", ".join(v["dates"]),
                    }
                    for c, v in groups[m]["types"].items()
                    if v["qty"] or v["dates"]
                },
            }
            for m in order
        ],
    }
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"OK -> {os.path.relpath(out_tsv)}")
    print(f"     {os.path.relpath(out_json)}")
    print(f"     {stats['lignes_entree']} lignes -> {stats['collaborateurs']} "
          f"collaborateurs ({stats['fusions']} fusionnés)")


if __name__ == "__main__":
    main()
