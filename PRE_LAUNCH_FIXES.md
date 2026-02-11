# Pre-Launch Fix Plan — advance.al

**Created:** February 11, 2026
**Last Verified:** February 11, 2026 — Every single item was confirmed by reading the actual code. Line numbers are exact.
**Purpose:** Definitive list of real bugs that will cause real failures in production. Nothing theoretical.

---

## What Was Audited & Cleared (Not Issues)

Before the fix list — things that were flagged but are actually fine:

- ✅ **Admin routes auth** — `router.use(authenticate)` + `router.use(requireAdmin)` on lines 8-9 of `admin.js`. All admin routes protected.
- ✅ **Global rate limiting** — Active in `server.js:103` for all `/api/` routes.
- ✅ **Input validation on auth** — `express-validator` with full `registerValidation` and `loginValidation` in `auth.js`.
- ✅ **CORS** — Reads `FRONTEND_URL` env var, only allows it in production mode.
- ✅ **Global error handler** — Present in `server.js:169-206` with proper Mongoose, JWT, and generic error handling.
- ✅ **MongoDB indexes** — Comprehensive indexes on all major collections.
- ✅ **`.env.example`** — Present with all required variables documented.
- ✅ **`api.ts` removeAuthToken()** — `removeAuthToken()` at line 243 correctly removes `authToken`, `refreshToken`, AND `user` from localStorage. Just not called on 401.

---

## CRITICAL — Breaks Production Immediately

### 1. Missing `_redirects` File — SPA Routing Completely Broken

**File to create:** `frontend/public/_redirects`
**Current state:** This file does not exist.

React Router uses `BrowserRouter`, which means routing is client-side only. When Render serves the frontend as a Static Site, it serves files directly from disk. If a user navigates directly to `advance.al/jobs/123`, `advance.al/profile`, or `advance.al/admin`, Render looks for a file at that path — finds nothing — and returns a **404 page from its CDN**. React never loads. The app is completely broken for any bookmarked URL, any shared link, and any page refresh.

**Fix:** Create the file with one line:

```
/* /index.html 200
```

This tells Render: "For any URL, serve `index.html` with a 200 status." React Router then handles the routing client-side.

**Effort:** 2 minutes
**Impact:** Without this, the entire app is broken for every URL except `/`

---

### 2. `EmployerRegister.tsx` — Fake Registration + No Form State

**File:** `frontend/src/pages/EmployerRegister.tsx:18-31`

Two problems that must both be fixed together:

**Problem A — Fake API:**
```js
// Lines 18-31 — current broken code
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);
  setTimeout(() => {          // No real API call
    setIsLoading(false);
    toast({ title: "Mirësevini në PunaShqip!" });
    navigate('/employer-dashboard'); // navigates with zero account
  }, 1500);
};
```

**Problem B — Uncontrolled inputs:**
Every `<Input>` in this form has no `value` prop and no `onChange` handler. Even if you add an API call, you can't read the field values. The inputs are decorative — nothing is captured.

The backend's `POST /api/auth/register` endpoint (verified in `auth.js:113-127`) requires: `email`, `password`, `firstName`, `lastName`, `city`, `companyName`, `industry`, `companySize`. The form collects company name and email in Step 1, location in Step 2, but has no state for any of it.

**Fix — Full rewrite of this component's logic:**
1. Add `useState` for all fields: `companyName`, `email`, `password`, `confirmPassword`, `location`, `companySize`, `industry`
2. Bind `value` + `onChange` to every `<Input>`
3. Add a dropdown for `industry` in Step 2 (required by backend)
4. Replace `setTimeout` with `authApi.register()`:

```tsx
const response = await authApi.register({
  email,
  password,
  userType: 'employer',
  firstName: companyName,  // backend uses firstName for display
  lastName: '-',
  city: location,
  companyName,
  industry,
  companySize,
});
if (response.success) {
  toast({ title: "Mirësevini në PunaShqip!" });
  navigate('/employer-dashboard');
}
```

