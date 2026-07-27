-- Phase 2A: lecture limitee au profil courant et ecritures directes fermees.

alter table public.profiles enable row level security;

revoke all on public.profiles from public;
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;

grant select on public.profiles to authenticated;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

-- Aucune policy insert, update ou delete n'est creee volontairement.
-- Les ecritures passent par les fonctions SECURITY DEFINER controlees.
