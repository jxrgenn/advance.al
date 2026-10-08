// API Configuration
let rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Fix common issues with the API URL
if (rawApiUrl.includes('.com.api')) {
  rawApiUrl = rawApiUrl.replace('.com.api', '.com/api');
}
if (rawApiUrl.includes('.com/api/api')) {
  rawApiUrl = rawApiUrl.replace('.com/api/api', '.com/api');
}

const API_BASE_URL = rawApiUrl;

// Types
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Array<{ field: string; message: string }>;
}

export interface User {
  _id: string;
  id: string;
  email: string;
  userType: 'jobseeker' | 'employer' | 'admin';
  status: string;
  profile: {
    firstName: string;
    lastName: string;
    fullName: string;
    phone?: string;
    location: {
      city: string;
      region: string;
    };
    jobSeekerProfile?: {
      title?: string;
      resume?: string;
      resumeType?: 'pdf' | 'docx' | 'doc';
      bio?: string;
      experience?: string;
      skills?: string[];
      education?: Array<{
        _id?: string;
        degree: string;
        school: string;
        year: number;
      }>;
      workHistory?: Array<{
        _id?: string;
        company: string;
        position: string;
        startDate: string;
        endDate: string;
        description: string;
      }>;
      desiredSalary?: {
        min: number;
        max: number;
        currency: string;
      };
      openToRemote: boolean;
      availability: string;
    };
    employerProfile?: {
      companyName: string;
      companySize: string;
      industry: string;
      description?: string;
      website?: string;
      verified: boolean;
      verificationStatus: string;
      subscriptionTier: string;
      isAdministrataAccount?: boolean;
    };
  };
  privacySettings: {
    profileVisible: boolean;
    showInSearch: boolean;
  };
  preferences?: {
    tutorialsEnabled?: boolean;
    salaryViewPeriod?: 'monthly' | 'yearly';
  };
  savedJobs?: string[];
}

export interface Job {
  _id: string;
  title: string;
  description: string;
  requirements: string[];
  benefits: string[];
  location: {
    city: string;
    region: string;
    remote: boolean;
    remoteType: string;
  };
  jobType: string;
  category: string;
  seniority: string;
  salary: {
    min?: number;
    max?: number;
    currency: string;
    negotiable: boolean;
    showPublic: boolean;
  };
  status: string;
  /**
   * Lifecycle state computed by GET /api/jobs/:id (single-job endpoint only):
   * 'active' = open for applications; 'expired' also covers an 'active' job
   * past expiresAt. The public only ever receives active / expired / closed;
   * draft / pending_payment / pending_approval / rejected / paused reach the
   * owning employer and admins only.
   */
  jobState?: 'active' | 'expired' | 'closed' | 'draft' | 'pending_payment' | 'pending_approval' | 'rejected' | 'paused';
  tier: string;
  postedAt: string;
  expiresAt: string;
  // Payment / lifecycle bookkeeping (employer-facing views)
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
  // Why a 'closed' job was closed — only 'employer' closes can be re-opened.
  closedReason?: 'employer' | 'suspension' | 'refund' | 'payment_canceled';
  closedFromStatus?: string;
  // On what basis the current listing period was granted ('free' = no payment needed).
  postingBasis?: 'free' | 'paid';
  pricing?: { finalPrice?: number };
  applicationMethod: string;
  customQuestions: Array<{
    question: string;
    required: boolean;
    type: string;
  }>;
  viewCount: number;
  applicationCount: number;
  tags: string[];
  slug: string;
  platformCategories?: {
    diaspora: boolean;
    ngaShtepia: boolean;
    partTime: boolean;
    administrata: boolean;
    sezonale: boolean;
  };
  employerId: {
    _id: string;
    email: string;
    profile: {
      phone?: string;
      employerProfile: {
        companyName: string;
        logo?: string;
        description?: string;
        website?: string;
        // Contact details — sent to authenticated viewers only (publicEmployer).
        phone?: string;
        whatsapp?: string;
      };
      location: {
        city: string;
        region: string;
      };
    };
  };
  formattedSalary: string;
  timeAgo: string;
}

export interface Application {
  _id: string;
  jobId: Job;
  jobSeekerId: string | User;
  employerId: string;
  appliedAt: string;
  status: 'pending' | 'viewed' | 'shortlisted' | 'rejected' | 'hired';
  applicationMethod: 'one_click' | 'custom_form';
  customAnswers: Array<{
    question: string;
    answer: string;
  }>;
  coverLetter?: string;
  // CV attached to THIS application in the apply modal (O-42). When present,
  // employers see it instead of the applicant's profile CV. Opened through
  // the same resumeView helper (POST /users/resume/sign).
  resumeUrl?: string;
  resumeType?: 'pdf' | 'docx' | 'doc';
  messages: Array<{
    from: string;
    message: string;
    sentAt: string;
    type: string;
    read: boolean;
  }>;
  withdrawn?: boolean;
  timeAgo: string;
}

export interface Location {
  _id: string;
  city: string;
  region: string;
  country: string;
  isActive: boolean;
  displayOrder: number;
  jobCount: number;
  userCount: number;
}

export interface Notification {
  _id: string;
  userId: string;
  type: 'application_status_changed' | 'application_received' | 'message_received' | 'job_expired' | 'interview_scheduled' | 'general';
  title: string;
  message: string;
  data: any;
  read: boolean;
  readAt?: string;
  relatedApplication?: string;
  relatedJob?: {
    _id: string;
    title: string;
  };
  emailSent: boolean;
  emailSentAt?: string;
  createdAt: string;
  updatedAt: string;
  timeAgo: string;
}

export interface PlatformStats {
  totalJobs: number;
  activeJobs: number;
  totalCompanies: number;
  totalJobSeekers: number;
  totalApplications: number;
  recentJobs: Array<{
    _id: string;
    title: string;
    company: string;
    location: {
      city: string;
      region: string;
    };
    category: string;
    salary?: {
      min?: number;
      max?: number;
      currency: string;
    };
    postedAt: string;
    timeAgo: string;
  }>;
}

// API Helper Functions
export class ApiError extends Error {
  constructor(public response: any, public status: number) {
    super(response.message || 'API Error');
    this.name = 'ApiError';
  }
}

const getAuthToken = (): string | null => {
  return localStorage.getItem('authToken');
};

const setAuthToken = (token: string): void => {
  localStorage.setItem('authToken', token);
};

const removeAuthToken = (): void => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
};

// Outcome of a session refresh:
//   'refreshed'   — a new token pair is in localStorage (and in the cookies);
//   'rejected'    — the session is over (revoked / expired): log out;
//   'unavailable' — rate limited, server error or offline: the session may
//                   still be fine, so keep it and try again later.
type RefreshOutcome = 'refreshed' | 'rejected' | 'unavailable';

let isRefreshing = false;
let refreshPromise: Promise<RefreshOutcome> | null = null;
// While the refresh endpoint is unavailable (429 / 5xx / offline), don't
// retry it on every request.
let refreshUnavailableUntil = 0;
const REFRESH_COOLDOWN_MS = 30_000;
const OTHER_TAB_WAIT_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Refresh tokens are single-use (the server rotates them atomically), and all
// tabs share one localStorage + cookie jar. When two tabs refresh at once, the
// loser gets 401 for a token the winner just rotated. Give the winner a moment
// to store the new pair, then adopt it instead of logging every tab out.
const adoptPairFromOtherTab = async (sentRefreshToken: string | null): Promise<boolean> => {
  const deadline = Date.now() + OTHER_TAB_WAIT_MS;
  for (;;) {
    const current = localStorage.getItem('refreshToken');
    if (current && current !== sentRefreshToken) return true;
    if (Date.now() >= deadline) return false;
    await sleep(150);
  }
};

