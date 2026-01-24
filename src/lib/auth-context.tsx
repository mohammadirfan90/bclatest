'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// =============================================================================
// Types
// =============================================================================

interface User {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    roleCode?: string;
    roleName?: string;
    permissions?: string[];
    customerNumber?: string;
    kycStatus?: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    userType: 'user' | 'customer' | null;
    login: (email: string, password: string, type: 'user' | 'customer') => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
    hasPermission: (permission: string) => boolean;
    isRole: (role: string) => boolean;
}

// =============================================================================
// Context
// =============================================================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [userType, setUserType] = useState<'user' | 'customer' | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    // Load auth state from localStorage on mount
    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        const storedUserType = localStorage.getItem('userType') as 'user' | 'customer' | null;

        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
            setUserType(storedUserType);
        }
        setIsLoading(false);
    }, []);

    const login = async (
        email: string,
        password: string,
        type: 'user' | 'customer'
    ): Promise<{ success: boolean; error?: string }> => {
        console.log('AuthContext Login calling API:', { email, type });
        try {
            const response = await fetch('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, type }),
            });

            const data = await response.json();

            if (!data.success) {
                return { success: false, error: data.error || 'Login failed' };
            }

            // Store auth state
            localStorage.setItem('token', data.data.token);
            localStorage.setItem('refreshToken', data.data.refreshToken);
            localStorage.setItem('user', JSON.stringify(data.data.user));
            localStorage.setItem('userType', type);

            setToken(data.data.token);
            setUser(data.data.user);
            setUserType(type);

            // Redirect based on user type
            if (type === 'customer') {
                router.push('/customer/dashboard');
            } else {
                const roleCode = data.data.user.roleCode;
                if (roleCode === 'ADMIN') {
                    router.push('/admin/dashboard');
                } else if (roleCode === 'AUDITOR') {
                    router.push('/auditor/dashboard');
                } else {
                    router.push('/banker/dashboard');
                }
            }

            return { success: true };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Network error. Please try again.' };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        localStorage.removeItem('userType');
        setToken(null);
        setUser(null);
        setUserType(null);
        router.push('/login');
    };

    const hasPermission = (permission: string): boolean => {
        if (!user || !user.permissions) return false;
        return user.permissions.includes(permission);
    };

    const isRole = (role: string): boolean => {
        if (!user || !user.roleCode) return false;
        return user.roleCode === role;
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                isLoading,
                isAuthenticated: !!token && !!user,
                userType,
                login,
                logout,
                hasPermission,
                isRole,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

// =============================================================================
// Hook
// =============================================================================

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

// =============================================================================
// API Client Helper
// =============================================================================

export async function apiClient<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
    const token = localStorage.getItem('token');

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
    };

    try {
        const response = await fetch(`/api/v1${endpoint}`, {
            ...options,
            headers,
        });

        const data = await response.json();

        if (!response.ok) {
            // Handle token expiration
            if (response.status === 401) {
                // Try to refresh token
                const refreshToken = localStorage.getItem('refreshToken');
                if (refreshToken) {
                    const refreshResponse = await fetch('/api/v1/auth/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken }),
                    });

                    if (refreshResponse.ok) {
                        const refreshData = await refreshResponse.json();
                        localStorage.setItem('token', refreshData.data.token);

                        // Retry original request with new token
                        const retryResponse = await fetch(`/api/v1${endpoint}`, {
                            ...options,
                            headers: {
                                ...headers,
                                Authorization: `Bearer ${refreshData.data.token}`,
                            },
                        });
                        return await retryResponse.json();
                    }
                }

                // Clear auth and redirect to login
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('user');
                localStorage.removeItem('userType');
                window.location.href = '/login';
            }

            return { success: false, error: data.error || 'Request failed' };
        }

        return data;
    } catch (error) {
        console.error('API error:', error);
        return { success: false, error: 'Network error. Please try again.' };
    }
}
