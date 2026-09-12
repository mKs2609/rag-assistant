create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  uploaded_by uuid not null references profiles(id),
  filename text not null,
  storage_path text not null, -- starts with tenant_id/
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_documents_tenant on documents (tenant_id);

create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  content text not null,
  embedding vector(1024), -- voyage-3.5
  chunk_index integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chunks_tenant on document_chunks (tenant_id);

-- reindex after loading real data, ivfflat clusters existing rows
create index if not exists idx_chunks_embedding
  on document_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
