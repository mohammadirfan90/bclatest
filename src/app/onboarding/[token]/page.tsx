'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function OnboardingPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    const router = useRouter();

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [formData, setFormData] = useState({
        email: '',
        firstName: '',
        lastName: '',
        password: '',
        confirmPassword: '',
        dateOfBirth: '',
        nationalId: '',
        address: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    const handleNext = () => {
        if (step === 1) {
            if (!formData.email || !formData.firstName || !formData.lastName || !formData.password) {
                setError('Please fill in all required fields');
                return;
            }
            if (formData.password !== formData.confirmPassword) {
                setError('Passwords do not match');
                return;
            }
            if (formData.password.length < 8) {
                setError('Password must be at least 8 characters');
                return;
            }
        }
        setError(null);
        setStep(prev => prev + 1);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/v1/onboarding/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    ...formData,
                    kycData: {
                        // Extra payload if needed, currently flatter structure
                        source: 'web_onboarding'
                    }
                }),
            });

            const data = await res.json();

            if (data.success) {
                setSuccess(true);
            } else {
                setError(data.error || 'Submission failed');
                // If token invalid, maybe redirect or show specific error
            }
        } catch (err) {
            setError('Network error, please try again');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <CardTitle className="text-2xl text-green-600">Application Submitted!</CardTitle>
                        <CardDescription>
                            Your onboarding request has been successfully submitted.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-center text-6xl my-4">🎉</div>
                        <p className="text-slate-600">
                            A banker will review your details shortly. You will receive an email once your account is active.
                        </p>
                    </CardContent>
                    <CardFooter className="justify-center">
                        <Button variant="outline" onClick={() => router.push('/login')}>
                            Back to Login
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <CardTitle>Complete Your Account Setup</CardTitle>
                    <CardDescription>
                        Step {step} of 2: {step === 1 ? 'Account Credentials' : 'Identity Verification'}
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {step === 1 && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="firstName">First Name</Label>
                                        <Input id="firstName" required value={formData.firstName} onChange={handleChange} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="lastName">Last Name</Label>
                                        <Input id="lastName" required value={formData.lastName} onChange={handleChange} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email Address</Label>
                                    <Input id="email" type="email" required value={formData.email} onChange={handleChange} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password">Create Password</Label>
                                    <Input id="password" type="password" required value={formData.password} onChange={handleChange} />
                                    <p className="text-xs text-slate-500">Min 8 chars, mixed case & numbers</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                                    <Input id="confirmPassword" type="password" required value={formData.confirmPassword} onChange={handleChange} />
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                                    <Input id="dateOfBirth" type="date" required value={formData.dateOfBirth} onChange={handleChange} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="nationalId">National ID / Passport Number</Label>
                                    <Input id="nationalId" required value={formData.nationalId} onChange={handleChange} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="address">Residential Address</Label>
                                    <Input id="address" required value={formData.address} onChange={handleChange} />
                                </div>
                                <div className="bg-blue-50 p-4 rounded text-sm text-blue-700">
                                    <strong>Note:</strong> Your details will be verified by our banking team before account activation.
                                </div>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex justify-between">
                        {step === 2 ? (
                            <Button type="button" variant="ghost" onClick={() => setStep(1)}>Back</Button>
                        ) : (
                            <div /> /* Spacer */
                        )}

                        {step === 1 ? (
                            <Button type="button" onClick={handleNext}>Next Step</Button>
                        ) : (
                            <Button type="submit" disabled={loading}>
                                {loading ? 'Submitting...' : 'Submit Evaluation'}
                            </Button>
                        )}
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
