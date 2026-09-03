alter table public.nexus_documents
  add column if not exists task_id uuid references public.nexus_tasks(id) on delete set null;

create index if not exists nexus_documents_task_id_idx
  on public.nexus_documents(task_id)
  where task_id is not null;

comment on column public.nexus_documents.task_id is
  'Optional Nexus action/task this document was uploaded for. Used to keep client files attached to the action where they were requested.';
