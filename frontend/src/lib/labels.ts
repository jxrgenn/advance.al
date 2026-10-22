/**
 * Albanian labels for every enum value the UI shows to people.
 *
 * Raw API values ("full-time", "closed", "medium", "pending", "warning",
 * "report_created" …) must never reach the screen — render them through
 * these helpers. Unknown values fall back to a neutral Albanian word, not
 * to the English enum.
 */

const lookup = (map: Record<string, string>, value: string | null | undefined, fallback: string): string =>
  (value && map[value]) || fallback;

// ── Jobs ──────────────────────────────────────────────────────────────────

export const JOB_TYPE_LABELS: Record<string, string> = {
  'full-time': 'Me kohë të plotë',
  'part-time': 'Me kohë të pjesshme',
  internship: 'Praktikë',
};
export const jobTypeLabel = (value: string | null | undefined): string =>
  lookup(JOB_TYPE_LABELS, value, '');
/** Select options for the job-type pickers (PostJob / EditJob). */
export const JOB_TYPE_OPTIONS = Object.entries(JOB_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export const JOB_STATUS_LABELS: Record<string, string> = {
  active: 'Aktive',
  pending_approval: 'Në pritje të miratimit',
  pending_payment: 'Pritet pagesa',
  draft: 'Draft',
  paused: 'Pezulluar',
  closed: 'Mbyllur',
  expired: 'Skaduar',
  rejected: 'Refuzuar',
};

const CLOSED_REASON_SUFFIX: Record<string, string> = {
  refund: 'rimbursuar',
  suspension: 'llogaria u pezullua',
  payment_canceled: 'pagesa u anulua',
};

/**
 * Status label for a job. A closed job says WHY when the reason is not the
 * employer's own choice, e.g. "Mbyllur — rimbursuar".
 */
export const jobStatusLabel = (
  status: string | null | undefined,
  closedReason?: string | null,
): string => {
  const base = lookup(JOB_STATUS_LABELS, status, 'Panjohur');
  if (status === 'closed' && closedReason && CLOSED_REASON_SUFFIX[closedReason]) {
    return `${base} — ${CLOSED_REASON_SUFFIX[closedReason]}`;
  }
  return base;
};

/**
 * Admin moderation actions the API accepts for a job in a given state
 * (routes/admin.js PATCH /jobs/:id/manage): "approve" only from
 * pending_approval / rejected; "reject" makes sense for a job that is or is
 * about to be public. Showing buttons the API always refuses was a dead end.
 */
export const canAdminApproveJob = (status: string | null | undefined): boolean =>
  status === 'pending_approval' || status === 'rejected';
export const canAdminRejectJob = (status: string | null | undefined): boolean =>
  status === 'active' || status === 'pending_approval' || status === 'pending_payment';

// ── Users ─────────────────────────────────────────────────────────────────

export const USER_STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  pending_verification: 'Në pritje',
  suspended: 'Pezulluar',
  banned: 'Bllokuar',
  deleted: 'Fshirë',
};

type UserLike = {
  status?: string;
  userType?: string;
  profile?: { employerProfile?: { verificationStatus?: string } };
};

/** Account status label; a rejected employer reads "Refuzuar", not "Në pritje". */
export const userStatusLabel = (user: UserLike | null | undefined): string => {
  if (!user) return '';
  if (
    user.userType === 'employer' &&
    user.status === 'pending_verification' &&
    user.profile?.employerProfile?.verificationStatus === 'rejected'
  ) {
    return 'Refuzuar';
  }
  return lookup(USER_STATUS_LABELS, user.status, 'Panjohur');
};

// ── Reports ───────────────────────────────────────────────────────────────

export const REPORT_STATUS_LABELS: Record<string, string> = {
  pending: 'Në pritje',
  under_review: 'Në shqyrtim',
  resolved: 'Zgjidhur',
  dismissed: 'Hedhur poshtë',
};
export const reportStatusLabel = (value: string | null | undefined): string =>
  lookup(REPORT_STATUS_LABELS, value, 'Panjohur');

export const REPORT_PRIORITY_LABELS: Record<string, string> = {
  low: 'E ulët',
  medium: 'Mesatare',
  high: 'E lartë',
  critical: 'Kritike',
};
export const reportPriorityLabel = (value: string | null | undefined): string =>
  lookup(REPORT_PRIORITY_LABELS, value, 'Panjohur');

export const REPORT_CATEGORY_LABELS: Record<string, string> = {
  fake_cv: 'CV i rremë',
  inappropriate_content: 'Përmbajtje e papërshtatshme',
  suspicious_profile: 'Profil i dyshimtë',
  spam_behavior: 'Sjellje spam',
  impersonation: 'Personifikim',
  harassment: 'Ngacmim',
  fake_job_posting: 'Njoftim pune i rremë',
  unprofessional_behavior: 'Sjellje joprofesionale',
  other: 'Tjetër',
};
export const reportCategoryLabel = (value: string | null | undefined): string =>
  lookup(REPORT_CATEGORY_LABELS, value, 'Tjetër');

/** Resolution actions an admin can take on a report. */
export const REPORT_ACTION_LABELS: Record<string, string> = {
  no_action: 'Asnjë veprim',
  warning: 'Paralajmërim',
  temporary_suspension: 'Pezullim i përkohshëm',
  permanent_suspension: 'Pezullim i përhershëm',
  account_termination: 'Mbyllje llogarie',
};
export const reportActionLabel = (value: string | null | undefined): string =>
  lookup(REPORT_ACTION_LABELS, value, 'Veprim');

/** ReportAction.actionType — the report's audit history. */
export const REPORT_ACTION_TYPE_LABELS: Record<string, string> = {
  report_created: 'Raporti u krijua',
  report_assigned: 'Raporti u caktua',
  report_reviewed: 'Raporti u shqyrtua',
  report_escalated: 'Raporti u përshkallëzua',
  report_resolved: 'Raporti u zgjidh',
  report_dismissed: 'Raporti u hodh poshtë',
  user_warned: 'Përdoruesi u paralajmërua',
  user_suspended: 'Përdoruesi u pezullua',
  user_banned: 'Përdoruesi u bllokua',
  suspension_lifted: 'Pezullimi u hoq',
  note_added: 'U shtua shënim',
  priority_changed: 'Prioriteti u ndryshua',
  status_changed: 'Statusi u ndryshua',
};
export const reportActionTypeLabel = (value: string | null | undefined): string =>
  lookup(REPORT_ACTION_TYPE_LABELS, value, 'Veprim');

// ── People names ──────────────────────────────────────────────────────────

type NamedUser = {
  profile?: { firstName?: string; lastName?: string; employerProfile?: { companyName?: string } };
  email?: string;
} | null | undefined;

/**
 * "Emër Mbiemër" from a populated user (names live under profile.*), with
 * the company in brackets for employers; falls back to the email, then to
 * `fallback`. Never renders "undefined".
 */
export const displayUserName = (user: NamedUser, fallback = 'Përdorues i panjohur'): string => {
  if (!user) return fallback;
  const name = [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ').trim();
  const company = user.profile?.employerProfile?.companyName?.trim();
  if (name && company) return `${name} (${company})`;
  return name || company || user.email || fallback;
};
