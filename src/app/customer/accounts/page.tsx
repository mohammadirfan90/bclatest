'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Account {
    id: number;
    accountNumber: string;
    accountType: string;
    accountTypeName: string;
    status: string;
    balance: {
        availableBalance: number;
        pendingBalance: number;
        holdBalance: number;
    };
    openedAt: string | null;
}

export default function AccountsPage() {
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

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-BD', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 2,
        }).format(amount);
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">My Accounts</h1>
                <p className="text-slate-600 mt-1">View and manage your bank accounts</p>
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
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 md:grid-cols-2">
                    {accounts.map((account) => (
                        <Card key={account.id}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">{account.accountTypeName}</CardTitle>
                                    <Badge variant={account.status === 'ACTIVE' ? 'default' : 'secondary'}>
                                        {account.status}
                                    </Badge>
                                </div>
                                <CardDescription className="font-mono">{account.accountNumber}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-sm text-slate-500">Available Balance</p>
                                        <p className="text-2xl font-bold text-slate-900">
                                            {formatCurrency(account.balance.availableBalance)}
                                        </p>
                                    </div>
                                    {(account.balance.pendingBalance > 0 || account.balance.holdBalance > 0) && (
                                        <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                                            <div>
                                                <p className="text-xs text-slate-500">Pending</p>
                                                <p className="text-sm font-medium">
                                                    {formatCurrency(account.balance.pendingBalance)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">On Hold</p>
                                                <p className="text-sm font-medium">
                                                    {formatCurrency(account.balance.holdBalance)}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
