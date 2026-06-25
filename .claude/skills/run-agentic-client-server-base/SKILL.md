---
name: run-agentic-client-server-base
description: run, start, launch, screenshot, drive, test the multiplayer-base web app and API server; browser automation; e2e smoke test
---

Full-stack Nx monorepo: React SPA on :4200, Express API on :3000, MongoDB + Redis required. Browser automation uses WebdriverIO (already configured in `apps/web-e2e/`) with the smoke spec at `apps/web-e2e/src/specs/smoke.spec.ts`.

## Prerequisites

- MongoDB and Redis must be running locally (the app will fail to connect otherwise)
- System Chrome must be installed — checked with `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --version`
- pnpm installed

## Start servers

```bash
npm run restart:both
```

Waits until both `:3000` (API) and `:4200` (web) are responding before returning (~5s). Always use this — it kills any old process first.

## Chromedriver setup (one-time, version must match system Chrome)

The npm-bundled chromedriver binary is missing on this machine. Download one that matches system Chrome:

```bash
# Get Chrome version first
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --version
# → e.g. "Google Chrome 133.0.6943.100"

# Download matching chromedriver (adjust version string to match)
curl -sL "https://storage.googleapis.com/chrome-for-testing-public/133.0.6943.141/mac-x64/chromedriver-mac-x64.zip" \
  -o /tmp/chromedriver.zip
unzip -q /tmp/chromedriver.zip -d /tmp/
chmod +x /tmp/chromedriver-mac-x64/chromedriver
/tmp/chromedriver-mac-x64/chromedriver --version   # verify

# Symlink to where wdio-chromedriver-service expects it
mkdir -p node_modules/.pnpm/chromedriver@125.0.3/node_modules/chromedriver/lib/chromedriver
ln -sf /tmp/chromedriver-mac-x64/chromedriver \
  node_modules/.pnpm/chromedriver@125.0.3/node_modules/chromedriver/lib/chromedriver/chromedriver
```

## Missing packages (one-time install)

These packages are referenced in `apps/web-e2e/tsconfig.json` but were not installed:

```bash
pnpm add -D @wdio/types@8 @wdio/globals@8 @types/mocha -w
```

`apps/web-e2e/tsconfig.json` must include `"mocha"` in the `types` array:

```json
"types": ["node", "@wdio/globals/types", "expect-webdriverio", "mocha"]
```

## Run (agent path) — smoke test

```bash
npx wdio run apps/web-e2e/wdio.conf.ts --spec apps/web-e2e/src/specs/smoke.spec.ts
```

Runs 3 tests in headless Chrome (~15s):
1. Register a fresh user → waits for redirect to `/dashboard`
2. Clear localStorage → log in again → waits for `/dashboard`
3. Navigate to `/dashboard/user` → waits for tabs to appear

Screenshots land in `.claude/skills/run-agentic-client-server-base/screenshots/`.

Expected output:
```
[chrome 133.x mac #0-0] agentic-client-server-base smoke
[chrome 133.x mac #0-0]    ✓ lands on dashboard after register
[chrome 133.x mac #0-0]    ✓ can logout and log back in
[chrome 133.x mac #0-0]    ✓ user dashboard loads with tabs
[chrome 133.x mac #0-0]
[chrome 133.x mac #0-0] 3 passing (10s)
```

To run all existing e2e specs (login + register + smoke):
```bash
npx wdio run apps/web-e2e/wdio.conf.ts
```

## Run (human path)

```bash
npm run restart:both     # start servers
open http://localhost:4200
```

Register an account, navigate to `/dashboard/user` to see the full dashboard with SmartTabs.

## Gotchas

- **Chromedriver binary is missing from the npm package.** The `chromedriver@125` npm package downloaded an empty/wrong binary on this machine. The symlink workaround above is required every time the node_modules are wiped. The actual Chrome version on this Mac is 133, so the chromedriver must also be 133.
- **wdio-chromedriver-service ignores PATH.** Setting `PATH="/tmp/chromedriver-mac-x64:$PATH"` does nothing — the service hardcodes the npm package path. The symlink is the only reliable fix.
- **`@wdio/globals`, `@wdio/types`, `@types/mocha` not in package.json.** The tsconfig references them but they were never installed. wdio type errors will appear until these are added. The `autoCompileOpts.transpileOnly: true` in `wdio.conf.ts` does NOT suppress these errors in the worker process — installing the packages is required.
- **`apps/web-e2e/src/specs/**/*.spec.ts` pattern warning.** When passing `--spec` to override, wdio always prints a WARN that the default glob didn't match. This is harmless — the override spec still runs.
- **Register form has no `name` field.** Only `#email`, `#password`, `#confirmPassword`. The existing `register.spec.ts` uses page objects; always check the RegisterPage source before writing selectors.
- **Screenshot timing.** Taking a screenshot immediately after `waitUntil` for a URL change can catch the old page if the new page is still rendering. Add a short `browser.pause(500)` or wait for a DOM element if the screenshot content matters.

## Troubleshooting

| Error | Fix |
|---|---|
| `Couldn't start Chromedriver: timeout` | Download matching chromedriver and symlink (see Chromedriver setup above) |
| `Cannot find name 'browser'` | `pnpm add -D @wdio/globals@8 -w` |
| `Cannot find name 'describe'` | `pnpm add -D @types/mocha -w` + add `"mocha"` to tsconfig types |
| `Cannot find module '@wdio/types'` | `pnpm add -D @wdio/types@8 -w` |
| `SyntaxError: Cannot use import statement outside a module` | ts-node not transpiling — remove `@ts-nocheck`, ensure packages above are installed |
| API returns 404 on login | MongoDB not running or no user registered yet — `npm run restart:api` and register first |
