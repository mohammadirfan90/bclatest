'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface User {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    roleName: string;
    roleCode: string;
    status: string;
    createdAt: string;
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            // API returns { success, data, pagination }
            // data is an array of users with camelCase keys
            const res = await apiClient<User[]>('/admin/users');
            if (res.success && res.data) {
                // Handle both direct array and nested data formats
                const userData = Array.isArray(res.data) ? res.data : [];
                setUsers(userData);
            } else {
                setError(res.error || 'Failed to fetch users');
            }
        } catch (err) {
            console.error('Failed to fetch users:', err);
            setError('Failed to connect to server');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
                    <p className="text-slate-600">Manage staff accounts and permissions</p>
                </div>
                <Button>Add User</Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Staff Users</CardTitle>
                    <CardDescription>All staff members with system access</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Loading users...</div>
                    ) : error ? (
                        <div className="text-center py-8 text-red-500">{error}</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">
                                            {user.firstName} {user.lastName}
                                        </TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{user.roleName}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={user.status === 'ACTIVE' ? 'default' : 'secondary'}>
                                                {user.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm">Edit</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {users.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                                            No users found
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
