ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS end_time time;
