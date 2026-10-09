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
