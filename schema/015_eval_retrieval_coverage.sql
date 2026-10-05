-- retrieval is measured by the embedding and the database, the answer by the model, and
-- only the model runs out of free quota. a run that could not reach the model still has a
-- complete retrieval result, so the two coverages are counted separately.
--
-- scored_count keeps its meaning: how many answers were scored. null here marks a run
-- recorded before the split, where retrieval was only counted for answered questions.

alter table eval_runs add column if not exists retrieval_scored_count integer;

comment on column eval_runs.retrieval_scored_count is
  'Questions whose retrieval was measured. Null for runs recorded before retrieval and answer scoring were separated.';
