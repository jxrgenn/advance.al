# Google OAuth 2.0 Implementation Plan for Albania JobFlow

## Overview
This document outlines the complete implementation plan for integrating Google OAuth 2.0 authentication into the Albania JobFlow platform. Users will be able to sign up and log in using their Google accounts.

---

## Prerequisites

### 1. Google Cloud Console Setup
- Create a project in [Google Cloud Console](https://console.cloud.google.com/)
- Enable Google+ API (for user profile access)
- Configure OAuth consent screen
- Create OAuth 2.0 Client ID credentials

---

## Phase 1: Google Cloud Console Configuration (30 minutes)

### Step 1.1: Create Google Cloud Project
1. Navigate to https://console.cloud.google.com/
2. Click "Select a project" → "New Project"
3. Project name: `albania-jobflow-prod`
4. Click "Create"

### Step 1.2: Configure OAuth Consent Screen
1. Navigate to **APIs & Services** → **OAuth consent screen**
2. Select **External** user type (for public access)
3. Fill in required fields:
   - **App name**: Albania JobFlow
   - **User support email**: advance.al123456@gmail.com
   - **App logo**: Upload company logo (120x120px PNG)
   - **Application home page**: https://advance.al
   - **Application privacy policy**: https://advance.al/privacy
   - **Application terms of service**: https://advance.al/terms
   - **Authorized domains**: advance.al
   - **Developer contact email**: advance.al123456@gmail.com
4. Click **Save and Continue**
5. **Scopes**: Add the following scopes:
   - `openid` - OpenID Connect
   - `email` - Email address
   - `profile` - Basic profile info
6. Skip "Test users" (only needed for testing phase)
7. Click **Save and Continue**

### Step 1.3: Create OAuth 2.0 Client ID
1. Navigate to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `Albania JobFlow Web Client`
5. **Authorized JavaScript origins**:
   - Development: `http://localhost:5173`
   - Development (Alt): `http://localhost:3000`
   - Production: `https://advance.al`
   - Production (Alt): `https://www.advance.al`
6. **Authorized redirect URIs**:
   - Development: `http://localhost:5173/auth/google/callback`
   - Production: `https://advance.al/auth/google/callback`
7. Click **Create**
8. **SAVE** Client ID and Client Secret - you'll need these!

---

## Phase 2: Backend Implementation (3-4 hours)

### Step 2.1: Install Dependencies

```bash
cd backend
npm install passport passport-google-oauth20
```

**Packages:**
- `passport` (v0.7.0+) - Authentication middleware
- `passport-google-oauth20` (v2.0.0+) - Google OAuth 2.0 strategy

### Step 2.2: Add Environment Variables

Add to `backend/.env`:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:5173/auth/google/callback

# Session Secret (for Passport.js sessions)
SESSION_SECRET=generate_a_random_256_bit_string_here
```

**Generate Session Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 2.3: Create Passport Google Strategy

Create `backend/src/config/passport.js`:

```javascript
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('-password');
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5173/auth/google/callback',
      scope: ['profile', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('🔐 Google OAuth Profile:', profile);

        // Check if user exists with this Google ID
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
          // User exists, log them in
          console.log('✅ Existing Google user found:', user.email);
          return done(null, user);
        }

        // Check if user exists with this email (linking accounts)
        user = await User.findOne({ email: profile.emails[0].value });

        if (user) {
          // Link Google account to existing user
          user.googleId = profile.id;
          await user.save();
          console.log('🔗 Linked Google account to existing user:', user.email);
          return done(null, user);
        }

        // Create new user
        const newUser = new User({
          googleId: profile.id,
          email: profile.emails[0].value,
          emailVerified: true, // Google emails are pre-verified
          userType: 'jobseeker', // Default to jobseeker, can be changed later
          profile: {
            firstName: profile.name.givenName || '',
            lastName: profile.name.familyName || '',
            location: {
              city: 'Tiranë', // Default location
            },
            jobSeekerProfile: {
              // Initialize empty jobseeker profile
            },
          },
          // Generate a random password (user won't use it for Google login)
          password: require('crypto').randomBytes(32).toString('hex'),
        });

        await newUser.save();
        console.log('🆕 New Google user created:', newUser.email);
        done(null, newUser);
      } catch (error) {
        console.error('❌ Google OAuth error:', error);
        done(error, null);
      }
    }
  )
);

