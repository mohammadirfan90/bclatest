'use client';

import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/layouts/Sidebar';

export default function VerificationPendingPage() {
    const { user, logout } = useAuth();

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <div className="mx-auto bg-yellow-100 p-3 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <CardTitle className="text-2xl">Verification Pending</CardTitle>
                    <CardDescription>
                        Hello {user?.firstName}, your account is currently under review.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-slate-600">
                        Our banking team is reviewing your KYC documents. This process usually takes 24-48 hours.
                    </p>
                    <div className="bg-slate-100 p-4 rounded text-sm text-slate-700">
                        <strong>Status:</strong> {user?.kycStatus || 'PENDING'}
                    </div>
                    <p className="text-xs text-slate-500">
                        You will receive an email notification once your account is active.
                    </p>
                </CardContent>
                <CardFooter className="justify-center">
                    <Button variant="outline" onClick={logout}>
                        Sign Out
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
