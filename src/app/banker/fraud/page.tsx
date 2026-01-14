
'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FraudReviewPanel } from '@/components/banker/FraudReviewPanel';

interface FraudItem {
    id: number;
    transaction_id: number;
    customer_id: number;
    rule_triggered: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: string;
    fraud_score: number;
    details: any;
    created_at: string;
    transaction_amount: number;
    transaction_type: string;
    customer_name: string;
}

export default function FraudPage() {
    const [items, setItems] = useState<FraudItem[]>([]);
    const [stats, setStats] = useState({ total: 0 });
    const [selectedItem, setSelectedItem] = useState<FraudItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchQueue = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/v1/banker/fraud/queue?status=PENDING');
            if (res.ok) {
                const data = await res.json();
                setItems(data.items);
                setStats({ total: data.total });
            }
        } catch (error) {
            console.error('Failed to fetch fraud queue', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
    }, []);

    const handleDecision = async (id: number, decision: 'APPROVE' | 'BLOCK' | 'ESCALATE', notes: string) => {
        try {
            const res = await fetch(`/api/v1/banker/fraud/${id}/decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision, notes }),
            });

            if (res.ok) {
                // Refresh list
                await fetchQueue();
            } else {
                alert('Failed to submit decision');
            }
        } catch (error) {
            console.error(error);
            alert('Error submitting decision');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Fraud Review Queue</h1>
                    <p className="text-muted-foreground">
                        {stats.total} pending transactions requiring review
                    </p>
                </div>
                <Button onClick={fetchQueue} variant="outline" size="sm">
                    Refresh
                </Button>
            </div>

            <div className="grid gap-4">
                {isLoading ? (
                    <div className="text-center py-10">Loading queue...</div>
                ) : items.length === 0 ? (
                    <div className="text-center py-10 border rounded-lg bg-gray-50">
                        <p className="text-gray-500">No pending fraud alerts. Great job! 🎉</p>
                    </div>
                ) : (
                    items.map((item) => (
                        <Card key={item.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-transparent hover:border-l-blue-500" onClick={() => setSelectedItem(item)}>
                            <div className="flex justify-between items-center">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Badge variant={item.severity === 'CRITICAL' || item.severity === 'HIGH' ? 'destructive' : 'secondary'}>
                                            {item.severity} ({item.fraud_score})
                                        </Badge>
                                        <span className="font-medium text-lg">৳{Number(item.transaction_amount).toLocaleString()}</span>
                                        <span className="text-gray-500 text-sm">from {item.customer_name}</span>
                                    </div>
                                    <p className="text-sm text-red-600 font-medium">
                                        Alert: {item.rule_triggered}
                                    </p>
                                    <p className="text-xs text-gray-400">
                                        Tx: {item.id} • {new Date(item.created_at).toLocaleString()}
                                    </p>
                                </div>
                                <Button size="sm">Review</Button>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            {selectedItem && (
                <FraudReviewPanel
                    item={selectedItem}
                    onDecision={handleDecision}
                    onClose={() => setSelectedItem(null)}
                />
            )}
        </div>
    );
}
