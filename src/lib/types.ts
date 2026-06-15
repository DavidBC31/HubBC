export type Action = "RELANCE" | "SKIP" | "MENSUEL";
export type Jour =
  | "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI" | "SAMEDI" | "DIMANCHE";

export interface Entry {
  id: number;
  source: "RELANCES" | "AUTONOMES" | "BILLETS TIERS";
  artiste: string;
  ville: string;
  salle: string;
  date_concert: string | null; // ISO yyyy-mm-dd
  mail: string;
  commentaire: string;
  relance_raw: string;
  dernier_recu: string | null;
  identifiant: string;
  mdp: string;
  action: Action;
  cadence: Jour[];
  raison_skip: string;
  billet_tiers: boolean;
  spectacles: string;
}

export interface Dataset {
  generated_at: string;
  source_file: string;
  count: number;
  entries: Entry[];
}

/** Un mail individuel à destination d'un contact, regroupant ses pointages dus. */
export interface DraftMail {
  to: string;
  subject: string;
  body: string;
  items: Entry[];
  billetTiers: boolean;
}
