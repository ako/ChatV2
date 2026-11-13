// Narrated walkthrough of ServiceDesk Copilot's chat answers: cards, delivery
// charts, product outlines with clickable references, and the staff product
// graph outline. Stage 2 of the record-narrated-demo skill: it EXPLAINS, it
// does not gate anything. Beats are asserted only so a dead take is noticed.
//
// Run from a scratch directory (it writes capture/ there):
//   node /home/user/ChatV2/demo/narrated-walkthrough.js
// then cut with the skill's cut-clips.js and demo/clips.json.
const path = require('path');
const { chromium } = require('playwright');
const SKILL = path.join(__dirname, '..', '.claude', 'skills', 'record-narrated-demo');
const { openTake } = require(path.join(SKILL, 'take.js'));
const N = require(path.join(SKILL, 'narrate.js'));

const ZOOM = 1.25;
const URL = process.env.APP_URL || 'http://127.0.0.1:8080/';
// The caption plate owns the bottom 17% of the frame, so the app is laid out in
// the 896 video px above it (896 / zoom CSS px). The chat pane's own heights
// come from the theme's 100vh rules, which would run under the plate.
const FIT = `#root{height:${Math.floor(896 / ZOOM)}px !important;min-height:0 !important;overflow:hidden}
.chat-history-page .chat-history-pane{height:${Math.floor(896 / ZOOM) - 76}px !important;min-height:0 !important}
.chat-history-page .chat-history-list{max-height:${Math.floor(896 / ZOOM) - 156}px !important}`;

