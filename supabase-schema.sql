-- ============================================================
-- Talent Engine : schéma de base de données (Supabase / PostgreSQL)
-- À exécuter UNE SEULE FOIS : Supabase > SQL Editor > New query > coller > Run
-- ============================================================

-- 1) Profils utilisateurs (liés aux comptes Supabase Auth)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'en_attente'
    check (role in ('admin','recruteur','lecteur','en_attente')),
  created_at timestamptz not null default now()
);

-- 2) Candidatures
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  job text not null,
  education text,
  education_label text,
  experience text,
  experience_label text,
  skills text not null default '',
  motivation text,
  education_score  int not null default 0 check (education_score  between 0 and 20),
  skills_score     int not null default 0 check (skills_score     between 0 and 30),
  experience_score int not null default 0 check (experience_score between 0 and 20),
  fit_score        int not null default 0 check (fit_score        between 0 and 20),
  motivation_score int not null default 0 check (motivation_score between 0 and 10),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists candidates_created_at_idx on public.candidates (created_at desc);

-- 3) Fonction utilitaire : rôle de l'utilisateur connecté
create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- 4) Création automatique du profil à l'inscription
--    Le PREMIER compte créé devient administrateur, les suivants sont "en_attente".
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
    case when not exists (select 1 from public.profiles) then 'admin' else 'en_attente' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) Sécurité au niveau des lignes (RLS)
alter table public.profiles   enable row level security;
alter table public.candidates enable row level security;

grant select, insert, update, delete on public.profiles   to authenticated;
grant select, insert, update, delete on public.candidates to authenticated;

-- Profils : chacun voit le sien ; les comptes approuvés voient les noms de l'équipe ; seul l'admin modifie les rôles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (auth.uid() = id or public.current_role_name() in ('admin','recruteur','lecteur'));

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update to authenticated
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

-- Candidatures : lecture pour les comptes approuvés
drop policy if exists "candidates_select" on public.candidates;
create policy "candidates_select" on public.candidates for select to authenticated
  using (public.current_role_name() in ('admin','recruteur','lecteur'));

-- Ajout : admin et recruteur
drop policy if exists "candidates_insert" on public.candidates;
create policy "candidates_insert" on public.candidates for insert to authenticated
  with check (public.current_role_name() in ('admin','recruteur') and created_by = auth.uid());

-- Suppression : admin, ou recruteur pour ses propres candidatures
drop policy if exists "candidates_delete" on public.candidates;
create policy "candidates_delete" on public.candidates for delete to authenticated
  using (
    public.current_role_name() = 'admin'
    or (public.current_role_name() = 'recruteur' and created_by = auth.uid())
  );
