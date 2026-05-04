# Overnight QA Playwright Suite

Converted from `COMPUTER_USE_OVERNIGHT_QA.md` sections B–M into deterministic
Playwright tests. ~150 user stories across 11 spec files.

## Run

```sh
# Full suite (~30-60 min)
cd frontend
npx playwright test -c playwright.overnight.config.ts

# Single section
npx playwright test -c playwright.overnight.config.ts --grep "Section D"

# Single story
npx playwright test -c playwright.overnight.config.ts --grep "D.1 register"

# View HTML report after a run
npx playwright show-report playwright-overnight-report
```

## Sections

| Spec file | Section | Coverage | Stories |
|---|---|---|---:|
| `B-public.spec.ts` | Public pages, logged-out | navigation, footer, static pages, protected-route redirects, console sentinel | 15 |
| `C-jobs-search.spec.ts` | Job listing + search | listing, debounced search, filters, detail nav, pagination | 15 |
| `D-auth.spec.ts` | Auth flows | UI registration with code capture, login, forgot/reset, change-password, F-21 fix verification | 15 |
| `E-jobseeker-profile.spec.ts` | Profile build | profile sections, work-experience CRUD, education CRUD, skills, GDPR export | 25 |
| `F-jobseeker-apply.spec.ts` | Apply + manage | save jobs, apply, withdraw, reapply, edge cases | 15 |
| `G-employer-post.spec.ts` | Post job (4-step wizard) | wizard steps, custom industry, validation, edit, close, F-22 fix | 19 |
| `H-employer-applicants.spec.ts` | Applicant management | view applicants, message types, status state machine | 15 |
| `I-admin.spec.ts` | Admin moderation | dashboard, suspend/ban/delete, jobs moderation, F-23 fix, escalation race (F-8), bulk notifications, configuration | 25 |
| `J-notifications.spec.ts` | Notifications | list, mark read, mark-all-read | 5 |
| `K-edge-cases.spec.ts` | Edge cases | NoSQL injection, XSS, oversize, empty body, special chars, spam-click | 15 |
| `L-visual-a11y.spec.ts` | Visual + a11y | lang attr, alt text, headings, focus, labels, viewport meta | 13 |
| `M-responsive.spec.ts` | Responsive | iPhone 14 Pro, Pixel 7, iPhone SE, iPad Pro — no horizontal scroll | 6 |

**Total: ~165 tests across 12 spec files.**

## Infrastructure

- **Backend:** spawned via `e2e/real-backend/start-test-server.mjs` (in-memory MongoDB replSet). Disables Redis, Cloudinary, OpenAI, real Sentry. Routes auth flows + side-channel access.
- **Frontend:** Vite dev on `:5174` with `VITE_API_URL=http://localhost:3001/api`.
- **Verification codes:** captured from launcher stdout; read via side-channel.

## Findings produced

The `html` reporter generates `playwright-overnight-report/index.html`. Each
test that fails has:
- screenshot at failure point
- video of the test run
- Playwright trace (replay step-by-step)

Test results JSON: `test-results/overnight-results.json`.

## What this suite does NOT cover

(Same gaps as Phase 22 — these need a real human or Computer Use)
- Real Apple Mail.app / Gmail / Outlook email rendering
- Real iPhone in your hand
- Native VoiceOver screen reader experience
- Animation smoothness / UX feel judgment
- Real Cloudinary uploads (mocked)
- Real Resend email delivery to inbox (diverted)
- Real OpenAI quality (key not provisioned in test launcher)
- Real Twilio SMS (mocked)

For those, see `MANUAL_QA_GUIDE.md` Section 12 and `COMPUTER_USE_HANDOFF.md`.
