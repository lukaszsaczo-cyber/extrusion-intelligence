-- 0036: link a machine to the reference model catalog (0035), optional. Set when the
-- operator can identify the model name but cannot read the nameplate on site.
alter table public.machines add column model_catalog_code text references public.machine_model_specs(model_code);
