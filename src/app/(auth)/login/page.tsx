'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    // const [loginType, setLoginType] = useState<'user' | 'customer'>('user'); // Removed for strict customer-only login
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const result = await login(email, password, 'customer');

        if (!result.success) {
            setError(result.error || 'Login failed');
        }

        setIsLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
            <div className="w-full max-w-md">
                {/* Logo/Branding */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-xl mb-4 shadow-sm p-2">
                        <img src="/bank.png" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">Banking Core</h1>
                    <p className="text-slate-600 mt-1">Production-Grade Core Banking System</p>
                </div>

                <Card className="border-0 shadow-xl">
                    <CardHeader className="space-y-1 pb-4">
                        <CardTitle className="text-xl">Sign in to your account</CardTitle>
                        <CardDescription>
                            Enter your credentials to access the banking portal
                        </CardDescription>
                    </CardHeader>

                    <div className="px-6 pb-4">
                        <h3 className="text-center font-medium text-slate-700">Customer Login</h3>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-4 pt-4">
                            {error && (
                                <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                />
                            </div>
                        </CardContent>

                        <CardFooter className="flex flex-col gap-4">
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                                fill="none"
                                            />
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            />
                                        </svg>
                                        Signing in...
                                    </span>
                                ) : (
                                    'Sign in'
                                )}
                            </Button>

                            <div className="mt-0 w-full">
                                <p className="text-sm text-center text-slate-600">
                                    Don't have an account?{' '}
                                    <span className="text-slate-900 font-medium">
                                        Visit your nearest branch
                                    </span>
                                </p>
                            </div>
                        </CardFooter>
                    </form>
                </Card>

                <p className="text-center text-sm text-slate-500 mt-6">
                    © {new Date().getFullYear()} Banking Core. All rights reserved.
                </p>
            </div>
        </div>
    );
}
