-- a document that failed to process said only "failed". the pipeline knew exactly what went
-- wrong, logged it to a server console nobody reads, and then threw it away, so the only way
-- to find out was to reproduce it by hand. this keeps the reason with the row.
--
-- it holds a message written for the person who uploaded the file, not the raw error: an
-- upstream error can name internal services, quotas and billing pages, and none of that
-- belongs in a tenant's document list.

alter table documents add column if not exists error text;

comment on column documents.error is
  'Why processing failed, in words for the uploader. Null unless status is failed.';
