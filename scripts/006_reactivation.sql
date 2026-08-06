-- Reactivation call system: niches, scripts, contacts, pipeline, calls, follow-ups

create table if not exists niches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One master script (niche_id null) with {{slot}} placeholders.
create table if not exists reactivation_scripts (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Master Script',
  body text not null default '',
  status text not null default 'live' check (status in ('draft', 'live')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Per-niche content for each {{slot}} in the master script.
create table if not exists script_sections (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid not null references niches(id) on delete cascade,
  slot_name text not null,
  content text not null default '',
  updated_at timestamptz not null default now(),
  unique (niche_id, slot_name)
);

-- Pipeline stages: owner_id null = global defaults; owners may add their own.
create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references participants(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references participants(id) on delete cascade,
  created_by uuid references participants(id) on delete set null,
  name text not null,
  phone text not null,
  email text,
  niche_id uuid references niches(id) on delete set null,
  stage_id uuid references pipeline_stages(id) on delete set null,
  do_not_call boolean not null default false,
  notes text,
  first_call_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists contacts_owner_idx on contacts(owner_id);

create table if not exists reactivation_calls (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  caller_id uuid references participants(id) on delete set null,
  disposition text not null check (disposition in (
    'no_answer', 'voicemail', 'spoke_did_not_schedule',
    'spoke_call_back_later', 'scheduled', 'do_not_call'
  )),
  voicemail_left boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists calls_contact_idx on reactivation_calls(contact_id);
create index if not exists calls_caller_idx on reactivation_calls(caller_id);

create table if not exists follow_ups (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  due_at timestamptz not null,
  reason text not null check (reason in ('retry', 'three_month', 'quarterly', 'manual', 'initial')),
  completed_call_id uuid references reactivation_calls(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists follow_ups_contact_idx on follow_ups(contact_id);
create index if not exists follow_ups_due_idx on follow_ups(due_at) where completed_call_id is null;

-- Remember each participant's last-selected niche for the script screen.
alter table participants add column if not exists selected_niche_id uuid references niches(id) on delete set null;

-- ---------- Seed data ----------

insert into pipeline_stages (name, sort_order, is_default)
select v.name, v.sort_order, true
from (values
  ('New', 0), ('Contacting', 1), ('Spoke To', 2), ('Scheduled', 3), ('Recall', 4)
) as v(name, sort_order)
where not exists (select 1 from pipeline_stages where owner_id is null);

insert into niches (name, sort_order)
select v.name, v.sort_order
from (values ('Chiropractic', 0), ('Dental', 1), ('Med Spa', 2)) as v(name, sort_order)
where not exists (select 1 from niches);

insert into reactivation_scripts (title, body, status)
select 'Master Reactivation Script', E'Hi, is this {{contact_first_name}}?\n\nGreat! This is [YOUR NAME] calling from [PRACTICE NAME]. How have you been?\n\n{{opening_hook}}\n\nThe reason I''m calling is that we were reviewing our records and noticed it''s been a while since your last visit. {{reason_for_visit}}\n\nWe''ve set aside a few appointment times this week specifically for returning clients, and I wanted to reach out to you personally before those spots fill up.\n\n{{offer_details}}\n\nWould mornings or afternoons work better for you?\n\n[IF YES - SCHEDULING]\nPerfect! I have [DATE/TIME OPTION 1] or [DATE/TIME OPTION 2] available. Which works best?\n\nExcellent, you''re all set for [CONFIRMED TIME]. We''ll send you a reminder. Is this still the best number to reach you?\n\n[IF HESITANT]\n{{objection_handler}}\n\nI completely understand. Would it help if I checked what we have available next week instead?\n\n[CLOSING]\nThank you so much for your time today. We look forward to seeing you again!', 'live'
where not exists (select 1 from reactivation_scripts);
