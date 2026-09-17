begin;

create schema if not exists integration;
create schema if not exists ymhub;

comment on schema integration is
  'Private server-side integration state and batch handoff history.';

revoke all on schema integration from public, anon, authenticated;
grant usage on schema integration to service_role;

create table integration.ymhub_import_batches (
  id uuid primary key default gen_random_uuid(),
  period_start date,
  period_end date,
  status text not null default 'draft' check (
    status in ('draft', 'validated', 'committed', 'failed')
  ),
  created_by uuid references core.user_accounts (id) on delete set null,
  committed_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ymhub_import_batches_period_order check (
    period_start is null or period_end is null or period_end >= period_start
  ),
  constraint ymhub_import_batches_commit_state check (
    (status = 'committed' and committed_at is not null)
    or (status <> 'committed')
  )
);

comment on table integration.ymhub_import_batches is
  'Logical YM Hub batch. The selectable source period is recorded so staff do not need to maintain a separate handoff log.';

create table integration.ymhub_import_files (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references integration.ymhub_import_batches (id) on delete cascade,
  dataset text not null check (
    dataset in (
      'person_accounts',
      'volunteer_initiatives',
      'job_position_shifts',
      'job_position_assignments'
    )
  ),
  file_name text not null check (char_length(file_name) between 1 and 255),
  file_sha256 text not null check (char_length(file_sha256) = 64),
  template_version text check (
    template_version is null or char_length(template_version) between 1 and 40
  ),
  status text not null default 'pending' check (
    status in ('pending', 'validated', 'committed', 'failed')
  ),
  row_count integer not null default 0 check (row_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  exception_count integer not null default 0 check (exception_count >= 0),
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dataset, file_sha256)
);

comment on table integration.ymhub_import_files is
  'Metadata and duplicate-detection history for each uploaded Salesforce report. Raw CSV contents are intentionally not retained here.';

create index ymhub_import_files_batch_idx
  on integration.ymhub_import_files (batch_id, dataset);
create index ymhub_import_files_imported_at_idx
  on integration.ymhub_import_files (imported_at desc);

create table integration.ymhub_import_exceptions (
  id uuid primary key default gen_random_uuid(),
  import_file_id uuid not null references integration.ymhub_import_files (id) on delete cascade,
  row_number integer check (row_number is null or row_number > 0),
  source_record_id text check (
    source_record_id is null or char_length(source_record_id) between 1 and 128
  ),
  code text not null check (char_length(code) between 1 and 100),
  message text not null check (char_length(message) between 1 and 1000),
  resolved_by uuid references core.user_accounts (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ymhub_import_exceptions_resolution check (
    (resolved_at is null and resolved_by is null)
    or resolved_at is not null
  )
);

comment on table integration.ymhub_import_exceptions is
  'Validation and reconciliation exceptions. Do not store full raw CSV rows or unnecessary personal data.';

create index ymhub_import_exceptions_open_idx
  on integration.ymhub_import_exceptions (import_file_id, created_at)
  where resolved_at is null;

create table integration.ymhub_export_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.phaseone_events (id) on delete set null,
  status text not null default 'generated' check (
    status in ('generated', 'handed_off', 'confirmed', 'rejected')
  ),
  generated_by uuid references core.user_accounts (id) on delete set null,
  generated_at timestamptz not null default now(),
  handed_off_at timestamptz,
  confirmed_at timestamptz,
  file_sha256 text check (file_sha256 is null or char_length(file_sha256) = 64),
  row_count integer not null default 0 check (row_count >= 0),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ymhub_export_batches_state_times check (
    (status <> 'handed_off' or handed_off_at is not null)
    and (status <> 'confirmed' or confirmed_at is not null)
  )
);

comment on table integration.ymhub_export_batches is
  'Audit history for KELUARGA attendance files generated for Salesforce/YM Hub handoff.';

create index ymhub_export_batches_generated_at_idx
  on integration.ymhub_export_batches (generated_at desc);
create index ymhub_export_batches_event_idx
  on integration.ymhub_export_batches (event_id, generated_at desc);