export default passport;
```

### Step 2.4: Update User Model

Add Google ID field to `backend/src/models/User.js`:

```javascript
// Add this field to the userSchema (around line 200)
googleId: {
  type: String,
  unique: true,
  sparse: true, // Allows null values
  index: true
},
```

**Create index:**
```bash
# In MongoDB shell or via Mongoose migration
db.users.createIndex({ googleId: 1 }, { unique: true, sparse: true })
```

### Step 2.5: Update Server Configuration

Update `backend/server.js` to include Passport:

```javascript
import express from 'express';
import session from 'express-session';
import passport from './src/config/passport.js';
import authRoutes from './src/routes/auth.js'; // Updated auth routes

const app = express();

// ... existing middleware ...

// Session middleware (BEFORE passport)
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// ... existing routes ...
```

### Step 2.6: Create OAuth Routes

Add to `backend/src/routes/auth.js`:

```javascript
import express from 'express';
import passport from 'passport';
import { generateToken } from '../lib/jwt.js';

const router = express.Router();

// ... existing auth routes ...

// @route   GET /api/auth/google
// @desc    Initiate Google OAuth flow
// @access  Public
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  prompt: 'select_account', // Always show account selector
}));

// @route   GET /api/auth/google/callback
// @desc    Google OAuth callback
// @access  Public
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login?error=google_auth_failed',
    session: false, // We're using JWT, not sessions
  }),
  (req, res) => {
    try {
      // Generate JWT token
      const accessToken = generateToken(req.user._id);
      const refreshToken = generateRefreshToken(req.user._id);

      // Set httpOnly cookies
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 2 * 60 * 60 * 1000, // 2 hours
      });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Redirect to frontend with success
      const redirectUrl = req.user.userType === 'employer'
        ? '/employer-dashboard'
        : '/profile';

      res.redirect(`${process.env.FRONTEND_URL}${redirectUrl}?auth=success`);
    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect('/login?error=auth_failed');
    }
  }
);

export default router;
```

---

## Phase 3: Frontend Implementation (2-3 hours)

### Step 3.1: Update Environment Variables

Add to `frontend/.env`:

```env
VITE_API_URL=http://localhost:3000
VITE_GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
```

### Step 3.2: Create Google OAuth Button Component

Create `frontend/src/components/GoogleOAuthButton.tsx`:

```typescript
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useState } from "react";

interface GoogleOAuthButtonProps {
  text?: string;
  variant?: "default" | "outline";
}

const GoogleOAuthButton = ({
  text = "Vazhdo me Google",
  variant = "outline"
}: GoogleOAuthButtonProps) => {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = () => {
    setLoading(true);
    // Redirect to backend OAuth endpoint
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    window.location.href = `${backendUrl}/api/auth/google`;
  };

  return (
    <Button
      type="button"
      variant={variant}
      onClick={handleGoogleLogin}
      disabled={loading}
      className="w-full"
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Duke u kyçur...
        </>
      ) : (
        <>
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {text}
        </>
      )}
    </Button>
  );
};

export default GoogleOAuthButton;
```

### Step 3.3: Update Login Page

Update `frontend/src/pages/Login.tsx` to include Google OAuth:

```typescript
import GoogleOAuthButton from "@/components/GoogleOAuthButton";

// Inside the Card component, after the login form:
<form onSubmit={handleLogin} className="space-y-4">
  {/* ... existing form fields ... */}
</form>

{/* Divider */}
<div className="relative my-6">
  <div className="absolute inset-0 flex items-center">
    <span className="w-full border-t" />
  </div>
  <div className="relative flex justify-center text-xs uppercase">
    <span className="bg-background px-2 text-muted-foreground">
      Ose
    </span>
  </div>
</div>

{/* Google OAuth Button */}
<GoogleOAuthButton text="Kyçu me Google" />

