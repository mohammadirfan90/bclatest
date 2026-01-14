'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function AdminGdprPage() {
    const [customerId, setCustomerId] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    const handlePseudonymize = async () => {
        if (!customerId || !reason) {
            setResult({ success: false, message: 'Please fill in all fields' });
            return;
        }

        if (!confirm('WARNING: This action will permanently pseudonymize customer data. This cannot be undone. Continue?')) {
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            const res = await apiClient(`/admin/customers/${customerId}/pseudonymize`, {
                method: 'POST',
                body: JSON.stringify({ reason }),
            });
            setResult({
                success: res.success,
                message: res.success
                    ? 'Customer data has been pseudonymized'
                    : (res.error || 'Failed to pseudonymize customer'),
            });
        } catch (err) {
            setResult({ success: false, message: 'Operation failed' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">GDPR Tools</h1>
                <p className="text-slate-600">Data privacy and compliance tools</p>
            </div>

            <Alert variant="destructive">
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>
                    These tools perform irreversible operations. Use with extreme caution.
                </AlertDescription>
            </Alert>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Right to Erasure</CardTitle>
                        <CardDescription>Pseudonymize customer data (GDPR Art. 17)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="customerId">Customer ID</Label>
                            <Input
                                id="customerId"
                                type="number"
                                placeholder="Enter customer ID"
                                value={customerId}
                                onChange={(e) => setCustomerId(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="reason">Reason for Erasure</Label>
                            <Textarea
                                id="reason"
                                placeholder="Document the reason for this request..."
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={3}
                            />
                        </div>

                        {result && (
                            <Alert variant={result.success ? 'default' : 'destructive'}>
                                <AlertDescription>{result.message}</AlertDescription>
                            </Alert>
                        )}

                        <Button
                            onClick={handlePseudonymize}
                            disabled={loading}
                            variant="destructive"
                            className="w-full"
                        >
                            {loading ? 'Processing...' : 'Pseudonymize Customer Data'}
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Data Export</CardTitle>
                        <CardDescription>Export customer data (GDPR Art. 20)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="exportCustomerId">Customer ID</Label>
                            <Input
                                id="exportCustomerId"
                                type="number"
                                placeholder="Enter customer ID"
                            />
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" className="flex-1">Export JSON</Button>
                            <Button variant="outline" className="flex-1">Export CSV</Button>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Consent Records</CardTitle>
                        <CardDescription>View and manage consent records</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-slate-500 text-sm">
                            Search and review customer consent records for data processing activities.
                        </p>
                        <Button variant="outline" className="mt-4 w-full">View Consent Records</Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Access Requests</CardTitle>
                        <CardDescription>Subject access requests (GDPR Art. 15)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-slate-500 text-sm">
                            Track and manage subject access requests from customers.
                        </p>
                        <Button variant="outline" className="mt-4 w-full">View Requests</Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
