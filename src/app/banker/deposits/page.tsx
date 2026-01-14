'use client';

import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient } from '@/lib/auth-context';

// =====================================================
// Types
// =====================================================
import { AccountSearch, Account } from '@/components/banker/AccountSearch';

// =====================================================
// Types
// =====================================================
interface Receipt {
    type: string;
    accountNumber: string;
    customerName: string;
    amount: number;
    currency: string;
    previousBalance: number;
    newBalance: number;
    description: string;
    tellerName: string;
    timestamp: string;
}

const depositFormSchema = z.object({
    amount: z.coerce.number().positive('Amount must be positive'),
    description: z.string().optional(),
});

type DepositForm = z.infer<typeof depositFormSchema>;

// =====================================================
// Component
// =====================================================
export default function DepositPage() {
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'search' | 'confirm' | 'receipt'>('search');
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [receipt, setReceipt] = useState<Receipt | null>(null);

    const { register, handleSubmit, formState: { errors }, watch, reset } = useForm<DepositForm>({
        resolver: zodResolver(depositFormSchema) as any,
    });

    const depositAmount = watch('amount');

    // =====================================================
    // Account Search
    // =====================================================
    const selectAccount = (account: Account) => {
        setSelectedAccount(account);
        setStep('confirm');
    };

    // =====================================================
    // Deposit Submission
    // =====================================================
    const onSubmit = async (data: DepositForm) => {
        if (!selectedAccount) return;

        setIsProcessing(true);
        setError(null);

        try {
            const res = await apiClient<{ data: { receipt: Receipt } }>('/banker/deposits', {
                method: 'POST',
                body: JSON.stringify({
                    accountId: selectedAccount.id,
                    amount: data.amount,
                    description: data.description || 'Cash Deposit'
                }),
            });

            if (res.success && res.data) {
                const resultData = res.data as any;
                setReceipt(resultData.receipt);
                setStep('receipt');
            } else {
                throw new Error(res.error || 'Deposit failed');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // =====================================================
    // Reset Flow
    // =====================================================
    const startNewDeposit = () => {
        setStep('search');
        setSelectedAccount(null);
        setReceipt(null);
        setError(null);
        reset();
    };

    // =====================================================
    // Render
    // =====================================================
    return (
        <div className="container py-10 space-y-6">
            {/* Progress Steps */}
            <div className="flex justify-center gap-2 mb-6">
                {['search', 'confirm', 'receipt'].map((s, i) => (
                    <div
                        key={s}
                        className={`w-3 h-3 rounded-full ${step === s ? 'bg-primary' : 'bg-muted'
                            }`}
                    />
                ))}
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Step 1: Account Search */}
            {step === 'search' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <span className="text-2xl">💰</span>
                            Cash Deposit
                        </CardTitle>
                        <CardDescription>Search for a customer account to deposit funds.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <Label>Search Account</Label>
                            <AccountSearch
                                onSelect={selectAccount}
                                className="w-full text-lg"
                                placeholder="Start typing account number or customer name..."
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 2: Confirmation */}
            {step === 'confirm' && selectedAccount && (
                <Card>
                    <CardHeader>
                        <CardTitle>Confirm Deposit</CardTitle>
                        <CardDescription>Review account details and enter deposit amount.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                            {/* Account Details */}
                            <div className="bg-muted p-4 rounded-lg space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Account</span>
                                    <span className="font-medium">{selectedAccount.accountNumber}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Customer</span>
                                    <span className="font-medium">{selectedAccount.customerName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Current Balance</span>
                                    <span className="font-medium">৳{selectedAccount.availableBalance.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Amount Input */}
                            <div className="space-y-2">
                                <Label htmlFor="amount">Deposit Amount (BDT)</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    {...register('amount')}
                                    className="text-2xl font-bold h-14"
                                />
                                {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
                            </div>

                            {/* Preview */}
                            {depositAmount > 0 && (
                                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                                    <p className="text-sm text-green-700">New Balance after deposit:</p>
                                    <p className="text-2xl font-bold text-green-800">
                                        ৳{(selectedAccount.availableBalance + Number(depositAmount)).toLocaleString()}
                                    </p>
                                </div>
                            )}

                            {/* Description */}
                            <div className="space-y-2">
                                <Label htmlFor="description">Description (Optional)</Label>
                                <Input
                                    id="description"
                                    placeholder="e.g., Cash deposit at branch"
                                    {...register('description')}
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-4">
                                <Button type="button" variant="outline" onClick={startNewDeposit} className="flex-1">
                                    Cancel
                                </Button>
                                <Button type="submit" className="flex-1" disabled={isProcessing}>
                                    {isProcessing ? 'Processing...' : 'Confirm Deposit'}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Step 3: Receipt */}
            {step === 'receipt' && receipt && (
                <Card className="border-2 border-green-500">
                    <CardHeader className="bg-green-50">
                        <CardTitle className="flex items-center gap-2 text-green-700">
                            <span className="text-2xl">✅</span>
                            Deposit Successful
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="space-y-4 font-mono text-sm">
                            <div className="text-center border-b pb-4">
                                <p className="text-lg font-bold">TRANSACTION RECEIPT</p>
                                <p className="text-muted-foreground">{receipt.timestamp}</p>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span>Type:</span>
                                    <span className="font-bold">{receipt.type}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Account:</span>
                                    <span>{receipt.accountNumber}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Customer:</span>
                                    <span>{receipt.customerName}</span>
                                </div>
                                <div className="flex justify-between border-t pt-2">
                                    <span>Previous Balance:</span>
                                    <span>৳{receipt.previousBalance.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-lg font-bold text-green-600">
                                    <span>Amount Deposited:</span>
                                    <span>+৳{receipt.amount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between border-t pt-2 text-lg font-bold">
                                    <span>New Balance:</span>
                                    <span>৳{receipt.newBalance.toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="text-center text-muted-foreground text-xs pt-4 border-t">
                                <p>Teller: {receipt.tellerName}</p>
                                <p>Thank you for banking with us.</p>
                            </div>
                        </div>

                        <Button onClick={startNewDeposit} className="w-full mt-6">
                            New Deposit
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
