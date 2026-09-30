-- keyword search had no index at all. every question ran a sequential scan over every
-- chunk in the workspace, building the tsvector for each row as it went. measured on
-- 20,000 chunks the median search took 1716 ms.

-- an index on the expression the search already uses. the first attempt added a stored
-- generated column instead, which rewrites the table and therefore rebuilds the ivfflat
-- vector index, and that rebuild needs more memory than a small instance has. an
-- expression index touches nothing else.
create index if not exists idx_chunks_content_tsv
  on document_chunks using gin (to_tsvector('english', content));

-- match_document_chunks_keyword already filters on exactly this expression, so it starts
-- using the index with no change to the function itself.
