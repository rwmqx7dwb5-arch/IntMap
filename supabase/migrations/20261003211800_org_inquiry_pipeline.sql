-- ============================================================================
--  sales-next — where an organisation's enquiry stands after it was answered (the pipeline)
-- ----------------------------------------------------------------------------
--  THE GAP (2026-10-03): public.org_inquiries (20261003150000) records whether an enquiry was ANSWERED
--  (status new / replied / closed / spam). It records nothing about the conversation that follows —
--  whether the newsroom is trying the embed, whether the school used the tour in a class, what the
--  operator promised to do next and by when. An operator with five conversations open keeps that in
--  their head or in a spreadsheet beside the console; the next one is the one that is forgotten.
--
--  THIS MIGRATION adds four columns, written only by an admin (the existing RLS update policy —
--  org_inquiries_admin_update — already restricts every UPDATE to is_admin(); the grant below adds
--  the four columns to the three an authenticated role may name):
--    · stage            the conversation: lead → talking → trial → adopted | declined.
--                       The words are declared once in supabase/functions/_shared/inquiry-shape.js
--                       (INQUIRY_PIPELINE.stages); this CHECK is the database's bound on the same words
--                       and tests/sales-next-checks.test.mjs holds the two equal.
--    · next_step        one sentence: what the operator will do next.
--    · next_step_on     when — the console lists what is due on or before today.
--    · stage_changed_at when the stage last moved (written by the console with the stage).
--  Every existing row becomes a 'lead' (nobody has recorded a conversation for it).
--
--  ⚠ NO NEW READER, NO NEW WRITER. anon and a non-admin still read and write nothing (RLS, unchanged);
--  the Edge Function (service role) still inserts only the enquiry's own columns — stage takes its default.
--  ⚠ RETENTION IS UNCHANGED: purge_org_inquiries still deletes every row 730 days after it arrived, an
--  adopted one included. A case study (docs/sales/case-study-template.md) is written from the
--  organisation's written consent, not from this row.
--  ⚠ NON-DESTRUCTIVE: four nullable/defaulted columns, two CHECKs, one partial index, one grant.
--  Re-running is a no-op (if not exists / the constraint guarded by its name).
-- ============================================================================

alter table public.org_inquiries add column if not exists stage            text not null default 'lead';
alter table public.org_inquiries add column if not exists next_step        text;
alter table public.org_inquiries add column if not exists next_step_on     date;
alter table public.org_inquiries add column if not exists stage_changed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'org_inquiries_stage_check' and conrelid = 'public.org_inquiries'::regclass) then
    alter table public.org_inquiries add constraint org_inquiries_stage_check
      check (stage in ('lead', 'talking', 'trial', 'adopted', 'declined'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'org_inquiries_next_step_check' and conrelid = 'public.org_inquiries'::regclass) then
    alter table public.org_inquiries add constraint org_inquiries_next_step_check
      check (next_step is null or char_length(next_step) <= 300);
  end if;
end $$;

-- what is due: only rows that carry a date are ever asked for by it
create index if not exists org_inquiries_next_step_on_idx on public.org_inquiries (next_step_on) where next_step_on is not null;

-- the admin's triage grant (20261003150000) named status, admin_note, handled_at; the pipeline's four join them.
-- RLS (org_inquiries_admin_update) still decides WHO: an admin only.
grant update (stage, next_step, next_step_on, stage_changed_at) on table public.org_inquiries to authenticated;

comment on column public.org_inquiries.stage is
  'sales-next: where the conversation stands — lead, talking, trial, adopted, declined (INQUIRY_PIPELINE.stages in supabase/functions/_shared/inquiry-shape.js). Separate from status, which says whether the enquiry was answered.';
comment on column public.org_inquiries.next_step is 'sales-next: what the operator will do next (one sentence, admin only).';
comment on column public.org_inquiries.next_step_on is 'sales-next: when the next step is due; the console lists what is due on or before today.';
comment on column public.org_inquiries.stage_changed_at is 'sales-next: when stage last moved (written by the enquiries console with the stage).';
