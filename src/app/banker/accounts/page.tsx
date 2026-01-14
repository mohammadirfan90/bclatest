'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MoreHorizontal, Lock, Unlock, Ban, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Account {
    id: number;
    accountNumber: string;
    customerId: number;
    customerName: string;
    accountType: string;
    accountTypeName: string;
    status: string;
    balanceLocked: boolean;
    availableBalance: number;
    createdAt: string;
}

export default function AccountsPage() {
    const router = useRouter();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Action State
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
    const [actionType, setActionType] = useState<'FREEZE' | 'UNFREEZE' | 'CLOSE' | null>(null);
    const [reason, setReason] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        setIsLoading(true);
        try {
            const result = await apiClient<Account[]>('/accounts?page=1&limit=20');
            if (result.success && result.data) {
                setAccounts(result.data);
            } else {
                setError(result.error || 'Failed to load accounts');
            }
        } catch (err) {
            setError('Failed to load accounts');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAction = (account: Account, type: 'FREEZE' | 'UNFREEZE' | 'CLOSE') => {
        setSelectedAccount(account);
        setActionType(type);
        setReason('');
    };

    const submitAction = async () => {
        if (!selectedAccount || !actionType) return;
        setIsProcessing(true);
        setError(null);

        let endpoint = '';
        if (actionType === 'FREEZE') endpoint = `/banker/accounts/${selectedAccount.id}/freeze`;
        if (actionType === 'UNFREEZE') endpoint = `/banker/accounts/${selectedAccount.id}/unfreeze`;
        if (actionType === 'CLOSE') endpoint = `/banker/accounts/${selectedAccount.id}/close`;

        try {
            const result = await apiClient(endpoint, {
                method: 'POST',
                body: JSON.stringify({ reason })
            });

            if (result.success) {
                // Refresh list
                await loadAccounts();
                closeDialog();
            } else {
                setError(result.error || 'Action failed');
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setIsProcessing(false);
        }
    };

    const closeDialog = () => {
        setSelectedAccount(null);
        setActionType(null);
        setReason('');
        setError(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Accounts</h1>
                    <p className="text-slate-600">Overview of all customer accounts.</p>
                </div>
                <Button onClick={() => router.push('/banker/accounts/pending')}>
                    Review Pending Applications
                </Button>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Active Accounts</CardTitle>
                    <CardDescription>Recent accounts across the system</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                        </div>
                    ) : accounts.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                            No accounts found.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Account Number</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Balance (BDT)</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {accounts.map((acc) => (
                                    <TableRow key={acc.id}>
                                        <TableCell className="font-mono">{acc.accountNumber}</TableCell>
                                        <TableCell>
                                            <div className="font-medium">{acc.customerName}</div>
                                            <div className="text-xs text-slate-500">ID: {acc.customerId}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{acc.accountType}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1 items-start">
                                                <Badge
                                                    variant={acc.status === 'ACTIVE' ? 'default' : 'secondary'}
                                                    className={acc.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : ''}
                                                >
                                                    {acc.status}
                                                </Badge>
                                                {acc.balanceLocked && (
                                                    <Badge variant="destructive" className="text-[10px] h-5 px-1">
                                                        LOCKED
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {acc.availableBalance.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <span className="sr-only">Open menu</span>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                    <DropdownMenuItem onClick={() => router.push(`/banker/accounts/${acc.id}`)}>
                                                        View Details
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    {acc.status === 'ACTIVE' && (
                                                        <DropdownMenuItem onClick={() => handleAction(acc, 'FREEZE')} className="text-amber-600">
                                                            <Lock className="mr-2 h-4 w-4" /> Freeze Account
                                                        </DropdownMenuItem>
                                                    )}
                                                    {acc.status === 'SUSPENDED' && (
                                                        <DropdownMenuItem onClick={() => handleAction(acc, 'UNFREEZE')} className="text-green-600">
                                                            <Unlock className="mr-2 h-4 w-4" /> Unfreeze Account
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem onClick={() => handleAction(acc, 'CLOSE')} className="text-red-600">
                                                        <Ban className="mr-2 h-4 w-4" /> Close Account
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={!!selectedAccount} onOpenChange={(open) => !open && closeDialog()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {actionType === 'FREEZE' && 'Freeze Account'}
                            {actionType === 'UNFREEZE' && 'Unfreeze Account'}
                            {actionType === 'CLOSE' && 'Close Account'}
                        </DialogTitle>
                        <DialogDescription>
                            {actionType === 'FREEZE' && `Are you sure you want to freeze account ${selectedAccount?.accountNumber}? This will prevent all debits.`}
                            {actionType === 'UNFREEZE' && `Are you sure you want to unfreeze account ${selectedAccount?.accountNumber}? Service will be restored.`}
                            {actionType === 'CLOSE' && `WARNING: This action is irreversible. Account ${selectedAccount?.accountNumber} will be permanently closed.`}
                        </DialogDescription>
                    </DialogHeader>

                    {actionType === 'CLOSE' && selectedAccount?.availableBalance !== 0 && (
                        <Alert variant="destructive" className="my-2">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Balance Warning</AlertTitle>
                            <AlertDescription>
                                Account has a remaining balance of {selectedAccount?.availableBalance}. Balance must be zero to close.
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="py-4">
                        <Textarea
                            placeholder="Reason for action (required)..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                        <Button
                            variant={actionType === 'UNFREEZE' ? 'default' : 'destructive'}
                            onClick={submitAction}
                            disabled={!reason || isProcessing || (actionType === 'CLOSE' && selectedAccount?.availableBalance !== 0)}
                        >
                            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm Action
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
