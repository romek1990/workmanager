-- Supplier documents: separate tax invoices from delivery notes
alter table public.invoices
  add column if not exists doc_type text not null default 'invoice';

alter table public.invoices drop constraint if exists invoices_doc_type_check;
alter table public.invoices
  add constraint invoices_doc_type_check check (doc_type in ('invoice', 'delivery_note'));

create index if not exists invoices_supplier_tax_id_idx on public.invoices (supplier_tax_id);
