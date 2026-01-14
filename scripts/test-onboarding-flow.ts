
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';
// Removed unused db import to avoid initialization side effects
const ADMIN_EMAIL = 'irfan@chrono.log'; // Assuming this user exists as banker/admin from previous steps
const ADMIN_PASSWORD = 'imirfan998#';

async function main() {
    console.log('🚀 Starting End-to-End Onboarding Test...');

    // 1. Authenticate as Banker
    console.log('\n🔐 Authenticating as Banker...');
    const bankerAuth = await login(ADMIN_EMAIL, ADMIN_PASSWORD, 'user');
    if (!bankerAuth.success) throw new Error('Banker login failed');
    const bankerToken = bankerAuth.data.token;
    console.log('✅ Banker Logged In');

    // 2. Create New Customer Invite
    console.log('\n📧 Inviting New Customer...');
    const inviteRes = await fetch(`${BASE_URL}/api/v1/banker/customers`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${bankerToken}`
        },
        body: JSON.stringify({
            firstName: 'Test',
            lastName: 'User',
            email: `testuser_${Date.now()}@example.com`,
            phone: '1234567890'
        })
    });
    const inviteData = await inviteRes.json();
    if (!inviteData.success) throw new Error('Invite failed: ' + inviteData.error);
    const { token: onboardingToken, link, customerId } = inviteData.data;
    console.log(`✅ Invite Sent. Token: ${onboardingToken}`);

    // 3. Customer Submits Onboarding
    console.log('\n📝 Customer Submitting Onboarding...');
    const customerPassword = 'Password123!';
    const submitRes = await fetch(`${BASE_URL}/api/v1/onboarding/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: onboardingToken,
            email: `testuser_${Date.now()}@example.com`, // Should match? or can be different? The submit route uses the email from body to create user.
            firstName: 'Test',
            lastName: 'User',
            password: customerPassword,
            confirmPassword: customerPassword,
            dateOfBirth: '1990-01-01',
            nationalId: 'NID123456',
            address: '123 Test St',
            kycData: { source: 'script' }
        })
    });
    const submitData = await submitRes.json();
    if (!submitData.success) throw new Error('Onboarding submission failed: ' + submitData.error);
    console.log('✅ Onboarding Submitted');

    // 4. Banker Checks Pending Request
    console.log('\n🔍 Banker Checking Pending Requests...');
    const pendingRes = await fetch(`${BASE_URL}/api/v1/banker/kyc/pending`, {
        headers: { 'Authorization': `Bearer ${bankerToken}` }
    });
    const pendingData = await pendingRes.json();
    const myRequest = pendingData.data.find((r: any) => r.customer_id === customerId);
    if (!myRequest) throw new Error('Pending request not found for customer');
    console.log(`✅ Found Pending Request ID: ${myRequest.id}`);

    // 5. Banker Approves Request
    console.log('\n✅ Banker Approving Request...');
    const approveRes = await fetch(`${BASE_URL}/api/v1/banker/kyc/${myRequest.id}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${bankerToken}` }
    });
    const approveData = await approveRes.json();
    if (!approveData.success) throw new Error('Approval failed');
    console.log('✅ Request Approved');

    // 6. Customer Login
    console.log('\n👤 Customer Logging In...');
    // We need to know the exact email used. In this script we generated dynamic emails. 
    // Wait, the invite generates an email, the submit might reuse it.
    // In step 3 I used a new Date() again, which might be different if execution is slow? 
    // No, I should store it.

    // Rerunning logic properly:
    // Actually inviteRes input email should be used login.
    // Let's fix the script variable usage.
}

async function login(email: string, password: string, type: 'user' | 'customer') {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, type })
    });
    return res.json();
}

