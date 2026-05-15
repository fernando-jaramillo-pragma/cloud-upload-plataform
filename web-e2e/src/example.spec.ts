import { test, expect } from '@playwright/test';

test('has upload form', async ({ page }) => {
  await page.goto('/');

  // Expect the upload label to be visible
  await expect(page.locator('label.input-label')).toContainText(
    'Selecciona una imagen',
  );
});
