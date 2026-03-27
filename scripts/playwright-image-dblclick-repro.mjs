import { chromium } from 'playwright';

async function run() {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const sessionId = process.env.E2E_SESSION_ID ?? 'cmmuiseix0007vafj6fdkj9x8';
  const userId = process.env.E2E_USER_ID ?? '';
  const targetUrl = `${baseUrl}/session/${sessionId}?debugImagePicker=1`;

  const browser = await chromium.launch({
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });

  if (userId.trim()) {
    await page.context().addCookies([
      {
        name: 'ai_next_user_id',
        value: userId.trim(),
        url: baseUrl,
      },
    ]);
    console.log('[repro] cookie ai_next_user_id injected');
  }

  page.on('console', message => {
    const type = message.type();
    const text = message.text();
    if (text.includes('[image-picker]')) {
      console.log(`[browser-console:${type}] ${text}`);
    }
  });

  page.on('pageerror', error => {
    console.error('[browser-pageerror]', error.message);
  });

  console.log('[repro] open', targetUrl);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  console.log('[repro] landed-url', page.url());
  await page.waitForTimeout(1500);

  const editorFrameHandle = await page.waitForSelector('iframe.gjs-frame', {
    state: 'attached',
    timeout: 60000,
  });
  const editorFrame = await editorFrameHandle.contentFrame();
  if (!editorFrame) {
    throw new Error('Could not resolve grapesjs frame');
  }

  const imageLocator = editorFrame.locator('img').first();
  await imageLocator.waitFor({ state: 'visible', timeout: 60000 });
  const box = await imageLocator.boundingBox();
  console.log('[repro] image-box', box);

  const modal = page.locator('div[role="dialog"][aria-label="Select image"]');

  const checkModal = async label => {
    const visible = await modal.isVisible().catch(() => false);
    const count = await modal.count().catch(() => 0);
    console.log(`[repro] modal-count-${label}`, count);
    console.log(`[repro] modal-visible-${label}`, visible);
    return visible;
  };

  await imageLocator.click();
  await page.waitForTimeout(150);
  await checkModal('after-single-click');

  await imageLocator.dblclick();
  await page.waitForTimeout(300);
  const openedAfterDouble = await checkModal('after-double-click');

  if (!openedAfterDouble) {
    await imageLocator.click();
    await page.waitForTimeout(300);
    await checkModal('after-third-click');
  }

  if (box) {
    if (await modal.isVisible().catch(() => false)) {
      const closeButton = page.getByRole('button', { name: 'Close image picker' });
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
        await page.waitForTimeout(200);
      }
    }

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(120);
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(350);
    await checkModal('after-page-mouse-dblclick');

    if (await modal.isVisible().catch(() => false)) {
      const closeButton = page.getByRole('button', { name: 'Close image picker' });
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
        await page.waitForTimeout(200);
      }
    }

    const overlayEdgeX = box.x + box.width + 4;
    const overlayEdgeY = box.y + 8;
    await page.mouse.click(overlayEdgeX, overlayEdgeY);
    await page.waitForTimeout(120);
    await page.mouse.dblclick(overlayEdgeX, overlayEdgeY);
    await page.waitForTimeout(350);
    await checkModal('after-overlay-edge-dblclick');
  }

  await page.screenshot({
    path: '.tmp-playwright-image-dblclick-repro.png',
    fullPage: true,
  });
  console.log('[repro] screenshot .tmp-playwright-image-dblclick-repro.png');

  await browser.close();
}

run().catch(error => {
  console.error('[repro] failed', error);
  process.exitCode = 1;
});
