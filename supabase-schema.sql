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

-- ============================================================
-- 6) Candidatures reçues via la page publique postuler.html
--    Les visiteurs peuvent ÉCRIRE (envoyer une candidature) mais jamais LIRE.
--    Seuls admin et recruteur les consultent, les évaluent, les valident ou les refusent.
-- ============================================================
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 200 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone text check (phone is null or char_length(phone) <= 40),
  job text not null check (char_length(job) between 2 and 120),
  education text check (education is null or education in ('10','14','17','20')),
  experience text check (experience is null or experience in ('0','5','10','15','20')),
  skills text not null default '' check (char_length(skills) <= 1000),
  motivation text check (motivation is null or char_length(motivation) <= 1500),
  consent boolean not null default false check (consent),
  status text not null default 'nouvelle' check (status in ('nouvelle','refusee')),
  created_at timestamptz not null default now()
);
create index if not exists applications_created_at_idx on public.applications (created_at desc);

alter table public.applications enable row level security;

grant insert on public.applications to anon, authenticated;
grant select, update, delete on public.applications to authenticated;

drop policy if exists "applications_insert_public" on public.applications;
create policy "applications_insert_public" on public.applications for insert to anon, authenticated
  with check (status = 'nouvelle');

drop policy if exists "applications_select_staff" on public.applications;
create policy "applications_select_staff" on public.applications for select to authenticated
  using (public.current_role_name() in ('admin','recruteur'));

drop policy if exists "applications_update_staff" on public.applications;
create policy "applications_update_staff" on public.applications for update to authenticated
  using (public.current_role_name() in ('admin','recruteur'))
  with check (public.current_role_name() in ('admin','recruteur'));

drop policy if exists "applications_delete_staff" on public.applications;
create policy "applications_delete_staff" on public.applications for delete to authenticated
  using (public.current_role_name() in ('admin','recruteur'));

-- ============================================================
-- 7) CV (fichiers PDF / Word) : stockage privé
--    Les visiteurs peuvent ENVOYER un CV (dossier incoming/) mais jamais le lire.
--    Admin, recruteur et lecteur peuvent l'ouvrir ; admin et recruteur peuvent le supprimer.
-- ============================================================
alter table public.applications add column if not exists cv_path text
  check (cv_path is null or (char_length(cv_path) <= 200 and cv_path like 'incoming/%'));
alter table public.applications add column if not exists cv_name text
  check (cv_name is null or char_length(cv_name) <= 150);
alter table public.candidates add column if not exists cv_path text;
alter table public.candidates add column if not exists cv_name text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', false, 5242880, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cvs_upload_public" on storage.objects;
create policy "cvs_upload_public" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'cvs' and name like 'incoming/%');

drop policy if exists "cvs_read_staff" on storage.objects;
create policy "cvs_read_staff" on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and public.current_role_name() in ('admin','recruteur','lecteur'));

drop policy if exists "cvs_delete_staff" on storage.objects;
create policy "cvs_delete_staff" on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and public.current_role_name() in ('admin','recruteur'));

-- ============================================================
-- 8) Postes et critères de notation automatique
--    Le public voit seulement l'intitulé des postes ouverts (jamais les critères).
--    Admin et recruteur gèrent les postes ; le lecteur peut les consulter.
-- ============================================================
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  description text check (description is null or char_length(description) <= 1500),
  required_skills text not null default '' check (char_length(required_skills) <= 1000),
  bonus_skills text not null default '' check (char_length(bonus_skills) <= 1000),
  min_education text check (min_education is null or min_education in ('10','14','17','20')),
  min_experience text check (min_experience is null or min_experience in ('0','5','10','15','20')),
  is_open boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.jobs enable row level security;

-- Le public ne peut lire que 4 colonnes (pas les critères de notation)
revoke all on public.jobs from anon;
grant select (id, title, description, is_open) on public.jobs to anon;
grant select, insert, update, delete on public.jobs to authenticated;

drop policy if exists "jobs_select_public" on public.jobs;
create policy "jobs_select_public" on public.jobs for select to anon using (is_open);

drop policy if exists "jobs_select_staff" on public.jobs;
create policy "jobs_select_staff" on public.jobs for select to authenticated
  using (public.current_role_name() in ('admin','recruteur','lecteur'));

drop policy if exists "jobs_insert_staff" on public.jobs;
create policy "jobs_insert_staff" on public.jobs for insert to authenticated
  with check (public.current_role_name() in ('admin','recruteur'));

drop policy if exists "jobs_update_staff" on public.jobs;
create policy "jobs_update_staff" on public.jobs for update to authenticated
  using (public.current_role_name() in ('admin','recruteur'))
  with check (public.current_role_name() in ('admin','recruteur'));

drop policy if exists "jobs_delete_staff" on public.jobs;
create policy "jobs_delete_staff" on public.jobs for delete to authenticated
  using (public.current_role_name() in ('admin','recruteur'));

-- Lien candidature -> poste
alter table public.applications add column if not exists job_id uuid
  references public.jobs(id) on delete set null;
