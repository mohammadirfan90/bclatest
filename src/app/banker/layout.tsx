'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Sidebar, Icons } from '@/components/layouts/Sidebar';

const bankerNavItems = [
    { title: 'Dashboard', href: '/banker/dashboard', icon: Icons.dashboard },
    { title: 'Customers', href: '/banker/customers', icon: Icons.customers },
    { title: 'KYC Review', href: '/banker/kyc', icon: Icons.users },
    { title: 'Accounts', href: '/banker/accounts', icon: Icons.accounts },
    { title: 'Teller', href: '/banker/teller', icon: Icons.deposit },
    { title: 'Deposits', href: '/banker/deposits', icon: Icons.deposit },
    { title: 'Withdrawals', href: '/banker/withdrawals', icon: Icons.withdraw },
    { title: 'Financial Ledger', href: '/banker/ledger', icon: Icons.reconciliation },
    { title: 'Transaction Search', href: '/banker/transactions', icon: Icons.transactions },
    { title: 'Reports', href: '/banker/reports', icon: Icons.reconciliation },
    { title: 'Reconciliation', href: '/banker/reconciliation', icon: Icons.reconciliation },
    { title: 'Fraud Review', href: '/banker/fraud', icon: Icons.fraud },
];

export default function BankerLayout({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading, userType } = useAuth();
    const router = useRouter();

    // Use effect for redirect to avoid setState during render
    useEffect(() => {
        if (!isLoading && (!isAuthenticated || userType !== 'user')) {
            router.push('/login');
        }
    }, [isLoading, isAuthenticated, userType, router]);

    // Show loading while checking auth
    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-slate-900 border-t-transparent rounded-full" />
            </div>
        );
    }

    // Show loading while redirecting
    if (!isAuthenticated || userType !== 'user') {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-slate-900 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-white">
            <Sidebar navItems={bankerNavItems} title="Banking Core" subtitle="Banker Dashboard" />
            <main className="flex-1 overflow-auto">
                <div className="p-6">{children}</div>
            </main>
        </div>
    );
}

