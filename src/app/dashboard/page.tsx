'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function DashboardRedirect() {
    const { user, userType, isLoading, isAuthenticated } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading) {
            if (!isAuthenticated) {
                router.push('/login');
                return;
            }

            if (userType === 'customer') {
                router.push('/customer/dashboard');
            } else {
                // Internal user
                if (user?.roleCode === 'ADMIN') {
                    router.push('/admin/dashboard');
                } else {
                    router.push('/banker/dashboard');
                }
            }
        }
    }, [user, userType, isLoading, isAuthenticated, router]);

    return (
        <div className="flex h-screen items-center justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-slate-900 border-t-transparent rounded-full" />
        </div>
    );
}
