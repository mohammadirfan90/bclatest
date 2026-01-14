'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload } from 'lucide-react';
import { apiClient } from '@/lib/auth-context';

interface Reconciliation {
    id: number;
    name: string;
    sourceType: string;
    sourceFile: string | null;
    status: 'OPEN' | 'IN_PROGRESS' | 'MATCHED' | 'CLOSED' | 'FAILED';
    totalItems: number;
    matchedItems: number;
    unmatchedItems: number;
    discrepancyAmount: number;
    createdAt: string;
}

export default function ReconciliationListPage() {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    // Data State
    const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchReconciliations = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await apiClient<{ data: Reconciliation[] }>(`/reconcile?page=${page}&limit=20`);
            if (result.success && result.data) {
                setReconciliations(result.data.data || []);
            }
        } catch (error) {
            console.error('Failed to fetch reconciliations:', error);
        } finally {
            setIsLoading(false);
        }
    }, [page]);

    useEffect(() => {
        fetchReconciliations();
    }, [fetchReconciliations]);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const name = prompt('Enter a name for this reconciliation:', `Statement ${format(new Date(), 'yyyy-MM-dd')}`);
        if (!name) return;

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('name', name);
            formData.append('source', 'Bank Statement CSV');

            // Use fetch directly for FormData as apiClient is JSON-optimized or tricky with valid token logic for FormData
            const token = localStorage.getItem('token');
            const res = await fetch('/api/v1/reconcile', {
                method: 'POST',
                headers: {
                    ...(token && { Authorization: `Bearer ${token}` }),
                },
                body: formData,
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to create reconciliation');
            }

            // Success
            if (fileInputRef.current) fileInputRef.current.value = '';
            fetchReconciliations(); // Refresh list
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'OPEN': return 'bg-blue-100 text-blue-800';
            case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800';
            case 'MATCHED': return 'bg-green-100 text-green-800';
            case 'CLOSED': return 'bg-gray-100 text-gray-800';
            case 'FAILED': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Reconciliations</h1>
                <div className="flex gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".csv"
                        onChange={handleFileUpload}
                    />
                    <Button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                    >
                        {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                        Import Statement
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Reconciliations</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b text-left text-sm font-medium text-gray-500">
                                        <th className="pb-3 pl-4">Name</th>
                                        <th className="pb-3">Source</th>
                                        <th className="pb-3">Status</th>
                                        <th className="pb-3 text-right">Items</th>
                                        <th className="pb-3 text-right">Matched</th>
                                        <th className="pb-3 text-right">Unmatched</th>
                                        <th className="pb-3 text-right">Discrepancy</th>
                                        <th className="pb-3 text-right">Created</th>
                                        <th className="pb-3 pr-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {reconciliations.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="text-center py-8 text-gray-500">
                                                No reconciliations found
                                            </td>
                                        </tr>
                                    ) : (
                                        reconciliations.map((recon) => (
                                            <tr key={recon.id} className="group hover:bg-gray-50">
                                                <td className="py-4 pl-4 font-medium">{recon.name}</td>
                                                <td className="py-4 text-sm text-gray-600">{recon.sourceType}</td>
                                                <td className="py-4">
                                                    <Badge className={getStatusColor(recon.status)} variant="secondary">
                                                        {recon.status}
                                                    </Badge>
                                                </td>
                                                <td className="py-4 text-right text-sm">{recon.totalItems}</td>
                                                <td className="py-4 text-right text-sm text-green-600">{recon.matchedItems}</td>
                                                <td className="py-4 text-right text-sm text-amber-600">{recon.unmatchedItems}</td>
                                                <td className="py-4 text-right text-sm font-mono">
                                                    {recon.discrepancyAmount !== 0 ? (
                                                        <span className="text-red-600">{Math.abs(recon.discrepancyAmount).toFixed(2)}</span>
                                                    ) : (
                                                        <span className="text-gray-400">-</span>
                                                    )}
                                                </td>
                                                <td className="py-4 text-right text-sm text-gray-500">
                                                    {format(new Date(recon.createdAt), 'MMM d, yyyy')}
                                                </td>
                                                <td className="py-4 pr-4 text-right">
                                                    <Link href={`/banker/reconciliation/${recon.id}`}>
                                                        <Button variant="outline" size="sm">
                                                            View
                                                        </Button>
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