**Effort:** ~2 hours (form state + API hookup)
**Impact:** Fixes a completely silent data loss — every employer signup attempt is currently dropped

---

### 3. `EmployerDashboard.tsx` — Hardcoded `localhost:3001` (Broken in Production)

**File:** `frontend/src/pages/EmployerDashboard.tsx`

```ts
// Line 740 — CV viewer
const fullUrl = cvUrl.startsWith('http') ? cvUrl : `http://localhost:3001${cvUrl}`;

// Line 1680 — Resume viewer
: `http://localhost:3001${resumeUrl}`;
```

In production, `localhost:3001` points to nothing. Employer clicks to view a job seeker's CV or resume — file never opens. No error, just a blank tab or a failed request.

**Fix:**
```ts
const baseUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

// Line 740
const fullUrl = cvUrl.startsWith('http') ? cvUrl : `${baseUrl}${cvUrl}`;

// Line 1680
: `${baseUrl}${resumeUrl}`;
```

**Effort:** 10 minutes
**Impact:** Employers can actually view uploaded CVs/resumes in production

---

## HIGH — Security / Session Reliability

### 4. `backend/package.json` — `NODE_ENV` Not Set in Start Script

**File:** `backend/package.json:8`

```json
"start": "node server.js"
```

Without `NODE_ENV=production`, `process.env.NODE_ENV` is `undefined` on Render unless the platform sets it separately. Looking at `server.js`:
- **Line 55:** `if (process.env.NODE_ENV !== 'production')` — if undefined, this is `true`, so CORS allows ALL origins
- **Line 106:** `if (process.env.NODE_ENV === 'development')` — Morgan uses `dev` format instead of `combined`
- **Line 204:** Stack traces are included in error responses when not production

**Fix:**
```json
"start": "NODE_ENV=production node server.js"
```

**Note:** Render typically sets `NODE_ENV=production` via environment variables in the dashboard. But relying on that is fragile — set it in the script as the definitive source of truth.

**Effort:** 2 minutes
**Impact:** CORS enforced, stack traces hidden, correct logging format

---

### 5. `backend/server.js` — Missing `trust proxy`

**File:** `backend/server.js` (add after `const app = express()` on line 32)

Render puts apps behind a reverse proxy (load balancer). Without `trust proxy`, Express reads `req.ip` as the proxy's internal IP address — not the real user's IP. Since all users share the same proxy IP, the entire rate limiter (100 req/15min) is effectively shared across ALL users simultaneously. One user can exhaust the limit for everyone.

**Fix:**
```js
const app = express();
app.set('trust proxy', 1); // Add this line — trusts first proxy hop
```

**Effort:** 5 minutes
**Impact:** Rate limiting correctly applies per-user IP instead of per-proxy IP

---

### 6. `backend/src/routes/auth.js` — Auth Rate Limiter Commented Out

**File:** `backend/src/routes/auth.js:10-17`

```js
// Stricter rate limiting for auth routes - DISABLED FOR DEVELOPMENT
// // const authLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 10,
//   ...
// });
```

The only protection on `/auth/login` is the global limiter: 100 requests per 15 minutes for ALL API routes combined. A bot can try 100 different passwords against one account every 15 minutes = 9,600 guesses per day per IP.

**Fix:** Uncomment the `authLimiter` and apply it. Increase max to 15 (more forgiving than 10 for legitimate users who mistype):

```js
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    error: 'Shumë tentativa kyçjeje, ju lutemi provoni përsëri pas 15 minutash.',
  }
});

