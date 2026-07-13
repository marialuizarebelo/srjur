-- Campo "está preso" (uso específico da instância Amabile — área penal/criminal),
-- com penitenciária e cidade preenchidas apenas quando marcado.
alter table clients add column if not exists is_incarcerated boolean not null default false;
alter table clients add column if not exists incarceration_facility text;
alter table clients add column if not exists incarceration_city text;

notify pgrst, 'reload schema';
