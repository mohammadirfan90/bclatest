'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

interface Account {
    id: number;
    accountNumber: string;
    accountType: string;
    accountTypeName: string;
    status: string;
    balanceLocked: boolean;
    balance: {
        availableBalance: number;
    };
}

export default function TransfersPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Form state
    const [fromAccountId, setFromAccountId] = useState('');
    const [toAccountNumber, setToAccountNumber] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        const result = await apiClient<Account[]>('/accounts');
        if (result.success && result.data) {
            // Strict filter: only ACTIVE accounts can initiate transfers
            setAccounts(result.data.filter((a) => a.status === 'ACTIVE' && !a.balanceLocked));
        }
        setIsLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        const result = await apiClient('/transactions/transfer', {
            method: 'POST',
            body: JSON.stringify({
                fromAccountId: parseInt(fromAccountId),
                toAccountId: parseInt(toAccountNumber),
                amount: parseFloat(amount),
                description: description || 'Transfer',
                idempotencyKey: crypto.randomUUID(),
            }),
        });

        if (result.success) {
            toast.success('Transfer completed successfully!');
            setAmount('');
            setToAccountNumber('');
            setDescription('');
            loadAccounts();
        } else {
            setError(result.error || 'Transfer failed');
        }

        setIsSubmitting(false);
    };

    const selectedAccount = accounts.find((a) => a.id.toString() === fromAccountId);

    const formatCurrency = (amt: number) => {
        return new Intl.NumberFormat('en-BD', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 2,
        }).format(amt);
    };

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Transfer Money</h1>
                <p className="text-slate-600 mt-1">Send money to another account instantly</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>New Transfer</CardTitle>
                    <CardDescription>All transfers are processed immediately.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="fromAccount">From Account</Label>
                            <Select value={fromAccountId} onValueChange={setFromAccountId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select source account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map((account) => (
                                        <SelectItem key={account.id} value={account.id.toString()}>
                                            {account.accountTypeName} - {account.accountNumber}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedAccount && (
                                <p className="text-sm text-slate-500">
                                    Available: {formatCurrency(selectedAccount.balance.availableBalance)}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="toAccount">To Account Number</Label>
                            <Input
                                id="toAccount"
                                placeholder="Enter destination account number"
                                value={toAccountNumber}
                                onChange={(e) => setToAccountNumber(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount (BDT)</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">৳</span>
                                <Input
                                    id="amount"
                                    type="number"
                                    step="0.01"
                                    min="1"
                                    max="10000000"
                                    placeholder="0.00"
                                    className="pl-8"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description (Optional)</Label>
                            <Textarea
                                id="description"
                                placeholder="What's this transfer for?"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={2}
                            />
                        </div>

                        <Button type="submit" className="w-full" disabled={isSubmitting || !fromAccountId || !toAccountNumber || !amount}>
                            {isSubmitting ? 'Processing...' : `Transfer ${amount ? formatCurrency(parseFloat(amount)) : ''}`}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
