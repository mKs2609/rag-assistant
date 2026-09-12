-- sources shown with an answer, so citations survive a reload
alter table messages
  add column if not exists sources jsonb;
