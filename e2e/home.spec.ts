import { expect, test } from '@playwright/test'

test('workspace supports routing, filters, markdown shortcuts, and sharing UI', async ({ page }) => {
  const consoleErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/')

  await expect(page.locator('[data-nextjs-dialog], .vite-error-overlay')).toHaveCount(0)
  await expect(page.locator('body')).toContainText('Note Atelier')
  await expect(page.locator('.doc-row').first()).toBeVisible()
  await expect(page.locator('.title-input')).toBeVisible()

  await page.locator('.new-doc-button').first().click()
  await expect(page).toHaveURL(/\/note\//)
  await page.locator('.title-input').fill('Deploy smoke page')
  await page.locator('.property-grid input').first().fill('QA')
  await page.locator('.property-grid input').nth(1).fill('deploy, smoke')

  await page.locator('.block textarea').first().fill('# Launch checklist')
  await expect(page.locator('.block.heading textarea').first()).toHaveValue('Launch checklist')

  await page.locator('.toolbar-button').nth(0).click()
  await page.locator('.block.paragraph textarea').last().fill('- [ ] Browser check')
  await expect(page.locator('.block.todo textarea').last()).toHaveValue('Browser check')

  await page.locator('.editor-action').nth(1).click()
  await expect(page.locator('.share-strip input')).toHaveValue(/\/share\//)

  await page.locator('.search-box input').fill('Deploy smoke')
  await expect(page.locator('.doc-row')).toHaveCount(1)

  await page.locator('.filter-grid select').first().selectOption('QA')
  await expect(page.locator('.doc-row')).toHaveCount(1)

  expect(consoleErrors).toEqual([])
})
