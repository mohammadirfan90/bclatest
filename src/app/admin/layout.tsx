'use client';

import { ReactNode } from 'react';
import { useRouter, notFound } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Sidebar, Icons } from '@/components/layouts/Sidebar';

const adminNavItems = [
    { title: 'Dashboard', href: '/admin/dashboard', icon: Icons.dashboard },
    { title: 'Users', href: '/admin/users', icon: Icons.users },
    { title: 'Roles', href: '/admin/roles', icon: Icons.settings },
    { title: 'Configuration', href: '/admin/config', icon: Icons.settings },
    { title: 'System Jobs', href: '/admin/jobs', icon: Icons.transactions },
    { title: 'EOD Process', href: '/admin/eod', icon: Icons.reconciliation },
    { title: 'Events', href: '/admin/events', icon: Icons.transactions },
    { title: 'Reports', href: '/admin/reports', icon: Icons.reports },
    { title: 'GDPR Tools', href: '/admin/gdpr', icon: Icons.fraud },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading, userType, isRole } = useAuth();
    const router = useRouter();

    // Redirect if not authenticated or not admin
    if (!isLoading && (!isAuthenticated || userType !== 'user' || !isRole('ADMIN'))) {
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
            <Sidebar navItems={adminNavItems} title="Banking Core" subtitle="Admin Console" />
            <main className="flex-1 overflow-auto">
                <div className="p-6">{children}</div>
            </main>
        </div>
    );
}
