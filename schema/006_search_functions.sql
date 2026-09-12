-- hybrid search: vector + full text, merged in /api/chat

create or replace function public.match_document_chunks(
  query_embedding vector,
  match_tenant_id uuid,
  match_count integer default 5,
  filter_document_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  filename text,
  similarity double precision
)
language sql
stable
as $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    documents.filename,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  join documents on documents.id = document_chunks.document_id
  where document_chunks.tenant_id = match_tenant_id
    and (filter_document_ids is null or document_chunks.document_id = any(filter_document_ids))
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- catches exact terms (codes, ids) that vector search misses
create or replace function public.match_document_chunks_keyword(
  search_query text,
  match_tenant_id uuid,
  match_count integer default 5,
  filter_document_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  filename text,
  rank double precision
)
language sql
stable
as $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    documents.filename,
    ts_rank(
      to_tsvector('english', document_chunks.content),
      plainto_tsquery('english', search_query)
    ) as rank
  from document_chunks
  join documents on documents.id = document_chunks.document_id
  where document_chunks.tenant_id = match_tenant_id
    and (filter_document_ids is null or document_chunks.document_id = any(filter_document_ids))
    and to_tsvector('english', document_chunks.content) @@ plainto_tsquery('english', search_query)
  order by rank desc
  limit match_count;
$$;
