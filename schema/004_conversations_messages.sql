create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references profiles(id),
  title text,
  document_ids uuid[], -- null = search all documents
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_tenant on conversations (tenant_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  cited_chunk_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_tenant on messages (tenant_id);
create index if not exists idx_messages_conversation on messages (conversation_id);
