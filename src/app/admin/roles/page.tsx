'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface Role {
    id: number;
    code: string;
    name: string;
    description: string;
    permission_count: number;
}

export default function AdminRolesPage() {
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRoles();
    }, []);

    const fetchRoles = async () => {
        try {
            const res = await apiClient<Role[]>('/admin/roles');
            if (res.success && res.data) {
                setRoles(res.data);
            }
        } catch (err) {
            console.error('Failed to fetch roles:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Role Management</h1>
                <p className="text-slate-600">Configure roles and permissions</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>System Roles</CardTitle>
                    <CardDescription>Roles define what actions users can perform</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Loading roles...</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Permissions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {roles.map((role) => (
                                    <TableRow key={role.id}>
                                        <TableCell>
                                            <Badge variant="outline" className="font-mono">{role.code}</Badge>
                                        </TableCell>
                                        <TableCell className="font-medium">{role.name}</TableCell>
                                        <TableCell className="text-slate-600">{role.description}</TableCell>
                                        <TableCell>{role.permission_count || 'All'}</TableCell>
                                    </TableRow>
                                ))}
                                {roles.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                                            No roles found
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