create table integration.ymhub_export_rows (
  id uuid primary key default gen_random_uuid(),
  export_batch_id uuid not null references integration.ymhub_export_batches (id) on delete cascade,
  source_attendance_id uuid not null references public.phaseone_attendance (id) on delete restrict,
  ymhub_assignment_id text not null check (
    char_length(ymhub_assignment_id) between 1 and 128
  ),
  actual_start_time timestamptz,
  actual_end_time timestamptz,
  attendance_status text not null check (
    char_length(attendance_status) between 1 and 100
  ),
  row_fingerprint text not null check (char_length(row_fingerprint) = 64),
  downstream_outcome text check (
    downstream_outcome is null or char_length(downstream_outcome) <= 100
  ),
  downstream_message text check (
    downstream_message is null or char_length(downstream_message) <= 1000
  ),
  created_at timestamptz not null default now(),
  constraint ymhub_export_rows_time_order check (
    actual_start_time is null or actual_end_time is null or actual_end_time >= actual_start_time
  ),
  unique (source_attendance_id, row_fingerprint)
);

comment on table integration.ymhub_export_rows is
  'Per-attendance-row handoff history. The fingerprint prevents unchanged attendance from being exported repeatedly while allowing later corrections.';

create index ymhub_export_rows_batch_idx
  on integration.ymhub_export_rows (export_batch_id);
create index ymhub_export_rows_assignment_idx
  on integration.ymhub_export_rows (ymhub_assignment_id);

create table ymhub.activity_snapshots (
  id uuid primary key default gen_random_uuid(),
  ymhub_activity_id text not null unique check (
    char_length(ymhub_activity_id) between 1 and 128
  ),
  title text not null check (char_length(title) between 1 and 240),
  is_ad_hoc boolean not null,
  starts_on date not null,
  ends_on date not null,
  source_status text not null check (char_length(source_status) between 1 and 100),
  published boolean not null,
  description text,
  venue text,
  registration_url text,
  image_url text,
  last_import_file_id uuid references integration.ymhub_import_files (id) on delete set null,
  last_imported_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_snapshots_date_order check (ends_on >= starts_on)
);

comment on table ymhub.activity_snapshots is
  'Current KELUARGA projection of Salesforce Volunteer Initiative records. Is Ad Hoc is programme type, not app category.';

create index activity_snapshots_dates_idx
  on ymhub.activity_snapshots (starts_on, ends_on);
create index activity_snapshots_published_idx
  on ymhub.activity_snapshots (published, starts_on);

create table ymhub.shift_snapshots (
  id uuid primary key default gen_random_uuid(),
  ymhub_shift_id text not null unique check (
    char_length(ymhub_shift_id) between 1 and 128
  ),
  ymhub_activity_id text not null references ymhub.activity_snapshots (ymhub_activity_id) on update cascade on delete restrict,
  job_position_id text check (
    job_position_id is null or char_length(job_position_id) between 1 and 128
  ),
  job_position_name text not null check (
    char_length(job_position_name) between 1 and 240
  ),
  shift_label text check (
    shift_label is null or char_length(shift_label) between 1 and 240
  ),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  last_import_file_id uuid references integration.ymhub_import_files (id) on delete set null,
  last_imported_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_snapshots_time_order check (ends_at >= starts_at)
);

comment on table ymhub.shift_snapshots is
  'Current KELUARGA projection of Salesforce Job Position Shift records. Job Position is the volunteer role; Shift is the time slot.';

create index shift_snapshots_activity_idx
  on ymhub.shift_snapshots (ymhub_activity_id, starts_at);