router.post('/login', authLimiter, loginValidation, handleValidationErrors, async (req, res) => { ... });
router.post('/register', authLimiter, registerValidation, handleValidationErrors, async (req, res) => { ... });
```

**Effort:** 15 minutes
**Impact:** Brute force window reduced from 9,600 attempts/day to 1,440/day per IP

---

### 7. `api.ts` — Expired Token Doesn't Auto-Logout

**File:** `frontend/src/lib/api.ts:295-296`

When any API call returns a 401, the current code at line 295 throws an `ApiError`:
```ts
if (!response.ok) {
  throw new ApiError(data, response.status); // Thrown but auth token NOT cleared
}
```

The `removeAuthToken()` function exists at line 243 and works correctly. It's just never called on 401. So when a user's JWT expires mid-session, the next API call silently fails with an error toast, but the user is left in a broken half-logged-in state.

**Fix:** Add a 401 check before throwing:
```ts
if (!response.ok) {
  if (response.status === 401) {
    removeAuthToken(); // Clear all 3 localStorage keys
  }
  throw new ApiError(data, response.status);
}
```

**Effort:** 15 minutes
**Impact:** Expired token = clean logout instead of broken frozen UI

---

## MEDIUM — Real Bugs / Polish

### 8. `App.tsx` — `ProtectedRoute` Exists But Is Never Used

**Files:** `frontend/src/App.tsx`, `frontend/src/contexts/AuthContext.tsx`

`ProtectedRoute` is fully implemented in `AuthContext.tsx` and accepts `allowedUserTypes`. It is imported in zero places. All 11 routes in `App.tsx` are completely unguarded at the router level. Pages do their own internal checks, but:
- These checks fire AFTER the component mounts — there is a brief flash of protected content before redirect
- If any page forgets its internal check, there is no safety net
- The `ProtectedRoute` fallback currently shows plain text `"You are not authorized to view this page."` — it should redirect to `/login`

**Fix part 1** — Fix the fallback in `AuthContext.tsx` (find the ProtectedRoute component, ~line 289-309):
```tsx
// Change the fallback from plain text to:
return <Navigate to="/login" replace />;
```

**Fix part 2** — Wrap the three truly sensitive routes in `App.tsx`:
```tsx
<Route path="/employer-dashboard" element={
  <ProtectedRoute allowedUserTypes={['employer']}>
    <EmployerDashboard />
  </ProtectedRoute>
} />
<Route path="/admin" element={
  <ProtectedRoute allowedUserTypes={['admin']}>
    <AdminDashboard />
  </ProtectedRoute>
} />
<Route path="/admin/reports" element={
  <ProtectedRoute allowedUserTypes={['admin']}>
    <AdminReports />
  </ProtectedRoute>
} />
```

**Effort:** 45 minutes
**Impact:** No flash of protected content, consistent auth enforcement

---

### 9. `admin.js` Analytics — N+1 Query Pattern

**File:** `backend/src/routes/admin.js:198-246`

The `/analytics` endpoint builds a date range, then for EACH date runs 3 separate `countDocuments()` queries:

```js
// Runs once per day in the range — up to 365 iterations
const userGrowth = await Promise.all(
  dateRange.map(async (date) => {
    const count = await User.countDocuments({ createdAt: { $gte: date, $lt: nextDate } });
    return { date, count };
  })
);
// Same pattern for jobs (another N queries) and applications (another N queries)
```

30-day view = 90 DB queries. Yearly view = 1,095 DB queries.

**Fix:** Replace with one aggregation per collection:
```js
const userGrowth = await User.aggregate([
  { $match: { createdAt: { $gte: startDate } } },
  { $group: {
    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
    count: { $sum: 1 }
  }},
  { $sort: { _id: 1 } }
]);
// Same for Job and Application — 3 total queries
```

**Effort:** 1 hour
**Impact:** Analytics goes from 90-1,095 DB queries to 3

---

### 10. `NotFound.tsx` — console.error on Every 404, English-Only, No Nav

**File:** `frontend/src/pages/NotFound.tsx`

Current code:
```tsx
useEffect(() => {
  console.error("404 Error: User attempted to access non-existent route:", location.pathname);
}, [location.pathname]);
```

Every mistyped URL logs an error to the browser console in production. Additionally, the page is entirely English on an Albanian platform and has no Navigation or Footer — users can only go home via one link.

**Fix:**
```tsx
const NotFound = () => {
  return (
    <>
      <Navigation />
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4 text-6xl font-bold text-gray-300">404</h1>
          <p className="mb-2 text-2xl font-semibold">Faqja nuk u gjet</p>
          <p className="mb-6 text-gray-500">Faqja që po kërkoni nuk ekziston ose është zhvendosur.</p>
          <a href="/" className="text-blue-500 underline hover:text-blue-700">
            Kthehu në faqen kryesore
          </a>
        </div>
      </div>
      <Footer />
    </>
  );
};
```

**Effort:** 20 minutes
**Impact:** Cleaner console, Albanian text, proper navigation on 404

---

## Implementation Order

Exact priority sequence — do not reorder:

| # | File | Change | Time |
|---|------|--------|------|
| 1 | `frontend/public/_redirects` | Create file with `/* /index.html 200` | 2 min |
| 2 | `backend/package.json` | Add `NODE_ENV=production` to start script | 2 min |
| 3 | `backend/server.js` | Add `app.set('trust proxy', 1)` after `const app = express()` | 5 min |
| 4 | `backend/src/routes/auth.js` | Uncomment + apply authLimiter to login and register | 15 min |
| 5 | `frontend/src/lib/api.ts` | Clear token on 401 in `apiRequest()` | 15 min |
| 6 | `frontend/src/pages/EmployerDashboard.tsx` | Fix hardcoded localhost:3001 (lines 740, 1680) | 10 min |
| 7 | `frontend/src/pages/NotFound.tsx` | Remove console.error, add nav/footer, Albanian text | 20 min |
| 8 | `frontend/src/contexts/AuthContext.tsx` + `App.tsx` | Fix ProtectedRoute redirect + wrap 3 sensitive routes | 45 min |
| 9 | `backend/src/routes/admin.js` | Fix analytics N+1 to aggregation pipeline | 1 hr |
| 10 | `frontend/src/pages/EmployerRegister.tsx` | Add form state + real authApi.register() call | 2 hr |

**Total: ~5 hours of focused work**

---

## Render Deployment Checklist

Before going live, verify these are set in the Render dashboard:

**Backend (Web Service) — Environment Variables:**
```
NODE_ENV=production
MONGODB_URI=<your atlas connection string>
JWT_SECRET=<strong random string>
JWT_REFRESH_SECRET=<different strong random string>
RESEND_API_KEY=<from resend.com>
OPENAI_API_KEY=<from openai>
FRONTEND_URL=https://advance.al (or your Render frontend URL)
PORT=10000
```

**Frontend (Static Site) — Environment Variables:**
```
VITE_API_URL=https://your-backend.onrender.com/api
```

**Frontend (Static Site) — Build settings:**
```
Build command: npm run build
Publish directory: dist
```

The `_redirects` file in `frontend/public/` is automatically included in `dist/` during the Vite build. No extra config needed once the file exists.

---

## Not Included (And Why)

| Suggestion | Why Dropped |
|-----------|-------------|
| Add auth to admin routes | Already done — `router.use(authenticate, requireAdmin)` on lines 8-9 |
| Input validation on auth | Already done — express-validator in auth.js |
| `removeAuthToken()` missing fields | Already removes all 3 keys (authToken, refreshToken, user) at line 243 |
| Missing compression middleware | Page sizes are small, not worth the dependency yet |
| Vite code splitting config | Default Vite chunking is fine at current bundle size |
| Image lazy loading audit | Most images already use `loading="lazy"` or are small icons |
| mongo-sanitize / xss-clean | Mongoose escapes queries by default; real risk is low at current scale |
| Remove all console.logs | Explicitly kept per user request |
