'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Sidebar, SidebarContent, Icons } from '@/components/layouts/Sidebar';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

const bankerNavItems = [
    { title: 'Dashboard', href: '/banker/dashboard', icon: Icons.dashboard },
    { title: 'Customers', href: '/banker/customers', icon: Icons.customers },
    { title: 'Accounts', href: '/banker/accounts', icon: Icons.accounts },
    { title: 'Teller', href: '/banker/teller', icon: Icons.deposit },
    { title: 'Deposits', href: '/banker/deposits', icon: Icons.deposit },
    { title: 'Withdrawals', href: '/banker/withdrawals', icon: Icons.withdraw },
    { title: 'Financial Ledger', href: '/banker/ledger', icon: Icons.reconciliation },
    { title: 'Transaction Search', href: '/banker/transactions', icon: Icons.transactions },
    { title: 'Reports', href: '/banker/reports', icon: Icons.reconciliation },
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
            {/* Desktop Sidebar */}
            <Sidebar navItems={bankerNavItems} title="Banking Core" subtitle="Banker Dashboard" />

            {/* Mobile Header & Content */}
            <div className="flex flex-1 flex-col min-w-0">
                {/* Mobile Header */}
                <header className="flex h-16 items-center border-b px-4 lg:hidden">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="mr-2">
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">Toggle menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="p-0 w-64">
                            <SheetTitle className="sr-only">Banker Navigation</SheetTitle>
                            <SidebarContent
                                navItems={bankerNavItems}
                                title="Banking Core"
                                subtitle="Banker Dashboard"
                            />
                        </SheetContent>
                    </Sheet>
                    <div className="flex items-center gap-2 font-semibold">
                        <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-900">
                            <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <span className="text-sm">Banking Core</span>
                    </div>
                </header>

                <main className="flex-1 overflow-auto">
                    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}