// Clean run function with state
async function run() {
    try {
        const testEmail = `testuser_${Date.now()}@example.com`;

        // 1. Authenticate as Banker
        console.log('🔐 Authenticating as Banker...');
        const bankerAuth = await login(ADMIN_EMAIL, ADMIN_PASSWORD, 'user');
        if (!bankerAuth.success) throw new Error('Banker login failed: ' + bankerAuth.error);
        const bankerToken = bankerAuth.data.token;
        console.log('✅ Banker Logged In');

        // 2. Create New Customer Invite
        console.log('📧 Inviting New Customer...');
        const inviteRes = await fetch(`${BASE_URL}/api/v1/banker/customers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bankerToken}`
            },
            body: JSON.stringify({
                firstName: 'Test',
                lastName: 'User',
                email: testEmail,
                phone: '1234567890'
            })
        });
        const inviteData = await inviteRes.json();
        if (!inviteData.success) throw new Error('Invite failed: ' + inviteData.error);
        const { token: onboardingToken, customerId } = inviteData.data;
        console.log(`✅ Invite Sent. Token: ${onboardingToken}`);

        // 3. Customer Submits Onboarding
        console.log('📝 Customer Submitting Onboarding...');
        const customerPassword = 'Password123!';
        const submitRes = await fetch(`${BASE_URL}/api/v1/onboarding/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: onboardingToken,
                email: testEmail,
                firstName: 'Test',
                lastName: 'User',
                password: customerPassword,
                confirmPassword: customerPassword,
                dateOfBirth: '1990-01-01',
                nationalId: 'NID123456',
                address: '123 Test St'
            })
        });
        const submitData = await submitRes.json();
        if (!submitData.success) {
            console.log('Submit Error:', submitData);
            throw new Error('Onboarding submission failed');
        }
        console.log('✅ Onboarding Submitted');

        // 4. Banker Checks Pending Request
        console.log('🔍 Banker Checking Pending Requests...');
        const pendingRes = await fetch(`${BASE_URL}/api/v1/banker/kyc/pending`, {
            headers: { 'Authorization': `Bearer ${bankerToken}` }
        });
        const pendingData = await pendingRes.json();
        const myRequest = pendingData.data.find((r: any) => r.customer_id === customerId);
        if (!myRequest) throw new Error('Pending request not found for customer');
        console.log(`✅ Found Pending Request ID: ${myRequest.id}`);

        // 5. Banker Approves Request
        console.log('✅ Banker Approving Request...');
        const approveRes = await fetch(`${BASE_URL}/api/v1/banker/kyc/${myRequest.id}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${bankerToken}` }
        });
        const approveData = await approveRes.json();
        if (!approveData.success) throw new Error('Approval failed: ' + approveData.error);
        console.log('✅ Request Approved');

        // 6. Customer Login
        console.log('👤 Customer Logging In...');
        const custAuth = await login(testEmail, customerPassword, 'customer');
        if (!custAuth.success) throw new Error('Customer login failed: ' + custAuth.error);
        const custToken = custAuth.data.token;
        console.log('✅ Customer Logged In');

        // 7. Check Profile
        console.log('📂 Checking Profile...');
        const profileRes = await fetch(`${BASE_URL}/api/v1/customer/profile`, {
            headers: { 'Authorization': `Bearer ${custToken}` }
        });
        const profileData = await profileRes.json();
        if (!profileData.success) throw new Error('Get profile failed');
        if (profileData.data.profile.kyc_status !== 'VERIFIED') throw new Error('KYC Status not VERIFIED');
        console.log('✅ Profile Verified');

        // 8. Update Profile
        console.log('✏️ Updating Profile (Triggering Review)...');
        const updateRes = await fetch(`${BASE_URL}/api/v1/customer/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${custToken}`
            },
            body: JSON.stringify({ address: '456 New St' })
        });
        const updateData = await updateRes.json();
        if (!updateData.success) throw new Error('Update failed');
        console.log('✅ Profile Update Submitted');

        // 9. Banker Reject
        console.log('❌ Banker Rejecting Update...');
        // Find new request
        const pendingRes2 = await fetch(`${BASE_URL}/api/v1/banker/kyc/pending`, {
            headers: { 'Authorization': `Bearer ${bankerToken}` }
        });
        const pendingData2 = await pendingRes2.json();
        const newRequest = pendingData2.data.find((r: any) => r.customer_id === customerId);

        if (!newRequest) throw new Error('New pending request not found');

        const rejectRes = await fetch(`${BASE_URL}/api/v1/banker/kyc/${newRequest.id}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bankerToken}`
            },
            body: JSON.stringify({ reason: 'Address not valid' })
        });
        const rejectData = await rejectRes.json();
        if (!rejectData.success) throw new Error('Rejection failed');
        console.log('✅ Request Rejected');

        console.log('\n🎉 TEST SUITE COMPLETED SUCCESSFULLY');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
        process.exit(1);
    }
}

run();