create table ymhub.assignment_snapshots (
  id uuid primary key default gen_random_uuid(),
  ymhub_assignment_id text not null unique check (
    char_length(ymhub_assignment_id) between 1 and 128
  ),
  ymhub_volunteer_id text not null check (
    char_length(ymhub_volunteer_id) between 1 and 128
  ),
  volunteer_id uuid references core.volunteers (id) on delete set null,
  ymhub_activity_id text not null check (
    char_length(ymhub_activity_id) between 1 and 128
  ),
  ymhub_shift_id text check (
    ymhub_shift_id is null or char_length(ymhub_shift_id) between 1 and 128
  ),
  source_status text not null check (char_length(source_status) between 1 and 100),
  actual_duration numeric(8, 2) check (actual_duration is null or actual_duration >= 0),
  last_import_file_id uuid references integration.ymhub_import_files (id) on delete set null,
  last_imported_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table ymhub.assignment_snapshots is
  'Canonical imported Job Position Assignment record. Source IDs remain durable even when the related Initiative or Shift is outside a partial published report.';

create index assignment_snapshots_volunteer_idx
  on ymhub.assignment_snapshots (volunteer_id, last_imported_at desc);
create index assignment_snapshots_source_volunteer_idx
  on ymhub.assignment_snapshots (ymhub_volunteer_id, last_imported_at desc);
create index assignment_snapshots_activity_idx
  on ymhub.assignment_snapshots (ymhub_activity_id, ymhub_shift_id);
create index assignment_snapshots_status_idx
  on ymhub.assignment_snapshots (source_status);

alter table core.volunteers
  add column mobile text check (
    mobile is null or char_length(mobile) between 1 and 40
  ),
  add column official_hours_12_months numeric(10, 2) check (
    official_hours_12_months is null or official_hours_12_months >= 0
  ),
  add column official_hours_24_months numeric(10, 2) check (
    official_hours_24_months is null or official_hours_24_months >= 0
  ),
  add column last_import_file_id uuid references integration.ymhub_import_files (id) on delete set null;

comment on column core.volunteers.official_hours_12_months is
  'Authoritative rolling 12-month verified hours supplied by YM Hub.';
comment on column core.volunteers.official_hours_24_months is
  'Authoritative rolling 24-month verified hours supplied by YM Hub.';

alter table public.phaseone_event_timeslots
  add column ymhub_shift_id text check (
    ymhub_shift_id is null or char_length(ymhub_shift_id) between 1 and 128
  );

create unique index phaseone_event_timeslots_ymhub_shift_idx
  on public.phaseone_event_timeslots (ymhub_shift_id)
  where ymhub_shift_id is not null;

alter table public.phaseone_roster
  add column volunteer_id uuid references core.volunteers (id) on delete set null,
  add column ymhub_assignment_id text check (
    ymhub_assignment_id is null or char_length(ymhub_assignment_id) between 1 and 128
  ),
  add column source_assignment_status text check (
    source_assignment_status is null or char_length(source_assignment_status) between 1 and 100
  );

create index phaseone_roster_volunteer_idx
  on public.phaseone_roster (volunteer_id)
  where volunteer_id is not null;
create unique index phaseone_roster_ymhub_assignment_idx
  on public.phaseone_roster (ymhub_assignment_id)
  where ymhub_assignment_id is not null;

create trigger ymhub_import_batches_set_updated_at
before update on integration.ymhub_import_batches
for each row execute function core.set_updated_at();

create trigger ymhub_import_files_set_updated_at
before update on integration.ymhub_import_files
for each row execute function core.set_updated_at();

create trigger ymhub_export_batches_set_updated_at
before update on integration.ymhub_export_batches
for each row execute function core.set_updated_at();

create trigger ymhub_activity_snapshots_set_updated_at
before update on ymhub.activity_snapshots
for each row execute function core.set_updated_at();

create trigger ymhub_shift_snapshots_set_updated_at
before update on ymhub.shift_snapshots
for each row execute function core.set_updated_at();

create trigger ymhub_assignment_snapshots_set_updated_at
before update on ymhub.assignment_snapshots
for each row execute function core.set_updated_at();

alter table integration.ymhub_import_batches enable row level security;
alter table integration.ymhub_import_batches force row level security;
alter table integration.ymhub_import_files enable row level security;
alter table integration.ymhub_import_files force row level security;
alter table integration.ymhub_import_exceptions enable row level security;
alter table integration.ymhub_import_exceptions force row level security;
alter table integration.ymhub_export_batches enable row level security;
alter table integration.ymhub_export_batches force row level security;
alter table integration.ymhub_export_rows enable row level security;
alter table integration.ymhub_export_rows force row level security;
alter table ymhub.activity_snapshots enable row level security;
alter table ymhub.activity_snapshots force row level security;
alter table ymhub.shift_snapshots enable row level security;
alter table ymhub.shift_snapshots force row level security;
alter table ymhub.assignment_snapshots enable row level security;
alter table ymhub.assignment_snapshots force row level security;

revoke all on integration.ymhub_import_batches from public, anon, authenticated;
revoke all on integration.ymhub_import_files from public, anon, authenticated;
revoke all on integration.ymhub_import_exceptions from public, anon, authenticated;
revoke all on integration.ymhub_export_batches from public, anon, authenticated;
revoke all on integration.ymhub_export_rows from public, anon, authenticated;
revoke all on ymhub.activity_snapshots from public, anon, authenticated;
revoke all on ymhub.shift_snapshots from public, anon, authenticated;
revoke all on ymhub.assignment_snapshots from public, anon, authenticated;

grant all on integration.ymhub_import_batches to service_role;
grant all on integration.ymhub_import_files to service_role;
grant all on integration.ymhub_import_exceptions to service_role;
grant all on integration.ymhub_export_batches to service_role;
grant all on integration.ymhub_export_rows to service_role;
grant all on ymhub.activity_snapshots to service_role;
grant all on ymhub.shift_snapshots to service_role;
grant all on ymhub.assignment_snapshots to service_role;

commit;
