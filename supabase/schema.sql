-- ============================================================
-- DocuSync — Supabase Database Schema
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- 1. Profiles (extends Supabase Auth users)
create table if not exists profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null,
    email text not null unique,
    role text not null default 'user' check (role in ('user', 'admin')),
    status text not null default 'active' check (status in ('pending', 'active', 'suspended')),
    avatar_letter text generated always as (upper(substr(name, 1, 1))) stored,
    created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
    insert into profiles (id, name, email)
    values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email);
    return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();

-- 2. Repositories
create table if not exists repositories (
    id bigserial primary key,
    name text not null,
    owner_id uuid not null references profiles(id) on delete cascade,
    status text not null default 'Up to date',
    last_synced text not null default 'Just now',
    created_at timestamptz not null default now()
);

-- 3. Repository Members (many-to-many)
create table if not exists repo_members (
    repo_id bigint not null references repositories(id) on delete cascade,
    user_id uuid not null references profiles(id) on delete cascade,
    role text not null default 'Editor' check (role in ('Owner', 'Editor', 'Viewer')),
    joined_at timestamptz not null default now(),
    primary key (repo_id, user_id)
);

-- 4. Files
create table if not exists files (
    id bigserial primary key,
    repo_id bigint not null references repositories(id) on delete cascade,
    name text not null,
    type text not null default 'word',
    content text not null default '',
    server_content text not null default '',
    sync_status text not null default 'synced' check (sync_status in ('synced', 'syncing...', 'conflict')),
    is_starred boolean not null default false,
    is_offline_available boolean not null default false,
    is_syncing boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists files_updated_at on files;
create trigger files_updated_at
    before update on files
    for each row execute function update_updated_at();

-- 5. Trashed Files
create table if not exists trashed_files (
    id bigserial primary key,
    original_file_id bigint,
    repo_id bigint references repositories(id) on delete set null,
    repo_name text not null,
    file_data jsonb not null,
    deleted_by uuid not null references profiles(id),
    deleted_at timestamptz not null default now()
);

-- 6. Pending Registration Requests (for Admin approval queue)
create table if not exists registration_requests (
    id bigserial primary key,
    name text not null,
    email text not null unique,
    requested_at timestamptz not null default now(),
    status text not null default 'pending' check (status in ('pending', 'approved', 'denied'))
);

-- ── Row Level Security ─────────────────────────────────────

alter table profiles enable row level security;
alter table repositories enable row level security;
alter table repo_members enable row level security;
alter table files enable row level security;
alter table trashed_files enable row level security;
alter table registration_requests enable row level security;

-- Profiles: users can read all, only edit their own
create policy "profiles_read_all" on profiles for select using (true);
create policy "profiles_edit_own" on profiles for update using (auth.uid() = id);

-- Repositories: visible to members
create policy "repos_member_read" on repositories for select
    using (exists (select 1 from repo_members where repo_id = repositories.id and user_id = auth.uid()));
create policy "repos_owner_write" on repositories for all
    using (owner_id = auth.uid());

-- Repo members
create policy "repo_members_read" on repo_members for select
    using (exists (select 1 from repo_members rm where rm.repo_id = repo_members.repo_id and rm.user_id = auth.uid()));

-- Files: accessible by repo members
create policy "files_member_access" on files for all
    using (exists (select 1 from repo_members where repo_id = files.repo_id and user_id = auth.uid()));

-- Trashed files: only the deleter
create policy "trash_owner" on trashed_files for all using (deleted_by = auth.uid());

-- Registration requests: anyone can insert, only admins read
create policy "reg_requests_insert" on registration_requests for insert with check (true);
create policy "reg_requests_admin_read" on registration_requests for select
    using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ── Realtime ───────────────────────────────────────────────
-- Enable realtime on all key tables so changes broadcast to all clients
alter publication supabase_realtime add table repositories;
alter publication supabase_realtime add table files;
alter publication supabase_realtime add table trashed_files;
alter publication supabase_realtime add table repo_members;
