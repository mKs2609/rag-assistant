-- Persist the sources shown alongside an assistant answer.
--
-- `cited_chunk_ids` already records which chunks were retrieved, but the
-- chat UI needs the filename, the snippet and the citation-verification
-- result to redraw its source cards — and chunk rows disappear when their
-- document is deleted. Snapshotting the rendered sources keeps old answers
-- intact and auditable regardless of what happens to the document later.
--
-- Shape: [{ "filename": text, "snippet": text, "verified": bool | null }]

alter table messages
  add column if not exists sources jsonb;

comment on column messages.sources is
  'Snapshot of the sources rendered with this assistant message: filename, snippet and citation-verification result.';
