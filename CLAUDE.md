!!!!ALWAYS CHECK AND UPDATE DEVELOPMENT_ROADMAP.MD BEFORE AND AFTER ANY CHANGE!!!!!!!

## Testing Philosophy — MANDATORY (read before adding tests)
**Before adding or modifying ANY test, read `TESTING_PHILOSOPHY.md`.**

Hard rules from Phase 28 sprint:
- No permissive `expect([200, 401, 403, 404]).toContain(...)` matchers without `// JUSTIFIED:` comment
- No `expect(x).toBeTruthy()` for fields under test — assert specific values
- No tautological assertions
- No `page.route('/api/...')` mocks of own backend (use real backend via overnight suite)
- Real services > mocks at system boundary (Cloudinary real, OpenAI snapshot-replay, see EXTERNAL_SERVICE_GAPS.md for what's NOT covered)
- Test names must match what the code actually does

## Testing Workflow — MANDATORY (SUPER THOROUGH)
EVERY change MUST be comprehensively tested before committing. No exceptions.

### Backend Testing (Claude does this):
- Start the server and run REAL requests against it
- **Happy path**: Verify the intended behavior works correctly
- **Auth testing**: Try without token, with expired token, with wrong role — confirm all are rejected
- **Input validation**: Send missing fields, empty strings, too-long strings, special characters, SQL/NoSQL injection patterns, XSS payloads
- **Boundary conditions**: Zero values, negative numbers, MAX values, Unicode, empty arrays
- **Error handling**: Verify proper error codes (400, 401, 403, 404, 500), correct error messages, no stack traces leaked
- **Response format**: Check response shape matches what frontend expects
- **Side effects**: Verify database state actually changed (query DB after mutations)
- **Regression**: Test that related endpoints still work after the change
- **Security-specific**: For security fixes, actively try to bypass the fix

### Frontend Testing (User does this — Claude provides test script):
For EVERY frontend change, provide a DETAILED test script:
- Exact URL to visit
- Step-by-step actions (click X, type Y, select Z)
- Expected visual result at each step
- Edge cases to try (empty form submit, rapid clicks, back button, refresh)
- What the OLD broken behavior was vs NEW correct behavior
- Cross-check: verify no regressions on related pages
- Test both logged-in and logged-out states where relevant
- Test with different user roles (jobseeker, employer, admin)

### Before Committing:
- Backend tests must all pass
- Frontend test script must be provided to user
- User confirms frontend works
- Run a final `npm run build` to catch compile errors