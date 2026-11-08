import { test, expect } from '@playwright/test'
import { createTestWorkspace, deleteTestWorkspace, logIn, type TestWorkspace } from './helpers'

// the test's own budget has to cover what it waits for. processing can take 120s and the
// loop can make three attempts, so with the old 150s per attempt a single slow upload put
// the test past playwright's timeout and it died as "target page has been closed" instead
// of failing with the reason.
//
// the number below has to track what the chat actually allows itself: two model attempts
// of 25 seconds, so about 51 seconds before it reports either an answer or an error. 75
// leaves room for retrieval and the page catching up. an earlier version of this comment
// claimed the chat gave up at 60s, which was true of one attempt and not of the three it
// was making, and the test failed waiting for a message the app had not finished deciding
// to send.
const MODEL_WAIT_MS = 75_000
const ATTEMPTS = 3

// processing 120s + three attempts of 75s + the gaps between them, with room to spare
test.describe.configure({ timeout: 7 * 60 * 1000 })

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

  // asking is the one step that depends on Gemini, so it reports which of three things happened
  // rather than just pass or fail: an answer arrived, the model was busy, or the day's free
  // allowance is spent. only the first is a pass, and only the last is not this project's fault.
  const outcome = await test.step('ask a question about the document', async () => {
    const answered = page.getByTestId('assistant-message').filter({ hasText: code })
    const modelBusy = page.getByText('busy right now')
    const quotaSpent = page.getByText('daily free quota')

    // gemini returns 503 under load even after the app's own retries, so ask again. only a
    // busy answer is worth retrying: the app clears the failed exchange when it reports one,
    // so the conversation is clean. a silence leaves the first question sitting there
    // unanswered, and asking again put a second copy in the thread, which the delete step
    // below then found two of and failed on with an error about playwright rather than
    // about the app.
    let result = 'timeout'
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      await page.getByPlaceholder('Ask something about your documents...').fill(question)
      await page.getByRole('button', { name: 'Send' }).click()

      result = await Promise.race([
        answered.waitFor({ state: 'visible', timeout: MODEL_WAIT_MS }).then(() => 'answered').catch(() => 'timeout'),
        modelBusy.waitFor({ state: 'visible', timeout: MODEL_WAIT_MS }).then(() => 'busy').catch(() => 'timeout'),
        quotaSpent.waitFor({ state: 'visible', timeout: MODEL_WAIT_MS }).then(() => 'quota').catch(() => 'timeout'),
      ])

      if (result !== 'busy') break
      await page.waitForTimeout(5_000)
    }
    return result
  })

  // the free tier allows twenty requests a day on the main model and the evaluation set spends all
  // of them, so a weekly run often finds the allowance gone. the app falls back to the lighter
  // model first, so this only fires when that allowance is gone too. google's accounting is not a
  // fault in this pipeline, so the run reports skipped rather than failing. every other outcome,
  // including a wrong answer or a missing citation below, still fails.
  test.skip(outcome === 'quota', "today's free Gemini allowance is used up, so the answer could not be checked")
  expect(
    outcome,
    outcome === 'timeout'
      ? `the page showed neither an answer nor an error within ${MODEL_WAIT_MS / 1000}s. the chat bounds itself to about 51s, two attempts of 25, so a longer silence is the app failing to report rather than the model being slow`
      : 'the model was busy on every attempt'
  ).toBe('answered')

  await test.step('the answer cites the document it came from', async () => {
    const answered = page.getByTestId('assistant-message').filter({ hasText: code })
    await expect(answered.first().getByTestId('source-card').first()).toContainText(fileName)
  })

  await test.step('delete the question and its answer', async () => {
    const asked = page.getByTestId('user-message').filter({ hasText: question })
    // say what we expect, so a stray second copy reads as a diagnosis rather than as
    // playwright complaining that a locator matched twice
    await expect(
      asked,
      'the question should be in the thread once. more than one means a failed attempt was left behind instead of being cleared'
    ).toHaveCount(1)
    await asked.hover()
    await asked.getByRole('button', { name: 'Delete this message' }).click()
    await asked.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(page.getByTestId('user-message').filter({ hasText: question })).toHaveCount(0)
    await expect(page.getByTestId('assistant-message').filter({ hasText: code })).toHaveCount(0)
  })
})
