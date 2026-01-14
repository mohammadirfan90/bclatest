'use client';

import { useState, use, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Loader2, ArrowLeft, CheckCircle, Search,
    AlertCircle, RefreshCw, AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/auth-context';

interface Reconciliation {
    id: number;
    name: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'MATCHED' | 'CLOSED' | 'FAILED';
    startedAt: string | null;
    completedAt: string | null;
}

interface ReconciliationItem {
    id: number;
    externalReference: string;
    externalDate: string;
    externalAmount: number;
    externalDescription: string;
    matchStatus: 'PENDING' | 'AUTO_MATCHED' | 'MANUAL_MATCHED' | 'UNMATCHED' | 'DISPUTED';
    matchConfidence: number | null;
    matchReason: string | null;
    matchedTransactionId: number | null;
    transactionReference?: string;
    transactionAmount?: number;
    transactionDate?: string;
}

interface Transaction {
    id: number;
    transactionReference: string;
    amount: number;
    date: string;
    description: string;
    status: string;
}

export default function ReconciliationDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const unwrappedParams = use(params);
    const { id } = unwrappedParams;
    const router = useRouter();

    // UI State
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Data State
    const [recon, setRecon] = useState<Reconciliation | null>(null);
    const [items, setItems] = useState<ReconciliationItem[]>([]);
    const [txMatches, setTxMatches] = useState<Transaction[]>([]);

    const [reconLoading, setReconLoading] = useState(true);
    const [itemsLoading, setItemsLoading] = useState(true);
    const [txLoading, setTxLoading] = useState(false);

    // Action Loading States
    const [autoMatchLoading, setAutoMatchLoading] = useState(false);
    const [matchLoading, setMatchLoading] = useState(false);
    const [closeLoading, setCloseLoading] = useState(false);

    // Initial Load
    const fetchRecon = useCallback(async () => {
        setReconLoading(true);
        try {
            const res = await apiClient<Reconciliation>(`/reconcile/${id}`);
            if (res.success && res.data) setRecon(res.data);
        } catch (e) { console.error(e); } finally { setReconLoading(false); }
    }, [id]);

    const fetchItems = useCallback(async () => {
        setItemsLoading(true);
        try {
            const res = await apiClient<ReconciliationItem[]>(`/reconcile/${id}/items?limit=100`);
            if (res.success && res.data) setItems(res.data);
        } catch (e) { console.error(e); } finally { setItemsLoading(false); }
    }, [id]);

    useEffect(() => {
        fetchRecon();
        fetchItems();
    }, [fetchRecon, fetchItems]);

    // Transaction Search
    const selectedItem = items.find(i => i.id === selectedItemId);

    const fetchMatches = useCallback(async () => {
        if (!selectedItemId || !selectedItem || selectedItem.matchStatus !== 'PENDING') return;

        setTxLoading(true);
        try {
            let url = `/reconcile/${id}/transactions?limit=10`;
            if (searchTerm) {
                url += `&description=${encodeURIComponent(searchTerm)}`;
            } else {
                url += `&amount=${selectedItem.externalAmount}`;
                url += `&dateFrom=${selectedItem.externalDate}`;
            }

            const res = await apiClient<Transaction[]>(url);
            if (res.success && res.data) setTxMatches(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setTxLoading(false);
        }
    }, [id, selectedItemId, selectedItem, searchTerm]);

    useEffect(() => {
        if (selectedItemId) {
            fetchMatches();
        } else {
            setTxMatches([]);
        }
    }, [selectedItemId, searchTerm, fetchMatches]);

    // Actions
    const handleAutoMatch = async () => {
        setAutoMatchLoading(true);
        try {
            const res = await apiClient(`/reconcile/${id}/auto-match`, { method: 'POST' });
            if (res.success) {
                fetchItems();
                fetchRecon();
            }
        } catch (e) { alert('Auto-match failed'); } finally { setAutoMatchLoading(false); }
    };

    const handleMatch = async (txId: number) => {
        if (!selectedItemId) return;
        setMatchLoading(true);
        try {
            const res = await apiClient(`/reconcile/${id}/match`, {
                method: 'POST',
                body: JSON.stringify({ reconciliationItemId: selectedItemId, transactionId: txId })
            });
            if (res.success) {
                fetchItems();
                fetchRecon();
                setSelectedItemId(null);
            }
        } catch (e) { alert('Match failed'); } finally { setMatchLoading(false); }
    };

    const handleUnmatch = async (itemId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const reason = prompt('Reason for unmatching:');
        if (!reason) return;

        try {
            const res = await apiClient(`/reconcile/${id}/unmatch`, {
                method: 'POST',
                body: JSON.stringify({ reconciliationItemId: itemId, reason })
            });
            if (res.success) {
                fetchItems();
                fetchRecon();
            }
        } catch (error) { alert('Unmatch failed'); }
    };

    const handleClose = async () => {
        if (!confirm('Are you sure you want to close this reconciliation? This action cannot be undone.')) return;
        setCloseLoading(true);
        try {
            const res = await apiClient(`/reconcile/${id}/close`, { method: 'POST' });
            if (res.success) {
                router.push('/banker/reconciliation');
            }
        } catch (e) { alert('Close failed'); } finally { setCloseLoading(false); }
    };

    const isClosed = recon?.status === 'CLOSED';

    return (
        <div className="space-y-6 h-[calc(100vh-6rem)] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            {reconLoading ? 'Loading...' : recon?.name}
                            {recon?.status && (
                                <Badge variant="secondary" className={
                                    recon.status === 'MATCHED' ? 'bg-green-100 text-green-800' :
                                        recon.status === 'CLOSED' ? 'bg-gray-100 text-gray-800' :
                                            'bg-blue-100 text-blue-800'
                                }>
                                    {recon.status}
                                </Badge>
                            )}
                        </h1>
                        <p className="text-sm text-gray-500">ID: {id}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {!isClosed && (
                        <>
                            <Button variant="outline" onClick={handleAutoMatch} disabled={autoMatchLoading}>
                                <RefreshCw className={cn("w-4 h-4 mr-2", autoMatchLoading && "animate-spin")} />
                                Auto Match
                            </Button>
                            <Button variant="default" onClick={handleClose} disabled={closeLoading}>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Close Reconciliation
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Content - Dual Pane */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
                {/* Left Pane: External Items */}
                <Card className="flex flex-col h-full rounded-lg border shadow-sm overflow-hidden">
                    <CardHeader className="py-4 px-6 border-b bg-gray-50 shrink-0">
                        <CardTitle className="text-base font-medium flex justify-between">
                            External Items
                            <span className="text-xs font-normal text-gray-500">Click to match</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 overflow-y-auto flex-1">
                        {itemsLoading ? (
                            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
                        ) : (
                            <div className="divide-y">
                                {items.map(item => (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            "p-4 cursor-pointer hover:bg-gray-50 transition-colors",
                                            selectedItemId === item.id ? "bg-blue-50 border-l-4 border-blue-500" : "",
                                            item.matchStatus !== 'PENDING' && "opacity-75 bg-gray-50/50"
                                        )}
                                        onClick={() => item.matchStatus === 'PENDING' && !isClosed && setSelectedItemId(item.id)}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-medium text-sm">{format(new Date(item.externalDate), 'MMM d')}</span>
                                            <span className="font-bold font-mono text-sm">{item.externalAmount.toFixed(2)}</span>
                                        </div>
                                        <p className="text-sm text-gray-600 truncate mb-2">{item.externalDescription}</p>

                                        <div className="flex justify-between items-center">
                                            {item.matchStatus === 'PENDING' ? (
                                                <Badge variant="outline" className="text-gray-500 border-gray-300">Unmatched</Badge>
                                            ) : (
                                                <Badge className={cn(
                                                    item.matchStatus === 'AUTO_MATCHED' ? 'bg-indigo-100 text-indigo-700' :
                                                        item.matchStatus === 'MANUAL_MATCHED' ? 'bg-green-100 text-green-700' :
                                                            'bg-gray-100 text-gray-700'
                                                )}>
                                                    {item.matchStatus.replace('_', ' ')}
                                                </Badge>
                                            )}

                                            {item.matchStatus !== 'PENDING' && !isClosed && (
                                                <Button size="sm" variant="ghost" className="h-6 px-2 text-red-600"
                                                    onClick={(e) => handleUnmatch(item.id, e)}
                                                >
                                                    Unmatch
                                                </Button>
                                            )}
                                        </div>

                                        {item.matchStatus !== 'PENDING' && item.matchedTransactionId && (
                                            <div className="mt-2 text-xs bg-white p-2 rounded border">
                                                <div className="font-semibold text-gray-700">Matched Transaction:</div>
                                                <div className="text-gray-600">Ref: {item.transactionReference}</div>
                                                <div className="text-gray-600 flex justify-between">
                                                    <span>Amt: {item.transactionAmount?.toFixed(2)}</span>
                                                    <span>{item.transactionDate && format(new Date(item.transactionDate), 'yyyy-MM-dd')}</span>
                                                </div>
                                            </div>
                                        )}
                                        {/* Suggestions */}
                                        {item.matchStatus === 'PENDING' && item.matchConfidence && (
                                            <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                Suggested Match ({item.matchConfidence}%)
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Right Pane: Transaction Matcher */}
                <Card className="flex flex-col h-full rounded-lg border shadow-sm overflow-hidden bg-white">
                    <CardHeader className="py-4 px-6 border-b bg-gray-50 shrink-0">
                        <CardTitle className="text-base font-medium">
                            {selectedItem ? 'Find Matching Transaction' : 'Select an item to match'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 overflow-y-auto flex-1">
                        {!selectedItem ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center">
                                <Search className="w-12 h-12 mb-4 opacity-20" />
                                <p>Select a pending external item from the left to search for matching transactions.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col h-full">
                                {/* Search Bar */}
                                <div className="p-4 border-b bg-white sticky top-0 z-10">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                        <Input
                                            placeholder="Search by amount, reference or description..."
                                            className="pl-9"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <div className="mt-2 text-sm text-gray-500">
                                        Searching for: <span className="font-mono font-medium">{selectedItem.externalAmount.toFixed(2)}</span> near {format(new Date(selectedItem.externalDate), 'yyyy-MM-dd')}
                                    </div>
                                </div>

                                {/* Results */}
                                <div className="flex-1 overflow-y-auto p-4">
                                    {txLoading ? (
                                        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
                                    ) : txMatches.length === 0 ? (
                                        <div className="text-center text-gray-500 py-12">
                                            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                            No matching transactions found.
                                            <div className="text-xs mt-2">Try adjusting search filters.</div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {txMatches.map((tx) => (
                                                <div key={tx.id} className="border rounded-lg p-3 hover:border-blue-300 transition-colors bg-white">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div>
                                                            <div className="font-mono text-sm font-semibold">{tx.transactionReference}</div>
                                                            <div className="text-xs text-gray-500">{format(new Date(tx.date), 'MMM d, yyyy')}</div>
                                                        </div>
                                                        <div className="font-mono font-bold">{tx.amount.toFixed(2)}</div>
                                                    </div>
                                                    <p className="text-sm text-gray-600 truncate mb-3">{tx.description}</p>
                                                    <Button
                                                        size="sm"
                                                        className="w-full"
                                                        onClick={() => handleMatch(tx.id)}
                                                        disabled={matchLoading}
                                                    >
                                                        {matchLoading ? 'Matching...' : 'Match'}
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
