/**
 * Assistant Settings UI interactions — E2E tests.
 *
 * Scenario-level port of upstream AionUi's tests/e2e/features/assistants
 * P0 suite (create / edit / toggle / duplicate / delete), adapted to this
 * fork's drawer-based editor (upstream drives a full-page editor).
 * Anchored on the data-testid set added alongside this spec.
 */
import { test, expect } from '../fixtures';
import { goToSettings, waitForSettle } from '../helpers';

const EDITOR = '[data-testid="assistant-editor-drawer"]';
const NAME_INPUT = '[data-testid="input-assistant-name"] , input[data-testid="input-assistant-name"]';

async function openAssistantSettings(page: import('@playwright/test').Page): Promise<void> {
  await goToSettings(page, 'assistants');
  await waitForSettle(page);
  await expect(page.locator('[data-testid^="assistant-card-"]').first()).toBeVisible({ timeout: 15_000 });
}

test.describe('Assistant Settings UI (P0)', () => {
  test.setTimeout(120_000);

  test('P0-1: create assistant — drawer opens, save adds card to list', async ({ page }) => {
    await openAssistantSettings(page);

    const name = `E2E create ${Date.now()}`;
    await page.locator('[data-testid="btn-create-assistant"]').click();
    await expect(page.locator(EDITOR)).toBeVisible({ timeout: 5_000 });

    await page.locator(NAME_INPUT).first().fill(name);
    await page.locator('[data-testid="input-assistant-description"]').first().fill('Created by e2e P0-1');
    await page.locator('[data-testid="btn-save-assistant"]').click();
    await expect(page.locator(EDITOR)).toBeHidden({ timeout: 10_000 });

    const createdCard = page.locator('[data-testid^="assistant-card-"]').filter({ hasText: name }).first();
    await expect(createdCard).toBeVisible({ timeout: 10_000 });

    // Cleanup: delete the assistant we just created (also exercises P0-3 delete flow).
    const createdId = ((await createdCard.getAttribute('data-testid')) ?? '').replace('assistant-card-', '');
    await createdCard.hover();
    await page.locator(`[data-testid="btn-delete-${createdId}"]`).click();
    const deleteModal = page.locator('.arco-modal').filter({ hasText: name });
    await expect(deleteModal).toBeVisible({ timeout: 5_000 });
    await deleteModal.locator('button', { hasText: /Delete|删除/ }).last().click();
    await expect(page.locator(`[data-testid="assistant-card-${createdId}"]`)).toBeHidden({ timeout: 10_000 });
  });

  test('P0-2: card click opens editor; enabled switch toggles in place without opening editor', async ({ page }) => {
    await openAssistantSettings(page);

    const firstCard = page.locator('[data-testid^="assistant-card-"]').first();
    const firstId = ((await firstCard.getAttribute('data-testid')) ?? '').replace('assistant-card-', '');

    // Card body opens the editor drawer
    await firstCard.click();
    await expect(page.locator(EDITOR)).toBeVisible({ timeout: 5_000 });
    // Close via Cancel (second footer button)
    await page.locator('.arco-drawer-footer button', { hasText: /Cancel|取消/ }).click();
    await expect(page.locator(EDITOR)).toBeHidden({ timeout: 5_000 });

    // Switch toggles in place: editor must stay closed, checked state must flip
    const switchEl = page.locator(`[data-testid="switch-enabled-${firstId}"]`);
    const checkedBefore = await switchEl.getAttribute('aria-checked');
    await switchEl.click();
    await waitForSettle(page);
    await expect(page.locator(EDITOR)).toBeHidden({ timeout: 3_000 });
    // The card moves between Enabled/Disabled sections — re-locate before asserting
    const toggled = page.locator(`[data-testid="switch-enabled-${firstId}"]`);
    await expect(toggled).toHaveAttribute('aria-checked', checkedBefore === 'true' ? 'false' : 'true', {
      timeout: 5_000,
    });
    // Restore original state
    await toggled.click();
    await waitForSettle(page);
  });

  test('P0-3: duplicate builtin assistant opens create-mode editor prefilled', async ({ page }) => {
    await openAssistantSettings(page);

    const builtinCard = page.locator('[data-testid^="assistant-card-builtin-"]').first();
    await expect(builtinCard).toBeVisible({ timeout: 10_000 });
    const builtinId = ((await builtinCard.getAttribute('data-testid')) ?? '').replace('assistant-card-', '');

    await builtinCard.hover();
    await page.locator(`[data-testid="btn-duplicate-${builtinId}"]`).click();
    await expect(page.locator(EDITOR)).toBeVisible({ timeout: 5_000 });

    // Create mode: save button reads Create, name is prefilled (copy of the builtin)
    await expect(page.locator('[data-testid="btn-save-assistant"]')).toContainText(/Create|创建/);
    const nameValue = await page.locator(NAME_INPUT).first().inputValue();
    expect(nameValue.length).toBeGreaterThan(0);

    // Abort creation — no new assistant should be persisted
    await page.locator('.arco-drawer-footer button', { hasText: /Cancel|取消/ }).click();
    await expect(page.locator(EDITOR)).toBeHidden({ timeout: 5_000 });
  });

  test('P0-4: builtin assistant editor opens prefilled in edit mode with delete available', async ({ page }) => {
    await openAssistantSettings(page);

    const builtinCard = page.locator('[data-testid^="assistant-card-builtin-"]').first();
    await builtinCard.click();
    await expect(page.locator(EDITOR)).toBeVisible({ timeout: 5_000 });

    // Edit mode for an existing builtin: name prefilled, save reads Save (not Create)
    const nameValue = await page.locator(NAME_INPUT).first().inputValue();
    expect(nameValue.length).toBeGreaterThan(0);
    await expect(page.locator('[data-testid="btn-save-assistant"]')).toContainText(/Save|保存/);
    // Delete stays available for builtin (hides it from the list, restorable)
    await expect(page.locator('[data-testid="btn-delete-assistant"]')).toBeVisible();

    await page.locator('.arco-drawer-footer button', { hasText: /Cancel|取消/ }).click();
    await expect(page.locator(EDITOR)).toBeHidden({ timeout: 5_000 });
  });
});
