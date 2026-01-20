'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertCircle, Play, Pause, XCircle, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Account {
    id: number;
    accountNumber: string;
    accountType: string;
    status: string;
    balance: {
        availableBalance: number;
    };
    created_at: string;
}

interface Customer {
    id: number;
    customer_number: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    status: string;
    kyc_status: string;
    onboarding_status: string;
    accounts: Account[];
}

export default function CustomerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    // Unwrap params using React.use()
    const { id } = use(params);
    const customerId = parseInt(id);

    const [customer, setCustomer] = useState<Customer | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processingId, setProcessingId] = useState<number | null>(null);

    // Modal State
    const [action, setAction] = useState<'FREEZE' | 'UNFREEZE' | 'CLOSE' | null>(null);
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
    const [reason, setReason] = useState('');

    // New Account State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newAccountType, setNewAccountType] = useState<string>('');

    useEffect(() => {
        loadCustomer();
    }, [id]);

    const loadCustomer = async () => {
        setIsLoading(true);
        try {
            const result = await apiClient<Customer>(`/customers/${id}`);
            if (result.success && result.data) {
                setCustomer(result.data);
            } else {
                setError(result.error || 'Failed to load customer details');
            }
        } catch (err) {
            setError('Failed to load customer');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAction = async () => {
        if (!selectedAccount || !action || !reason) return;

        setProcessingId(selectedAccount.id);
        setError(null);

        let endpoint = '';
        if (action === 'FREEZE') endpoint = `/banker/accounts/${selectedAccount.id}/freeze`;
        if (action === 'UNFREEZE') endpoint = `/banker/accounts/${selectedAccount.id}/unfreeze`;
        if (action === 'CLOSE') endpoint = `/banker/accounts/${selectedAccount.id}/close`;

        try {
            const result = await apiClient(endpoint, {
                method: 'POST',
                body: JSON.stringify({ reason })
            });

            if (result.success) {
                setAction(null);
                setSelectedAccount(null);
                setReason('');
                loadCustomer(); // Refresh data
            } else {
                setError(result.error || `Failed to ${action.toLowerCase()} account`);
            }
        } catch (err) {
            setError(`Failed to ${action.toLowerCase()} account`);
        } finally {
            setProcessingId(null);
        }
    };

    const openActionModal = (acc: Account, type: 'FREEZE' | 'UNFREEZE' | 'CLOSE') => {
        setSelectedAccount(acc);
        setAction(type);
        setReason('');
    };

    const handleCreateAccount = async () => {
        if (!newAccountType) return;
        setIsLoading(true);
        setError(null);

        try {
            const result = await apiClient('/accounts', {
                method: 'POST',
                body: JSON.stringify({
                    customerId,
                    accountType: newAccountType
                })
            });

            if (result.success) {
                setIsCreateModalOpen(false);
                setNewAccountType('');
                loadCustomer(); // Refresh data
            } else {
                setError(result.error || 'Failed to create account');
            }
        } catch (err) {
            setError('Failed to create account');
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-slate-400" /></div>;
    if (!customer) return <div className="p-8 text-center text-red-500">Customer not found</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">{customer.first_name} {customer.last_name}</h1>
                    <p className="text-slate-500 text-sm font-mono">{customer.customer_number} • {customer.email}</p>
                </div>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-6 md:grid-cols-3">
                {/* Customer Profile Card */}
                <Card className="md:col-span-1 h-fit">
                    <CardHeader>
                        <CardTitle>Profile Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                        <div>
                            <Label className="text-slate-500 text-xs">Status</Label>
                            <div className="flex gap-2 mt-1">
                                <Badge variant={customer.status === 'ACTIVE' ? 'default' : 'secondary'}>{customer.status}</Badge>
                                <Badge variant="outline">{customer.kyc_status}</Badge>
                            </div>
                        </div>
                        <div>
                            <Label className="text-slate-500 text-xs">Contact</Label>
                            <p>{customer.phone || 'N/A'}</p>
                        </div>
                    </CardContent>
                </Card>

                {/* Accounts List */}
                <Card className="md:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div>
                            <CardTitle>Accounts</CardTitle>
                            <CardDescription>Manage customer's banking accounts</CardDescription>
                        </div>
                        <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
                            Open New Account
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Account Number</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Balance</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {customer.accounts.map((acc) => (
                                    <TableRow key={acc.id}>
                                        <TableCell className="font-mono">{acc.accountNumber}</TableCell>
                                        <TableCell>{acc.accountType}</TableCell>
                                        <TableCell className="font-medium">
                                            {new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT' }).format(acc.balance.availableBalance)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={
                                                acc.status === 'ACTIVE' ? 'default' :
                                                    acc.status === 'SUSPENDED' ? 'secondary' :
                                                        acc.status === 'CLOSED' ? 'destructive' : 'outline'
                                            }>
                                                {acc.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right space-x-1">
                                            {acc.status === 'ACTIVE' && (
                                                <Button size="icon" variant="ghost" title="Freeze Account" onClick={() => openActionModal(acc, 'FREEZE')}>
                                                    <Pause className="h-4 w-4 text-orange-600" />
                                                </Button>
                                            )}
                                            {acc.status === 'SUSPENDED' && (
                                                <Button size="icon" variant="ghost" title="Unfreeze Account" onClick={() => openActionModal(acc, 'UNFREEZE')}>
                                                    <Play className="h-4 w-4 text-green-600" />
                                                </Button>
                                            )}
                                            {acc.status !== 'CLOSED' && (
                                                <Button size="icon" variant="ghost" title="Close Account" onClick={() => openActionModal(acc, 'CLOSE')}>
                                                    <XCircle className="h-4 w-4 text-red-600" />
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {customer.accounts.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-6 text-slate-500">
                                            No accounts found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {/* Action Dialog */}
            <Dialog open={!!action} onOpenChange={(open) => !open && setAction(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {action === 'FREEZE' ? 'Freeze Account' :
                                action === 'UNFREEZE' ? 'Unfreeze Account' :
                                    'Close Account'}
                        </DialogTitle>
                        <DialogDescription>
                            {action === 'FREEZE' && 'This will prevent any outgoing transactions from this account.'}
                            {action === 'UNFREEZE' && 'This will restore full functionality to the account.'}
                            {action === 'CLOSE' && 'This will permanently close the account. Balance must be zero.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        <Label>Reason for Action</Label>
                        <Textarea
                            placeholder="Enter a reason (required)..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
                        <Button
                            variant={action === 'UNFREEZE' ? 'default' : 'destructive'}
                            onClick={handleAction}
                            disabled={!reason || processingId === selectedAccount?.id}
                        >
                            {processingId === selectedAccount?.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            Confirm {action ? (action.charAt(0) + action.slice(1).toLowerCase()) : 'Action'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Account Dialog */}
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Open New Account</DialogTitle>
                        <DialogDescription>
                            Select the type of account to create for this customer.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Account Type</Label>
                            <Select value={newAccountType} onValueChange={setNewAccountType}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="SAVINGS">Savings Account</SelectItem>
                                    <SelectItem value="CHECKING">Checking Account</SelectItem>
                                    <SelectItem value="FIXED">Fixed Deposit</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleCreateAccount}
                            disabled={!newAccountType || isLoading}
                        >
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Account
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
