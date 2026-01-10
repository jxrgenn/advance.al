// API Configuration
console.log('🌍 Environment Variables Debug:', {
  all_env_vars: import.meta.env,
  VITE_API_URL: import.meta.env.VITE_API_URL,
  NODE_ENV: import.meta.env.NODE_ENV,
  MODE: import.meta.env.MODE
});

// Get the API URL and ensure it has the correct format
let rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Fix common issues with the API URL
if (rawApiUrl.includes('.com.api')) {
  rawApiUrl = rawApiUrl.replace('.com.api', '.com/api');
}
if (rawApiUrl.includes('.com/api/api')) {
  rawApiUrl = rawApiUrl.replace('.com/api/api', '.com/api');
}

const API_BASE_URL = rawApiUrl;
console.log('🔧 Fixed API_BASE_URL:', { original: import.meta.env.VITE_API_URL, fixed: API_BASE_URL });

// Types
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Array<{ field: string; message: string }>;
}

export interface User {
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
      bio?: string;
      experience?: string;
      skills?: string[];
      education?: Array<{
        degree: string;
        school: string;
        year: number;
      }>;
      workHistory?: Array<{
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
    };
  };
  privacySettings: {
    profileVisible: boolean;
    showInSearch: boolean;
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
  tier: string;
  postedAt: string;
  expiresAt: string;
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
  employerId: {
    _id: string;
    profile: {
      employerProfile: {
        companyName: string;
        logo?: string;
        description?: string;
        website?: string;
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
  jobSeekerId: string;
  employerId: string;
  appliedAt: string;
  status: 'pending' | 'viewed' | 'shortlisted' | 'rejected' | 'hired';
  applicationMethod: 'one_click' | 'custom_form';
  customAnswers: Array<{
    question: string;
    answer: string;
  }>;
  coverLetter?: string;
  messages: Array<{
    from: string;
    message: string;
    sentAt: string;
    type: string;
    read: boolean;
  }>;
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
class ApiError extends Error {
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

const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit & { isFormData?: boolean } = {}
): Promise<ApiResponse<T>> => {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log('🔍 API Debug:', { API_BASE_URL, endpoint, url, envVar: import.meta.env.VITE_API_URL });
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
    const response = await fetch(url, {
      ...options,
      headers,
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
  // Register new user
  register: async (userData: {
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
  }): Promise<ApiResponse<{ user: User; token: string; refreshToken: string }>> => {
    const response = await apiRequest<{ user: User; token: string; refreshToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
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
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      removeAuthToken();
    }
  }
};

// Jobs API
export const jobsApi = {
  // Get all jobs with filters
  getJobs: async (params: {
    search?: string;
    city?: string;
    category?: string;
    jobType?: string;
    minSalary?: number;
    maxSalary?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
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

  // Get single job
  getJob: async (id: string): Promise<ApiResponse<{ job: Job }>> => {
    return apiRequest<{ job: Job }>(`/jobs/${id}`);
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

  // Delete job (employers only)
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

  // Update job status
  updateJobStatus: async (id: string, status: string): Promise<ApiResponse<{ job: Job }>> => {
    return apiRequest<{ job: Job }>(`/jobs/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }
};

// Applications API
export const applicationsApi = {
  // Apply for job
  apply: async (applicationData: {
    jobId: string;
    applicationMethod: 'one_click' | 'custom_form';
    customAnswers?: Array<{
      question: string;
      answer: string;
    }>;
    coverLetter?: string;
  }): Promise<ApiResponse<{ application: Application }>> => {
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
  deleteAccount: async (): Promise<ApiResponse<any>> => {
    return apiRequest('/users/account', {
      method: 'DELETE',
    });
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

// Verification API
export const verificationApi = {
  // Request verification code
  requestCode: async (data: {
    identifier: string;
    method: 'email' | 'sms';
    userType?: 'employer' | 'jobseeker';
  }): Promise<ApiResponse<{ message: string }>> => {
    return apiRequest<{ message: string }>('/verification/request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Verify code
  verifyCode: async (data: {
    identifier: string;
    code: string;
    method: 'email' | 'sms';
  }): Promise<ApiResponse<{ verified: boolean; message: string }>> => {
    return apiRequest<{ verified: boolean; message: string }>('/verification/verify', {
      method: 'POST',
      body: JSON.stringify(data),
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

// Admin API
export const adminApi = {
  // Get employers pending verification
  getPendingEmployers: async (): Promise<ApiResponse<{ employers: User[] }>> => {
    return apiRequest<{ employers: User[] }>('/users/admin/pending-employers');
  },

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
  }
};

// Quick Users API
export const quickUsersApi = {
  // Create a quick user for job notifications
  createQuickUser: async (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    city: string;
    interests: string[];
  }): Promise<ApiResponse<{ quickUser: any }>> => {
    return apiRequest<{ quickUser: any }>('/quickusers', {
      method: 'POST',
      body: JSON.stringify({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        location: data.city, // API expects 'location' field
        interests: data.interests
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