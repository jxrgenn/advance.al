# Codebase Analysis Report - Albania JobFlow

**Generated:** $(date)
**Project:** Albania JobFlow (Advance.al)

---

## 📊 Project Statistics

### File Count by Type

| File Type | Count |
|-----------|-------|
| TypeScript/TSX | 6318
| JavaScript | 11890
| JSON | 934
| Markdown | 762

### Lines of Code

- **Backend (JavaScript):** 16046 lines
- **Frontend (TypeScript/React):** 1979 lines
- **Total:** 18025 lines

### Component Structure

**Backend:**
- Routes:       16
- Models:       16
- Middleware:        1

**Frontend:**
- Components:       61
- Pages:       21

### TODO Comments

Found **       5** TODO/FIXME comments:

```
backend/src/routes/users.js:74:    .withMessage('Numri i telefonit duhet të jetë në formatin +355XXXXXXXX'),
backend/src/routes/users.js:114:    .withMessage('Numri i telefonit duhet të jetë në formatin +355XXXXXXXX'),
backend/src/routes/verification.js:192:          message: 'Numri i telefonit duhet të jetë në formatin +355XXXXXXXX'
backend/src/routes/reports.js:675:            averageResolutionTime: '2.5 ditë' // TODO: Calculate actual average
frontend/src/components/Navigation.tsx:290:                          // TODO: Navigate to full notifications page if we create one
```

### Security Scan

**Password Handling:**
- bcrypt usage:        6 occurrences

**Authentication:**
- JWT usage:        4 occurrences

### Dependencies

**Backend Dependencies:**
```json
{
  "express": "^5.1.0",
  "mongoose": "^8.18.1",
  "bcryptjs": "^3.0.2",
  "jsonwebtoken": "^9.0.2",
  "express-validator": "^7.2.1",
  "express-rate-limit": "^8.1.0",
  "cors": "^2.8.5",
  "helmet": "^8.1.0",
  "morgan": "^1.10.1",
  "multer": "^2.0.2",
  "dotenv": "^17.2.2",
  "mongodb": "^6.20.0",
  "nodemailer": "^7.0.6",
  "resend": "^6.1.0"
}
```

