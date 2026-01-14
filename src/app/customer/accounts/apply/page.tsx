'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ApplyAccountPage() {
    const router = useRouter();
    const [accountType, setAccountType] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accountType) {
            setError('Please select an account type');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const result = await apiClient('/accounts/apply', {
                method: 'POST',
                body: JSON.stringify({ accountType }),
            });

            if (result.success) {
                setSuccess(true);
                // Optional: Redirect after delay
                setTimeout(() => router.push('/customer/accounts'), 2000);
            } else {
                setError(result.error || 'Failed to submit application');
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-xl mx-auto space-y-8 py-10">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Open New Account</h1>
                <p className="text-slate-600 mt-2">Apply for a new banking account in minutes.</p>
            </div>

            {success ? (
                <Card className="border-green-100 bg-green-50">
                    <CardContent className="pt-6 text-center space-y-4">
                        <div className="flex justify-center">
                            <CheckCircle2 className="h-12 w-12 text-green-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-green-900">Application Submitted!</h2>
                        <p className="text-green-700">
                            Your application for a {accountType} account has been received and is pending approval.
                            You will be notified once a banker reviews it.
                        </p>
                        <Button onClick={() => router.push('/customer/accounts')} variant="outline" className="mt-4 border-green-200 text-green-800 hover:bg-green-100">
                            Back to Accounts
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>Account Details</CardTitle>
                        <CardDescription>Select the type of account you wish to open.</CardDescription>
                    </CardHeader>
                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-6">
                            {error && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Error</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="type">Account Type</Label>
                                <Select value={accountType} onValueChange={setAccountType}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select account type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="SAVINGS">
                                            <div className="font-medium">Savings Account</div>
                                            <p className="text-xs text-muted-foreground">Standard interest-bearing account</p>
                                        </SelectItem>
                                        <SelectItem value="CURRENT">
                                            <div className="font-medium">Current Account</div>
                                            <p className="text-xs text-muted-foreground">For daily transactions and payments</p>
                                        </SelectItem>
                                        <SelectItem value="BUSINESS">
                                            <div className="font-medium">Business Account</div>
                                            <p className="text-xs text-muted-foreground">For corporate usage</p>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-lg text-sm text-slate-600">
                                <h4 className="font-semibold mb-2 text-slate-900">Important Information</h4>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li>Applications typically take 1-2 business days to process.</li>
                                    <li>You may be contacted if additional documents are required.</li>
                                    <li>Initial deposit can be made after approval.</li>
                                </ul>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-between">
                            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
                            <Button type="submit" disabled={isLoading || !accountType}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Submit Application
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            )}
        </div>
    );
}