const attemptTokenRefresh = async (): Promise<RefreshOutcome> => {
  const refreshToken = localStorage.getItem('refreshToken');
  // Only refresh when this browser holds a session. Anonymous 401s must not
  // spend the refresh rate-limit budget.
  if (!refreshToken && !localStorage.getItem('user')) return 'rejected';
  if (Date.now() < refreshUnavailableUntil) return 'unavailable';

  let refreshResponse: Response;
  try {
    // O-40: credentials:'include' is required cross-origin (advance.al →
    // api.advance.al). Without it the browser neither sends the httpOnly
    // refresh_token cookie nor stores the rotated cookie pair from the
    // response, so the cookie session silently decayed to localStorage
    // tokens after the first refresh. The body copy stays as the rollback
    // path; the backend accepts whichever copy is still live.
    refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    });
  } catch {
    // Offline / network error: nothing says the session is over.
    refreshUnavailableUntil = Date.now() + REFRESH_COOLDOWN_MS;
    return 'unavailable';
  }

  if (refreshResponse.status === 429 || refreshResponse.status >= 500) {
    // Rate limited (e.g. many users behind one NAT) or server trouble: keep
    // the session and retry after a pause instead of logging the user out.
    refreshUnavailableUntil = Date.now() + REFRESH_COOLDOWN_MS;
    return 'unavailable';
  }

  let refreshData: { success?: boolean; data?: { token: string; refreshToken: string } } | null = null;
  try {
    refreshData = await refreshResponse.json();
  } catch {
    refreshData = null;
  }
  if (refreshResponse.ok && refreshData?.success && refreshData.data) {
    setAuthToken(refreshData.data.token);
    localStorage.setItem('refreshToken', refreshData.data.refreshToken);
    return 'refreshed';
  }
  if (refreshResponse.status === 401 && await adoptPairFromOtherTab(refreshToken)) {
    return 'refreshed';
  }
  return 'rejected';
};

// One refresh at a time: concurrent 401s all wait for the same attempt, so a
// rotated-out refresh token is never presented twice.
const refreshTokensOnce = (): Promise<RefreshOutcome> => {
  if (!isRefreshing || !refreshPromise) {
    isRefreshing = true;
    refreshPromise = attemptTokenRefresh().finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit & { isFormData?: boolean; _isRetry?: boolean } = {}
): Promise<ApiResponse<T>> => {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getAuthToken();

  const headers: Record<string, string> = {
    ...options.headers as Record<string, string>,
  };

  // Don't set Content-Type for FormData - browser will set it with boundary
  if (!options.isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    // Round O-F: send cross-origin cookies on every API call so the
    // backend can read the httpOnly `auth_token` / `refresh_token` set on
    // login. We continue to attach the Authorization header from
    // localStorage in parallel — backend prefers cookie when both arrive,
    // so a rollback (stop setting cookies in backend) lands us back on
    // header-only auth with zero frontend changes.
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      // If response is not valid JSON, likely an HTML error page
      console.error('Invalid JSON response:', jsonError);
      console.error('Response status:', response.status);
      console.error('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        throw new ApiError({
          success: false,
          message: `Server error: ${response.status} ${response.statusText}`
        }, response.status);
      }

      throw new Error('Server returned invalid response format');
    }

    if (!response.ok) {
      // On 401, try to refresh the token before giving up
      if (response.status === 401 && !options._isRetry && endpoint !== '/auth/refresh' && endpoint !== '/auth/login') {
        // Use a shared promise so concurrent 401s all wait for the same refresh
        const outcome = await refreshTokensOnce();
        if (outcome === 'refreshed') {
          // Retry the original request with the new token
          return apiRequest<T>(endpoint, { ...options, _isRetry: true });
        }
        if (outcome === 'unavailable') {
          // Keep the session: a later request retries the refresh.
          throw new ApiError({
            success: false,
            message: 'Sesioni nuk u rinovua dot për momentin. Ju lutemi provoni përsëri pas pak.'
          }, 429);
        }
        // Session over — clear tokens and notify React
        removeAuthToken();
        window.dispatchEvent(new Event('auth:logout'));
      } else if (response.status === 401) {
        removeAuthToken();
        window.dispatchEvent(new Event('auth:logout'));
      }
      throw new ApiError(data, response.status);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    console.error('API request failed:', error);
    throw new Error('Gabim në lidhjen me serverin');
  }
};

