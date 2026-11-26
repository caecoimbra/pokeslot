import assert from 'node:assert/strict';

// Deterministic browser rounds. Record the real animation and audio calls before playback.
export async function checkArcadeFeedback(browser, origin) {
  const page = await browser.newPage({ viewport: { width: 320, height: 720 } });
  const miss = [['pokeball', 'spin', 'voucher'], ['spin', 'voucher', 'pokeball'], ['pokeball', 'voucher', 'spin']];
  const win = [miss[0], ['spin', 'spin', 'spin'], miss[2]];
  let grid = miss;
  let fail = false;
  try {
    await page.addInitScript(() => {
      const feedback = window.feedback = { notes: [], durations: [] };
      const create = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const oscillator = create.call(this);
        const notes = [];
        feedback.notes.push(notes);
        const set = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
        oscillator.frequency.setValueAtTime = (pitch, time) => { notes.push(pitch); return set(pitch, time); };
        return oscillator;
      };
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        if (this.matches('.reel-track')) feedback.durations.push(options.duration);
        return animate.call(this, frames, options);
      };
    });
    await page.route('**/api/demo-round', route => fail ? route.fulfill({ status: 503 }) : route.fulfill({
      json: { status: 'ok', grid, winningLines: grid === win ? [{ line: 'middle', symbol: 'spin' }] : [], captures: [] },
    }));
    await page.goto(origin + '/previa-maquina.html');
    const spin = page.locator('#spin');
    const sound = page.locator('#sound-toggle');
    const play = async () => {
      await spin.press('Enter');
      await page.waitForFunction(() => !document.querySelector('#spin').disabled);
    };
    assert.deepEqual(await page.evaluate(() => window.feedback.notes), []);
    await page.waitForFunction(() => !document.querySelector('#spin').disabled);
    await spin.press('Enter');
    await page.waitForSelector('.is-stopping');
    // A language change renders again after the server replies, while the reels still move.
    await page.evaluate(() => document.querySelector('#language').click());
    assert.equal(await page.locator('#status').textContent(), 'Round in progress');
    await page.evaluate(() => document.querySelector('#language').click());
    await page.waitForFunction(() => !document.querySelector('#spin').disabled);
    const first = await page.evaluate(() => window.feedback);
    assert.equal(first.notes.length, 2);
    assert.ok(first.notes[1][0] > first.notes[1].at(-1), 'Descending no-win cue');
    assert.equal(first.durations.length, 3);
    assert.ok(first.durations[0] < first.durations[1] && first.durations[1] < first.durations[2]);
    assert.ok(first.durations[2] < 850, 'Final reel settles in under 850ms after braking begins');
    assert.equal(await spin.evaluate(button => button === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    grid = win;
    await play();
    const second = await page.evaluate(() => window.feedback);
    assert.deepEqual(second.durations, first.durations, 'Reduced motion skips animated stops');
    assert.equal(second.notes.length, 4);
    assert.ok(second.notes[3][0] < second.notes[3].at(-1), 'Ascending reward cue');
    assert.equal(await page.locator('.reel-paylines .lane-won').count(), 1);
    const columns = await page.locator('.reel-track').evaluateAll(tracks => tracks.map(track =>
      Array.from(track.querySelectorAll('.reel-icon'), icon => icon.classList[1].slice('icon-'.length))));
    assert.deepEqual(columns, [0, 1, 2].map(c => win.map(row => row[c])));
    await page.locator('#capture-dialog-close').click();
    fail = true;
    await play();
    assert.equal(await page.evaluate(() => window.feedback.notes.length), 5, 'Failure has no outcome cue');
    await sound.click();
    await page.reload();
    await sound.waitFor();
    assert.equal(await sound.getAttribute('aria-pressed'), 'false');
    await page.waitForFunction(() => !document.querySelector('#spin').disabled);
    fail = false;
    await play();
    assert.deepEqual(await page.evaluate(() => window.feedback.notes), [], 'Mute survives reload');
    await page.locator('#capture-dialog-close').click();
    await sound.click();
    let release;
    const heldResponse = new Promise(resolve => { release = resolve; });
    await page.route('**/api/demo-round', async route => { await heldResponse; await route.fallback(); });
    await spin.press('Enter');
    await page.waitForFunction(() => window.feedback.notes.length >= 2);
    await page.locator('[data-screen-link=pokedex]').click();
    await page.locator('[data-screen=pokedex]').waitFor();
    release();
    await page.waitForFunction(() => !document.querySelector('#spin').disabled);
    const longRound = await page.evaluate(() => window.feedback.notes);
    assert.ok(longRound.every(notes => notes.length === longRound[0].length), 'Leaving the machine suppresses its result cue');
  } finally { await page.close(); }
}
