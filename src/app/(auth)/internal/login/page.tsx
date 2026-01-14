'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function StaffLoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const result = await login(email, password, 'user'); // 'user' type for Staff (Banker/Admin)

        if (!result.success) {
            setError(result.error || 'Login failed');
        } else {
            // Redirect is handled by auth-context usually, but fallback here if needed
            // router.push('/admin/dashboard') etc.
        }

        setIsLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-800 rounded-xl mb-4 border border-slate-700">
                        <svg
                            className="w-8 h-8 text-indigo-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                            />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white">Restricted Access</h1>
                    <p className="text-slate-400 mt-1">Authorized Personnel Only</p>
                </div>

                <Card className="border-slate-800 bg-slate-950/50 text-slate-100 shadow-2xl">
                    <CardHeader className="space-y-1 pb-4">
                        <CardTitle className="text-xl">Staff Authentication</CardTitle>
                        <CardDescription className="text-slate-400">
                            System activity is monitored and logged
                        </CardDescription>
                    </CardHeader>

                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-4 pt-4">
                            {error && (
                                <Alert variant="destructive" className="bg-red-900/50 border-red-900 text-red-200">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-slate-200">Corporate Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="admin@internal.bank"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                    className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-slate-200">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                    className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
                                />
                            </div>
                        </CardContent>

                        <CardFooter>
                            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={isLoading}>
                                {isLoading ? 'Authenticating...' : 'Access Console'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
}
