# PROJECT SEPARATION SPECIFICATION

## 1. FEATURE DESCRIPTION

**Feature Name:** Backend/Frontend Project Separation
**Category:** Infrastructure & Architecture
**Priority:** High
**Estimated Complexity:** High

### Business Value
Separate the current monolithic codebase into distinct backend and frontend projects to improve:
- Development workflow (independent development cycles)
- Deployment flexibility (separate hosting strategies)
- Code organization (clear separation of concerns)
- Team scalability (frontend/backend developers can work independently)
- Maintenance (easier to update dependencies per project)

### Technical Summary
Transform the current mixed React+Express monolith into a clean backend API server and frontend React application using workspace architecture for coordinated development.

## 2. CURRENT STATE ANALYSIS

### Current Architecture Issues
- Mixed dependencies in single package.json (React + Express)
- Frontend and backend code intermingled in /src directory
- Shared development server makes debugging complex
- Single deployment target limits hosting options
- File upload handling tied to backend static serving

### Current File Structure
```
albania-jobflow/
├── server.js (Backend entry)
├── package.json (Mixed dependencies)
├── src/
│   ├── components/ (Frontend)
│   ├── pages/ (Frontend)
│   ├── lib/ (Mixed - API client + backend services)
│   ├── routes/ (Backend)
│   ├── models/ (Backend)
│   └── middleware/ (Backend)
├── public/ (Frontend static)
└── uploads/ (Backend files)
```

## 3. DETAILED IMPLEMENTATION PLAN

### Phase 1: Project Structure Creation
**Time Estimate: 1 hour**

#### Step 1.1: Create Workspace Structure
- Create `/backend` directory for server code
- Create `/frontend` directory for React application
- Create root workspace package.json
- Configure workspace dependencies

#### Step 1.2: Backend Project Setup
- Move server.js to backend/server.js
- Create backend/package.json with Express dependencies
- Update backend imports and paths
- Configure backend development scripts

#### Step 1.3: Frontend Project Setup
- Move React code to frontend/src
- Create frontend/package.json with React dependencies
- Update frontend imports and paths
- Configure frontend development scripts

### Phase 2: File Migration
**Time Estimate: 2 hours**

#### Step 2.1: Backend File Migration
**Files to Move:**
```
server.js → backend/server.js
src/routes/ → backend/src/routes/
src/models/ → backend/src/models/
src/middleware/ → backend/src/middleware/
src/config/ → backend/src/config/
src/lib/emailService.js → backend/src/lib/emailService.js
src/lib/notificationService.js → backend/src/lib/notificationService.js
uploads/ → backend/uploads/
scripts/ → backend/scripts/
.env → backend/.env (copy)
```

#### Step 2.2: Frontend File Migration
**Files to Move:**
```
src/components/ → frontend/src/components/
src/pages/ → frontend/src/pages/
src/contexts/ → frontend/src/contexts/
src/hooks/ → frontend/src/hooks/
src/lib/api.ts → frontend/src/lib/api.ts
src/App.tsx → frontend/src/App.tsx
src/main.tsx → frontend/src/main.tsx
public/ → frontend/public/
index.html → frontend/index.html
vite.config.ts → frontend/vite.config.ts
```

### Phase 3: Configuration Updates
**Time Estimate: 1.5 hours**

#### Step 3.1: Backend Configuration
- Update all import paths in backend files
- Configure CORS for frontend communication
- Update static file serving for uploads
- Configure environment variables

#### Step 3.2: Frontend Configuration
- Update API base URL configuration
- Fix all import paths in React components
- Update build configuration
- Configure environment variables

#### Step 3.3: Workspace Configuration
- Configure root package.json workspaces
- Create unified development scripts
- Set up concurrency for both projects

### Phase 4: Testing & Validation
**Time Estimate: 1 hour**

#### Step 4.1: Backend Testing
- Verify all API endpoints work
- Test file upload functionality
- Validate database connections
- Check authentication flows

#### Step 4.2: Frontend Testing
- Verify all pages load correctly
- Test API communication
- Validate authentication
- Check file upload/display

#### Step 4.3: Integration Testing
- Test full user flows
- Validate business control panel
- Test job posting workflow
- Verify admin dashboard

## 4. TECHNICAL IMPLEMENTATION DETAILS

### Backend Package Configuration
```json
{
  "name": "albania-jobflow-backend",
  "type": "module",
  "scripts": {
    "dev": "node --watch=src --watch=server.js server.js",
    "start": "node server.js",
    "seed": "node scripts/seed-database.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^7.6.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "express-validator": "^7.0.1",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "morgan": "^1.10.0",
    "multer": "^1.4.5-lts.1",
    "dotenv": "^16.3.1"
  }
}
```

