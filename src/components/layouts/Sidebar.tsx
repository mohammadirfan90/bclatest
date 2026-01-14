'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
    title: string;
    href: string;
    icon: React.ReactNode;
}

interface SidebarProps {
    navItems: NavItem[];
    title: string;
    subtitle?: string;
}

export function Sidebar({ navItems, title, subtitle }: SidebarProps) {
    const pathname = usePathname();
    const { user, logout } = useAuth();

    return (
        <div className="flex h-screen w-64 flex-col border-r bg-slate-50">
            {/* Header */}
            <div className="flex h-16 items-center gap-3 border-b px-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900">
                    <svg
                        className="h-5 w-5 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                </div>
                <div>
                    <h2 className="font-semibold text-slate-900">{title}</h2>
                    {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
                </div>
            </div>

            {/* Navigation */}
            <ScrollArea className="flex-1 px-3 py-4">
                <nav className="space-y-1">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                                    isActive
                                        ? 'bg-slate-900 text-white'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                )}
                            >
                                <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                                {item.title}
                            </Link>
                        );
                    })}
                </nav>
            </ScrollArea>

            {/* User Menu */}
            <div className="border-t p-3">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            className="w-full justify-start gap-3 px-3 py-6 text-left"
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                                {user?.firstName?.[0]}
                                {user?.lastName?.[0]}
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <p className="truncate text-sm font-medium text-slate-900">
                                    {user?.firstName} {user?.lastName}
                                </p>
                                <p className="truncate text-xs text-slate-500">{user?.email}</p>
                            </div>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>My Account</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={logout} className="text-red-600">
                            <svg
                                className="mr-2 h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                />
                            </svg>
                            Sign out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}

// Icons for navigation
export const Icons = {
    dashboard: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
    ),
    accounts: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
    ),
    transfers: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
    ),
    customers: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
    ),
    transactions: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
    ),
    fraud: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    ),
    reconciliation: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
    ),
    users: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
    ),
    settings: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    ),
    reports: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
    ),
    deposit: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
    ),
    withdraw: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
    ),
};
