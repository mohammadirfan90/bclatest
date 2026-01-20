'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/auth-context';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

export default function CustomerProfilePage() {
    const [profile, setProfile] = useState<any>(null);
    const [pendingRequest, setPendingRequest] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Edit Mode
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<any>({});
    const [submitting, setSubmitting] = useState(false);

    const fetchProfile = async () => {
        try {
            const result = await apiClient<{ profile: any; pendingRequest: any }>('/customer/profile');
            if (result.success && result.data) {
                setProfile(result.data.profile);
                setPendingRequest(result.data.pendingRequest);
                // Initialize form data with current profile
                setFormData({
                    firstName: result.data.profile.first_name,
                    lastName: result.data.profile.last_name,
                    nationalId: result.data.profile.national_id,
                    dateOfBirth: result.data.profile.date_of_birth ? new Date(result.data.profile.date_of_birth).toISOString().split('T')[0] : '',
                    address: result.data.profile.address_line1,
                    phone: result.data.profile.phone,
                    postalCode: result.data.profile.postal_code
                });
            } else {
                setError(result.error || 'Failed to load profile');
            }
        } catch (e) {
            setError('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData((prev: any) => ({ ...prev, [e.target.id]: e.target.value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const result = await apiClient('/customer/profile', {
                method: 'PUT',
                body: JSON.stringify(formData)
            });
            if (result.success) {
                setIsEditing(false);
                fetchProfile(); // Refresh to see pending status
            } else {
                alert(result.error || 'Update failed');
            }
        } catch (e) {
            alert('Update failed');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-8">Loading profile...</div>;

    return (
        <div className="space-y-6 max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold">My Profile</h1>

            {pendingRequest && (
                <Alert className="bg-yellow-50 border-yellow-200">
                    <AlertDescription className="text-yellow-800">
                        You have a pending profile update request (ID: {pendingRequest.id}) submitted on {new Date(pendingRequest.submitted_at).toLocaleDateString()}.
                        <br />
                        Changes will be reflected once approved by a banker.
                    </AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Personal Information</CardTitle>
                        <CardDescription>Manage your identity details</CardDescription>
                    </div>
                    {/* Only allow edit if no pending request and strictly active/verified? */}
                    {/* Actually, user might want to correct a mistake, but let's block for simplicity if pending exists */}
                    {!isEditing && !pendingRequest && (
                        <Button variant="outline" onClick={() => setIsEditing(true)}>Edit Profile</Button>
                    )}
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="firstName">First Name</Label>
                                <Input
                                    id="firstName"
                                    value={isEditing ? formData.firstName : profile?.first_name}
                                    readOnly={!isEditing}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="lastName">Last Name</Label>
                                <Input
                                    id="lastName"
                                    value={isEditing ? formData.lastName : profile?.last_name}
                                    readOnly={!isEditing}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="nationalId">National ID</Label>
                                <Input
                                    id="nationalId"
                                    value={isEditing ? formData.nationalId : profile?.national_id}
                                    readOnly={!isEditing}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                                <Input
                                    id="dateOfBirth"
                                    type="date"
                                    value={isEditing ? formData.dateOfBirth : (profile?.date_of_birth ? new Date(profile.date_of_birth).toISOString().split('T')[0] : '')}
                                    readOnly={!isEditing}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="address">Address</Label>
                            <Input
                                id="address"
                                value={isEditing ? formData.address : profile?.address_line1}
                                readOnly={!isEditing}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone</Label>
                                <Input
                                    id="phone"
                                    value={isEditing ? formData.phone : profile?.phone}
                                    readOnly={!isEditing}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="postalCode">Postal Code</Label>
                                <Input
                                    id="postalCode"
                                    value={isEditing ? formData.postalCode : profile?.postal_code}
                                    readOnly={!isEditing}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t mt-4">
                            <Label>KYC Status</Label>
                            <div className="mt-2">
                                <Badge variant={profile?.kyc_status === 'VERIFIED' ? 'default' : 'destructive'}>
                                    {profile?.kyc_status}
                                </Badge>
                                <span className="ml-2 text-xs text-slate-500">Version: {profile?.kyc_version}</span>
                            </div>
                        </div>

                        {isEditing && (
                            <div className="flex justify-end gap-2 mt-6">
                                <Button type="button" variant="ghost" onClick={() => { setIsEditing(false); setFormData({ ...profile }); }}>Cancel</Button>
                                <Button type="submit" disabled={submitting}>
                                    {submitting ? 'Submitting...' : 'Submit Changes'}
                                </Button>
                            </div>
                        )}
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
