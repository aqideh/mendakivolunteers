create index if not exists phaseone_opportunity_imports_uploaded_by_idx
  on public.phaseone_opportunity_imports(uploaded_by);

create index if not exists phaseone_opportunity_imports_created_at_idx
  on public.phaseone_opportunity_imports(created_at desc);