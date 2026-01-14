'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AdminEodPage() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [processDate, setProcessDate] = useState(new Date().toISOString().split('T')[0]);

    const runEod = async () => {
        setLoading(true);
        setResult(null);
        try {
            const res = await apiClient('/admin/eod/process', {
                method: 'POST',
                body: JSON.stringify({ processDate }),
            });
            setResult({
                success: res.success,
                message: res.success ? 'EOD process completed successfully' : (res.error || 'EOD process failed'),
            });
        } catch (err) {
            setResult({ success: false, message: 'Failed to run EOD process' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">End of Day Processing</h1>
                <p className="text-slate-600">Run EOD operations and view history</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Run EOD Process</CardTitle>
                        <CardDescription>Execute end-of-day batch operations</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="date">Process Date</Label>
                            <Input
                                id="date"
                                type="date"
                                value={processDate}
                                onChange={(e) => setProcessDate(e.target.value)}
                            />
                        </div>

                        {result && (
                            <Alert variant={result.success ? 'default' : 'destructive'}>
                                <AlertDescription>{result.message}</AlertDescription>
                            </Alert>
                        )}

                        <Button onClick={runEod} disabled={loading} className="w-full">
                            {loading ? 'Processing...' : 'Run EOD Process'}
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>EOD Status</CardTitle>
                        <CardDescription>Current system state</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-slate-600">Current Business Date</span>
                            <Badge>{new Date().toLocaleDateString()}</Badge>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-slate-600">Last EOD Run</span>
                            <span className="font-medium">Yesterday 23:00</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-slate-600">Status</span>
                            <Badge variant="default">Completed</Badge>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-slate-600">Transactions Processed</span>
                            <span className="font-medium">1,234</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
