const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    console.log('Page loaded.');
    
    // Wait a bit for everything to settle
    await page.waitForTimeout(2000);

    // Screenshot
    await page.screenshot({ path: 'babylon_editor_fix.png' });
    console.log('Screenshot saved to babylon_editor_fix.png');
  } catch (error) {
    console.error('Error capturing screenshot:', error);
  } finally {
    await browser.close();
  }
})();