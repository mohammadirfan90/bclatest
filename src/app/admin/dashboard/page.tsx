'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { SystemHealthCard } from '@/components/admin/SystemHealthCard';
import { DashboardStats } from '@/components/dashboard/DashboardStats';

interface SystemHealth {
    database: 'connected' | 'disconnected';
    status: 'healthy' | 'unhealthy';
}

export default function AdminDashboard() {
    const { user } = useAuth();
    const [health, setHealth] = useState<SystemHealth | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        checkHealth();
    }, []);

    const checkHealth = async () => {
        try {
            const response = await fetch('/api/v1/health');
            const data = await response.json();
            setHealth({
                database: data.services?.database || 'disconnected',
                status: data.status || 'unhealthy',
            });
        } catch {
            setHealth({ database: 'disconnected', status: 'unhealthy' });
        }
        setIsLoading(false);
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Admin Console</h1>
                <p className="text-slate-600 mt-1">
                    Welcome back, {user?.firstName}. System administration and monitoring.
                </p>
            </div>

            {/* System Health Row */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>System Status</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="animate-pulse h-8 bg-slate-200 rounded w-20" />
                        ) : (
                            <Badge
                                variant={health?.status === 'healthy' ? 'default' : 'destructive'}
                                className="text-sm"
                            >
                                {health?.status === 'healthy' ? '● Healthy' : '● Unhealthy'}
                            </Badge>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Database</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="animate-pulse h-8 bg-slate-200 rounded w-24" />
                        ) : (
                            <Badge
                                variant={health?.database === 'connected' ? 'default' : 'destructive'}
                                className="text-sm"
                            >
                                {health?.database === 'connected' ? '● Connected' : '● Disconnected'}
                            </Badge>
                        )}
                    </CardContent>
                </Card>

                {/* System Integrity Check Card */}
                <SystemHealthCard />
            </div>

            {/* Stats Overview - reuse DashboardStats */}
            <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4">System Overview</h2>
                <div className="grid gap-6 md:grid-cols-4">
                    <DashboardStats />
                </div>
            </div>

            {/* Admin Actions */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">User Management</CardTitle>
                        <CardDescription>Manage staff accounts and permissions</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Button asChild variant="outline" className="w-full justify-start">
                            <Link href="/admin/users">
                                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                View Users
                            </Link>
                        </Button>
                        <Button asChild variant="outline" className="w-full justify-start">
                            <Link href="/admin/roles">
                                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Manage Roles
                            </Link>
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Financial Operations</CardTitle>
                        <CardDescription>View ledger and audit trail</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Button asChild variant="outline" className="w-full justify-start">
                            <Link href="/banker/ledger">
                                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                View Ledger
                            </Link>
                        </Button>
                        <Button asChild variant="outline" className="w-full justify-start">
                            <Link href="/banker/transactions">
                                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Transactions
                            </Link>
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Customer Management</CardTitle>
                        <CardDescription>View and manage customers</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Button asChild variant="outline" className="w-full justify-start">
                            <Link href="/banker/customers">
                                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                All Customers
                            </Link>
                        </Button>
                        <Button asChild variant="outline" className="w-full justify-start">
                            <Link href="/banker/accounts">
                                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                </svg>
                                All Accounts
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
