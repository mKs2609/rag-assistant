import { test, expect } from '@playwright/test'
import { createTestWorkspace, deleteTestWorkspace, logIn, type TestWorkspace } from './helpers'

let workspace: TestWorkspace | undefined

test.beforeAll(async () => {
  workspace = await createTestWorkspace()
})

test.afterAll(async () => {
  await deleteTestWorkspace(workspace)
})

test('upload a document, ask about it, get a cited answer, then delete the question', async ({ page }) => {
  const ws = workspace!
  // a made-up fact the model can only know from the uploaded file
  const code = `KV-${Math.floor(10000 + Math.random() * 90000)}`
  const fileName = `e2e-facts-${code}.txt`

  await test.step('log in and land on the workspace', async () => {
    await logIn(page, ws)
    await expect(page.getByRole('heading', { name: ws.name })).toBeVisible()
  })

  await test.step('upload a document and wait for it to be processed', async () => {
    const uploadForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Upload document' }) })
    await uploadForm.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(
        `Archive room handbook.\nThe locker code for the east archive room is ${code}.\n` +
          'Visitors must sign in at reception before entering the archive.'
      ),
    })
    await uploadForm.getByRole('button', { name: 'Upload document' }).click()

    const item = page.locator('li', { hasText: fileName })
    await expect(item).toBeVisible()
    // the list refreshes itself every few seconds until processing finishes
    await expect(item).not.toContainText('processing', { timeout: 120_000 })
    await expect(item).not.toContainText('failed')
  })

  const question = 'What is the locker code for the east archive room?'

  await test.step('ask a question and get an answer that uses the document', async () => {
    await page.getByPlaceholder('Ask something about your documents...').fill(question)
    await page.getByRole('button', { name: 'Send' }).click()

    const answer = page.getByTestId('assistant-message').last()
    await expect(answer).toContainText(code, { timeout: 120_000 })
    await expect(answer.getByTestId('source-card').first()).toContainText(fileName)
  })

  await test.step('delete the question and its answer', async () => {
    const asked = page.getByTestId('user-message').filter({ hasText: question })
    await asked.hover()
    await asked.getByRole('button', { name: 'Delete this message' }).click()
    await asked.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(page.getByTestId('user-message').filter({ hasText: question })).toHaveCount(0)
    await expect(page.getByTestId('assistant-message').filter({ hasText: code })).toHaveCount(0)
  })
})
