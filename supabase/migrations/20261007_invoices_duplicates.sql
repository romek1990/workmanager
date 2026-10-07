-- Duplicate guard: the same document (supplier tax id + document number + type) must not be counted twice.
-- A suspected duplicate points at the original; it is shown in red and left out of totals until resolved.
alter table public.invoices
  add column if not exists duplicate_of uuid references public.invoices(id) on delete set null;
-- a manager confirmed "not a duplicate" — don't flag it again on re-scan
alter table public.invoices add column if not exists duplicate_ok boolean not null default false;

-- normalized document number: letters/digits only, no leading zeros ("INV-00123" = "inv123")
create or replace function public.invoice_num_key(n text) returns text
  language sql immutable as $$
  select nullif(regexp_replace(lower(regexp_replace(coalesce(n, ''), '[^[:alnum:]]', '', 'g')), '^0+', ''), '')
$$;

create index if not exists invoices_dup_key_idx
  on public.invoices (regexp_replace(coalesce(supplier_tax_id, ''), '\D', '', 'g'), public.invoice_num_key(invoice_number), doc_type);