{/* ... rest of the component ... */}
```

### Step 3.4: Handle OAuth Callback

Update `frontend/src/contexts/AuthContext.tsx` to handle OAuth callback:

```typescript
useEffect(() => {
  // Check for OAuth success in URL params
  const params = new URLSearchParams(window.location.search);
  const authStatus = params.get('auth');

  if (authStatus === 'success') {
    // OAuth successful, refresh user data
    checkAuth();
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.get('error')) {
    const errorType = params.get('error');
    const errorMessage = errorType === 'google_auth_failed'
      ? 'Autentifikimi me Google dështoi. Ju lutemi provoni përsëri.'
      : 'Gabim në autentifikim.';

    toast({
      title: "Gabim",
      description: errorMessage,
      variant: "destructive"
    });

    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}, []);
```

---

## Phase 4: Testing (1-2 hours)

### Step 4.1: Development Testing Checklist

- [ ] **New User Registration via Google**
  - Click "Kyçu me Google" on login page
  - Select Google account
  - Verify redirect to profile/dashboard
  - Verify user created in database with Google ID
  - Verify email marked as verified

- [ ] **Existing User Login via Google**
  - Register user manually with email X
  - Log out
  - Click "Kyçu me Google" with same email X
  - Verify Google ID linked to existing account
  - Verify successful login

- [ ] **Account Linking**
  - Create account with email/password
  - Log in with Google using same email
  - Verify accounts linked (googleId added)

- [ ] **Error Handling**
  - Cancel Google auth midway → Verify redirect to login with error
  - Use restricted/banned Google account → Verify error handling
  - Network interruption → Verify graceful failure

- [ ] **Security**
  - Verify JWT tokens set in httpOnly cookies
  - Verify CSRF protection enabled
  - Verify no sensitive data in URL params

### Step 4.2: Production Testing

1. Update OAuth redirect URIs in Google Cloud Console to production URLs
2. Deploy backend and frontend to production
3. Test complete OAuth flow on production domain
4. Monitor error logs for OAuth failures
5. Test on multiple devices/browsers

---

## Phase 5: Production Deployment (30 minutes)

### Step 5.1: Update Environment Variables

**Backend Production (.env):**
```env
GOOGLE_CLIENT_ID=your_production_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_production_client_secret
GOOGLE_CALLBACK_URL=https://advance.al/auth/google/callback
SESSION_SECRET=your_production_session_secret_256_bit
FRONTEND_URL=https://advance.al
NODE_ENV=production
```

**Frontend Production (.env.production):**
```env
VITE_API_URL=https://api.advance.al
VITE_GOOGLE_CLIENT_ID=your_production_client_id.apps.googleusercontent.com
```

### Step 5.2: Update Google Cloud Console

1. Go to Google Cloud Console → Credentials
2. Edit OAuth 2.0 Client ID
3. Add production authorized origins:
   - `https://advance.al`
   - `https://www.advance.al`
4. Add production redirect URIs:
   - `https://advance.al/auth/google/callback`
5. Save changes

### Step 5.3: Deploy Application

```bash
# Backend
cd backend
npm run build  # If using TypeScript
pm2 restart albania-jobflow-backend

# Frontend
cd frontend
npm run build
# Deploy dist/ folder to hosting (Vercel/Netlify/etc.)
```

---

## Security Considerations

### 1. **OAuth Token Security**
- ✅ Store tokens in httpOnly cookies (not localStorage)
- ✅ Use secure: true in production (HTTPS only)
- ✅ Set sameSite: 'lax' or 'strict' to prevent CSRF
- ✅ Implement token expiration (2h access, 7d refresh)

### 2. **Client Secret Protection**
- ❌ NEVER expose client secret in frontend code
- ✅ Keep client secret in backend .env file
- ✅ Add .env to .gitignore
- ✅ Use environment variables in production

### 3. **Session Security**
- ✅ Generate strong session secret (256-bit random)
- ✅ Enable secure cookies in production
- ✅ Implement session expiration
- ✅ Clear sessions on logout

### 4. **User Data Privacy**
- ✅ Only request necessary scopes (email, profile)
- ✅ Store minimal user data from Google
- ✅ Provide clear privacy policy
- ✅ Allow users to unlink Google account

### 5. **Error Handling**
- ✅ Don't expose internal errors to users
- ✅ Log OAuth errors securely
- ✅ Implement rate limiting on auth endpoints
- ✅ Handle expired/revoked tokens gracefully

---

## Database Schema Updates

### User Model Changes

```javascript
// backend/src/models/User.js

// Add these fields to userSchema:
{
  googleId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },

  oauthProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },

  emailVerified: {
    type: Boolean,
    default: false
  },

  // Make password optional for OAuth users
  password: {
    type: String,
    required: function() {
      return this.oauthProvider === 'local';
    },
    minlength: 6
  }
}
```

### Migration Script

Create `backend/scripts/add-google-oauth-fields.js`:

```javascript
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import { connectDB } from '../src/config/database.js';

async function migrateUsers() {
  await connectDB();

  console.log('🔄 Migrating existing users...');

  // Add oauthProvider: 'local' to all existing users
  await User.updateMany(
    { oauthProvider: { $exists: false } },
    { $set: { oauthProvider: 'local' } }
  );

  console.log('✅ Migration complete!');
  process.exit(0);
}

migrateUsers();
```

Run migration:
```bash
cd backend
node scripts/add-google-oauth-fields.js
```

---

## Cost Analysis

### Google OAuth Costs
- **OAuth API**: **FREE** (unlimited)
- **User limit**: Unlimited
- **Rate limits**: 10,000 requests/day (should be sufficient)
- **No charges** for OAuth authentication

**Total Monthly Cost: $0**

---

## User Experience Flow

### New User Flow (Google)
1. User clicks "Kyçu me Google" on Login page
2. Redirected to Google account selector
3. User selects Google account
4. Google prompts for permission (email, profile)
5. User approves
6. Redirected back to app
7. Backend creates new user account
8. User redirected to profile/dashboard
9. Success toast: "Mirësevini! Llogaria juaj u krijua me sukses."

### Existing User Flow (Google)
1. User clicks "Kyçu me Google"
2. Redirected to Google (auto-login if already signed in)
3. Redirected back to app
4. Backend finds existing user with Google ID
5. User logged in automatically
6. Redirected to profile/dashboard
7. Success toast: "Mirësevini!"

### Account Linking Flow
1. User registered with email: `john@example.com`
2. User clicks "Kyçu me Google"
3. Selects Google account with same email: `john@example.com`
4. Backend detects existing email, links Google ID
5. User logged in
6. Toast: "Llogaria juaj Google u lidhur me sukses!"

---

## Troubleshooting Guide

### Error: "redirect_uri_mismatch"
**Cause:** Redirect URI not added to Google Cloud Console
**Fix:** Add exact redirect URI to Authorized redirect URIs list

### Error: "invalid_client"
**Cause:** Wrong Client ID or Client Secret
**Fix:** Verify credentials match Google Cloud Console

### Error: "User not created"
**Cause:** Database validation error (missing required fields)
**Fix:** Ensure User model has default values for required fields

### Error: "Token expired"
**Cause:** JWT token expired (2 hours)
**Fix:** Implement token refresh logic with refresh token

### Error: "Session not found"
**Cause:** Session store not configured or expired
**Fix:** Check session middleware configuration and expiration

---

## Additional Features (Optional)

### 1. **Account Settings - Unlink Google**
Allow users to disconnect Google account:

```typescript
// Backend route
router.post('/auth/google/unlink', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Ensure user has password set (so they can still log in)
    if (!user.password || user.oauthProvider === 'google') {
      return res.status(400).json({
        success: false,
        message: 'Ju duhet të vendosni një fjalëkalim përpara se të shkëputni Google'
      });
    }

    user.googleId = undefined;
    user.oauthProvider = 'local';
    await user.save();

    res.json({
      success: true,
      message: 'Llogaria Google u shkëput me sukses'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Gabim në shkëputjen e llogarisë Google'
    });
  }
});
```

### 2. **Profile Picture from Google**
Store Google profile picture:

```javascript
// In Google strategy callback:
const newUser = new User({
  // ... existing fields ...
  profile: {
    // ... existing fields ...
    jobSeekerProfile: {
      profilePhoto: profile.photos?.[0]?.value || null, // Google profile picture URL
    },
  },
});
```

### 3. **Email Verification Bypass**
Users who sign up with Google have pre-verified emails:

```javascript
const newUser = new User({
  // ... existing fields ...
  emailVerified: true, // Google emails are verified
  status: 'active', // Skip email verification step
});
```

---

## Timeline Summary

| Phase | Duration | Complexity |
|-------|----------|------------|
| 1. Google Cloud Setup | 30 min | Easy |
| 2. Backend Implementation | 3-4 hours | Medium |
| 3. Frontend Implementation | 2-3 hours | Medium |
| 4. Testing | 1-2 hours | Medium |
| 5. Production Deployment | 30 min | Easy |
| **Total** | **7-10 hours** | **Medium** |

---

## Success Criteria

- ✅ Users can sign up with Google account
- ✅ Users can log in with Google account
- ✅ Existing accounts can be linked to Google
- ✅ JWT tokens issued on successful OAuth
- ✅ Proper error handling for OAuth failures
- ✅ Security best practices implemented
- ✅ Works on both desktop and mobile
- ✅ No sensitive data exposed
- ✅ Production-ready deployment

---

## Next Steps After Implementation

1. **Monitor OAuth Usage**
   - Track number of Google sign-ups vs email sign-ups
   - Monitor OAuth error rates
   - Check conversion rates

2. **Consider Additional Providers**
   - Facebook OAuth
   - Apple Sign In (iOS requirement)
   - Microsoft Account (LinkedIn integration)

3. **Advanced Features**
   - Two-factor authentication (2FA)
   - Magic link login (passwordless)
   - Biometric authentication (mobile)

---

## Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Passport.js Google Strategy](https://www.passportjs.org/packages/passport-google-oauth20/)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

**Document Version:** 1.0
**Last Updated:** 2026-01-16
**Author:** Claude Code
**Status:** Ready for Implementation
