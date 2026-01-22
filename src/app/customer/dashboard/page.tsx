'use client';

import { useEffect, useState } from 'react';
import { useAuth, apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface Account {
    id: number;
    accountNumber: string;
    accountType: string;
    accountTypeName: string;
    status: string;
    balance: {
        availableBalance: number;
    };
}

export default function CustomerDashboard() {
    const { user } = useAuth();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        const result = await apiClient<Account[]>('/accounts');
        if (result.success && result.data) {
            setAccounts(result.data);
        }
        setIsLoading(false);
    };

    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance.availableBalance, 0);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-BD', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 2,
        }).format(amount);
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">
                    Welcome back, {user?.firstName}
                </h1>
                <p className="text-slate-600 mt-1">
                    Here's an overview of your accounts
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-slate-300">Total Balance</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">{formatCurrency(totalBalance)}</p>
                        <p className="text-sm text-slate-400 mt-1">
                            Across {accounts.length} account{accounts.length !== 1 ? 's' : ''}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Active Accounts</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-slate-900">
                            {accounts.filter((a) => a.status === 'ACTIVE').length}
                        </p>
                        <p className="text-sm text-slate-500 mt-1">Ready for transactions</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Quick Actions</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                        <Button asChild size="sm">
                            <Link href="/customer/transfers">New Transfer</Link>
                        </Button>

                        <Button asChild variant="ghost" size="sm">
                            <Link href="/customer/statements">Statements</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>



            {/* Pending Applications Alert */}
            {accounts.some(a => a.status === 'PENDING') && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                    <div className="p-1 bg-yellow-100 rounded-full text-yellow-700 mt-0.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <h4 className="font-semibold text-yellow-900">Application Under Review</h4>
                        <p className="text-sm text-yellow-700 mt-1">
                            You have {accounts.filter(a => a.status === 'PENDING').length} account application(s) currently being reviewed by our team.
                            You will be notified once they are active.
                        </p>
                    </div>
                </div>
            )}

            {/* Accounts List */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900">Your Accounts</h2>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/customer/accounts">View all →</Link>
                    </Button>
                </div>

                {isLoading ? (
                    <div className="grid gap-4 md:grid-cols-2">
                        {[1, 2].map((i) => (
                            <Card key={i} className="animate-pulse">
                                <CardContent className="p-6">
                                    <div className="h-4 bg-slate-200 rounded w-1/3 mb-4" />
                                    <div className="h-8 bg-slate-200 rounded w-1/2" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : accounts.length === 0 ? (
                    <Card>
                        <CardContent className="p-8 text-center">
                            <p className="text-slate-500">No accounts found.</p>
                            <p className="text-sm text-slate-400 mt-1">
                                Visit your nearest branch or apply online to open an account.
                            </p>
                            <Button asChild className="mt-4">
                                <Link href="/customer/accounts/apply">Open Account</Link>
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                        {accounts.map((account) => (
                            <Card key={account.id} className={`transition-shadow ${account.status === 'PENDING' ? 'opacity-75 bg-slate-50 border-dashed' : 'hover:shadow-md'}`}>
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-sm text-slate-500">{account.accountTypeName}</p>
                                            <p className="font-mono text-sm text-slate-600 mt-0.5">
                                                {account.accountNumber || 'Pending Allocation'}
                                            </p>
                                        </div>
                                        <Badge
                                            variant={account.status === 'ACTIVE' ? 'default' : 'secondary'}
                                            className={account.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' : ''}
                                        >
                                            {account.status}
                                        </Badge>
                                    </div>
                                    <p className="text-2xl font-bold text-slate-900 mt-4">
                                        {formatCurrency(account.balance.availableBalance)}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">Available balance</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
