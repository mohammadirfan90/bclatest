'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/auth-context';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';

interface KycRequest {
    id: number;
    customer_name: string;
    customer_email: string;
    customer_number: string;
    submitted_at: string;
    kyc_payload: {
        submitted_first_name?: string;
        submitted_last_name?: string;
        submitted_dob?: string;
        submitted_nid?: string;
        submitted_address?: string;
        [key: string]: any;
    };
    status: string;
}

export default function KycReviewPage() {
    const [requests, setRequests] = useState<KycRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Review Modal
    const [selectedRequest, setSelectedRequest] = useState<KycRequest | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [processing, setProcessing] = useState(false);
    const [rejectMode, setRejectMode] = useState(false);

    const fetchRequests = async () => {
        try {
            const res = await apiClient<{ data: KycRequest[] }>('/banker/kyc/pending');
            // apiClient returns the API response body directly. 
            // In our API utils, success response is { success: true, data: ... }
            // BUT apiClient type definition says it returns { success, data, error } wrapper?
            // Let's check auth-context.ts again. 
            // Line 227: return data. 
            // Line 186: const data = await response.json().
            // So it returns whatever server sent.
            // Server sends { success: true, data: [...] }.
            // So res.success exists. res.data exists.

            // Wait, strict typing of apiClient<T> implies res.data IS T?
            // Line 171: Promise<{ success: boolean; data?: T; error?: string }>
            // If the server returns { success: true, data: [...] }, then apiClient returns that object.
            // So if I pass T as KycRequest[], then res.data is KycRequest[].

            /* 
               Actually, looking at `apiClient` implementation in auth-context.tsx:
               It returns `data` (line 227) which is `response.json()`.
               The return type annotation on function says `Promise<{ success: boolean; data?: T; error?: string }>`.
               So `res` object matches that shape.
               So `res.data` is T.
            */

            if (res.success && Array.isArray(res.data)) {
                setRequests(res.data as KycRequest[]);
            } else {
                setError(res.error || 'Failed to fetch backlog');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    const handleApprove = async () => {
        if (!selectedRequest) return;
        setProcessing(true);
        try {
            const res = await apiClient(`/banker/kyc/${selectedRequest.id}/approve`, { method: 'POST' });
            if (res.success) {
                setSelectedRequest(null);
                fetchRequests();
            } else {
                alert(res.error);
            }
        } catch (e) {
            alert('Approval failed');
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!selectedRequest) return;
        if (!rejectReason) {
            alert('Reason required');
            return;
        }
        setProcessing(true);
        try {
            const res = await apiClient(`/banker/kyc/${selectedRequest.id}/reject`, {
                method: 'POST',
                body: JSON.stringify({ reason: rejectReason })
            });
            if (res.success) {
                setSelectedRequest(null);
                setRejectMode(false);
                setRejectReason('');
                fetchRequests();
            } else {
                alert(res.error);
            }
        } catch (e) {
            alert('Rejection failed');
        } finally {
            setProcessing(false);
        }
    }

    if (loading) return <div className="p-8">Loading KYC queue...</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">KYC Review Queue</h1>

            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

            {!error && requests.length === 0 && (
                <div className="p-12 text-center border rounded-lg bg-slate-50 text-slate-500">
                    No pending KYC requests. Good job!
                </div>
            )}

            <div className="grid gap-4">
                {requests.map(req => (
                    <Card key={req.id} className="hover:shadow transition-shadow">
                        <CardContent className="flex items-center justify-between p-6">
                            <div>
                                <h3 className="font-semibold text-lg">{req.customer_name}</h3>
                                <div className="text-sm text-slate-500 space-x-2">
                                    <span>{req.customer_email}</span>
                                    <span>•</span>
                                    <span className="font-mono">{req.customer_number}</span>
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    Submitted: {new Date(req.submitted_at).toLocaleString()}
                                </div>
                            </div>
                            <Button onClick={() => { setSelectedRequest(req); setRejectMode(false); }}>
                                Review Application
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Review Modal */}
            <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Review Customer Identity</DialogTitle>
                        <DialogDescription>
                            Verify the submitted details against expected criteria.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedRequest && (
                        <div className="grid grid-cols-2 gap-8 py-4">
                            <div className="space-y-4">
                                <h4 className="font-medium border-b pb-2">Submitted Data</h4>
                                <div className="space-y-2 text-sm">
                                    <div>
                                        <label className="text-slate-500 text-xs">Full Name</label>
                                        <p>{selectedRequest.kyc_payload.submitted_first_name} {selectedRequest.kyc_payload.submitted_last_name}</p>
                                    </div>
                                    <div>
                                        <label className="text-slate-500 text-xs">Date of Birth</label>
                                        <p className="font-mono">{selectedRequest.kyc_payload.submitted_dob || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="text-slate-500 text-xs">National ID</label>
                                        <p className="font-mono">{selectedRequest.kyc_payload.submitted_nid || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="text-slate-500 text-xs">Address</label>
                                        <p>{selectedRequest.kyc_payload.submitted_address || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4 bg-slate-50 p-4 rounded text-sm">
                                <h4 className="font-medium text-slate-700">Banker Actions</h4>
                                <p className="text-slate-600 text-xs">
                                    Approving will:
                                    <br />1. Update customer profile
                                    <br />2. Mark KYC as VERIFED
                                    <br />3. Enable dashboard access
                                </p>
                            </div>
                        </div>
                    )}

                    {rejectMode ? (
                        <div className="space-y-2">
                            <Label>Rejection Reason</Label>
                            <Textarea
                                placeholder="Explain why this was rejected..."
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                            />
                        </div>
                    ) : null}

                    <DialogFooter className="gap-2">
                        {!rejectMode ? (
                            <>
                                <Button variant="destructive" onClick={() => setRejectMode(true)}>Reject</Button>
                                <Button className="bg-green-600 hover:bg-green-700" onClick={handleApprove} disabled={processing}>
                                    {processing ? 'Approving...' : 'Approve & Verify'}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="ghost" onClick={() => setRejectMode(false)}>Back</Button>
                                <Button variant="destructive" onClick={handleReject} disabled={processing || !rejectReason}>
                                    {processing ? 'Rejecting...' : 'Confirm Rejection'}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
