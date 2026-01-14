
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    // Dynamic import to ensure env vars are loaded before db module
    const { KycService } = await import('../src/lib/services/kyc-service');

    console.log('Testing KycService.getPendingRequests()...');
    try {
        const reqs = await KycService.getPendingRequests();
        console.log('✅ Success! Found', reqs.length, 'requests');
        console.log(reqs);
    } catch (e: any) {
        console.error('❌ Failed:', e.message);
        console.error(e);
    }
    process.exit(0);
}

main();
