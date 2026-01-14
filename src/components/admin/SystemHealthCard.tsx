'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/auth-context';

interface VerifyResult {
    valid: boolean;
    doubleEntry: {
        valid: boolean;
        discrepancy: number;
        message: string;
    };
    balanceIntegrity: {
        valid: boolean;
        discrepancies: Array<{
            accountId: number;
            materialized: number;
            calculated: number;
        }>;
        message: string;
    };
}

export function SystemHealthCard() {
    const [result, setResult] = useState<VerifyResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runVerification = useCallback(async () => {
        setIsVerifying(true);
        setError(null);
        try {
            const response = await apiClient<VerifyResult>('/core/verify');
            if (response.success && response.data) {
                setResult(response.data as unknown as VerifyResult);
            } else {
                setError('Failed to verify system integrity');
            }
        } catch {
            setError('Failed to connect to verification API');
        }
        setIsLoading(false);
        setIsVerifying(false);
    }, []);

    useEffect(() => {
        runVerification();
    }, [runVerification]);

    const getStatusColor = () => {
        if (!result) return 'bg-gray-500';
        if (result.valid) return 'bg-green-500';
        return 'bg-red-500';
    };

    const getStatusText = () => {
        if (!result) return 'Unknown';
        if (result.valid) return 'HEALTHY';
        return 'ISSUES DETECTED';
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    System Integrity
                </CardTitle>
                <CardDescription>Double-entry and balance verification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {isLoading ? (
                    <div className="animate-pulse space-y-3">
                        <div className="h-8 bg-slate-200 rounded w-24" />
                        <div className="h-4 bg-slate-200 rounded w-32" />
                    </div>
                ) : error ? (
                    <p className="text-red-500 text-sm">{error}</p>
                ) : result ? (
                    <>
                        {/* Overall Status */}
                        <div className="flex items-center gap-3">
                            <div className={`h-3 w-3 rounded-full ${getStatusColor()}`} />
                            <Badge variant={result.valid ? 'default' : 'destructive'}>
                                {getStatusText()}
                            </Badge>
                        </div>

                        {/* Checks Details */}
                        <div className="text-sm space-y-2">
                            {/* Double Entry Check */}
                            <div className="flex items-center gap-2">
                                {result.doubleEntry.valid ? (
                                    <span className="text-green-600">✓</span>
                                ) : (
                                    <span className="text-red-600">✗</span>
                                )}
                                <span className="text-slate-600">{result.doubleEntry.message}</span>
                            </div>

                            {/* Balance Integrity Check */}
                            <div className="flex items-center gap-2">
                                {result.balanceIntegrity.valid ? (
                                    <span className="text-green-600">✓</span>
                                ) : (
                                    <span className="text-red-600">✗</span>
                                )}
                                <span className="text-slate-600">{result.balanceIntegrity.message}</span>
                            </div>
                        </div>

                        {/* Discrepancies Warning */}
                        {!result.balanceIntegrity.valid && result.balanceIntegrity.discrepancies.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm">
                                <p className="font-medium text-red-800 mb-2">
                                    ⚠️ {result.balanceIntegrity.discrepancies.length} accounts with balance discrepancies
                                </p>
                                <div className="space-y-1 text-xs text-red-700">
                                    {result.balanceIntegrity.discrepancies.slice(0, 3).map((d) => (
                                        <p key={d.accountId}>
                                            Account #{d.accountId}: {d.materialized} vs {d.calculated}
                                        </p>
                                    ))}
                                    {result.balanceIntegrity.discrepancies.length > 3 && (
                                        <p>... and {result.balanceIntegrity.discrepancies.length - 3} more</p>
                                    )}
                                </div>
                            </div>
                        )}

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={runVerification}
                            disabled={isVerifying}
                            className="w-full"
                        >
                            {isVerifying ? 'Verifying...' : 'Run Verification'}
                        </Button>
                    </>
                ) : (
                    <p className="text-slate-500">Unable to load system health</p>
                )}
            </CardContent>
        </Card>
    );
}
