# Working on this project

RAG Assistant is a multi-tenant document question answering platform. A workspace uploads
documents, asks questions in plain English, and gets answers built only from those documents,
with every citation checked against the passage it claims to quote.

Live: https://rag-assistant-gamma.vercel.app

## Commands

```bash
npm run dev         # dev server on port 3000
npm run build       # production build
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm test            # vitest, unit tests only
npm run test:e2e    # playwright, needs .env.e2e
```

Run `lint`, `typecheck` and `test` before opening a pull request. CI runs all three plus a build
on every push.

## Layout

```
app/
  api/            15 route handlers, one folder each
  dashboard/      the workspace interface
  login, signup, forgot-password, reset-password, invite/[token]
lib/
  documents/      chunking, direct upload, background processing
  supabase/       browser, server and admin clients
  hooks/          speech recognition and speech synthesis
  __tests__/      unit tests
  citations.ts    citation grounding check
  gemini.ts       every Gemini call goes through here, with retries
  markdown.ts     parses model answers into renderable blocks
  ocr.ts          reading scanned pages
  theme.ts        accent colour as a value, for props that need one
schema/           numbered SQL migrations, apply in order
e2e/              playwright specs
proxy.ts          session refresh and route protection
```

## How a question is answered

1. The question is embedded with Voyage `voyage-3.5` (1024 dimensions).
2. Two searches run in parallel: pgvector cosine similarity and Postgres full text search,
   top 5 each. Vector search finds meaning, keyword search finds exact codes and identifiers.
3. Results are merged, deduplicated, and the best 6 passages are kept.
4. A prompt is built from those passages plus the last 10 messages of the conversation.
5. Gemini streams the answer back as newline delimited JSON events (`status`, `token`, `done`).
6. Each citation is verified: at least 30 per cent of the significant words in the citing
   sentence must appear in the cited passage. Failures are shown as unverified, never hidden.

## Rules that matter

**Tenant isolation is enforced by the database.** Every table carries `tenant_id` and every row
is filtered by Row Level Security through the `auth_tenant_id()` helper. Do not rely on adding a
filter in application code; the policy is the guarantee. The service role key bypasses RLS, so
`lib/supabase/admin.ts` may only be used after the route has made its own ownership checks.

**Never send a file through a route handler.** Vercel caps a serverless request body at 4.5 MB
while the app allows 10 MB files. Uploads go from the browser straight to Supabase Storage using
a signed URL; only metadata passes through the function.

**Respect the provider limits.** Voyage accepts at most 128 inputs per request, so embeddings are
batched and also capped by total characters. OCR runs one 10-page group at a time: three groups in
parallel measured 252 seconds against 34 sequential, because free tier requests queue.

**Background work needs a deadline.** A serverless function can be stopped mid-run. Check the
remaining time before each unit of work and mark the document failed rather than leaving it
stuck on `processing` for ever.

**Rate limit anything that costs money.** Chat, upload, evaluation and signup all have limits.
Count chat by the sender (`messages.user_id`), not by who created the conversation, because
conversations are shared.

## Database changes

Add a new numbered file in `schema/`. Never edit an applied migration, and never make schema
changes only in the Supabase dashboard; the files are the source of truth.

## Tests

Logic that can be tested without a browser lives in its own module under `lib/` with unit tests.
Everything else is covered by Playwright. After writing a test, break the code on purpose and
confirm the test fails; a test that cannot fail proves nothing.

End-to-end tests point at a **separate** Supabase project configured in `.env.e2e`. The config
refuses to start if that URL matches the one in `.env.local`, because the tests create and delete
users, workspaces and documents.

## Writing style

British English. No em dashes anywhere, in code comments, UI copy or documentation. Comments
explain why something is the way it is, especially when a measurement or a provider limit drove
the decision; they do not restate what the line already says.

## Environment

`.env.local` holds the real keys and is never committed. `NEXT_PUBLIC_` values reach the browser;
`SUPABASE_SERVICE_ROLE_KEY`, `VOYAGE_API_KEY` and `GEMINI_API_KEY` are server only.

Free tier limits worth knowing while developing: Voyage allows 3 requests per minute, and Gemini
allows 20 requests per day and returns 503 when busy. Both will interrupt local testing.
