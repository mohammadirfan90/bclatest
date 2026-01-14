'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Check, X, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Application {
    id: number;
    customerId: number;
    customerName: string;
    customerEmail: string;
    accountType: string;
    status: string;
    createdAt: string;
    kycStatus: string;
}

export default function PendingAccountsPage() {
    const [applications, setApplications] = useState<Application[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Reject Modal State
    const [rejectId, setRejectId] = useState<number | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    useEffect(() => {
        loadApplications();
    }, []);

    const loadApplications = async () => {
        setIsLoading(true);
        try {
            const result = await apiClient<Application[]>('/banker/accounts/pending');
            if (result.success && result.data) {
                setApplications(result.data);
            } else {
                setError(result.error || 'Failed to load applications');
            }
        } catch (err) {
            setError('Failed to load applications');
        } finally {
            setIsLoading(false);
        }
    };

    const handleApprove = async (id: number) => {
        setProcessingId(id);
        setError(null);
        try {
            const result = await apiClient(`/banker/accounts/${id}/approve`, { method: 'POST' });
            if (result.success) {
                setApplications(prev => prev.filter(app => app.id !== id));
            } else {
                setError(result.error || 'Approval failed');
            }
        } catch (err) {
            setError('Approval failed');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async () => {
        if (!rejectId || !rejectReason) return;
        setProcessingId(rejectId);
        setError(null);
        try {
            const result = await apiClient(`/banker/accounts/${rejectId}/reject`, {
                method: 'POST',
                body: JSON.stringify({ reason: rejectReason })
            });
            if (result.success) {
                setApplications(prev => prev.filter(app => app.id !== rejectId));
                setRejectId(null);
                setRejectReason('');
            } else {
                setError(result.error || 'Rejection failed');
            }
        } catch (err) {
            setError('Rejection failed');
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Account Approvals</h1>
                <p className="text-slate-600">Review and action pending account applications.</p>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Pending Applications</CardTitle>
                    <CardDescription>
                        {applications.length} applications waiting for review
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                        </div>
                    ) : applications.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                            No pending applications found.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>KYC</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {applications.map((app) => (
                                    <TableRow key={app.id}>
                                        <TableCell className="font-medium">
                                            {new Date(app.createdAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium text-slate-900">{app.customerName}</div>
                                            <div className="text-xs text-slate-500">{app.customerEmail}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{app.accountType}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={app.kycStatus === 'VERIFIED' ? 'default' : 'secondary'} className={app.kycStatus === 'VERIFIED' ? 'bg-green-100 text-green-800' : ''}>
                                                {app.kycStatus}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                                                {app.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right space-x-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                                                onClick={() => handleApprove(app.id)}
                                                disabled={processingId === app.id}
                                            >
                                                {processingId === app.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Check className="h-4 w-4 mr-1" />
                                                )}
                                                Approve
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                                onClick={() => setRejectId(app.id)}
                                                disabled={processingId === app.id}
                                            >
                                                <X className="h-4 w-4 mr-1" />
                                                Reject
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={!!rejectId} onOpenChange={(open) => !open && setRejectId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reject Application</DialogTitle>
                        <DialogDescription>
                            Please provide a reason for rejecting this application. This will be visible to the customer.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea
                            placeholder="Reason for rejection..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={handleReject}
                            disabled={!rejectReason || processingId === rejectId}
                        >
                            {processingId === rejectId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Reject Application
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
