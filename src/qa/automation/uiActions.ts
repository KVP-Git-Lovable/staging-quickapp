/**
 * QA-only UI automation primitives.
 *
 * IMPORTANT — Scope and limitations:
 * This engine runs inside the same WebView as the app. It drives the
 * React/DOM layer by dispatching real DOM events on elements located
 * via `data-testid`. It DOES detect: missing/disabled buttons, broken
 * handlers, forms that fail to submit, broken navigation, and bad DB
 * writes. It does NOT detect: native rendering defects, native
 * permission prompts (camera/GPS/files), or WebView-only bugs below
 * the DOM. Flows that require native capabilities should be surfaced
 * as `Manual step required` rather than faked here.
 *
 * This file is QA-build-only and MUST NOT be imported from any
 * production code path.
 */

export interface UIStepOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

const DEFAULT_TIMEOUT = 8000;
const DEFAULT_POLL = 100;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  // offsetParent is null for display:none and for elements with position:fixed
  // in some browsers; rect check is a fallback.
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export async function waitForElement(
  testId: string,
  opts: UIStepOptions = {},
): Promise<HTMLElement> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const interval = opts.pollIntervalMs ?? DEFAULT_POLL;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    if (el && isVisible(el)) return el;
    await sleep(interval);
  }
  throw new Error(`Element not found within ${timeout}ms: [data-testid="${testId}"]`);
}

async function clickElement(el: HTMLElement): Promise<void> {
  el.scrollIntoView({ block: 'center' });
  await sleep(50);
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.click();
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
}

export async function tap(testId: string, opts?: UIStepOptions): Promise<void> {
  const el = await waitForElement(testId, opts);
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
    throw new Error(`Element is disabled, cannot tap: ${testId}`);
  }
  await clickElement(el);
}

/**
 * Types into an <input> or <textarea> using the native value setter so
 * React's controlled-component listeners fire correctly.
 */
export async function typeText(
  testId: string,
  value: string,
  opts?: UIStepOptions,
): Promise<void> {
  const el = (await waitForElement(testId, opts)) as HTMLInputElement | HTMLTextAreaElement;
  const proto =
    el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  nativeSetter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function waitForElementByText(
  text: string,
  opts?: UIStepOptions,
): Promise<HTMLElement> {
  const timeout = opts?.timeoutMs ?? DEFAULT_TIMEOUT;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="option"], [role="menuitem"], li, button, div',
      ),
    );
    const match = candidates.find(
      (el) => el.textContent?.trim() === text && isVisible(el),
    );
    if (match) return match;
    await sleep(DEFAULT_POLL);
  }
  throw new Error(`No element found with text: ${text}`);
}

/**
 * Selects an option from either a native <select> or a custom dropdown
 * (e.g. shadcn/ui Select) by opening it and clicking the matching option.
 */
export async function selectOption(
  testId: string,
  optionLabel: string,
  opts?: UIStepOptions,
): Promise<void> {
  const el = await waitForElement(testId, opts);
  if (el.tagName === 'SELECT') {
    const select = el as HTMLSelectElement;
    const option = Array.from(select.options).find(
      (o) => o.textContent?.trim() === optionLabel,
    );
    if (!option) throw new Error(`Option "${optionLabel}" not found in select ${testId}`);
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    )?.set;
    nativeSetter?.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  await clickElement(el);
  const optionEl = await waitForElementByText(optionLabel, opts);
  await clickElement(optionEl);
}

/**
 * Returns true if any element on the page contains the given text
 * within the timeout. Used to confirm success toasts/banners.
 */
export async function waitForText(
  text: string,
  opts?: UIStepOptions,
): Promise<boolean> {
  const timeout = opts?.timeoutMs ?? DEFAULT_TIMEOUT;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (document.body.textContent?.includes(text)) return true;
    await sleep(DEFAULT_POLL);
  }
  return false;
}

/**
 * Opens a shadcn/ui Select (or native <select>) and picks a random
 * enabled option. Used when the QA action doesn't care which value
 * is chosen, only that the field is populated.
 */
export async function randomSelectOption(
  testId: string,
  opts?: UIStepOptions,
): Promise<string> {
  const el = await waitForElement(testId, opts);
  if (el.tagName === 'SELECT') {
    const select = el as HTMLSelectElement;
    const usable = Array.from(select.options).filter(
      (o) => !o.disabled && o.value && !o.value.startsWith('header-'),
    );
    if (!usable.length) throw new Error(`No enabled options in select ${testId}`);
    const pick = usable[Math.floor(Math.random() * usable.length)];
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    )?.set;
    nativeSetter?.call(select, pick.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return pick.textContent?.trim() ?? pick.value;
  }
  await clickElement(el);
  const start = Date.now();
  const timeout = opts?.timeoutMs ?? DEFAULT_TIMEOUT;
  let options: HTMLElement[] = [];
  while (Date.now() - start < timeout) {
    options = Array.from(
      document.querySelectorAll<HTMLElement>('[role="option"]'),
    ).filter((o) => {
      if (!isVisible(o)) return false;
      if (o.getAttribute('aria-disabled') === 'true') return false;
      if (o.getAttribute('data-disabled') != null) return false;
      const t = (o.textContent ?? '').trim().toLowerCase();
      if (!t) return false;
      if (t.includes('no beats available')) return false;
      if (t.startsWith('distributors for this beat')) return false;
      if (t.startsWith('all distributors')) return false;
      return true;
    });
    if (options.length) break;
    await sleep(DEFAULT_POLL);
  }
  if (!options.length) throw new Error(`No selectable options in dropdown ${testId}`);
  const pick = options[Math.floor(Math.random() * options.length)];
  const label = pick.textContent?.trim() ?? '';
  await clickElement(pick);
  return label;
}

/**
 * QA-only: patches navigator.geolocation.getCurrentPosition so any
 * caller receives the given coordinates synchronously via the success
 * callback. Returns a restore function. No-op outside QA builds.
 */
export function stubGeolocation(
  lat: number,
  lng: number,
  accuracy = 10,
): () => void {
  if (import.meta.env.VITE_APP_MODE !== 'qa') return () => {};
  const geo = navigator.geolocation as any;
  if (!geo) return () => {};
  const originalGet = geo.getCurrentPosition?.bind(geo);
  const originalWatch = geo.watchPosition?.bind(geo);
  const fakePos = {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  };
  geo.getCurrentPosition = (success: any) => {
    try { success(fakePos); } catch { /* ignore */ }
  };
  geo.watchPosition = (success: any) => {
    try { success(fakePos); } catch { /* ignore */ }
    return 0;
  };
  return () => {
    if (originalGet) geo.getCurrentPosition = originalGet;
    if (originalWatch) geo.watchPosition = originalWatch;
  };
}
