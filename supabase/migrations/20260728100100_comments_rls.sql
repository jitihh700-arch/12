-- Phase 3A: RLS commentaires.
-- Les ecritures directes restent fermees; les RPC portent les regles metier.

alter table public.comments enable row level security;

revoke all on public.comments from public;
revoke all on public.comments from anon;
revoke all on public.comments from authenticated;

grant select on public.comments to authenticated;

create policy "comments_select_visible_for_realtime"
on public.comments
for select
to authenticated
using (true);

-- Aucune policy insert, update ou delete n'est creee volontairement.
-- Le SELECT ci-dessus existe pour Supabase Realtime: il permet de recevoir
-- l'UPDATE de soft delete avec deleted_at. La liste applicative publique
-- reste controlee par list_comments, qui exclut les commentaires supprimes.
