'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// =============================================================================
// Types
// =============================================================================

interface AuditLogEntry {
    id: number;
    actorId: number | null;
    actorType: string;
    actorRole: string | null;
    actionType: string;
    entityType: string;
    entityId: number | null;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
}

// =============================================================================
// Component
// =============================================================================

export default function AuditLogsPage() {
    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [offset, setOffset] = useState(0);
    const [actionFilter, setActionFilter] = useState('ALL');
    const [entityFilter, setEntityFilter] = useState('ALL');
    const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
    const [exporting, setExporting] = useState(false);

    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const [fromDate, setFromDate] = useState(thirtyDaysAgo);
    const [toDate, setToDate] = useState(today);

    const limit = 25;

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (actionFilter && actionFilter !== 'ALL') params.set('actionType', actionFilter);
            if (entityFilter && entityFilter !== 'ALL') params.set('entityType', entityFilter);

            const res = await apiClient<{ entries: AuditLogEntry[]; total: number }>(`/auditor/audit-logs?${params}`);
            if (res.success && res.data) {
                setEntries(res.data.entries);
                setTotal(res.data.total);
            }
        } catch (err) {
            console.error('Failed to fetch audit logs:', err);
        } finally {
            setLoading(false);
        }
    }, [offset, actionFilter, entityFilter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleExportPDF = async () => {
        setExporting(true);
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({ from: fromDate, to: toDate });
            if (actionFilter !== 'ALL') params.set('actionType', actionFilter);
            if (entityFilter !== 'ALL') params.set('entityType', entityFilter);
            const response = await fetch(`/api/v1/auditor/export-pdf/audit-logs?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `audit-logs-${fromDate}-to-${toDate}.pdf`;
                a.click();
                window.URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setExporting(false);
        }
    };

    const getActionBadgeVariant = (action: string) => {
        if (action.includes('LOGIN')) return 'default';
        if (action.includes('LOGOUT')) return 'secondary';
        if (action.includes('CREATED')) return 'default';
        if (action.includes('FROZEN') || action.includes('CLOSED')) return 'destructive';
        if (action.includes('UNFROZEN')) return 'default';
        return 'outline';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
                    <p className="text-slate-600">System activity audit trail</p>
                </div>
                <div className="flex items-center gap-2">
                    <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
                    <span className="text-slate-400">to</span>
                    <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
                    <Button onClick={handleExportPDF} disabled={exporting}>
                        {exporting ? 'Exporting...' : 'Export PDF'}
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Activity Log</CardTitle>
                            <CardDescription>{total} total entries</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setOffset(0); }}>
                                <SelectTrigger className="w-48">
                                    <SelectValue placeholder="All actions" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All actions</SelectItem>
                                    <SelectItem value="USER_LOGIN">User Login</SelectItem>
                                    <SelectItem value="USER_LOGOUT">User Logout</SelectItem>
                                    <SelectItem value="CUSTOMER_LOGIN">Customer Login</SelectItem>
                                    <SelectItem value="ACCOUNT_CREATED">Account Created</SelectItem>
                                    <SelectItem value="ACCOUNT_FROZEN">Account Frozen</SelectItem>
                                    <SelectItem value="ACCOUNT_UNFROZEN">Account Unfrozen</SelectItem>
                                    <SelectItem value="ACCOUNT_CLOSED">Account Closed</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setOffset(0); }}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder="All entities" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All entities</SelectItem>
                                    <SelectItem value="ACCOUNT">Account</SelectItem>
                                    <SelectItem value="CUSTOMER">Customer</SelectItem>
                                    <SelectItem value="SESSION">Session</SelectItem>
                                    <SelectItem value="USER">User</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={fetchLogs}>Refresh</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Loading...</div>
                    ) : (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-16">ID</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Entity</TableHead>
                                        <TableHead>Actor</TableHead>
                                        <TableHead>Timestamp</TableHead>
                                        <TableHead className="text-right">Details</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {entries.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell className="font-mono text-sm">{entry.id}</TableCell>
                                            <TableCell>
                                                <Badge variant={getActionBadgeVariant(entry.actionType)}>
                                                    {entry.actionType.replace(/_/g, ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-slate-500">{entry.entityType}</span>
                                                {entry.entityId && (
                                                    <span className="text-slate-400"> #{entry.entityId}</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-slate-700">
                                                    {entry.actorType}{entry.actorId && ` #${entry.actorId}`}
                                                </span>
                                                {entry.actorRole && (
                                                    <span className="ml-1 text-xs text-slate-400">({entry.actorRole})</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {new Date(entry.createdAt).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSelectedEntry(entry)}
                                                >
                                                    View
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {entries.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                                                No audit logs found
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>

                            {/* Pagination */}
                            <div className="flex items-center justify-between mt-4">
                                <div className="text-sm text-slate-500">
                                    Showing {offset + 1} to {Math.min(offset + limit, total)} of {total}
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={offset === 0}
                                        onClick={() => setOffset(Math.max(0, offset - limit))}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={offset + limit >= total}
                                        onClick={() => setOffset(offset + limit)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Detail Modal */}
            {selectedEntry && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
                        <div className="p-6 border-b">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold">Audit Entry #{selectedEntry.id}</h3>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedEntry(null)}>
                                    ✕
                                </Button>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-slate-500">Action:</span>
                                    <span className="ml-2 font-medium">{selectedEntry.actionType}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Entity:</span>
                                    <span className="ml-2 font-medium">
                                        {selectedEntry.entityType} #{selectedEntry.entityId}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Actor:</span>
                                    <span className="ml-2">
                                        {selectedEntry.actorType} #{selectedEntry.actorId}
                                        {selectedEntry.actorRole && ` (${selectedEntry.actorRole})`}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Time:</span>
                                    <span className="ml-2">{new Date(selectedEntry.createdAt).toLocaleString()}</span>
                                </div>
                            </div>
                            {selectedEntry.beforeState && (
                                <div>
                                    <span className="text-sm text-slate-500 block mb-2">Before State:</span>
                                    <pre className="bg-slate-50 p-4 rounded-lg text-sm overflow-x-auto">
                                        {JSON.stringify(selectedEntry.beforeState, null, 2)}
                                    </pre>
                                </div>
                            )}
                            {selectedEntry.afterState && (
                                <div>
                                    <span className="text-sm text-slate-500 block mb-2">After State:</span>
                                    <pre className="bg-slate-50 p-4 rounded-lg text-sm overflow-x-auto">
                                        {JSON.stringify(selectedEntry.afterState, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
