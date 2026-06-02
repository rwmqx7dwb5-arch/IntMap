-- IntMap Pro entitlement
-- The client (imIsPro()) reads profiles.is_pro. refreshCurrentUser() already tolerates a
-- missing column, but to actually flag non-admin Pro users you must add it once.
-- Safe to run multiple times.

alter table public.profiles
  add column if not exists is_pro boolean not null default false;

-- Grant yourself Pro for testing (replace with your auth user id):
--   update public.profiles set is_pro = true where id = '00000000-0000-0000-0000-000000000000';

-- After a successful Stripe checkout you would set is_pro = true for the buyer
-- (e.g. from a Stripe webhook Edge Function keyed on the customer email / user id).
