-- Add user_id to reports for account-linked saving
alter table reports add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists reports_user_id_idx on reports(user_id);
