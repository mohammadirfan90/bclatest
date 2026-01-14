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

interface Event {
    id: number;
    event_type: string;
    aggregate_type: string;
    aggregate_id: number;
    payload: Record<string, unknown>;
    created_at: string;
    processed_at: string | null;
}

interface OutboxItem {
    id: number;
    event_type: string;
    aggregate_type: string;
    aggregate_id: number;
    payload: Record<string, unknown>;
    status: 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'FAILED';
    retry_count: number;
    max_retries: number;
    last_error: string | null;
    created_at: string;
    processed_at: string | null;
}

interface OutboxStats {
    pending: number;
    processing: number;
    delivered: number;
    failed: number;
}

// =============================================================================
// Component
// =============================================================================

export default function AdminEventsPage() {
    const [activeTab, setActiveTab] = useState<'events' | 'outbox' | 'replay'>('events');

    // Events state
    const [events, setEvents] = useState<Event[]>([]);
    const [eventTypes, setEventTypes] = useState<string[]>([]);
    const [eventsTotal, setEventsTotal] = useState(0);
    const [eventsLoading, setEventsLoading] = useState(true);
    const [eventTypeFilter, setEventTypeFilter] = useState('ALL');
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

    // Outbox state
    const [outboxItems, setOutboxItems] = useState<OutboxItem[]>([]);
    const [outboxStats, setOutboxStats] = useState<OutboxStats | null>(null);
    const [outboxLoading, setOutboxLoading] = useState(false);
    const [outboxStatusFilter, setOutboxStatusFilter] = useState('ALL');

    // Replay state
    const [replayEventType, setReplayEventType] = useState('ALL');
    const [replayFrom, setReplayFrom] = useState('');
    const [replayTo, setReplayTo] = useState('');
    const [replayLoading, setReplayLoading] = useState(false);
    const [replayResult, setReplayResult] = useState<{ message: string; eventsReplayed?: number } | null>(null);

    // Fetch event types on mount
    useEffect(() => {
        apiClient<string[]>('/admin/events?types=true')
            .then(res => {
                if (res.success && res.data) {
                    setEventTypes(res.data);
                }
            })
            .catch(console.error);
    }, []);

    // Fetch events
    const fetchEvents = useCallback(async () => {
        setEventsLoading(true);
        try {
            const params = new URLSearchParams({ limit: '50' });
            if (eventTypeFilter && eventTypeFilter !== 'ALL') params.set('eventType', eventTypeFilter);

            const res = await apiClient<{ events: Event[]; total: number }>(`/admin/events?${params}`);
            if (res.success && res.data) {
                setEvents(res.data.events);
                setEventsTotal(res.data.total);
            }
        } catch (err) {
            console.error('Failed to fetch events:', err);
        } finally {
            setEventsLoading(false);
        }
    }, [eventTypeFilter]);

    // Fetch outbox
    const fetchOutbox = useCallback(async () => {
        setOutboxLoading(true);
        try {
            const params = new URLSearchParams({ limit: '50' });
            if (outboxStatusFilter && outboxStatusFilter !== 'ALL') params.set('status', outboxStatusFilter);

            const res = await apiClient<{ items: OutboxItem[]; stats: OutboxStats }>(`/admin/outbox?${params}`);
            if (res.success && res.data) {
                setOutboxItems(res.data.items);
                setOutboxStats(res.data.stats);
            }
        } catch (err) {
            console.error('Failed to fetch outbox:', err);
        } finally {
            setOutboxLoading(false);
        }
    }, [outboxStatusFilter]);

    // Load data based on active tab
    useEffect(() => {
        if (activeTab === 'events') {
            fetchEvents();
        } else if (activeTab === 'outbox') {
            fetchOutbox();
        }
    }, [activeTab, fetchEvents, fetchOutbox]);

    // Retry outbox item
    const handleRetry = async (id: number) => {
        try {
            const res = await apiClient(`/admin/outbox/${id}/retry`, { method: 'POST' });
            if (res.success) {
                fetchOutbox();
            }
        } catch (err) {
            console.error('Failed to retry:', err);
        }
    };

    // Trigger replay
    const handleReplay = async () => {
        if (!replayFrom || !replayTo) {
            alert('Please select both from and to dates');
            return;
        }

        setReplayLoading(true);
        setReplayResult(null);
        try {
            const res = await apiClient<{ message: string; eventsReplayed: number }>('/admin/events/replay', {
                method: 'POST',
                body: JSON.stringify({
                    eventType: replayEventType !== 'ALL' ? replayEventType : undefined,
                    from: replayFrom,
                    to: replayTo
                })
            });
            if (res.success && res.data) {
                setReplayResult(res.data);
            }
        } catch (err) {
            console.error('Failed to replay:', err);
            setReplayResult({ message: 'Replay failed. Check console for details.' });
        } finally {
            setReplayLoading(false);
        }
    };

    const getStatusBadgeVariant = (status: OutboxItem['status']) => {
        switch (status) {
            case 'DELIVERED': return 'default';
            case 'PENDING': return 'secondary';
            case 'PROCESSING': return 'outline';
            case 'FAILED': return 'destructive';
            default: return 'outline';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Event Sourcing</h1>
                    <p className="text-slate-600">Event log, outbox monitoring, and replay controls</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                {(['events', 'outbox', 'replay'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                            }`}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        {tab === 'outbox' && outboxStats && outboxStats.pending > 0 && (
                            <span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                                {outboxStats.pending}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Events Tab */}
            {activeTab === 'events' && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Event Log</CardTitle>
                                <CardDescription>
                                    {eventsTotal} total events
                                </CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue placeholder="All event types" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">All event types</SelectItem>
                                        {eventTypes.map(type => (
                                            <SelectItem key={type} value={type}>{type}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" onClick={fetchEvents}>Refresh</Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {eventsLoading ? (
                            <div className="text-center py-8 text-slate-500">Loading events...</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-16">ID</TableHead>
                                        <TableHead>Event Type</TableHead>
                                        <TableHead>Aggregate</TableHead>
                                        <TableHead>Timestamp</TableHead>
                                        <TableHead>Processed</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {events.map((event) => (
                                        <TableRow key={event.id}>
                                            <TableCell className="font-mono text-sm">{event.id}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{event.event_type}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-slate-500">{event.aggregate_type}</span>
                                                <span className="text-slate-400"> #{event.aggregate_id}</span>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {new Date(event.created_at).toLocaleString()}
                                            </TableCell>
                                            <TableCell>
                                                {event.processed_at ? (
                                                    <Badge variant="default">Yes</Badge>
                                                ) : (
                                                    <Badge variant="secondary">No</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSelectedEvent(event)}
                                                >
                                                    View
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {events.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                                                No events found
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Outbox Tab */}
            {activeTab === 'outbox' && (
                <>
                    {/* Stats Cards */}
                    {outboxStats && (
                        <div className="grid grid-cols-4 gap-4">
                            {[
                                { label: 'Pending', value: outboxStats.pending, color: 'amber' },
                                { label: 'Processing', value: outboxStats.processing, color: 'blue' },
                                { label: 'Delivered', value: outboxStats.delivered, color: 'green' },
                                { label: 'Failed', value: outboxStats.failed, color: 'red' }
                            ].map(stat => (
                                <Card key={stat.label}>
                                    <CardContent className="pt-6">
                                        <div className={`text-3xl font-bold text-${stat.color}-600`}>
                                            {stat.value}
                                        </div>
                                        <div className="text-sm text-slate-500">{stat.label}</div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Outbox Queue</CardTitle>
                                    <CardDescription>Reliable event delivery via outbox pattern</CardDescription>
                                </div>
                                <div className="flex gap-2">
                                    <Select value={outboxStatusFilter} onValueChange={setOutboxStatusFilter}>
                                        <SelectTrigger className="w-36">
                                            <SelectValue placeholder="All statuses" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">All statuses</SelectItem>
                                            <SelectItem value="PENDING">Pending</SelectItem>
                                            <SelectItem value="PROCESSING">Processing</SelectItem>
                                            <SelectItem value="DELIVERED">Delivered</SelectItem>
                                            <SelectItem value="FAILED">Failed</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button variant="outline" onClick={fetchOutbox}>Refresh</Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {outboxLoading ? (
                                <div className="text-center py-8 text-slate-500">Loading outbox...</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-16">ID</TableHead>
                                            <TableHead>Event Type</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Retries</TableHead>
                                            <TableHead>Created</TableHead>
                                            <TableHead>Last Error</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {outboxItems.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-mono text-sm">{item.id}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{item.event_type}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={getStatusBadgeVariant(item.status)}>
                                                        {item.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {item.retry_count}/{item.max_retries}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {new Date(item.created_at).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="max-w-48 truncate text-sm text-red-600">
                                                    {item.last_error || '-'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {item.status === 'FAILED' && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleRetry(item.id)}
                                                        >
                                                            Retry
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {outboxItems.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                                                    No outbox items found
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}

            {/* Replay Tab */}
            {activeTab === 'replay' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Event Replay</CardTitle>
                        <CardDescription>
                            Re-process events within a date range. This will reset processed flags and re-add events to the outbox.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Event Type (optional)
                                </label>
                                <Select value={replayEventType} onValueChange={setReplayEventType}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All event types" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">All event types</SelectItem>
                                        {eventTypes.map(type => (
                                            <SelectItem key={type} value={type}>{type}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    From Date
                                </label>
                                <Input
                                    type="date"
                                    value={replayFrom}
                                    onChange={e => setReplayFrom(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    To Date
                                </label>
                                <Input
                                    type="date"
                                    value={replayTo}
                                    onChange={e => setReplayTo(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <Button
                                onClick={handleReplay}
                                disabled={replayLoading || !replayFrom || !replayTo}
                            >
                                {replayLoading ? 'Processing...' : 'Trigger Replay'}
                            </Button>

                            {replayResult && (
                                <div className={`p-3 rounded-lg ${replayResult.eventsReplayed !== undefined
                                    ? 'bg-green-50 text-green-700'
                                    : 'bg-red-50 text-red-700'
                                    }`}>
                                    {replayResult.message}
                                </div>
                            )}
                        </div>

                        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                            <h4 className="font-medium text-amber-800">⚠️ Important Notes</h4>
                            <ul className="mt-2 text-sm text-amber-700 list-disc list-inside space-y-1">
                                <li>Replay range is limited to 31 days maximum</li>
                                <li>Events will be re-added to the outbox for reprocessing</li>
                                <li>No ledger mutations occur during replay</li>
                                <li>Event handlers must be idempotent</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Event Detail Modal */}
            {selectedEvent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
                        <div className="p-6 border-b">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold">Event #{selectedEvent.id}</h3>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(null)}>
                                    ✕
                                </Button>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-slate-500">Event Type:</span>
                                    <span className="ml-2 font-medium">{selectedEvent.event_type}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Aggregate:</span>
                                    <span className="ml-2 font-medium">
                                        {selectedEvent.aggregate_type} #{selectedEvent.aggregate_id}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Created:</span>
                                    <span className="ml-2">{new Date(selectedEvent.created_at).toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Processed:</span>
                                    <span className="ml-2">
                                        {selectedEvent.processed_at
                                            ? new Date(selectedEvent.processed_at).toLocaleString()
                                            : 'Not yet'}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <span className="text-sm text-slate-500 block mb-2">Payload:</span>
                                <pre className="bg-slate-50 p-4 rounded-lg text-sm overflow-x-auto">
                                    {JSON.stringify(selectedEvent.payload, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
