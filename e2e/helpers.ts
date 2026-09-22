import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'

export interface TestWorkspace {
  email: string
  password: string
  userId: string
  tenantId: string
  name: string
}

function admin() {
  return createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// a confirmed user with their own workspace, created directly so no email is needed
export async function createTestWorkspace(): Promise<TestWorkspace> {
  const id = randomUUID().slice(0, 8)
  const email = `e2e-${id}@example.com`
  const password = `E2e-${id}-password`
  const name = `E2E Workspace ${id}`
  const db = admin()

  const { data: auth, error: authError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authError || !auth.user) throw new Error(`Could not create test user: ${authError?.message}`)

  const { data: tenant, error: tenantError } = await db
    .from('tenants')
    .insert({ name, slug: `e2e-${id}` })
    .select('id')
    .single()
  if (tenantError || !tenant) throw new Error(`Could not create test workspace: ${tenantError?.message}`)

  const { error: profileError } = await db.from('profiles').insert({
    id: auth.user.id,
    tenant_id: tenant.id,
    email,
    role: 'owner',
    display_name: 'E2E Tester',
  })
  if (profileError) throw new Error(`Could not create test profile: ${profileError.message}`)

  return { email, password, userId: auth.user.id, tenantId: tenant.id, name }
}

// removes everything the test made: files, workspace (cascades to its data) and the user
export async function deleteTestWorkspace(workspace: TestWorkspace | undefined) {
  if (!workspace) return
  const db = admin()

  const { data: files } = await db.storage.from('documents').list(workspace.tenantId)
  if (files && files.length > 0) {
    await db.storage.from('documents').remove(files.map((f) => `${workspace.tenantId}/${f.name}`))
  }

  await db.from('tenants').delete().eq('id', workspace.tenantId)
  await db.auth.admin.deleteUser(workspace.userId)
}

export async function logIn(page: Page, workspace: TestWorkspace) {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(workspace.email)
  await page.getByPlaceholder('Password').fill(workspace.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL('**/dashboard')
}
