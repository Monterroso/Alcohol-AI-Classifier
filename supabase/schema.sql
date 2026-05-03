create table if not exists applications (
  id text primary key,
  application_number text not null unique,
  submitted_data jsonb not null,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'processed', 'failed')),
  processing_error text,
  processing_started_at timestamptz,
  processing_finished_at timestamptz,
  locked_by text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'approved', 'rejected', 'needs_changes')),
  specialist_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists application_images (
  id text primary key,
  application_id text not null references applications(id) on delete cascade,
  image_url text not null,
  storage_path text,
  label_type text not null
    check (label_type in ('front', 'back', 'neck', 'brand', 'government_warning', 'other')),
  original_filename text,
  mime_type text,
  width_px integer check (width_px is null or width_px > 0),
  height_px integer check (height_px is null or height_px > 0),
  created_at timestamptz not null default now()
);

create table if not exists ocr_text_blocks (
  id text primary key,
  application_id text not null references applications(id) on delete cascade,
  image_id text not null references application_images(id) on delete cascade,
  text text not null,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  bbox jsonb not null,
  page_section text
    check (page_section is null or page_section in ('top', 'middle', 'bottom', 'left', 'right', 'unknown')),
  block_order integer,
  line_number integer,
  created_at timestamptz not null default now()
);

create table if not exists extracted_fields (
  id text primary key,
  application_id text not null references applications(id) on delete cascade,
  field_key text,
  field_label text not null,
  extracted_value text,
  normalized_value text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  extraction_status text not null
    check (extraction_status in ('found', 'missing', 'ambiguous', 'conflict')),
  explanation text,
  created_at timestamptz not null default now()
);

create table if not exists extracted_field_evidence (
  id text primary key,
  extracted_field_id text not null references extracted_fields(id) on delete cascade,
  image_id text not null references application_images(id) on delete cascade,
  ocr_text_block_id text references ocr_text_blocks(id) on delete set null,
  evidence_text text not null,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  bbox jsonb not null,
  evidence_rank integer not null default 1 check (evidence_rank > 0),
  created_at timestamptz not null default now()
);

create table if not exists validation_results (
  id text primary key,
  application_id text not null references applications(id) on delete cascade,
  field_key text,
  check_key text not null,
  check_label text not null,
  result_status text not null
    check (result_status in ('pass', 'fail', 'warning', 'unknown')),
  submitted_value text,
  extracted_value text,
  score numeric check (score is null or (score >= 0 and score <= 1)),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists applications_created_at_idx on applications(created_at desc);
create index if not exists applications_processing_status_idx on applications(processing_status);
create index if not exists applications_review_status_idx on applications(review_status);
create index if not exists application_images_application_id_idx on application_images(application_id);
create index if not exists ocr_text_blocks_application_id_idx on ocr_text_blocks(application_id);
create index if not exists ocr_text_blocks_image_id_idx on ocr_text_blocks(image_id);
create index if not exists extracted_fields_application_id_idx on extracted_fields(application_id);
create index if not exists extracted_field_evidence_field_id_idx on extracted_field_evidence(extracted_field_id);
create index if not exists validation_results_application_id_idx on validation_results(application_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists applications_set_updated_at on applications;
create trigger applications_set_updated_at
before update on applications
for each row
execute function set_updated_at();

alter table applications replica identity full;
alter table application_images replica identity full;
alter table ocr_text_blocks replica identity full;
alter table extracted_fields replica identity full;
alter table extracted_field_evidence replica identity full;
alter table validation_results replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'applications'
  ) then
    alter publication supabase_realtime add table applications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'application_images'
  ) then
    alter publication supabase_realtime add table application_images;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ocr_text_blocks'
  ) then
    alter publication supabase_realtime add table ocr_text_blocks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'extracted_fields'
  ) then
    alter publication supabase_realtime add table extracted_fields;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'extracted_field_evidence'
  ) then
    alter publication supabase_realtime add table extracted_field_evidence;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'validation_results'
  ) then
    alter publication supabase_realtime add table validation_results;
  end if;
end $$;