async function main() {
  const browser = await chromium.launch();
  const take = await openTake(browser, { url: URL + 'login.html', zoom: ZOOM, minGap: 600 });
  const { page } = take;
  N.configure({ zoom: ZOOM, font: "'IBM Plex Sans'" });

  const settle = async () => { await take.applyZoom(); await page.addStyleTag({ content: FIT }); await N.install(page); };
  const login = async (user, password) => {
    await page.fill('#usernameInput', user); await page.fill('#passwordInput', password);
    await page.click('#loginButton'); await page.waitForTimeout(4500); await settle();
  };
  const openAssistant = async () => {
    await page.getByText('Assistant', { exact: true }).first().click(); await page.waitForTimeout(5000);
    await settle();
  };
  const answers = () => page.locator('.crt-root');
  // Ask, then wait until the newest answer has rendered and stopped changing.
  const ask = async (id, question) => {
    const before = await answers().count();
    await N.typeSlowly(page, 'textarea', question, 45);
    await page.locator('textarea').first().press('Enter');
    take.mark(`${id}:sent`);
    let last = '', stable = 0;
    for (let i = 0; i < 60 && stable < 3; i++) {
      await page.waitForTimeout(2000);
      const n = await answers().count();
      if (n <= before) continue;
      const txt = await answers().nth(n - 1).innerText();
      stable = txt === last && txt.length > 0 && !/Preparing a card/.test(txt) ? stable + 1 : 0;
      last = txt;
    }
    // The chat does not follow a long answer, so bring the answer's first card
    // to the top of the message list the way a reader would scroll to it.
    const answer = answers().nth((await answers().count()) - 1);
    await answer.locator('.crt-card').first().evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' })).catch(() => {});
    await page.waitForTimeout(1200);
    take.mark(`${id}:answered`);
    return answer;
  };

  await take.goto();
  await settle();
  await login('demo_customer', 'DemoCustomer1!');
  await openAssistant();
  await page.getByRole('button', { name: 'New chat' }).click(); await page.waitForTimeout(3000); await settle();

  take.mark('intro');
  await N.say(page, 'Ada buys bikes and parts from an online shop. Today she has questions about her deliveries.', '1 / 6');

  take.mark('q1');
  await N.say(page, 'First: where is her latest order?', '2 / 6', { holdMs: 1800 });
  const a1 = await ask('q1', 'Where is my order SO-10002?');
  await take.assertBeat('parcel card', async () => (await a1.locator('.crt-card .crt-timeline li').count()) >= 2, 'the answer should be a card with a tracking timeline');
  await N.say(page, 'The answer is a card, not a wall of text: status, carrier and every tracking scan.', '2 / 6', { holdMs: 5000 });

  take.mark('q2');
  await N.say(page, 'How long do her deliveries usually take?', '3 / 6', { holdMs: 1800 });
  const a2 = await ask('q2', 'On average, how long did my orders take to deliver?');
  await take.assertBeat('carrier chart', async () => (await a2.locator('.crt-chart-bars .crt-bar-row').count()) >= 2, 'the answer should be a bar chart per carrier');
  await N.say(page, 'The assistant charts her own delivery history, carrier by carrier, from figures the shop computed.', '3 / 6', { holdMs: 5500 });

  take.mark('q3');
  await N.say(page, 'And where does the time go?', '4 / 6', { holdMs: 1800 });
  const a3 = await ask('q3', 'Where is most time spent delivering my parcels?');
  await take.assertBeat('stacked chart', async () => (await a3.locator('.crt-chart-stacked .crt-legend li').count()) >= 3, 'the answer should split delivery time into stages');
  await N.point(page, '.crt-chart-stacked');
  await N.say(page, 'Each delivery splits into stages. The largest share is highlighted, and the note names the slowest hub.', '4 / 6', { holdMs: 6000 });
  await N.unpoint(page);

  take.mark('q4');
  await N.say(page, 'Now a product question.', '5 / 6', { holdMs: 1600 });
  const a4 = await ask('q4', 'Give me an overview of the EB-200');
  await take.assertBeat('product outline', async () => (await a4.locator('.crt-outline').count()) === 1 && (await a4.locator('button.crt-ref').count()) >= 5, 'the answer should be an outline with references');
  await N.say(page, 'An outline of the bike: what ships with it, what fits it, and any recall.', '5 / 6', { holdMs: 4500 });
  const supplier = a4.locator('.crt-field button.crt-ref').first();
  await supplier.scrollIntoViewIfNeeded(); await N.point(page, '.crt-root:last-of-type .crt-field button.crt-ref');
  await page.waitForTimeout(900); await supplier.click(); await page.waitForTimeout(1800); await N.unpoint(page);
  take.mark('ref1');
  await take.assertBeat('supplier details', async () => /SUPPLIER/i.test(await a4.locator('.crt-ref-panel').first().innerText()), 'the supplier reference should open its details');
  await N.say(page, 'Every underlined name opens its details, live from the product catalogue.', '5 / 6', { holdMs: 4500 });
  const recall = a4.locator('.crt-outline button.crt-ref').filter({ hasText: /REC-/ }).first();
  await recall.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await page.waitForTimeout(1200);
  await recall.click(); await page.waitForTimeout(2000);
  await recall.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' })); await page.waitForTimeout(1000);
  take.mark('ref2');
  await take.assertBeat('recall details', async () => /RECALL/i.test(await a4.locator('.crt-outline .crt-ref-panel').first().innerText()), 'the recall reference should open its advice');
  await N.say(page, 'Including what a recall means for her, and what to do about it.', '5 / 6', { holdMs: 4500 });

  take.mark('switch');
  await page.evaluate(() => mx.logout()).catch(() => {}); await page.waitForTimeout(3000);
  await page.goto(URL + 'login.html', { waitUntil: 'networkidle' }); await settle();
  await login('demo_agent', 'DemoAgent1234!');
  await page.locator('.mx-navigationtree a, nav a').filter({ hasText: 'Product graph' }).first().click().catch(async () => { await page.getByText('Product graph').first().click(); });
  await page.waitForTimeout(4500); await settle();
  take.mark('graph');
  await N.say(page, 'Sam, on the support team, browses the same catalogue as an outline.', '6 / 6', { holdMs: 3500 });
  await page.getByText(/^Part \(/).first().click(); await page.waitForTimeout(2000);
  await page.getByText(/BAT-418 · Battery 418 Wh/).first().click(); await page.waitForTimeout(2000);
  await take.assertBeat('graph outline', async () => (await page.getByText(/supplied by: CellPower/).count()) >= 1, 'the battery should show its facts');
  take.mark('graph:open');
  await N.say(page, 'Every fact links both ways: who supplies a part, what it fits, which orders contain it.', '6 / 6', { holdMs: 5500 });
  take.mark('outro');
  await N.say(page, 'Answers in cards, charts and outlines, grounded in the shop\'s own data.', '', { holdMs: 4000 });

  await page.evaluate(() => mx.logout()).catch(() => {});
  await take.finish();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
