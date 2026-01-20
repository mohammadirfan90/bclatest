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

type OperationType = 'deposit' | 'withdraw';

const transactionSchema = z.object({
    amount: z.coerce.number().positive('Amount must be positive'),
    description: z.string().optional(),
});

type TransactionForm = z.infer<typeof transactionSchema>;

// =====================================================
// Component
// =====================================================
export default function TellerPage() {
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'search' | 'operation' | 'receipt'>('search');
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
    const [operationType, setOperationType] = useState<OperationType>('deposit');
    const [isProcessing, setIsProcessing] = useState(false);
    const [receipt, setReceipt] = useState<Receipt | null>(null);

    const { register, handleSubmit, formState: { errors }, watch, reset } = useForm<TransactionForm>({
        resolver: zodResolver(transactionSchema) as any,
    });

    const amount = watch('amount');

    // =====================================================
    // Account Search
    // =====================================================
    const selectAccount = (account: Account) => {
        setSelectedAccount(account);
        setStep('operation');
        setError(null);
    };

    // =====================================================
    // Transaction Submission
    // =====================================================
    const onSubmit = async (data: TransactionForm) => {
        if (!selectedAccount) return;

        // Client-side balance check for withdrawals
        if (operationType === 'withdraw' && data.amount > selectedAccount.availableBalance) {
            setError(`Insufficient balance. Available: ৳${selectedAccount.availableBalance.toLocaleString()}`);
            return;
        }

        setIsProcessing(true);
        setError(null);

        const endpoint = operationType === 'deposit' ? '/banker/deposits' : '/banker/withdrawals';

        try {
            const res = await apiClient<{ data: { receipt: Receipt } }>(endpoint, {
                method: 'POST',
                body: JSON.stringify({
                    accountId: selectedAccount.id,
                    amount: data.amount,
                    description: data.description || `Cash ${operationType === 'deposit' ? 'Deposit' : 'Withdrawal'}`
                }),
            });

            if (res.success && res.data) {
                const resultData = res.data as any;
                setReceipt(resultData.receipt);
                setStep('receipt');
            } else {
                throw new Error(res.error || `${operationType} failed`);
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
    const startNew = () => {
        setStep('search');
        setSelectedAccount(null);
        setReceipt(null);
        setError(null);
        setOperationType('deposit');
        reset();
    };

    // =====================================================
    // Render
    // =====================================================
    const isInsufficientBalance = operationType === 'withdraw' && selectedAccount && amount > selectedAccount.availableBalance;

    return (
        <div className="container py-10 space-y-6">
            {/* Page Header */}
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
                    <span className="text-4xl">🏦</span> Teller Operations
                </h1>
                <p className="text-muted-foreground mt-2">Cash deposits and withdrawals</p>
            </div>

            {/* Progress */}
            <div className="flex justify-center gap-2 mb-6">
                {['search', 'operation', 'receipt'].map((s) => (
                    <div
                        key={s}
                        className={`w-3 h-3 rounded-full transition-colors ${step === s ? 'bg-primary' : 'bg-muted'
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
                        <CardTitle>Find Customer Account</CardTitle>
                        <CardDescription>Search by account number or customer name</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <Label>Search Account</Label>
                            <AccountSearch
                                onSelect={selectAccount}
                                className="w-full text-lg"
                                placeholder="Start typing account number or customer name..."
                            />

                            <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm flex gap-2 items-start mt-4">
                                <span className="text-xl">💡</span>
                                <div>
                                    <p className="font-semibold mb-1">Search Tips</p>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li>Enter at least 2 characters to start searching.</li>
                                        <li>You can search by <strong>Account Number</strong> (e.g. SAV...)</li>
                                        <li>You can also search by <strong>Customer Name</strong> or <strong>ID</strong>.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 2: Operation */}
            {step === 'operation' && selectedAccount && (
                <Card>
                    <CardHeader>
                        <CardTitle>Teller Transaction</CardTitle>
                        <CardDescription>Select operation and enter amount</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {/* Account Info */}
                        <div className="bg-muted p-4 rounded-lg mb-6 space-y-2">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Account</span>
                                <span className="font-medium">{selectedAccount.accountNumber}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Customer</span>
                                <span className="font-medium">{selectedAccount.customerName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Balance</span>
                                <span className="font-bold text-lg">৳{selectedAccount.availableBalance.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Operation Toggle */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                            <button
                                type="button"
                                onClick={() => setOperationType('deposit')}
                                className={`p-4 rounded-lg border-2 text-center transition-all ${operationType === 'deposit'
                                    ? 'border-green-500 bg-green-50 text-green-700'
                                    : 'border-muted hover:border-green-300'
                                    }`}
                            >
                                <span className="text-2xl block mb-1">💰</span>
                                <span className="font-medium">Deposit</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setOperationType('withdraw')}
                                className={`p-4 rounded-lg border-2 text-center transition-all ${operationType === 'withdraw'
                                    ? 'border-amber-500 bg-amber-50 text-amber-700'
                                    : 'border-muted hover:border-amber-300'
                                    }`}
                            >
                                <span className="text-2xl block mb-1">🏧</span>
                                <span className="font-medium">Withdraw</span>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            {/* Amount */}
                            <div className="space-y-2">
                                <Label htmlFor="amount">Amount (BDT)</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    {...register('amount')}
                                    className={`text-3xl font-bold h-16 text-center ${isInsufficientBalance ? 'border-red-500' : ''}`}
                                />
                                {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
                                {isInsufficientBalance && (
                                    <p className="text-sm text-red-500 font-medium text-center">
                                        ⚠️ Insufficient balance!
                                    </p>
                                )}
                            </div>

                            {/* Preview */}
                            {amount > 0 && !isInsufficientBalance && (
                                <div className={`p-4 rounded-lg border ${operationType === 'deposit' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                                    }`}>
                                    <p className="text-sm text-center text-muted-foreground">New Balance</p>
                                    <p className={`text-2xl font-bold text-center ${operationType === 'deposit' ? 'text-green-700' : 'text-amber-700'
                                        }`}>
                                        ৳{(operationType === 'deposit'
                                            ? selectedAccount.availableBalance + Number(amount)
                                            : selectedAccount.availableBalance - Number(amount)
                                        ).toLocaleString()}
                                    </p>
                                </div>
                            )}

                            {/* Description */}
                            <div className="space-y-2">
                                <Label htmlFor="description">Description (Optional)</Label>
                                <Input
                                    id="description"
                                    placeholder="Note..."
                                    {...register('description')}
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-4 pt-4">
                                <Button type="button" variant="outline" onClick={startNew} className="flex-1">
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    variant={operationType === 'withdraw' ? 'destructive' : 'default'}
                                    className="flex-1"
                                    disabled={isProcessing || !!isInsufficientBalance}
                                >
                                    {isProcessing ? 'Processing...' : `Confirm ${operationType === 'deposit' ? 'Deposit' : 'Withdrawal'}`}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Step 3: Receipt */}
            {step === 'receipt' && receipt && (
                <Card className={`border-2 ${receipt.type === 'DEPOSIT' ? 'border-green-500' : 'border-amber-500'}`}>
                    <CardHeader className={receipt.type === 'DEPOSIT' ? 'bg-green-50' : 'bg-amber-50'}>
                        <CardTitle className={`flex items-center gap-2 ${receipt.type === 'DEPOSIT' ? 'text-green-700' : 'text-amber-700'}`}>
                            <span className="text-2xl">✅</span>
                            {receipt.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} Successful
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="space-y-4 font-mono text-sm">
                            <div className="text-center border-b pb-4">
                                <p className="text-lg font-bold">TRANSACTION RECEIPT</p>
                                <p className="text-muted-foreground">{new Date(receipt.timestamp).toLocaleString()}</p>
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
                                <div className={`flex justify-between text-xl font-bold ${receipt.type === 'DEPOSIT' ? 'text-green-600' : 'text-red-600'
                                    }`}>
                                    <span>Amount:</span>
                                    <span>{receipt.type === 'DEPOSIT' ? '+' : '-'}৳{receipt.amount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between border-t pt-2 text-xl font-bold">
                                    <span>New Balance:</span>
                                    <span>৳{receipt.newBalance.toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="text-center text-muted-foreground text-xs pt-4 border-t">
                                <p>Teller: {receipt.tellerName}</p>
                                <p>Thank you for banking with us.</p>
                            </div>
                        </div>

                        <Button onClick={startNew} className="w-full mt-6">
                            New Transaction
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
