
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

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

interface FraudReviewPanelProps {
    item: FraudItem;
    onDecision: (id: number, decision: 'APPROVE' | 'BLOCK' | 'ESCALATE', notes: string) => Promise<void>;
    onClose: () => void;
}

export function FraudReviewPanel({ item, onDecision, onClose }: FraudReviewPanelProps) {
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleDecision = async (decision: 'APPROVE' | 'BLOCK' | 'ESCALATE') => {
        setIsSubmitting(true);
        try {
            await onDecision(item.id, decision, notes);
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    const details = typeof item.details === 'string' ? JSON.parse(item.details) : item.details;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 space-y-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-xl font-bold">Fraud Review #{item.id}</h2>
                            <p className="text-gray-500 text-sm">Created {new Date(item.created_at).toLocaleString()}</p>
                        </div>
                        <Badge variant={item.severity === 'CRITICAL' ? 'destructive' : (item.severity === 'HIGH' ? 'destructive' : 'secondary')}>
                            {item.severity} Risk ({item.fraud_score}/100)
                        </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <h3 className="font-semibold mb-2">Transaction</h3>
                            <div className="space-y-1 text-sm">
                                <p><span className="text-gray-500">Amount:</span> ৳{Number(item.transaction_amount).toFixed(2)}</p>
                                <p><span className="text-gray-500">Type:</span> {item.transaction_type}</p>
                                <p><span className="text-gray-500">Tx ID:</span> {item.transaction_id}</p>
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <h3 className="font-semibold mb-2">Customer</h3>
                            <div className="space-y-1 text-sm">
                                <p><span className="text-gray-500">Name:</span> {item.customer_name}</p>
                                <p><span className="text-gray-500">ID:</span> {item.customer_id}</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border border-red-100 bg-red-50 rounded-lg">
                        <h3 className="font-semibold text-red-800 mb-2">Risk Signals</h3>
                        <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                            {details?.risks?.map((risk: any, i: number) => (
                                <li key={i}>
                                    <span className="font-medium">{risk.rule}</span>: {risk.severity} (Score: {risk.score})
                                </li>
                            )) || <li>{item.rule_triggered}</li>}
                        </ul>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Review Notes</label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Enter justification for your decision..."
                            className="min-h-[100px]"
                        />
                    </div>

                    <div className="flex gap-3 pt-4 border-t">
                        <Button
                            variant="outline"
                            className="flex-1 border-green-600 text-green-600 hover:bg-green-50"
                            onClick={() => handleDecision('APPROVE')}
                            disabled={isSubmitting}
                        >
                            Approve (False Positive)
                        </Button>
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => handleDecision('ESCALATE')}
                            disabled={isSubmitting}
                        >
                            Escalate
                        </Button>
                        <Button
                            variant="destructive"
                            className="flex-1"
                            onClick={() => handleDecision('BLOCK')}
                            disabled={isSubmitting}
                        >
                            Block & Freeze
                        </Button>
                    </div>
                    <div className="flex justify-center pt-2">
                        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