// Authentication API
export const authApi = {
  // Boolean email-availability check (used by signup forms onBlur).
  // Returns { available: true } on invalid input / network errors so the form
  // never blocks on a hiccup — the real submit is the authoritative check.
  checkEmail: async (email: string): Promise<{ available: boolean }> => {
    try {
      const r = (await apiRequest<{ available: boolean }>(`/auth/check-email?email=${encodeURIComponent(email)}`, { method: 'GET' })) as unknown as { available?: boolean };
      return { available: typeof r.available === 'boolean' ? r.available : true };
    } catch {
      return { available: true };
    }
  },

  // Step 1: Validate data and send verification code
  initiateRegistration: async (userData: {
    email: string;
    password: string;
    userType: 'jobseeker' | 'employer';
    firstName: string;
    lastName: string;
    city: string;
    phone?: string;
    companyName?: string;
    industry?: string;
    companySize?: string;
    description?: string;
    website?: string;
    verificationMethod?: 'email' | 'sms';
  }): Promise<ApiResponse<null>> => {
    return apiRequest<null>('/auth/initiate-registration', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  // Step 2: Verify code and complete registration
  register: async (data: {
    email: string;
    verificationCode: string;
  }): Promise<ApiResponse<{ user: User; token: string; refreshToken: string }>> => {
    const response = await apiRequest<{ user: User; token: string; refreshToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (response.success && response.data) {
      setAuthToken(response.data.token);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }

    return response;
  },

  // Login user
  login: async (email: string, password: string): Promise<ApiResponse<{ user: User; token: string; refreshToken: string }>> => {
    const response = await apiRequest<{ user: User; token: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.success && response.data) {
      setAuthToken(response.data.token);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }

    return response;
  },

  // Get current user
  getCurrentUser: async (): Promise<ApiResponse<{ user: User }>> => {
    return apiRequest<{ user: User }>('/auth/me');
  },

  // Refresh token
  refreshToken: async (): Promise<ApiResponse<{ token: string; refreshToken: string }>> => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await apiRequest<{ token: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    if (response.success && response.data) {
      setAuthToken(response.data.token);
      localStorage.setItem('refreshToken', response.data.refreshToken);
    }

    return response;
  },

  // Logout
  logout: async (): Promise<void> => {
    // O-40: send the localStorage refresh token too — the backend revokes
    // every copy it receives (body + httpOnly cookie), so neither survives
    // logout. The request is rebuilt per attempt: when the access token has
    // expired, the refresh in between rotates the refresh token, and the
    // retry must revoke the rotated token rather than the one read before.
    const sendLogout = () => {
      const accessToken = getAuthToken();
      const refreshToken = localStorage.getItem('refreshToken');
      return fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });
    };
    try {
      const response = await sendLogout();
      if (response.status === 401 && (await refreshTokensOnce()) === 'refreshed') {
        await sendLogout();
      }
    } catch {
      // Network failure: the local session is still ended below.
    } finally {
      removeAuthToken();
    }
  },

  // Forgot password
  forgotPassword: async (email: string): Promise<ApiResponse<any>> => {
    return apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  // Reset password
  resetPassword: async (token: string, password: string): Promise<ApiResponse<any>> => {
    return apiRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },

  // Change password (authenticated)
  changePassword: async (currentPassword: string, newPassword: string): Promise<ApiResponse<{ token: string; refreshToken: string }>> => {
    const response = await apiRequest<{ token: string; refreshToken: string }>('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    // O-14: the backend revokes every session and issues this device a fresh
    // pair (also set as cookies). Store it, or the next refresh would present
    // a revoked token and log the user out.
    if (response.success && response.data?.token && response.data?.refreshToken) {
      setAuthToken(response.data.token);
      localStorage.setItem('refreshToken', response.data.refreshToken);
    }

    return response;
  },
};

// Jobs API
export const jobsApi = {
  // Get all jobs with filters.
  //
  // Salary filter CONTRACT (backend routes/jobs.js GET /):
  //   minSalary / maxSalary are MONTHLY amounts in `currency` ('EUR' | 'ALL',
  //   default EUR). Job salaries are STORED ANNUAL, so the backend multiplies
  //   the bounds ×12 before matching, and an active salary filter only matches
  //   jobs in that same currency whose salary is public. Either bound may be
  //   omitted (open-ended range). Build these params with salaryFilterQuery()
  //   from lib/salary.ts. sortBy=salary orders by an approximate
  //   EUR-equivalent; hidden / missing salaries always sort last.
  getJobs: async (params: {
    search?: string;
    city?: string;
    category?: string;
    categories?: string;
    jobType?: string;
    minSalary?: number;
    maxSalary?: number;
    experience?: string;
    seniority?: string;
    remote?: string;
    postedAfter?: string;
    company?: string;
    currency?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
    diaspora?: string;
    ngaShtepia?: string;
    partTime?: string;
    administrata?: string;
    sezonale?: string;
    tier?: string;
  } = {}): Promise<ApiResponse<{
    jobs: Job[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalJobs: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
    filters: any;
  }>> => {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = queryParams.toString() ? `/jobs?${queryParams}` : '/jobs';
    return apiRequest<any>(endpoint);
  },

  // Get single job. `countView: false` for background fetches that are not a
  // page view (e.g. the recently-viewed widget) — the backend then leaves the
  // employer-facing view count alone.
  getJob: async (id: string, opts: { countView?: boolean } = {}): Promise<ApiResponse<{ job: Job }>> => {
    return apiRequest<{ job: Job }>(`/jobs/${id}${opts.countView === false ? '?view=0' : ''}`);
  },

  // Get personalized job recommendations
  getRecommendations: async (params: {
    limit?: number;
  } = {}): Promise<ApiResponse<{ recommendations: Job[]; total: number; personalized: boolean }>> => {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = queryParams.toString() ? `/jobs/recommendations?${queryParams}` : '/jobs/recommendations';
    return apiRequest<{ recommendations: Job[]; total: number; personalized: boolean }>(endpoint);
  },

  // Get embedding-based similar jobs for a given job
  getSimilarJobs: async (jobId: string, limit: number = 4): Promise<ApiResponse<{
    similarJobs: Array<{
      job: Job;
      score: number | null;
      cosineScore?: number;
      tier?: 'strong' | 'good' | 'decent';
      computedAt?: string;
      cached?: boolean;
    }>;
    count: number;
    cached: boolean;
    computedAt?: string;
    note?: string;
  }>> => {
    return apiRequest(`/jobs/${jobId}/similar?limit=${limit}`);
  },

  // Create new job (employers only)
  createJob: async (jobData: {
    title: string;
    description: string;
    requirements?: string[];
    benefits?: string[];
    location: {
      city: string;
      remote?: boolean;
      remoteType?: string;
    };
    jobType: string;
    category: string;
    seniority?: string;
    salary?: {
      min?: number;
      max?: number;
      currency?: string;
      negotiable?: boolean;
      showPublic?: boolean;
    };
    customQuestions?: Array<{
      question: string;
      required: boolean;
      type: string;
    }>;
    tags?: string[];
    tier?: string;
  }): Promise<ApiResponse<{ job: Job }>> => {
    return apiRequest<{ job: Job }>('/jobs', {
      method: 'POST',
      body: JSON.stringify(jobData),
    });
  },

  // Update job (employers only)
  updateJob: async (id: string, jobData: any): Promise<ApiResponse<{ job: Job }>> => {
    return apiRequest<{ job: Job }>(`/jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(jobData),
    });
  },

  // Delete job (employers only). Unpaid (pending_payment) jobs delete
  // normally — the server marks paymentStatus=failed before soft-deleting
  // so any orphaned Paysera callback can be reconciled.
  deleteJob: async (id: string): Promise<ApiResponse<any>> => {
    return apiRequest(`/jobs/${id}`, {
      method: 'DELETE',
    });
  },

  // Get employer's jobs
  getEmployerJobs: async (params: {
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Promise<ApiResponse<{
    jobs: Job[];
    pagination: any;
  }>> => {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = queryParams.toString() ? `/jobs/employer/my-jobs?${queryParams}` : '/jobs/employer/my-jobs';
    return apiRequest<any>(endpoint);
  },

  // Close a job ('closed') or re-open a job the employer closed ('active').
  // Publishing is NOT done here: unpaid → checkout, expired → renewJob.
  updateJobStatus: async (id: string, status: 'active' | 'closed'): Promise<ApiResponse<{ job: Job }>> => {
    return apiRequest<{ job: Job }>(`/jobs/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Re-list an expired/closed job. Free employers get a fresh period here;
  // paying employers get HTTP 402 { code: 'PAYMENT_REQUIRED' } (thrown as
  // ApiError) and must go through paymentsApi.createCheckout with
  // purpose 'job_renewal'.
  renewJob: async (id: string): Promise<ApiResponse<{ job: Job }>> => {
    return apiRequest<{ job: Job }>(`/jobs/${id}/renew`, {
      method: 'POST',
    });
  }
};

// Applications API
export const applicationsApi = {
  // Apply for job. With `resumeFile` the request is multipart/form-data and
  // the file is stored as THIS application's CV (O-42) — it reaches the
  // employer whether or not the applicant also saves it to their profile.
  // customAnswers travel as a JSON string part in that case.
  apply: async (applicationData: {
    jobId: string;
    applicationMethod: 'one_click' | 'custom_form';
    customAnswers?: Array<{
      question: string;
      answer: string;
    }>;
    coverLetter?: string;
  }, resumeFile?: File): Promise<ApiResponse<{ application: Application }>> => {
    if (resumeFile) {
      const formData = new FormData();
      formData.append('jobId', applicationData.jobId);
      formData.append('applicationMethod', applicationData.applicationMethod);
      if (applicationData.coverLetter !== undefined) {
        formData.append('coverLetter', applicationData.coverLetter);
      }
      if (applicationData.customAnswers !== undefined) {
        formData.append('customAnswers', JSON.stringify(applicationData.customAnswers));
      }
      formData.append('resume', resumeFile);
      return apiRequest<{ application: Application }>('/applications/apply', {
        method: 'POST',
        body: formData,
        isFormData: true,
      });
    }
    return apiRequest<{ application: Application }>('/applications/apply', {
      method: 'POST',
      body: JSON.stringify(applicationData),
    });
  },

  // Get list of job IDs that user has applied to
  getAppliedJobIds: async (): Promise<ApiResponse<{ jobIds: string[] }>> => {
    return apiRequest<{ jobIds: string[] }>('/applications/applied-jobs');
  },

  // Get job seeker's applications
  getMyApplications: async (params: {
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Promise<ApiResponse<{
    applications: Application[];
    pagination: any;
  }>> => {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = queryParams.toString() ? `/applications/my-applications?${queryParams}` : '/applications/my-applications';
    return apiRequest<any>(endpoint);
  },

  // Get applications for employer's job
  getJobApplications: async (jobId: string, params: {
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Promise<ApiResponse<{
    applications: Application[];
    job: any;
    pagination: any;
  }>> => {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = queryParams.toString() ? `/applications/job/${jobId}?${queryParams}` : `/applications/job/${jobId}`;
    return apiRequest<any>(endpoint);
  },

  // Get all applications for employer
  getEmployerApplications: async (params: {
    status?: string;
    jobId?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Promise<ApiResponse<{
    applications: Application[];
    pagination: any;
  }>> => {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = queryParams.toString() ? `/applications/employer/all?${queryParams}` : '/applications/employer/all';
    return apiRequest<any>(endpoint);
  },

  // Get single application
  getApplication: async (id: string): Promise<ApiResponse<{ application: Application }>> => {
    return apiRequest<{ application: Application }>(`/applications/${id}`);
  },

  // Update application status (employers only)
  updateApplicationStatus: async (id: string, status: string, notes?: string): Promise<ApiResponse<{ application: Application }>> => {
    return apiRequest<{ application: Application }>(`/applications/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes }),
    });
  },

  // Send message about application
  sendMessage: async (id: string, message: string, type = 'text'): Promise<ApiResponse<any>> => {
    return apiRequest(`/applications/${id}/message`, {
      method: 'POST',
      body: JSON.stringify({ message, type }),
    });
  },

  // Withdraw application
  withdrawApplication: async (id: string, reason?: string): Promise<ApiResponse<any>> => {
    return apiRequest(`/applications/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  }
};

// Users API
export const usersApi = {
  // Get current user profile
  getProfile: async (): Promise<ApiResponse<{ user: User }>> => {
    return apiRequest<{ user: User }>('/users/profile');
  },

  // Update user profile
  updateProfile: async (profileData: any): Promise<ApiResponse<{ user: User }>> => {
    return apiRequest<{ user: User }>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  },

  // Get public profile (employers viewing job seekers)
  getPublicProfile: async (id: string): Promise<ApiResponse<{ user: any }>> => {
    return apiRequest<{ user: any }>(`/users/public-profile/${id}`);
  },

  // Get user statistics
  getUserStats: async (): Promise<ApiResponse<{ stats: any }>> => {
    return apiRequest<{ stats: any }>('/users/stats');
  },

  // Delete account
  deleteAccount: async (password: string): Promise<ApiResponse<any>> => {
    return apiRequest('/users/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
  },

  // Round O-B: get a short-lived (~5min) signed Cloudinary download URL for
  // a resume. The stored URL is no longer publicly accessible — backend
  // verifies caller is owner / admin / employer-with-application, then mints
  // a signed URL. Open with window.open(data.url) or fetch+blob for download.
  signResumeUrl: async (resumeUrl: string): Promise<ApiResponse<{ url: string; expiresAt: number }>> => {
    return apiRequest<{ url: string; expiresAt: number }>('/users/resume/sign', {
      method: 'POST',
      body: JSON.stringify({ resumeUrl }),
    });
  },

  // GDPR Article 20: Right to Data Portability — fetch full user data as JSON
  exportData: async (): Promise<ApiResponse<any>> => {
    return apiRequest('/users/export');
  },

  // Upload resume/CV
  uploadResume: async (formData: FormData): Promise<ApiResponse<{ resumeUrl: string; user?: User }>> => {
    return apiRequest<{ resumeUrl: string; user?: User }>('/users/upload-resume', {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header for FormData - browser will set it with boundary
      isFormData: true
    });
  },

  // Delete resume/CV from profile
  deleteResume: async (): Promise<ApiResponse<{ user: User }>> => {
    return apiRequest<{ user: User }>('/users/resume', {
      method: 'DELETE'
    });
  },

  // Upload resume/CV and parse with AI for profile auto-fill
  parseResume: async (formData: FormData): Promise<ApiResponse<{ resumeUrl: string; parsedData: any; user?: User }>> => {
    return apiRequest<{ resumeUrl: string; parsedData: any; user?: User }>('/users/parse-resume', {
      method: 'POST',
      body: formData,
      isFormData: true
    });
  },

  // Upload company logo
  uploadLogo: async (formData: FormData): Promise<ApiResponse<{ logoUrl: string; user?: User }>> => {
    return apiRequest<{ logoUrl: string; user?: User }>('/users/upload-logo', {
      method: 'POST',
      body: formData,
      isFormData: true
    });
  },

  // Upload profile photo
  uploadProfilePhoto: async (formData: FormData): Promise<ApiResponse<{ photoUrl: string; user?: User }>> => {
    return apiRequest<{ photoUrl: string; user?: User }>('/users/upload-profile-photo', {
      method: 'POST',
      body: formData,
      isFormData: true
    });
  },

  // Add work experience
  addWorkExperience: async (experienceData: {
    position: string;
    company: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    isCurrentJob: boolean;
    description?: string;
    achievements?: string;
  }): Promise<ApiResponse<{ user: User; experience: any }>> => {
    return apiRequest<{ user: User; experience: any }>('/users/work-experience', {
      method: 'POST',
      body: JSON.stringify(experienceData),
    });
  },

  // Add education
  addEducation: async (educationData: {
    degree: string;
    fieldOfStudy?: string;
    institution: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    isCurrentStudy: boolean;
    gpa?: string;
    description?: string;
  }): Promise<ApiResponse<{ user: User; education: any }>> => {
    return apiRequest<{ user: User; education: any }>('/users/education', {
      method: 'POST',
      body: JSON.stringify(educationData),
    });
  },

  // Update work experience
  updateWorkExperience: async (experienceId: string, experienceData: any): Promise<ApiResponse<{ user: User }>> => {
    return apiRequest<{ user: User }>(`/users/work-experience/${experienceId}`, {
      method: 'PUT',
      body: JSON.stringify(experienceData),
    });
  },

  // Delete work experience
  deleteWorkExperience: async (experienceId: string): Promise<ApiResponse<{ user: User }>> => {
    return apiRequest<{ user: User }>(`/users/work-experience/${experienceId}`, {
      method: 'DELETE',
    });
  },

  // Update education
  updateEducation: async (educationId: string, educationData: any): Promise<ApiResponse<{ user: User }>> => {
    return apiRequest<{ user: User }>(`/users/education/${educationId}`, {
      method: 'PUT',
      body: JSON.stringify(educationData),
    });
  },

  // Delete education
  deleteEducation: async (educationId: string): Promise<ApiResponse<{ user: User }>> => {
    return apiRequest<{ user: User }>(`/users/education/${educationId}`, {
      method: 'DELETE',
    });
  },

  // ===== Saved Jobs API Methods =====

  // Save a job
  saveJob: async (jobId: string): Promise<ApiResponse<{ message: string; savedJobs: string[] }>> => {
    return apiRequest<{ message: string; savedJobs: string[] }>(`/users/saved-jobs/${jobId}`, {
      method: 'POST',
    });
  },

  // Unsave a job
  unsaveJob: async (jobId: string): Promise<ApiResponse<{ message: string; savedJobs: string[] }>> => {
    return apiRequest<{ message: string; savedJobs: string[] }>(`/users/saved-jobs/${jobId}`, {
      method: 'DELETE',
    });
  },

  // Get user's saved jobs
  getSavedJobs: async (params: {
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<{
    savedJobs: Job[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalJobs: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }>> => {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = queryParams.toString() ? `/users/saved-jobs?${queryParams}` : '/users/saved-jobs';
    return apiRequest<any>(endpoint);
  },

  // Check if a job is saved
  isJobSaved: async (jobId: string): Promise<ApiResponse<{ isSaved: boolean }>> => {
    return apiRequest<{ isSaved: boolean }>(`/users/saved-jobs/check/${jobId}`);
  },

  // Bulk check saved status for multiple jobs (avoids N+1 API calls)
  checkSavedBulk: async (jobIds: string[]): Promise<ApiResponse<{ savedMap: Record<string, boolean> }>> => {
    return apiRequest<{ savedMap: Record<string, boolean> }>('/users/saved-jobs/check-bulk', {
      method: 'POST',
      body: JSON.stringify({ jobIds }),
    });
  },

  // Record cookie consent server-side (GDPR compliance)
  recordCookieConsent: async (): Promise<ApiResponse<any>> => {
    return apiRequest<any>('/users/cookie-consent', {
      method: 'POST',
    });
  }
};

// Locations API
export const locationsApi = {
  // Get all locations
  getLocations: async (): Promise<ApiResponse<{ locations: Location[] }>> => {
    return apiRequest<{ locations: Location[] }>('/locations');
  },

  // Get popular locations
  getPopularLocations: async (limit = 10): Promise<ApiResponse<{ locations: Location[] }>> => {
    return apiRequest<{ locations: Location[] }>(`/locations/popular?limit=${limit}`);
  }
};

// Company interface
export interface Company {
  _id: string;
  name: string;
  industry: string;
  companySize: string;
  description: string;
  website?: string;
  logo?: string;
  city: string;
  region: string;
  activeJobs: number;
  verified: boolean;
  joinedAt: string;
}

// Companies API
export const companiesApi = {
  // Get all companies with filters
  getCompanies: async (params: {
    search?: string;
    city?: string;
    industry?: string;
    companySize?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Promise<ApiResponse<{
    companies: Company[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCompanies: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
    filters: any;
  }>> => {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = queryParams.toString() ? `/companies?${queryParams}` : '/companies';
    return apiRequest<any>(endpoint);
  },

  // Get single company profile
  getCompany: async (id: string): Promise<ApiResponse<{ company: any }>> => {
    return apiRequest<{ company: any }>(`/companies/${id}`);
  },

  // Get company's jobs
  getCompanyJobs: async (id: string, params: {
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Promise<ApiResponse<{
    jobs: Job[];
    company: any;
    pagination: any;
  }>> => {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = queryParams.toString() ? `/companies/${id}/jobs?${queryParams}` : `/companies/${id}/jobs`;
    return apiRequest<any>(endpoint);
  }
};

// Auth Helper Functions
export const isAuthenticated = (): boolean => {
  return !!getAuthToken();
};

export const getCurrentUserFromStorage = (): User | null => {
  const userStr = localStorage.getItem('user');
  if (!userStr || userStr === 'undefined' || userStr === 'null') {
    return null;
  }
  try {
    return JSON.parse(userStr);
  } catch (error) {
    console.error('Error parsing user from localStorage:', error);
    localStorage.removeItem('user'); // Clear invalid data
    return null;
  }
};

export const getUserType = (): string | null => {
  const user = getCurrentUserFromStorage();
  return user?.userType || null;
};

// Notifications API
export const notificationsApi = {
  // Get user notifications
  getNotifications: async (params: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
  } = {}): Promise<ApiResponse<{
    notifications: Notification[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalNotifications: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
    unreadCount: number;
  }>> => {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = queryParams.toString() ? `/notifications?${queryParams}` : '/notifications';
    return apiRequest<any>(endpoint);
  },

  // Get unread notifications count
  getUnreadCount: async (): Promise<ApiResponse<{ unreadCount: number }>> => {
    return apiRequest<{ unreadCount: number }>('/notifications/unread-count');
  },

  // Mark single notification as read
  markAsRead: async (id: string): Promise<ApiResponse<any>> => {
    return apiRequest(`/notifications/${id}/read`, {
      method: 'PATCH',
    });
  },

  // Mark all notifications as read
  markAllAsRead: async (): Promise<ApiResponse<{ modifiedCount: number }>> => {
    return apiRequest<{ modifiedCount: number }>('/notifications/mark-all-read', {
      method: 'PATCH',
    });
  },

  // Delete notification
  deleteNotification: async (id: string): Promise<ApiResponse<any>> => {
    return apiRequest(`/notifications/${id}`, {
      method: 'DELETE',
    });
  }
};

// Stats API
export const statsApi = {
  // Get public platform statistics
  getPublicStats: async (): Promise<ApiResponse<PlatformStats>> => {
    return apiRequest<PlatformStats>('/stats/public');
  }
};

// Public runtime configuration (no auth). `smsEnabled` reflects whether
// Twilio is configured on the backend — the signup forms use it to decide
// whether to offer SMS verification.
export type PublicConfig = {
  settings: Record<string, unknown>;
  smsEnabled: boolean;
  // Card checkout usable right now (provider configured, or dev-fake in dev).
  paymentsAvailable?: boolean;
};

export const configApi = {
  getPublic: async (): Promise<ApiResponse<PublicConfig>> => {
    return apiRequest<PublicConfig>('/configuration/public');
  }
};

// Admin API
export type AdminPayment = {
  _id: string;
  title: string;
  slug?: string;
  status: string;
  paymentStatus: string;
  paymentMethod?: 'stripe' | 'paysera' | 'dev-fake' | 'admin' | 'admin-manual' | 'free';
  paymentRequired: number;
  paymentId?: string;
  paymentInitiatedAt?: string;
  paidAt?: string;
  tier: string;
  employer: { _id: string; email: string; name: string };
  latestOrder: {
    orderId: string;
    status: PaymentOrderStatus;
    provider: PaymentProvider;
    purpose: PaymentPurpose;
    tier: CheckoutTier;
    amountEur: number;
    needsRefund: boolean;
    createdAt: string;
    paidAt: string | null;
  } | null;
};

export type CheckoutTier = 'standard' | 'promoted';
export type PaymentPurpose = 'job_post' | 'job_renewal';
export type PaymentProvider = 'stripe' | 'paysera' | 'admin' | 'dev-fake' | 'free';
export type PaymentOrderStatus =
  | 'created' | 'pending' | 'paid' | 'failed' | 'canceled' | 'expired'
  | 'refunded' | 'partially_refunded' | 'disputed';

export type AdminPaymentOrder = {
  orderId: string;
  status: PaymentOrderStatus;
  purpose: PaymentPurpose;
  tier: CheckoutTier;
  amountEur: number;
  refundedEur: number;
  currency: string;
  provider: PaymentProvider;
  providerPaymentId: string | null;
  livemode: boolean | null;
  activation: 'not_applied' | 'applied' | 'skipped';
  activationReason: string | null;
  needsRefund: boolean;
  needsRefundReason: string | null;
  failureReason: string | null;
  notes: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  job: { _id: string; title: string; slug?: string; status: string; isDeleted: boolean } | null;
  employer: { _id: string; email: string; name: string };
};

export const adminApi = {
  // Get employers pending verification
  getPendingEmployers: async (): Promise<ApiResponse<{ employers: User[] }>> => {
    return apiRequest<{ employers: User[] }>('/users/admin/pending-employers');
  },

  // QA-G5: list payments with filters + pagination
  listPayments: async (params: { status?: 'all' | 'pending_payment' | 'paid' | 'failed'; employerEmail?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.employerEmail) qs.set('employerEmail', params.employerEmail);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    return apiRequest<{ payments: AdminPayment[]; pagination: { page: number; limit: number; total: number; pages: number } }>(`/admin/payments?${qs.toString()}`);
  },

  // Manual mark-paid (admin only; reason >= 5 chars). Creates an 'admin'
  // PaymentOrder and activates through the same path as a card payment.
  // Allowed for pending_payment (post) or expired/closed (renewal) jobs.
  manualAcceptPayment: async (jobId: string, reason: string, opts: { tier?: CheckoutTier; amountCents?: number } = {}) =>
    apiRequest<{
      jobId: string; status: string; paymentStatus: string; paymentMethod: string; paymentId: string; paidAt: string;
      expiresAt: string; orderId: string; purpose: PaymentPurpose; tier: CheckoutTier; amountEur: number; supersededCheckouts: number;
    }>(
      `/admin/payments/${jobId}/manual-accept`,
      { method: 'POST', body: JSON.stringify({ reason, ...opts }) }
    ),

  // PaymentOrder list (admin)
  listPaymentOrders: async (params: { status?: PaymentOrderStatus | 'all'; provider?: PaymentProvider; needsRefund?: boolean; employerEmail?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status && params.status !== 'all') qs.set('status', params.status);
    if (params.provider) qs.set('provider', params.provider);
    if (params.needsRefund !== undefined) qs.set('needsRefund', String(params.needsRefund));
    if (params.employerEmail) qs.set('employerEmail', params.employerEmail);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    return apiRequest<{ orders: AdminPaymentOrder[]; pagination: { page: number; limit: number; total: number; pages: number } }>(`/admin/payments/orders?${qs.toString()}`);
  },

  // Refund an order (Stripe → real refund; other providers → record-only).
  refundOrder: async (orderId: string, reason: string, amountCents?: number) =>
    apiRequest<{ orderId: string; status: PaymentOrderStatus; refundedEur: number; needsRefund: boolean; refundId: string | null; recordedOnly: boolean; jobClosed: boolean }>(
      `/admin/payments/orders/${orderId}/refund`,
      { method: 'POST', body: JSON.stringify(amountCents === undefined ? { reason } : { reason, amountCents }) }
    ),

  // Clear a needsRefund flag without refunding (decision recorded).
  resolveOrderRefundFlag: async (orderId: string, reason: string) =>
    apiRequest<{ orderId: string; needsRefund: boolean; needsRefundReason: string }>(
      `/admin/payments/orders/${orderId}/resolve`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),

  // Verify or reject employer
  verifyEmployer: async (id: string, action: 'approve' | 'reject'): Promise<ApiResponse<{ employer: User }>> => {
    return apiRequest<{ employer: User }>(`/users/admin/verify-employer/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    });
  },

  // Get dashboard statistics
  getDashboardStats: async (): Promise<ApiResponse<{
    totalUsers: number;
    totalEmployers: number;
    totalJobSeekers: number;
    totalJobs: number;
    activeJobs: number;
    totalApplications: number;
    pendingEmployers: number;
    verifiedEmployers: number;
    quickUsers: number;
    totalRevenue: number;
    monthlyGrowth: {
      users: number;
      jobs: number;
      applications: number;
    };
    topCategories: Array<{ name: string; count: number }>;
    topCities: Array<{ name: string; count: number }>;
    recentActivity: Array<{
      type: 'job_posted' | 'user_registered' | 'application_submitted';
      description: string;
      timestamp: string;
    }>;
  }>> => {
    return apiRequest('/admin/dashboard-stats');
  },

  // Get platform analytics
  getAnalytics: async (period: 'week' | 'month' | 'year' = 'month'): Promise<ApiResponse<{
    userGrowth: Array<{ date: string; count: number }>;
    jobGrowth: Array<{ date: string; count: number }>;
    applicationGrowth: Array<{ date: string; count: number }>;
    conversionRates: {
      visitorToRegistration: number;
      registrationToApplication: number;
      applicationToHire: number;
    };
    topPerformingJobs: Array<{
      id: string;
      title: string;
      company: string;
      applicationCount: number;
      viewCount: number;
    }>;
    userEngagement: {
      averageSessionDuration: number;
      returnVisitorRate: number;
      emailOpenRate: number;
      emailClickRate: number;
    };
  }>> => {
    return apiRequest(`/admin/analytics?period=${period}`);
  },

  // Get system health metrics
  getSystemHealth: async (): Promise<ApiResponse<{
    serverStatus: 'healthy' | 'warning' | 'error';
    databaseStatus: 'connected' | 'disconnected' | 'slow';
    emailServiceStatus: 'operational' | 'limited' | 'down';
    storageUsage: {
      total: number;
      used: number;
      available: number;
    };
    apiResponseTimes: {
      average: number;
      p95: number;
      p99: number;
    };
    errorRates: {
      last24h: number;
      last7d: number;
    };
    uptime: {
      current: number;
      last30Days: number;
    };
  }>> => {
    return apiRequest('/admin/system-health');
  },

  // Manage user actions
  manageUser: async (userId: string, action: 'suspend' | 'activate' | 'delete', reason?: string): Promise<ApiResponse<{ user: User }>> => {
    return apiRequest(`/admin/users/${userId}/manage`, {
      method: 'PATCH',
      body: JSON.stringify({ action, reason }),
    });
  },

  // Manage job actions
  manageJob: async (jobId: string, action: 'approve' | 'reject' | 'feature' | 'remove_feature' | 'delete', reason?: string): Promise<ApiResponse<{ job: Job }>> => {
    return apiRequest(`/admin/jobs/${jobId}/manage`, {
      method: 'PATCH',
      body: JSON.stringify({ action, reason }),
    });
  },

  // Get all users with pagination and filters
  getAllUsers: async (params: {
    userType?: 'jobseeker' | 'employer' | 'admin';
    status?: 'active' | 'suspended' | 'pending';
    page?: number;
    limit?: number;
    search?: string;
  } = {}): Promise<ApiResponse<{
    users: User[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalUsers: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }>> => {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = queryParams.toString() ? `/admin/users?${queryParams}` : '/admin/users';
    return apiRequest(endpoint);
  },

  // Get all jobs with admin view
  getAllJobs: async (params: {
    status?: 'active' | 'expired' | 'draft' | 'rejected';
    employerId?: string;
    page?: number;
    limit?: number;
    search?: string;
  } = {}): Promise<ApiResponse<{
    jobs: Job[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalJobs: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }>> => {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = queryParams.toString() ? `/admin/jobs?${queryParams}` : '/admin/jobs';
    return apiRequest(endpoint);
  },

  // Send system notification to users
  sendSystemNotification: async (data: {
    recipients: 'all' | 'jobseekers' | 'employers' | string[];
    title: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'error';
    sendEmail?: boolean;
  }): Promise<ApiResponse<{ notificationsSent: number }>> => {
    return apiRequest('/admin/notifications/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Send bulk notification (alias for sendSystemNotification with email support)
  sendBulkNotification: async (data: {
    title: string;
    message: string;
    type: string;
    targetAudience: string;
  }): Promise<ApiResponse<{ totalRecipients: number; sent: number; failed: number }>> => {
    // Map our UI fields to the API format
    let recipients: 'all' | 'jobseekers' | 'employers';
    switch (data.targetAudience) {
      case 'jobseekers':
        recipients = 'jobseekers';
        break;
      case 'employers':
        recipients = 'employers';
        break;
      case 'quick_users':
      case 'all':
      default:
        recipients = 'all';
        break;
    }

    const response = await apiRequest<{ notificationsSent: number }>('/admin/notifications/send', {
      method: 'POST',
      body: JSON.stringify({
        recipients,
        title: data.title,
        message: data.message,
        type: data.type === 'announcement' ? 'info' : data.type,
        sendEmail: true
      }),
    });

    // Transform response to match expected format
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          totalRecipients: response.data.notificationsSent,
          sent: response.data.notificationsSent,
          failed: 0
        }
      };
    }

    return response as any;
  },

  // New bulk notification methods using the dedicated API
  createBulkNotification: async (data: {
    title: string;
    message: string;
    type: string;
    targetAudience: string;
    deliveryChannels?: {
      inApp: boolean;
      email: boolean;
    };
    template?: boolean;
    templateName?: string;
  }): Promise<ApiResponse<{
    bulkNotification: any;
    targetCount: number;
  }>> => {
    return apiRequest('/bulk-notifications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get bulk notification history
  getBulkNotificationHistory: async (params: {
    page?: number;
    limit?: number;
    status?: string;
    targetAudience?: string;
    type?: string;
  } = {}): Promise<ApiResponse<{
    bulkNotifications: any[];
    pagination: any;
  }>> => {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = queryParams.toString() ? `/bulk-notifications?${queryParams}` : '/bulk-notifications';
    return apiRequest(endpoint);
  },

  // Get notification templates
  getNotificationTemplates: async (): Promise<ApiResponse<{
    templates: any[];
  }>> => {
    return apiRequest('/bulk-notifications/templates/list');
  },

  // Configuration management methods
  getConfiguration: async (category?: string): Promise<ApiResponse<{
    settings: any;
    auditHistory?: any[];
  }>> => {
    const endpoint = category ? `/configuration?category=${category}` : '/configuration';
    return apiRequest(endpoint);
  },

  updateConfiguration: async (id: string, data: {
    value: any;
    reason?: string;
  }): Promise<ApiResponse<{
    setting: any;
  }>> => {
    return apiRequest(`/configuration/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  resetConfiguration: async (id: string, reason?: string): Promise<ApiResponse<{
    setting: any;
  }>> => {
    return apiRequest(`/configuration/${id}/reset`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  initializeDefaultConfiguration: async (): Promise<ApiResponse<{
    createdSettings: any[];
  }>> => {
    return apiRequest('/configuration/initialize-defaults', {
      method: 'POST',
    });
  },

  // Business Control Methods
  getBusinessCampaigns: async (): Promise<ApiResponse<{ campaigns: any[] }>> => {
    return apiRequest('/business-control/campaigns');
  },

  getPricingRules: async (): Promise<ApiResponse<{ rules: any[] }>> => {
    return apiRequest('/business-control/pricing-rules');
  },

  getBusinessAnalytics: async (period: string = 'month'): Promise<ApiResponse<any>> => {
    return apiRequest(`/business-control/analytics/dashboard?period=${period}`);
  },

  createCampaign: async (campaignData: any): Promise<ApiResponse<{ campaign: any }>> => {
    return apiRequest('/business-control/campaigns', {
      method: 'POST',
      body: JSON.stringify(campaignData),
    });
  },

  updateCampaign: async (campaignId: string, action: string): Promise<ApiResponse<any>> => {
    return apiRequest(`/business-control/campaigns/${campaignId}/${action}`, {
      method: 'POST',
    });
  },

  updateCampaignData: async (campaignId: string, campaignData: any): Promise<ApiResponse<any>> => {
    return apiRequest(`/business-control/campaigns/${campaignId}`, {
      method: 'PUT',
      body: JSON.stringify(campaignData),
    });
  },

  createPricingRule: async (ruleData: any): Promise<ApiResponse<{ rule: any }>> => {
    return apiRequest('/business-control/pricing-rules', {
      method: 'POST',
      body: JSON.stringify(ruleData),
    });
  },

  executeEmergencyControl: async (action: string): Promise<ApiResponse<any>> => {
    return apiRequest('/business-control/platform/emergency', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  },

  getWhitelistedEmployers: async (): Promise<ApiResponse<{ employers: any[] }>> => {
    return apiRequest('/business-control/whitelist');
  },

  addToWhitelist: async (employerId: string, reason: string): Promise<ApiResponse<any>> => {
    return apiRequest(`/business-control/whitelist/${employerId}`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  removeFromWhitelist: async (employerId: string): Promise<ApiResponse<any>> => {
    return apiRequest(`/business-control/whitelist/${employerId}`, {
      method: 'DELETE'
    });
  },

  searchEmployers: async (query: string, limit = 10): Promise<ApiResponse<{ employers: any[] }>> => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return apiRequest(`/business-control/employers/search?${params}`);
  }
};

// Quick Users API
export const quickUsersApi = {
  // Create a quick user for job notifications (supports optional CV file upload)
  createQuickUser: async (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    city: string;
    interests: string[];
    customInterests?: string[];
    resume?: File | null;
  }): Promise<ApiResponse<{ quickUser: any }>> => {
    // Use FormData when a resume file is provided
    if (data.resume) {
      const formData = new FormData();
      formData.append('firstName', data.firstName);
      formData.append('lastName', data.lastName);
      formData.append('email', data.email);
      if (data.phone) formData.append('phone', data.phone);
      formData.append('location', data.city);
      formData.append('interests', JSON.stringify(data.interests));
      if (data.customInterests) formData.append('customInterests', JSON.stringify(data.customInterests));
      formData.append('resume', data.resume);

      return apiRequest<{ quickUser: any }>('/quickusers', {
        method: 'POST',
        body: formData,
        isFormData: true,
      });
    }

    // Plain JSON when no file
    return apiRequest<{ quickUser: any }>('/quickusers', {
      method: 'POST',
      body: JSON.stringify({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        ...(data.phone && { phone: data.phone }),
        location: data.city, // API expects 'location' field
        interests: data.interests,
        ...(data.customInterests && { customInterests: data.customInterests })
      }),
    });
  }
};

// Reports API Types
export interface Report {
  _id: string;
  reportedUser: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    userType: string;
  };
  reportingUser: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    userType: string;
  };
  category: string;
  description: string;
  evidence: string[];
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedAdmin?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  resolution?: {
    action: string;
    reason: string;
    duration?: number;
    resolvedBy: string;
    resolvedAt: string;
    adminNotes?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ReportAction {
  _id: string;
  report: string;
  actionType: string;
  performedBy: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  targetUser?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  actionDetails: {
    actionData: {
      reason?: string;
      duration?: number;
      notes?: string;
    };
  };
  createdAt: string;
}

// Reports API
export const reportsApi = {
  // Submit a new report
  submitReport: async (data: {
    reportedUserId: string;
    category: string;
    description: string;
    evidence?: string[];
  }): Promise<ApiResponse<{ reportId: string; status: string; priority: string; createdAt: string }>> => {
    return apiRequest<{ reportId: string; status: string; priority: string; createdAt: string }>('/reports', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get user's submitted reports
  getUserReports: async (page = 1, limit = 10): Promise<ApiResponse<{
    reports: Report[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalReports: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }>> => {
    return apiRequest<{
      reports: Report[];
      pagination: {
        currentPage: number;
        totalPages: number;
        totalReports: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>(`/reports?page=${page}&limit=${limit}`, {
      method: 'GET',
    });
  },

  // Admin: Get all reports with filtering
  getAdminReports: async (filters: {
    status?: string;
    priority?: string;
    category?: string;
    assignedAdmin?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Promise<ApiResponse<{
    reports: Report[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalReports: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    statistics: {
      statusBreakdown: Array<{ _id: string; count: number }>;
      priorityBreakdown: Array<{ _id: string; count: number }>;
      categoryBreakdown: Array<{ _id: string; count: number }>;
    };
  }>> => {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    return apiRequest<{
      reports: Report[];
      pagination: {
        currentPage: number;
        totalPages: number;
        totalReports: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
      statistics: {
        statusBreakdown: Array<{ _id: string; count: number }>;
        priorityBreakdown: Array<{ _id: string; count: number }>;
        categoryBreakdown: Array<{ _id: string; count: number }>;
      };
    }>(`/reports/admin?${queryParams.toString()}`, {
      method: 'GET',
    });
  },

  // Admin: Get specific report details
  getReportDetails: async (reportId: string): Promise<ApiResponse<{
    report: Report;
    actions: ReportAction[];
    relatedReports: Report[];
    userViolationHistory: number;
  }>> => {
    return apiRequest<{
      report: Report;
      actions: ReportAction[];
      relatedReports: Report[];
      userViolationHistory: number;
    }>(`/reports/admin/${reportId}`, {
      method: 'GET',
    });
  },

  // Admin: Update report
  updateReport: async (reportId: string, updates: {
    status?: string;
    priority?: string;
    assignedAdmin?: string;
    adminNotes?: string;
  }): Promise<ApiResponse<{ report: Report }>> => {
    return apiRequest<{ report: Report }>(`/reports/admin/${reportId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Admin: Take action on reported user
  takeAction: async (reportId: string, actionData: {
    action: string;
    reason: string;
    duration?: number;
    notifyUser?: boolean;
  }): Promise<ApiResponse<{ report: Report; action: ReportAction }>> => {
    return apiRequest<{ report: Report; action: ReportAction }>(`/reports/admin/${reportId}/action`, {
      method: 'POST',
      body: JSON.stringify(actionData),
    });
  },

  // Admin: Get reporting statistics
  getReportStats: async (timeframe = 30): Promise<ApiResponse<{
    summary: {
      totalReports: number;
      resolvedReports: number;
      pendingReports: number;
      resolutionRate: string;
      averageResolutionTime: string;
    };
    reportStats: any;
    actionStats: any;
    topReportedUsers: Array<{
      userId: string;
      count: number;
      user: {
        firstName: string;
        lastName: string;
        email: string;
        userType: string;
      };
    }>;
    timeframe: number;
  }>> => {
    return apiRequest<{
      summary: {
        totalReports: number;
        resolvedReports: number;
        pendingReports: number;
        resolutionRate: string;
        averageResolutionTime: string;
      };
      reportStats: any;
      actionStats: any;
      topReportedUsers: Array<{
        userId: string;
        count: number;
        user: {
          firstName: string;
          lastName: string;
          email: string;
          userType: string;
        };
      }>;
      timeframe: number;
    }>(`/reports/admin/stats?timeframe=${timeframe}`, {
      method: 'GET',
    });
  },

  // Admin: Reopen a resolved report
  reopenReport: async (reportId: string, reason?: string): Promise<ApiResponse<{ report: Report }>> => {
    return apiRequest<{ report: Report }>(`/reports/admin/${reportId}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }
};

// Candidate Match Interface
export interface CandidateMatch {
  _id: string;
  jobId: string;
  candidateId: {
    _id: string;
    email: string;
    profile: {
      firstName: string;
      lastName: string;
      phone?: string;
      location?: {
        city: string;
        region: string;
      };
      jobSeekerProfile?: {
        title?: string;
        experience?: string;
        skills?: string[];
        bio?: string;
        resume?: string;
        availability?: string;
        desiredSalary?: {
          min: number;
          max: number;
          currency: string;
        };
      };
    };
    createdAt: string;
  };
  matchScore: number;
  matchBreakdown: {
    titleMatch: number;
    skillsMatch: number;
    experienceMatch: number;
    locationMatch: number;
    educationMatch: number;
    salaryMatch: number;
    availabilityMatch: number;
  };
  calculatedAt: string;
  expiresAt: string;
  contacted: boolean;
  contactedAt?: string;
  contactMethod?: 'email' | 'phone' | 'whatsapp';
}

// Candidate Matching API
export const matchingApi = {
  /**
   * Get matching candidates for a job
   */
  getMatchingCandidates: async (jobId: string, limit: number = 15): Promise<ApiResponse<{
    jobId: string;
    matches: CandidateMatch[];
    fromCache: boolean;
    count: number;
  }>> => {
    return apiRequest(`/matching/jobs/${jobId}/candidates?limit=${limit}`);
  },

  /**
   * Purchase candidate matching access for a job
   */
  purchaseMatching: async (jobId: string): Promise<ApiResponse<{
    jobId: string;
    accessGranted: boolean;
  }>> => {
    return apiRequest(`/matching/jobs/${jobId}/purchase`, {
      method: 'POST'
    });
  },

  /**
   * Track when employer contacts a candidate
   */
  trackContact: async (jobId: string, candidateId: string, contactMethod: 'email' | 'phone' | 'whatsapp'): Promise<ApiResponse<{}>> => {
    return apiRequest('/matching/track-contact', {
      method: 'POST',
      body: JSON.stringify({ jobId, candidateId, contactMethod })
    });
  },

  /**
   * Check if employer has access to candidate matching for a job
   */
  checkAccess: async (jobId: string): Promise<ApiResponse<{
    jobId: string;
    hasAccess: boolean;
  }>> => {
    return apiRequest(`/matching/jobs/${jobId}/access`);
  }
};

// CV AI Generation API
export const cvApi = {
  /**
   * Generate CV from natural language input
   */
  generate: async (naturalLanguageInput: string, targetLanguage: 'sq' | 'en' = 'sq'): Promise<ApiResponse<{
    cvData: any;
    language: string;
    files: {
      pdf: { fileId: string; fileName: string; fileSize: number };
      docx: { fileId: string; fileName: string; fileSize: number };
    };
    // Legacy fields (DOCX) — kept for backward compatibility.
    fileId: string;
    fileName: string;
    fileSize: number;
    downloadUrl: string;
    previewUrl: string;
  }>> => {
    const response = await apiRequest('/cv/generate', {
      method: 'POST',
      body: JSON.stringify({ naturalLanguageInput, targetLanguage })
    });
    return response;
  },

  /**
   * Download CV file with authentication
   */
  downloadFile: async (fileId: string, fileName: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/cv/download/${fileId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to download CV');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  /**
   * Preview CV file in new tab with authentication
   */
  previewFile: async (fileId: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/cv/preview/${fileId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to preview CV');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const newWindow = window.open(url, '_blank');

    if (newWindow) {
      setTimeout(() => { window.URL.revokeObjectURL(url); }, 10000);
    }
  },

  /**
   * Get current user's CV data
   */
  getMyCv: async (): Promise<ApiResponse<{
    cvData: any;
    cvFile: any;
    generatedAt: string;
    lastUpdatedAt: string;
  }>> => {
    return apiRequest('/cv/my-cv');
  },

  /**
   * O-70: set the latest AI-generated PDF as the profile CV ("Përdore si
   * CV-në time"). Only called on an explicit click. `pdfFileId` is the PDF the
   * page is showing — the backend answers 409 if a newer generation replaced
   * it meanwhile. Replaces (and deletes) any existing profile CV.
   */
  useAsProfile: async (pdfFileId: string): Promise<ApiResponse<{
    resumeUrl: string;
    resumeType: 'pdf';
    replacedExisting: boolean;
  }>> => {
    return apiRequest('/cv/use-as-profile', {
      method: 'POST',
      body: JSON.stringify({ fileId: pdfFileId }),
    });
  }
};

// Card payments (Stripe-hosted checkout; see backend PAYMENTS.md)
export type PaymentOrderView = {
  orderId: string;
  status: PaymentOrderStatus;
  purpose: PaymentPurpose;
  tier: CheckoutTier;
  amountEur: number;
  currency: string;
  provider: PaymentProvider;
  jobId: string;
  jobSlug: string | null;
  jobTitle: string | null;
  jobStatus: string | null;
  paidAt: string | null;
  activation: 'not_applied' | 'applied' | 'skipped';
  checkoutExpiresAt: string | null;
};

export const paymentsApi = {
  /**
   * Open a hosted checkout for a job. Returns the URL to send the browser to
   * (Stripe, or a relative /payment/fake-success?order=… in dev without keys).
   * Errors (thrown ApiError): 400 INVALID_JOB_STATE / FREE_POSTING / INVALID_TIER,
   * 409 CHECKOUT_IN_PROGRESS / ALREADY_PAID, 502 PROVIDER_ERROR,
   * 503 PAYMENTS_UNAVAILABLE.
   */
  createCheckout: (jobId: string, tier: CheckoutTier, purpose: PaymentPurpose = 'job_post') =>
    apiRequest<{ url: string; orderId: string; amountEur: number; tier: CheckoutTier; purpose: PaymentPurpose; fake?: boolean; reused?: boolean }>(
      '/payments/checkout',
      { method: 'POST', body: JSON.stringify({ jobId, tier, purpose }) }
    ),

  /** Real order status (the success page polls this; never trust the redirect alone). */
  getOrder: (orderId: string) =>
    apiRequest<PaymentOrderView>(`/payments/orders/${encodeURIComponent(orderId)}`),

  /** Dev-only: complete a dev-fake order (no payment provider configured). */
  fakeComplete: (orderId: string) =>
    apiRequest<PaymentOrderView>(`/payments/orders/${encodeURIComponent(orderId)}/fake-complete`, { method: 'POST' }),

  /**
   * What THIS employer can do for this job right now: `free` (posts free now →
   * publishFree), `paymentsAvailable` (card checkout usable for this user),
   * and the exact prices checkout charges.
   */
  getOptions: (jobId: string) =>
    apiRequest<PaymentOptions>(`/payments/options?jobId=${encodeURIComponent(jobId)}`),

  /** Publish a pending_payment job without paying — only when the employer posts free now. */
  publishFree: (jobId: string) =>
    apiRequest<PaymentOrderView>('/payments/publish-free', { method: 'POST', body: JSON.stringify({ jobId }) }),
};

export type PaymentOptions = {
  jobStatus: string;
  jobTier: string;
  free: boolean;
  paymentsAvailable: boolean;
  testMode: boolean;
  prices: { standard: number; promoted: number };
};