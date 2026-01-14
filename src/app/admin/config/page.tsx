'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Config {
    id: number;
    config_key: string;
    config_value: string;
    value_type: string;
    description: string;
}

export default function AdminConfigPage() {
    const [configs, setConfigs] = useState<Config[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        try {
            const res = await apiClient<Config[]>('/admin/config');
            if (res.success && res.data) {
                setConfigs(res.data);
            }
        } catch (err) {
            console.error('Failed to fetch config:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">System Configuration</h1>
                    <p className="text-slate-600">Manage system-wide settings</p>
                </div>
                <Button>Add Config</Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Configuration Parameters</CardTitle>
                    <CardDescription>System-wide configuration values</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Loading configuration...</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Key</TableHead>
                                    <TableHead>Value</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {configs.map((config) => (
                                    <TableRow key={config.id}>
                                        <TableCell className="font-mono text-sm">{config.config_key}</TableCell>
                                        <TableCell>
                                            <Input
                                                defaultValue={config.config_value}
                                                className="max-w-xs"
                                                disabled
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{config.value_type}</Badge>
                                        </TableCell>
                                        <TableCell className="text-slate-600 text-sm">{config.description}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm">Edit</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {configs.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                            No configuration found
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
