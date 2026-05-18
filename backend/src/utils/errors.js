// Pre-deploy audit (Round O-E) — centralize the "include error.message in
// the response?" decision. Previously each route did
//   process.env.NODE_ENV === 'development' ? error.message : undefined
// which FAILS-OPEN on a misconfigured NODE_ENV (unset, typo'd, or set to
// something like "staging" / "test"): the conditional thinks it's NOT
// development, but it's also NOT production, and admin endpoints would
// still leak the raw error.message. Inverting to !== 'production' gives
// fail-closed behavior — only production strips the detail, everything
// else gets it.
//
// Use:  res.status(500).json({ success: false, message: '...', error: errorDetail(err) });
export function errorDetail(err) {
  if (process.env.NODE_ENV === 'production') return undefined;
  return err?.message;
}
