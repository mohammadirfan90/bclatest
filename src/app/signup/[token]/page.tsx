
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod'; // We'll redefine schema here for client-side or share it. 
// Ideally share, but for simplicity redefining locally to match backend strong password rules.

const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

const signupSchema = z.object({
    password: z.string().regex(strongPasswordRegex, "Password must be 8+ chars, include uppercase, lowercase, number, and special char."),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

type SignupForm = z.infer<typeof signupSchema>;

export default function SignupPage() {
    const params = useParams();
    const router = useRouter();
    const [tokenValid, setTokenValid] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const { register, handleSubmit, formState: { errors } } = useForm<SignupForm>({
        resolver: zodResolver(signupSchema),
    });

    useEffect(() => {
        const validateToken = async () => {
            try {
                const res = await fetch(`/api/v1/auth/signup-tokens/${params.token}`);
                if (res.ok) {
                    setTokenValid(true);
                } else {
                    setTokenValid(false);
                    setError("Invalid or expired signup link.");
                }
            } catch (err) {
                setTokenValid(false);
                setError("Failed to validate link.");
            } finally {
                setLoading(false);
            }
        };

        if (params.token) {
            validateToken();
        }
    }, [params.token]);

    const onSubmit = async (data: SignupForm) => {
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch('/api/v1/auth/signup/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: params.token,
                    password: data.password,
                }),
            });

            const result = await res.json();

            if (!res.ok) {
                throw new Error(result.error || 'Signup failed');
            }

            setSuccess(true);
            setTimeout(() => {
                router.push('/login');
            }, 3000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Validating Key...</p>
                </div>
            </div>
        );
    }

    if (!tokenValid) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
                    <div className="text-red-500 text-5xl mb-4">⚠️</div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Link</h1>
                    <p className="text-gray-600 mb-6">{error || "This signup link is invalid, expired, or has already been used."}</p>
                    <button onClick={() => router.push('/login')} className="text-primary-600 hover:underline">
                        Return to Login
                    </button>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
                    <div className="text-green-500 text-5xl mb-4">✅</div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Signup Complete</h1>
                    <p className="text-gray-600 mb-6">Your password has been set. Your account is now <strong>PENDING APPROVAL</strong>. You will be notified once a banker activates your access.</p>
                    <p className="text-sm text-gray-500">Redirecting to login...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    Complete Account Setup
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Set your secure password to activate your banking access.
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
                        {error && (
                            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                                <div className="flex">
                                    <div className="ml-3">
                                        <p className="text-sm text-red-700">{error}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                New Password
                            </label>
                            <div className="mt-1">
                                <input
                                    id="password"
                                    type="password"
                                    {...register('password')}
                                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                                />
                                {errors.password && <p className="mt-2 text-sm text-red-600">{errors.password.message}</p>}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                                Confirm Password
                            </label>
                            <div className="mt-1">
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    {...register('confirmPassword')}
                                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                                />
                                {errors.confirmPassword && <p className="mt-2 text-sm text-red-600">{errors.confirmPassword.message}</p>}
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                            >
                                {submitting ? 'Setting Password...' : 'Activate Account'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
