import { test, expect } from '@playwright/test'

test('the dashboard sends logged-out visitors to the login page', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
})

test('a wrong password shows an error and stays on the login page', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill('nobody-e2e@example.com')
  await page.getByPlaceholder('Password').fill('definitely-wrong')
  await page.getByRole('button', { name: 'Log in' }).click()

  await expect(page.getByText('Invalid login credentials')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('forgot password gives the same answer for an email with no account', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await page.getByPlaceholder('Email').fill('nobody-e2e@example.com')
  await page.getByRole('button', { name: 'Send reset link' }).click()

  await expect(page.getByRole('status')).toContainText('If an account exists for nobody-e2e@example.com')
})

test('a reset link that is missing or broken is rejected', async ({ page }) => {
  await page.goto('/reset-password#access_token=fake&refresh_token=fake&type=recovery')
  await expect(page.getByText('This reset link is invalid or has expired')).toBeVisible()
  // the tokens are removed from the address bar
  expect(page.url()).not.toContain('access_token')
})
