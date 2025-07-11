import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
    console.log("Razorpay webhook received.");

    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    if (!signature) {
        console.error("Webhook signature missing.");
        return NextResponse.json({ error: 'Signature missing' }, { status: 400 });
    }
    if (!webhookSecret) {
        console.error("Razorpay webhook secret is not set.");
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    try {
        const shasum = crypto.createHmac('sha256', webhookSecret);
        shasum.update(body);
        const digest = shasum.digest('hex');

        if (digest !== signature) {
            console.error("Webhook signature mismatch.");
            return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
        }
        
        console.log("Webhook signature verified.");
        const payload = JSON.parse(body);

        console.log(`Received event: ${payload.event}`);

        if (payload.event === 'payment_link.paid') {
            const adminDb = getAdminDb();
            console.log("Processing payment_link.paid event.");
            const paymentEntity = payload.payload.payment.entity;
            const paymentLinkEntity = payload.payload.payment_link.entity;
            
            const userId = paymentLinkEntity.notes?.userId;
            const billId = paymentLinkEntity.notes?.billId;
            const amountPaid = paymentEntity.amount / 100;
            const paymentId = paymentEntity.id;

            if (!userId) {
                console.error('User ID not found in webhook payload notes.');
                return NextResponse.json({ error: 'User ID missing' }, { status: 400 });
            }

            console.log(`Processing payment for user: ${userId}, amount: ${amountPaid}, billId: ${billId || 'N/A'}`);

            const userRef = adminDb.collection('users').doc(userId);
            
            await adminDb.runTransaction(async (transaction) => {
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) {
                    throw new Error(`User ${userId} not found in Firestore.`);
                }
                const userData = userDoc.data()!;
                
                const newTotalPaid = (userData.totalPaid || 0) + amountPaid;
                const newPending = (userData.pending || 0) - amountPaid;

                transaction.update(userRef, {
                    totalPaid: newTotalPaid,
                    pending: newPending < 0 ? 0 : newPending,
                    status: newPending <= 0 ? 'paid' : 'pending'
                });
                
                if (billId) {
                    const billRef = adminDb.collection('bills').doc(billId);
                    transaction.update(billRef, { status: 'paid' });
                }

                const paymentRef = adminDb.collection('payments').doc(paymentId);
                transaction.set(paymentRef, {
                    userId,
                    amount: amountPaid,
                    date: new Date(paymentEntity.created_at * 1000),
                    notes: `Paid via Razorpay. Ref: ${paymentLinkEntity.notes?.type || 'payment'}.`,
                    type: 'razorpay',
                    createdAt: new Date(),
                    razorpay_payment_id: paymentId,
                    razorpay_order_id: paymentEntity.order_id,
                    razorpay_signature: paymentEntity.signature || null,
                });
            });

            revalidatePath('/dashboard');
            revalidatePath(`/admin/users`);
            revalidatePath(`/admin/dashboard`);

            console.log(`Successfully recorded payment and revalidated paths for user: ${userId}`);
        }

        return NextResponse.json({ status: 'ok' });

    } catch (error: any) {
        console.error('Error processing Razorpay webhook:', error);
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
}
