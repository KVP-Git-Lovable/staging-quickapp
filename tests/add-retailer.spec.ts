import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://bharat-sales-spark.lovable.app/');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email Address' }).click();
  await page.getByRole('textbox', { name: 'Email Address' }).fill('abhishek.kvp2979@gmail.com');
  await page.getByRole('textbox', { name: 'Email Address' }).press('Tab');
  await page.getByRole('textbox', { name: 'Enter your password' }).fill('87654321');
  await page.locator('form').getByRole('button').filter({ hasText: /^$/ }).click();
  await page.locator('form').getByRole('button').filter({ hasText: /^$/ }).click();
  await page.getByRole('button', { name: 'Sign In as User' }).click();
  await page.getByRole('button').filter({ hasText: /^$/ }).nth(4).click();
  await page.getByRole('link', { name: 'All Retailers' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
});