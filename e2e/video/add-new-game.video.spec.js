// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Screencast of docs/guides/add-new-game.md.
 *
 * Every step of the written guide is replayed in order, with an on-screen
 * caption so the recording can be watched without the guide open.
 * Requires a running app (default http://localhost:9000) and an Owner account.
 */

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'dneprokos@gmail.com';
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'Test12345@';

const GAME = {
  name: "Kirby's Adventure",
  genre: 'Platformer',
  releaseDate: '1993-05-01',
  platform: 'NES',
  hasMultiplayer: true,
  rating: '8.9',
  imageUrl: 'https://upload.wikimedia.org/wikipedia/en/9/9e/KirbysAdventure_box.jpg',
  description:
    "Kirby's first NES platformer. Inhale enemies, copy their powers, and restore the Star Rod to Dream Land.",
};

/** Pacing (ms) so a human can follow the recording. */
const BEAT = 900;

/**
 * Draw or update the caption banner on the current page.
 * Re-applied after every navigation because it lives in the DOM.
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 * @param {string} body
 */
async function caption(page, title, body) {
  await page.evaluate(
    ({ title, body }) => {
      let el = document.getElementById('guide-caption');
      if (!el) {
        el = document.createElement('div');
        el.id = 'guide-caption';
        el.style.cssText = [
          'position:fixed',
          'left:0',
          'right:0',
          'bottom:0',
          'z-index:2147483647',
          'padding:14px 24px',
          'background:rgba(10,10,20,0.92)',
          'border-top:2px solid #ff2e88',
          'color:#f5f5ff',
          'font-family:Consolas,Menlo,monospace',
          'pointer-events:none',
        ].join(';');
        document.body.appendChild(el);
      }
      el.innerHTML =
        '<div style="color:#ff2e88;font-weight:700;font-size:17px">' + title + '</div>' +
        '<div style="font-size:15px;margin-top:4px;opacity:.9">' + body + '</div>';
    },
    { title, body }
  );
  await page.waitForTimeout(BEAT);
}

/**
 * Remove any previous copy of the demo game so the walkthrough starts clean
 * (game names must be unique).
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} baseURL
 */
async function deleteExistingGame(request, baseURL) {
  const login = await request.post(`${baseURL}/api/auth/login`, {
    data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  expect(login.ok(), 'owner login for cleanup').toBeTruthy();
  const { token } = await login.json();

  const list = await request.get(`${baseURL}/api/games?limit=200`);
  const body = await list.json();
  const games = body.games || body;
  for (const game of games.filter((g) => g.name === GAME.name)) {
    await request.delete(`${baseURL}/api/games/${game._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

test('How to add a new game - guide walkthrough', async ({ page, request, baseURL }) => {
  await deleteExistingGame(request, baseURL);

  // Step 1 - Open the portal as a guest
  await page.goto('/');
  await expect(page.locator('nav').first()).toBeVisible();
  await caption(
    page,
    'Step 1 - Open the portal',
    'As a guest you can browse, search and filter. The navigation only offers Games and Login.'
  );
  await page.waitForTimeout(BEAT * 2);

  // Step 2 - Go to the Login page
  await page.getByRole('link', { name: /login/i }).first().click();
  await page.waitForURL('**/login');
  await caption(page, 'Step 2 - Open the Login page', 'Click Login in the top-right navigation.');
  await page.waitForTimeout(BEAT);

  // Step 3 - Sign in with an Admin/Owner account
  await caption(
    page,
    'Step 3 - Sign in as Admin or Owner',
    'Only Admin and Owner accounts may add games.'
  );
  await page.getByTestId('email-input').pressSequentially(OWNER_EMAIL, { delay: 45 });
  await page.getByTestId('password-input').pressSequentially(OWNER_PASSWORD, { delay: 45 });
  await page.waitForTimeout(BEAT);
  await page.getByTestId('login-button').click();

  await page.waitForURL((url) => !url.pathname.includes('/login'));
  await expect(page.getByRole('link', { name: /^admin$/i })).toBeVisible();
  await caption(page, 'Signed in', 'The navigation now shows Admin, Owner, your email and Logout.');
  await page.waitForTimeout(BEAT);

  // Step 4 - Open the Admin Panel
  await page.getByRole('link', { name: /^admin$/i }).click();
  await page.waitForURL('**/admin');
  await expect(page.getByRole('heading', { name: /admin panel/i })).toBeVisible();
  await caption(
    page,
    'Step 4 - Open the Admin Panel',
    'Every game is listed in a management table with Edit / Delete actions.'
  );
  await page.waitForTimeout(BEAT * 2);

  // Step 5 - Open the "Add Game" form
  await page.getByRole('button', { name: /add game/i }).first().click();
  await expect(page.getByRole('heading', { name: /add new game/i })).toBeVisible();
  await caption(
    page,
    'Step 5 - Open the Add Game form',
    'Fields marked with * are required: Name, Genre, Release Date, Platforms, Multiplayer.'
  );
  await page.waitForTimeout(BEAT);

  // Step 6 - Fill in the game details
  const form = page.locator('form');

  await caption(page, 'Step 6 - Fill in the details', 'Game Name must be unique, minimum 2 characters.');
  await form.locator('input[name="name"]').pressSequentially(GAME.name, { delay: 45 });

  await caption(page, 'Step 6 - Fill in the details', 'Pick a Genre from the dropdown.');
  await form.locator('select[name="genre"]').selectOption(GAME.genre);

  await caption(page, 'Step 6 - Fill in the details', 'Release Date cannot be in the future.');
  await form.locator('input[name="releaseDate"]').fill(GAME.releaseDate);

  await caption(page, 'Step 6 - Fill in the details', 'Tick at least one platform.');
  await form
    .locator('label')
    .filter({ hasText: new RegExp(`^${GAME.platform}$`) })
    .locator('input[type="checkbox"]')
    .check();

  await caption(page, 'Step 6 - Fill in the details', 'Choose multiplayer support: Yes or No.');
  await form.locator(`input[name="hasMultiplayer"][value="${GAME.hasMultiplayer}"]`).check();

  await caption(page, 'Step 6 - Optional fields', 'Rating, Image URL and Description are optional.');
  await form.locator('input[name="rating"]').pressSequentially(GAME.rating, { delay: 60 });
  await form.locator('input[name="imageUrl"]').fill(GAME.imageUrl);
  await form.locator('textarea[name="description"]').pressSequentially(GAME.description, { delay: 12 });
  await page.waitForTimeout(BEAT);

  // Step 7 - Submit
  await caption(
    page,
    'Step 7 - Submit',
    'Click Add Game. Duplicate names and future release dates are rejected.'
  );
  await form.getByRole('button', { name: /^add game$/i }).click();

  const row = page.locator('#games-list tr', { hasText: GAME.name });
  await expect(row).toBeVisible({ timeout: 20000 });
  await row.scrollIntoViewIfNeeded();
  await caption(
    page,
    'Step 7 - Submitted',
    'The form closes and the new game appears in the management table.'
  );
  await page.waitForTimeout(BEAT * 2);

  // Step 8 - Verify the game
  await row.getByRole('link', { name: GAME.name }).click();
  await page.waitForURL('**/game/**');
  await expect(page.getByText(GAME.name).first()).toBeVisible();
  await caption(
    page,
    'Step 8 - Verify the game',
    'Open the detail page and confirm genre, platform, year, rating and description.'
  );
  await page.waitForTimeout(BEAT * 3);

  await caption(page, 'Done', 'The game is live in the catalog and visible to every visitor.');
  await page.waitForTimeout(BEAT * 2);
});
