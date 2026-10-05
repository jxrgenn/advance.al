/**
 * O-69 — src/routes/verification.js is intentionally NOT mounted by
 * server.js anymore (unused by the frontend; a public code-sending and
 * account-enumeration surface). The file is kept, so its existing tests mount
 * the router on this minimal app instead of the real server. The middleware
 * order mirrors server.js (cookies → body parsers → operator guard).
 *
 * tests/integration/verification-unmounted.test.js asserts that the REAL app
 * answers 404 on these paths.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import verificationRoutes from '../../src/routes/verification.js';
import { rejectMongoOperators } from '../../src/middleware/rejectMongoOperators.js';

const app = express();
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(rejectMongoOperators);
app.use('/api/verification', verificationRoutes);
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Rruga nuk u gjet', path: req.originalUrl });
});

export default app;
