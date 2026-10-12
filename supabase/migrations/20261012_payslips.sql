-- Payslips (תלושי שכר)
-- A manager uploads ONE PDF with all employees' payslips. The "payslips" edge function splits it per employee,
-- matches each slip to an employee (ת.ז on the slip → known ת.ז; else exact name) and files it by month.
-- Employees see only their own published slips. Uncertain matches wait for a manager ("review" / "unassigned").

create table if not exists public.payslip_batches (
  id uuid primary key default gen_random_uuid(),
  file_path text not null,
  file_name text,
  status text not null default 'processing' check (status in ('processing', 'done', 'failed')),
  total_pages int,
  slips_count int,
  error text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.payslip_batches(id) on delete set null,
  employee_id uuid references public.profiles(id) on delete set null,
  month text check (month is null or month ~ '^\d{4}-\d{2}$'),
  name_on_slip text,
  id_number_on_slip text,
  file_path text not null,
  pages int[],
  -- published = employee sees it · review = AI guess, manager must confirm · unassigned = no match · replaced = newer slip uploaded
  status text not null default 'unassigned' check (status in ('published', 'review', 'unassigned', 'replaced')),
  match_method text check (match_method in ('tz', 'name', 'ai', 'manual')),
  sent_at timestamptz,
  sent_by_name text,
  viewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payslips_employee_month_idx on public.payslips (employee_id, month);
create index if not exists payslips_month_idx on public.payslips (month);

alter table public.payslip_batches enable row level security;
alter table public.payslips enable row level security;

create policy payslip_batches_perm_all on public.payslip_batches for all
  using (is_admin() and has_perm('payslips')) with check (is_admin() and has_perm('payslips'));
create policy lock_payslip_batches on public.payslip_batches as restrictive for all
  using (system_open()) with check (system_open());

create policy payslips_perm_all on public.payslips for all
  using (is_admin() and has_perm('payslips')) with check (is_admin() and has_perm('payslips'));
create policy payslips_own_select on public.payslips for select
  using (employee_id = (select auth.uid()) and status = 'published');
create policy lock_payslips on public.payslips as restrictive for all
  using (system_open()) with check (system_open());

-- employee opened their slip (they can't update the table directly)
create or replace function public.mark_payslip_viewed(p_id uuid) returns void
  language sql security definer set search_path = public as $$
  update public.payslips set viewed_at = coalesce(viewed_at, now())
   where id = p_id and employee_id = auth.uid() and status = 'published';
$$;
grant execute on function public.mark_payslip_viewed(uuid) to authenticated;

-- private bucket, PDFs only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payslips', 'payslips', false, 31457280, array['application/pdf'])
on conflict (id) do nothing;

create policy payslips_files_admin on storage.objects for all
  using (bucket_id = 'payslips' and is_admin() and has_perm('payslips') and system_open())
  with check (bucket_id = 'payslips' and is_admin() and has_perm('payslips') and system_open());
create policy payslips_files_own on storage.objects for select
  using (bucket_id = 'payslips' and exists (
    select 1 from public.payslips s where s.file_path = name and s.employee_id = (select auth.uid()) and s.status = 'published'));
