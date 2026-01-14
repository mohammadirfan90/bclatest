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

const withdrawFormSchema = z.object({
    amount: z.coerce.number().positive('Amount must be positive'),
    description: z.string().optional(),
});

type WithdrawForm = z.infer<typeof withdrawFormSchema>;

// =====================================================
// Component
// =====================================================
export default function WithdrawalPage() {
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'search' | 'confirm' | 'receipt'>('search');
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [receipt, setReceipt] = useState<Receipt | null>(null);

    const { register, handleSubmit, formState: { errors }, watch, reset, setError: setFormError } = useForm<WithdrawForm>({
        resolver: zodResolver(withdrawFormSchema) as any,
    });

    const withdrawAmount = watch('amount');

    // =====================================================
    // Account Search
    // =====================================================
    const selectAccount = (account: Account) => {
        setSelectedAccount(account);
        setStep('confirm');
        setError(null);
    };

    // =====================================================
    // Withdrawal Submission
    // =====================================================
    const onSubmit = async (data: WithdrawForm) => {
        if (!selectedAccount) return;

        // Client-side balance check
        if (data.amount > selectedAccount.availableBalance) {
            setError(`Insufficient balance. Available: ৳${selectedAccount.availableBalance.toLocaleString()}`);
            return;
        }

        setIsProcessing(true);
        setError(null);

        try {
            const res = await apiClient<{ data: { receipt: Receipt } }>('/banker/withdrawals', {
                method: 'POST',
                body: JSON.stringify({
                    accountId: selectedAccount.id,
                    amount: data.amount,
                    description: data.description || 'Cash Withdrawal'
                }),
            });

            if (res.success && res.data) {
                const resultData = res.data as any;
                setReceipt(resultData.receipt);
                setStep('receipt');
            } else {
                throw new Error(res.error || 'Withdrawal failed');
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
    const startNewWithdrawal = () => {
        setStep('search');
        setSelectedAccount(null);
        setReceipt(null);
        setError(null);
        reset();
    };

    // =====================================================
    // Render
    // =====================================================
    const isInsufficientBalance = selectedAccount && withdrawAmount > selectedAccount.availableBalance;

    return (
        <div className="container py-10 space-y-6">
            {/* Progress Steps */}
            <div className="flex justify-center gap-2 mb-6">
                {['search', 'confirm', 'receipt'].map((s) => (
                    <div
                        key={s}
                        className={`w-3 h-3 rounded-full ${step === s ? 'bg-destructive' : 'bg-muted'
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
                            <span className="text-2xl">🏧</span>
                            Cash Withdrawal
                        </CardTitle>
                        <CardDescription>Search for a customer account to withdraw funds.</CardDescription>
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
                        <CardTitle>Confirm Withdrawal</CardTitle>
                        <CardDescription>Review account details and enter withdrawal amount.</CardDescription>
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
                                    <span className="text-muted-foreground">Available Balance</span>
                                    <span className="font-medium text-lg">৳{selectedAccount.availableBalance.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Amount Input */}
                            <div className="space-y-2">
                                <Label htmlFor="amount">Withdrawal Amount (BDT)</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    {...register('amount')}
                                    className={`text-2xl font-bold h-14 ${isInsufficientBalance ? 'border-red-500' : ''}`}
                                />
                                {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
                                {isInsufficientBalance && (
                                    <p className="text-sm text-red-500 font-medium">
                                        ⚠️ Insufficient balance! Available: ৳{selectedAccount.availableBalance.toLocaleString()}
                                    </p>
                                )}
                            </div>

                            {/* Preview */}
                            {withdrawAmount > 0 && !isInsufficientBalance && (
                                <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                                    <p className="text-sm text-amber-700">New Balance after withdrawal:</p>
                                    <p className="text-2xl font-bold text-amber-800">
                                        ৳{(selectedAccount.availableBalance - Number(withdrawAmount)).toLocaleString()}
                                    </p>
                                </div>
                            )}

                            {/* Description */}
                            <div className="space-y-2">
                                <Label htmlFor="description">Description (Optional)</Label>
                                <Input
                                    id="description"
                                    placeholder="e.g., Customer withdrawal"
                                    {...register('description')}
                                />
                            </div>

                            {/* Warning */}
                            <div className="bg-yellow-50 p-3 rounded-md text-sm text-yellow-800 border border-yellow-200">
                                <strong>⚠️ Note:</strong> Withdrawals are irreversible without higher authorization.
                            </div>

                            {/* Actions */}
                            <div className="flex gap-4">
                                <Button type="button" variant="outline" onClick={startNewWithdrawal} className="flex-1">
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    variant="destructive"
                                    className="flex-1"
                                    disabled={isProcessing || !!isInsufficientBalance}
                                >
                                    {isProcessing ? 'Processing...' : 'Confirm Withdrawal'}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Step 3: Receipt */}
            {step === 'receipt' && receipt && (
                <Card className="border-2 border-amber-500">
                    <CardHeader className="bg-amber-50">
                        <CardTitle className="flex items-center gap-2 text-amber-700">
                            <span className="text-2xl">✅</span>
                            Withdrawal Successful
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
                                <div className="flex justify-between text-lg font-bold text-red-600">
                                    <span>Amount Withdrawn:</span>
                                    <span>-৳{receipt.amount.toLocaleString()}</span>
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

                        <Button onClick={startNewWithdrawal} variant="outline" className="w-full mt-6">
                            New Withdrawal
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
