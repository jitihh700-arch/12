# Sauvegarde et restauration

## Principes

- Sauvegarder PostgreSQL avant toute migration.
- Les migrations validees sont forward-only: ne jamais reecrire une migration deja appliquee.
- Tester une restauration sur staging avant de declarer une sauvegarde fiable.

## Donnees a proteger

- profils anonymes;
- commentaires et suppressions logiques;
- sessions de quiz;
- scores et statistiques;
- parties multijoueurs;
- reactions et traces techniques utiles.

## Maintenance

Planifier:

- rotation des cles Supabase;
- verification RLS apres migration;
- nettoyage des parties expirees;
- mise a jour des dependances apres audit;
- test regulier de restauration.