### Frontend Package Configuration
```json
{
  "name": "albania-jobflow-frontend",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.16.0",
    "lucide-react": "^0.294.0",
    "@radix-ui/react-*": "latest"
  }
}
```

### Root Workspace Configuration
```json
{
  "name": "albania-jobflow",
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "dev": "concurrently \"npm run dev --workspace=backend\" \"npm run dev --workspace=frontend\"",
    "dev:backend": "npm run dev --workspace=backend",
    "dev:frontend": "npm run dev --workspace=frontend",
    "build": "npm run build --workspace=frontend",
    "seed": "npm run seed --workspace=backend"
  }
}
```

### CORS Configuration Update
```javascript
// backend/server.js
const corsOptions = {
  origin: [
    'http://localhost:5173',  // Vite dev server
    'http://localhost:3000',  // Alternative port
    process.env.FRONTEND_URL  // Production
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
```

### API Client Configuration
```typescript
// frontend/src/lib/api.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
```

## 5. RISK ASSESSMENT & MITIGATION

### High Risks
1. **Import Path Breakage**: All relative imports need updating
   - *Mitigation*: Systematic path replacement with careful testing
2. **Environment Variable Confusion**: Frontend vs backend vars
   - *Mitigation*: Clear naming convention (VITE_ prefix for frontend)
3. **File Upload Path Issues**: Static serving changes
   - *Mitigation*: Update backend static middleware and test thoroughly

### Medium Risks
1. **Development Workflow Disruption**: New commands needed
   - *Mitigation*: Clear documentation and workspace scripts
2. **Dependency Conflicts**: Workspace dependency resolution
   - *Mitigation*: Use exact versions and test installations

### Low Risks
1. **Performance Impact**: Separate development servers
   - *Mitigation*: Modern machines handle multiple Node processes fine

## 6. VALIDATION CRITERIA

### Functional Requirements
- [ ] All existing API endpoints work correctly
- [ ] Frontend pages load and function properly
- [ ] Authentication flow works end-to-end
- [ ] File upload/download works correctly
- [ ] Business control panel functions completely
- [ ] Admin dashboard displays real data

### Non-Functional Requirements
- [ ] Development server starts with single command
- [ ] Auto-restart works for both backend and frontend
- [ ] Build process completes successfully
- [ ] Performance is equivalent to current setup
- [ ] Memory usage is reasonable

### Integration Requirements
- [ ] Frontend communicates with backend APIs
- [ ] CORS configuration allows proper communication
- [ ] Environment variables are properly configured
- [ ] File uploads are accessible from frontend

## 7. DEPLOYMENT CONSIDERATIONS

### Development Environment
- Root command: `npm run dev` starts both servers
- Backend runs on localhost:3001
- Frontend runs on localhost:5173
- Hot reload works for both projects

### Production Environment
- Backend: Deploy to Node.js hosting (Railway, Heroku, VPS)
- Frontend: Deploy to static hosting (Vercel, Netlify)
- Environment: VITE_API_URL points to production backend
- File uploads: Serve from backend or migrate to CDN

## 8. SUCCESS METRICS

### Technical Metrics
- Zero broken API endpoints after migration
- Zero broken frontend routes after migration
- Development startup time under 30 seconds
- All tests pass in both projects

### Business Metrics
- All existing functionality preserved
- No performance degradation
- Improved developer experience
- Easier deployment options

## 9. ROLLBACK PLAN

### If Migration Fails
1. Keep original codebase in separate branch
2. Can revert entire migration with git reset
3. Current monolithic structure continues working
4. No data loss (database unchanged)

### Partial Rollback Options
- Roll back to workspace structure but keep separation
- Fix specific issues without full revert
- Gradual migration of remaining components

## 10. POST-IMPLEMENTATION TASKS

### Documentation Updates
- Update README with new development workflow
- Document environment variable setup
- Create deployment guides for both projects
- Update contributor guidelines

### Future Improvements
- Consider TypeScript shared library for common types
- Evaluate monorepo tools (Lerna, Nx) for advanced workflows
- Plan for multiple frontend clients (mobile app, admin panel)
- Consider microservices architecture for backend scaling

---

**Total Estimated Time: 5.5 hours**
**Complexity: High**
**Business Impact: Medium (improved architecture, no feature changes)**
**Risk Level: Medium (major structural changes)**