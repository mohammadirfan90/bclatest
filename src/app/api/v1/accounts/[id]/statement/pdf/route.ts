import { NextRequest, NextResponse } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    notFoundResponse,
    errorResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { generateStatementPdf } from '@/lib/services/statement-service';
import { getAccountById } from '@/lib/services/account-service';

import { format } from 'date-fns';

// =============================================================================
// GET /api/v1/accounts/[id]/statement/pdf - Generate PDF statement
// =============================================================================

export const GET = withErrorHandler(async (request: NextRequest, context) => {
    const params = await context?.params;
    const accountId = parseInt(params?.id || '0');

    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            // Validate account exists
            const account = await getAccountById(accountId);
            if (!account) {
                return notFoundResponse('Account not found');
            }

            // Customers can only view their own accounts
            if (req.tokenPayload?.type === 'customer') {
                if (account.customerId !== req.customer?.id) {
                    return notFoundResponse('Account not found');
                }
            }

            // Get query parameters
            const { searchParams } = new URL(request.url);
            const fromP = searchParams.get('from');
            const toP = searchParams.get('to');
            const month = searchParams.get('month');

            try {
                let fromStr: string;
                let toStr: string;

                if (fromP && toP) {
                    fromStr = fromP;
                    toStr = toP;
                } else if (month) {
                    const [year, monthNum] = month.split('-').map(Number);
                    fromStr = `${year}-${String(monthNum).padStart(2, '0')}-01`;
                    const lastDay = new Date(year, monthNum, 0).getDate();
                    toStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
                } else {
                    // Default to current month if nothing provided
                    const now = new Date();
                    fromStr = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
                    toStr = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd');
                }

                const pdfBuffer = await generateStatementPdf(accountId, fromStr, toStr);

                // Generate filename
                const filename = `statement_${account.accountNumber}_${fromStr}_to_${toStr}.pdf`;

                return new NextResponse(new Uint8Array(pdfBuffer), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': `attachment; filename="${filename}"`,
                        'Access-Control-Expose-Headers': 'Content-Disposition',
                        // Remove Content-Length to let Next.js handle it
                    },
                });
            } catch (error) {
                console.error('PDF generation error:', error);
                return errorResponse('Failed to generate PDF statement');
            }
        },
        {
            requiredType: 'any',
        }
    );
});
