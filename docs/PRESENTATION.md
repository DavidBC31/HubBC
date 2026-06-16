# Présentation du projet — HubBC (outils paie Bleu Citron)

Ce document explique, **sans entrer dans la technique**, à quoi sert le projet,
ce qui a été mis en place, et comment ça s'utilise au quotidien. Pour le mode
d'emploi détaillé de chaque outil, voir [GUIDE-UTILISATEUR.md](./GUIDE-UTILISATEUR.md).

---

## Pourquoi ce projet

Avant chaque clôture de paie, le Pôle Social passe du temps sur des tâches
répétitives : récupérer les justificatifs de frais des collaborateurs, remettre
en forme des exports, relancer les salles pour les chiffres de billetterie.

L'objectif du projet est simple : **automatiser ces tâches** pour faire gagner du
temps, réduire les oublis et les erreurs de recopie, et rendre les démarches plus
faciles pour tout le monde.

---

## Ce que le projet permet de faire

Le projet regroupe **trois outils** accessibles depuis un navigateur :

### 1. Dépôt de justificatifs — pour tous les collaborateurs
Chaque collaborateur envoie ses justificatifs de frais (forfait téléphonique,
mobilité douce, transport, Navigo) en quelques secondes via un formulaire :
il choisit le type, saisit le montant et le mois, joint sa facture, et valide.

Côté Pôle Social, tout arrive **déjà trié** : un email standardisé est généré
automatiquement, les pièces sont rangées dans le Drive du mois, et un fichier
prêt à importer dans le logiciel de paie (sPAIEctacle) est préparé.

### 2. Nettoyeur d'absences — pour le Pôle Social
On dépose l'export d'absences issu de Lucca, et l'outil le transforme
automatiquement au format attendu par sPAIEctacle (une ligne par personne et par
type d'absence, dates regroupées). Plus besoin de manipulations Excel.

### 3. Relances pointages — outil interne
Prépare automatiquement les emails de relance aux salles pour récupérer les
chiffres de billetterie. Les emails sont créés en **brouillons** : l'équipe les
relit et les envoie à la main, rien n'est envoyé sans validation humaine.

---

## Ce qui a été mis en place

- **Une application unique** regroupant les trois outils, accessible par un simple
  lien web.
- **Connexion sécurisée** : on se connecte avec son **compte Google Bleu Citron**.
  Seuls les comptes du domaine `bleucitron.net` peuvent accéder aux outils, et le
  nom de la personne est reconnu automatiquement (rien à ressaisir).
- **Archivage automatique** des justificatifs dans Google Drive, classés par mois,
  avec préparation des fichiers pour la paie.
- **Validation humaine conservée** là où elle compte : les relances et les envois
  sensibles restent relus par l'équipe avant tout envoi.
- **Hébergement maîtrisé en interne** : l'application tourne sur une machine de
  Bleu Citron (un Mac Mini dédié), accessible via une adresse web sécurisée
  (HTTPS). Les données restent sous notre contrôle.
- **Documentation complète** pour installer, configurer et maintenir l'outil
  (mise en route Google, déploiement, guide utilisateur).
- **Traitements planifiés** : certaines tâches (comme la préparation des relances)
  peuvent s'exécuter automatiquement selon un calendrier défini.

---

## Confidentialité et sécurité

- L'accès est **réservé aux collaborateurs Bleu Citron** (compte Google du domaine).
- Le nettoyeur d'absences traite le fichier **directement dans le navigateur** :
  les données RH ne sont pas envoyées sur un serveur.
- Les informations sensibles (clés d'accès, mots de passe) ne sont jamais
  partagées dans le code ; elles restent sur la machine d'hébergement.

---

## Ce qu'il reste à finaliser

- **Mise en ligne définitive** et diffusion du lien `/justificatifs` aux
  collaborateurs.
- **Deux codes de rubrique paie** (Mobilité douce et Transport en commun) à
  confirmer pour finaliser l'export sPAIEctacle.
- **Prochaine évolution** : le **suivi automatique des réponses aux relances**,
  pour boucler le cycle sans intervention manuelle.

---

*Pour les détails d'utilisation pas à pas, voir
[GUIDE-UTILISATEUR.md](./GUIDE-UTILISATEUR.md). Pour l'installation et la
configuration technique, voir [DEPLOY-MACMINI.md](./DEPLOY-MACMINI.md) et
[SETUP-GOOGLE.md](./SETUP-GOOGLE.md).*
