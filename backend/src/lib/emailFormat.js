// Email format check shared by every Mongoose schema that stores an email.
//
// The previous QuickUser/Job pattern /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,63})+$/
// backtracked exponentially: a 34-character local part such as
// 'aaaa…aaa+x@company.al' (accepted by express-validator's isEmail) pinned the
// event loop for minutes inside save(). This pattern has no nested quantifiers;
// its worst case is quadratic, and the RFC 5321 length cap keeps that negligible.
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MAX_EMAIL_LENGTH = 254;

export function isEmailFormat(value) {
  return typeof value === 'string'
    && value.length <= MAX_EMAIL_LENGTH
    && EMAIL_FORMAT.test(value);
}

// Mongoose validator with the same semantics as `match`: empty values pass
// (required-ness is a separate validator).
export const emailFormatValidator = (value) =>
  value == null || value === '' || isEmailFormat(value);
