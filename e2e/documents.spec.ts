import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createTestWorkspace, deleteTestWorkspace, logIn, type TestWorkspace } from './helpers'

// none of these touch the language model, so unlike the question test they run whatever is
// left of the day's allowance

let workspace: TestWorkspace | undefined

function admin() {
  return createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

test.beforeAll(async () => {
  workspace = await createTestWorkspace()
})

test.afterAll(async () => {
  await deleteTestWorkspace(workspace)
})

test('a document that failed to process says why, and does not leak the upstream error', async ({
  page,
}) => {
  const ws = workspace!
  const db = admin()

  // the state the pipeline leaves behind when embedding is rate limited. written directly
  // because reproducing it for real would mean exhausting a quota on purpose.
  const reason = 'The embedding service was rate limited while processing this document. Please try again in a few minutes.'
  const { error: insertError } = await db.from('documents').insert({
    tenant_id: ws.tenantId,
    uploaded_by: ws.userId,
    filename: 'rate-limited-report.pdf',
    storage_path: `${ws.tenantId}/never-uploaded.pdf`,
    status: 'failed',
    error: reason,
  })
  expect(insertError, insertError?.message).toBeNull()

  await logIn(page, ws)

  const item = page.locator('li', { hasText: 'rate-limited-report.pdf' })
  await expect(item).toBeVisible()
  await expect(item).toContainText('failed')

  // the reason is on the page, not hidden in a title attribute
  await expect(item).toContainText('rate limited')
  await expect(item).toContainText('try again in a few minutes')

  // whatever is shown, it must not be the raw upstream error
  await expect(item).not.toContainText('Voyage')
  await expect(item).not.toContainText('TPM')
  await expect(item).not.toContainText('billing')
})

test('a document that processed normally shows no failure line', async ({ page }) => {
  const ws = workspace!
  const db = admin()

  const { error: insertError } = await db.from('documents').insert({
    tenant_id: ws.tenantId,
    uploaded_by: ws.userId,
    filename: 'fine-document.pdf',
    storage_path: `${ws.tenantId}/fine.pdf`,
    status: 'ready',
    error: null,
  })
  expect(insertError, insertError?.message).toBeNull()

  await logIn(page, ws)

  const item = page.locator('li', { hasText: 'fine-document.pdf' })
  await expect(item).toBeVisible()
  await expect(item).not.toContainText('failed')
})
