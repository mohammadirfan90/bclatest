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
            const month = searchParams.get('month');

            // Validate required parameters
            if (!month) {
                return errorResponse('Missing required parameter: month (YYYY-MM format)');
            }

            // Validate month format
            const monthRegex = /^\d{4}-\d{2}$/;
            if (!monthRegex.test(month)) {
                return errorResponse('Invalid month format. Use YYYY-MM');
            }

            try {
                const pdfBuffer = await generateStatementPdf(accountId, month);

                // Generate filename
                const filename = `statement_${account.accountNumber}_${month}.pdf`;

                // Convert Buffer to Uint8Array for NextResponse compatibility
                const uint8Array = new Uint8Array(pdfBuffer);

                return new NextResponse(uint8Array, {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': `attachment; filename="${filename}"`,
                        'Content-Length': pdfBuffer.length.toString(),
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
