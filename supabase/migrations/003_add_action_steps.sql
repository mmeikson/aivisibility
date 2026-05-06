alter table recommendations
  add column if not exists action_steps jsonb default '[]'::jsonb;
