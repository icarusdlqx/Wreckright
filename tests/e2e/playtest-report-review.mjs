import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.BASE_URL ?? 'http://127.0.0.1:5292/';
const shots = process.env.SHOT_DIR ?? 'reports/focused/saves/playtest-report';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await page.goto(`${url}?playtest=1`);
  await page.getByTestId('playtest-consent-enable').click();
  await page.getByTestId('home-campaign').click();
  if (await page.getByTestId('campaign-chooser').isVisible()) {
    await page.getByTestId('campaign-choice-start').click();
  }
  await page.getByTestId('feedback-link').click();
  const dialog = page.getByTestId('playtest-feedback');
  await dialog.getByText('What did you expect?').locator('..').locator('textarea').fill('The weapon should snap into the arm.');
  await dialog.getByText('What actually happened?').locator('..').locator('textarea').fill('The weapon returned to stores.');
  await dialog.getByText('How can we reproduce it?').locator('..').locator('textarea').fill('Open the workshop, drag a weapon, and release it over the arm.');
  await dialog.screenshot({ path: `${shots}/written-bug-report.png` });
  await dialog.locator('.playtest-bug-report').screenshot({ path: `${shots}/bug-report-form.png` });
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('playtest-download').click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let body = '';
  for await (const chunk of stream) body += chunk.toString();
  const report = JSON.parse(body);
  if (report.report.survey.expected !== 'The weapon should snap into the arm.') throw new Error('Expected result was not exported');
  if (!report.report.context?.build || !report.report.context?.faction || !report.report.context?.difficulty) {
    throw new Error('Reproduction context was incomplete');
  }
  if (JSON.stringify(report).match(/battleCode|campaignSeed|userAgent|referrer/)) throw new Error('Private runtime data entered the report');
  console.log('8/8 written playtest report checks passed');
} finally {
  await browser.close();
}
