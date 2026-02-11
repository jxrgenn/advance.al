import React, { createContext, useContext, useReducer, useEffect, useCallback, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { authApi, User, getCurrentUserFromStorage, isAuthenticated } from '@/lib/api';

// Auth State Types
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// Auth Actions
type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: User }
  | { type: 'AUTH_ERROR'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'UPDATE_USER'; payload: User };

// Initial State
const initialState: AuthState = {
  user: getCurrentUserFromStorage(),
  isAuthenticated: isAuthenticated(),
  isLoading: false,
  error: null,
};

// Auth Reducer
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    
    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    
    case 'AUTH_ERROR':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };
    
    case 'AUTH_LOGOUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };
    
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    
    case 'UPDATE_USER':
      return {
        ...state,
        user: action.payload,
      };
    
    default:
      return state;
  }
};

// Auth Context
interface AuthContextType {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (userData: {
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
  }) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  updateUser: (user: User) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth Provider
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Login function
  const login = async (email: string, password: string): Promise<void> => {
    dispatch({ type: 'AUTH_START' });
    
    try {
      const response = await authApi.login(email, password);
      
      if (response.success && response.data) {
        dispatch({ type: 'AUTH_SUCCESS', payload: response.data.user });
      } else {
        dispatch({ type: 'AUTH_ERROR', payload: response.message || 'Gabim në kyçje' });
      }
    } catch (error: any) {
      let errorMessage = 'Gabim në kyçje';
      
      if (error.response && error.response.message) {
        errorMessage = error.response.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      dispatch({ type: 'AUTH_ERROR', payload: errorMessage });
    }
  };

  // Register function
  const register = async (userData: {
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
  }): Promise<void> => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authApi.register(userData);

      if (response.success && response.data) {
        dispatch({ type: 'AUTH_SUCCESS', payload: response.data.user });
        return; // Success - promise resolves
      } else {
        const errorMessage = response.message || 'Gabim në regjistrimin';
        dispatch({ type: 'AUTH_ERROR', payload: errorMessage });
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      let errorMessage = 'Gabim në regjistrimin';

      if (error.response && error.response.message) {
        errorMessage = error.response.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      dispatch({ type: 'AUTH_ERROR', payload: errorMessage });
      throw error; // Re-throw so caller can handle
    }
  };

  // Logout function
  const logout = async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  };

  // Clear error function
  const clearError = (): void => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  // Update user function
  const updateUser = (user: User): void => {
    localStorage.setItem('user', JSON.stringify(user));
    dispatch({ type: 'UPDATE_USER', payload: user });
  };

  // Refresh user data
  const refreshUser = async (): Promise<void> => {
    try {
      const response = await authApi.getCurrentUser();
      if (response.success && response.data) {
        updateUser(response.data.user);
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
      // If token is invalid, logout
      if (error instanceof Error && error.message.includes('token')) {
        await logout();
      }
    }
  };

  // Initial authentication check on mount only
  useEffect(() => {
    const checkAuthOnMount = async () => {
      if (state.isAuthenticated && !state.user) {
        try {
          await refreshUser();
        } catch (error) {
          console.error('Initial auth check failed:', error);
          await logout();
        }
      }
    };

    checkAuthOnMount();
  }, []); // Only run once on mount

  // Auto-refresh user data every 5 minutes
  useEffect(() => {
    if (state.isAuthenticated) {
      const interval = setInterval(() => {
        refreshUser();
      }, 5 * 60 * 1000); // 5 minutes

      return () => clearInterval(interval);
    }
  }, [state.isAuthenticated]);

  const value: AuthContextType = {
    user: state.user,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    error: state.error,
    login,
    register,
    logout,
    clearError,
    updateUser,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};

// HOC for protected routes
interface ProtectedRouteProps {
  children: ReactNode;
  allowedUserTypes?: ('jobseeker' | 'employer' | 'admin')[];
  fallback?: ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedUserTypes,
}) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Duke ngarkuar...</div>;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedUserTypes && !allowedUserTypes.includes(user.userType)) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Helper hooks for user types
export const useIsJobSeeker = (): boolean => {
  const { user } = useAuth();
  return user?.userType === 'jobseeker';
};

export const useIsEmployer = (): boolean => {
  const { user } = useAuth();
  return user?.userType === 'employer';
};

export const useIsAdmin = (): boolean => {
  const { user } = useAuth();
  return user?.userType === 'admin';
};