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

# Codes numériques internes Lucca -> abréviation sPAIEctacle (fourni par le métier,
# 2026-06). Selon la config d'export, les colonnes peuvent porter ces codes plutôt
# que l'abréviation. Plusieurs codes peuvent viser la même abréviation (millésimes
# CP/RTT, sous-types maladie) : ils sont fusionnés dans la même colonne de sortie.
LUCCA_CODE_MAP = {
    "1124": "CPr", "1125": "CPr", "1126": "CPr",      # Congés payés (par millésime)
    "1224": "RTT", "1225": "RTT", "1226": "RTT",      # RTT (par millésime)
    "1325": "JRS", "1326": "JRS",                      # JRS (par millésime)
    "5": "AbMa",   # Maladie avec maintien
    "7": "AbMa",   # Maladie sans maintien
    "6": "AbMaP",  # Maladie professionnelle
    "1": "AbMaT",  # Accident de trajet
    "2": "AbMaT",  # Accident de travail
    "18": "AbJo",  # Absence à justifier
    "21": "AbJo",  # Absence injustifiée
}

# Colonnes de sortie sPAIEctacle, dans l'ordre attendu à l'import (= en-tête observé
# des exports Lucca). Chaque type a une colonne quantité CODE et une colonne CODE/L.
SPCT_TYPES = ("CPr", "AbMa", "AbMaP", "AbJo", "AbMaT", "RTT", "JRS")


def to_spaiectacle(raw: str) -> str:
    """En-tête de colonne -> abréviation sPAIEctacle (code Lucca mappé, sinon inchangé)."""
    r = (raw or "").strip()
    return LUCCA_CODE_MAP.get(r, r)


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
    # Colonnes de type en entrée -> abréviation sPAIEctacle (+ index qty et /L).
    # Gère les en-têtes en abréviations (CPr…) comme en codes Lucca (1124, 5…).
    input_cols = []  # liste de (qi, li|None, abbr)
    for i, h in enumerate(header):
        if h in ID_COLS or is_label_col(h):
            continue
        abbr = to_spaiectacle(h)
        if abbr not in SPCT_TYPES:
            continue  # type hors périmètre paie -> ignoré
        li = header.index(h + "/L") if (h + "/L") in header else None
        input_cols.append((i, li, abbr))

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
                # buckets indexés par abréviation APRÈS remap (maladie regroupée)
                "types": {remap_code(t): {"qty": 0.0, "dates": []} for t in SPCT_TYPES},
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
        for qi, li, abbr in input_cols:
            q = parse_qty(r[qi] if qi < len(r) else "")
            # Le libellé/dates n'est retenu que s'il y a réellement une quantité :
            # au format Lucca verbeux une cellule « vide » est un gabarit non vide
            # (« Prise(s) de  Maladie entre le  et le ») à ne pas concaténer.
            if not q:
                continue
            tgt = remap_code(abbr)
            g["types"][tgt]["qty"] += q
            d = (r[li].strip() if (li is not None and li < len(r) and r[li]) else "")
            if d:
                g["types"][tgt]["dates"].append(d)

    # Sortie canonique : colonnes sPAIEctacle dans l'ordre attendu.
    out_header = ["matricule", "(nom)", "(prenom)"]
    for t in SPCT_TYPES:
        out_header += [t, t + "/L"]
    out = [out_header]
    for mat in order:
        g = groups[mat]
        line = [g["matricule"], g["nom"], g["prenom"]]
        for t in SPCT_TYPES:
            tgt = remap_code(t)
            if tgt != t:  # type d'une famille regroupée, non cible -> vidé
                line += ["", ""]
                continue
            line.append(fmt_qty(g["types"][tgt]["qty"]))
            line.append(", ".join(g["types"][tgt]["dates"]))
        out.append(line)

    stats = {
        "lignes_entree": len(rows),
        "collaborateurs": len(order),
        "fusions": sum(1 for m in order if groups[m]["rows_fusionnees"] > 1),
    }
    return out, groups, order, stats, input_cols


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
