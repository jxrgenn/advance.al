import type { Job } from "@/lib/api";

/**
 * Quick-apply (one POST with no answers) is only valid for a job that has no
 * custom questions: the API rejects an application that skips a REQUIRED
 * question (400), and optional ones deserve a chance to be answered. When the
 * list item carries no question info at all we cannot tell — so in every
 * case except "known to have zero questions" the caller must send the user to
 * the full apply form (JobDetail opens ApplyModal for `state.openApply`).
 */
export const needsApplyForm = (job: Pick<Job, 'customQuestions'> | null | undefined): boolean =>
  !job || !Array.isArray(job.customQuestions) || job.customQuestions.length > 0;

/** Router target for the full apply flow of a job (JobDetail + ApplyModal). */
export const applyFormRoute = (job: Pick<Job, '_id' | 'slug'> | null | undefined, jobId: string) => ({
  to: `/jobs/${job?.slug || jobId}`,
  state: { openApply: true },
});
