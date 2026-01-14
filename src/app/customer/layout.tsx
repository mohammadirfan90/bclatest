'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Sidebar, Icons } from '@/components/layouts/Sidebar';

const customerNavItems = [
    { title: 'Dashboard', href: '/customer/dashboard', icon: Icons.dashboard },
    { title: 'Accounts', href: '/customer/accounts', icon: Icons.accounts },
    { title: 'Transfers', href: '/customer/transfers', icon: Icons.transfers },
    { title: 'Statements', href: '/customer/statements', icon: Icons.transactions },
    { title: 'My Profile', href: '/customer/profile', icon: Icons.users },
];

export default function CustomerLayout({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading, userType, user } = useAuth();
    const router = useRouter();

    // Redirect if not authenticated or wrong user type
    if (!isLoading) {
        if (!isAuthenticated || userType !== 'customer') {
            router.push('/login');
            return null;
        }

        const isVerified = user?.kycStatus === 'VERIFIED';
        const isPendingPage = typeof window !== 'undefined' && window.location.pathname === '/customer/verification-pending';

        // Enforce KYC
        if (!isVerified) {
            if (!isPendingPage) {
                router.push('/customer/verification-pending');
                return null;
            }
        } else {
            // If verified but trying to access pending page, go to dashboard
            if (isPendingPage) {
                router.push('/customer/dashboard');
                return null;
            }
        }
    }

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-slate-900 border-t-transparent rounded-full" />
            </div>
        );
    }

    // If not verified, only show simple layout (no sidebar) or just the children (which is the pending page)
    if (user?.kycStatus !== 'VERIFIED') {
        return <main className="min-h-screen bg-slate-50">{children}</main>;
    }

    return (
        <div className="flex h-screen bg-white">
            <Sidebar navItems={customerNavItems} title="Banking Core" subtitle="Customer Portal" />
            <main className="flex-1 overflow-auto">
                <div className="p-6">{children}</div>
            </main>
        </div>
    );
}
