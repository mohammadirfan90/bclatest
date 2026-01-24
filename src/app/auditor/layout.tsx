'use client';

import { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Sidebar, Icons } from '@/components/layouts/Sidebar';

// Audit icon - eye/search icon for audit
const AuditIcon = (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
);

// Ledger icon - book/journal icon
const LedgerIcon = (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
);

const auditorNavItems = [
    { title: 'Dashboard', href: '/auditor/dashboard', icon: Icons.dashboard },
    { title: 'Audit Logs', href: '/auditor/audit-logs', icon: AuditIcon },
    { title: 'Transactions', href: '/auditor/transactions', icon: Icons.transactions },
    { title: 'Ledger', href: '/auditor/ledger', icon: LedgerIcon },
    { title: 'Customers', href: '/auditor/customers', icon: Icons.customers },
    { title: 'Accounts', href: '/auditor/accounts', icon: Icons.accounts },
];

export default function AuditorLayout({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading, userType, isRole } = useAuth();

    // Redirect if not authenticated or not auditor/admin
    if (!isLoading && (!isAuthenticated || userType !== 'user' || (!isRole('AUDITOR') && !isRole('ADMIN')))) {
        notFound();
        return null;
    }

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-slate-900 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-white">
            <Sidebar navItems={auditorNavItems} title="Banking Core" subtitle="Audit Console" />
            <main className="flex-1 overflow-auto">
                <div className="p-6">{children}</div>
            </main>
        </div>
    );
}
