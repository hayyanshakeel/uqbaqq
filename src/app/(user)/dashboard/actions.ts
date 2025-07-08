'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { format } from 'date-fns';
import Razorpay from 'razorpay';
import { getPendingBillsForUser, Bill } from '@/lib/data-service';


export interface UserDashboardData {
    name: string;
    totalPaid: number;
    pending: number;
}

export interface PaymentHistoryItem {
    id: string;
    amount: number;
    date: string;
    notes: string;
    razorpay_payment_id?: string;
}


export async function getUserDashboardData(userId: string): Promise<{user: UserDashboardData, paymentHistory: PaymentHistoryItem[], pendingBills: Bill[]} | null> {
    if (!userId) return null;
    const adminDb = getAdminDb();

    try {
        const userRef = adminDb.collection('users').doc(userId);
        const paymentsRef = adminDb.collection('payments').where('userId', '==', userId);

        const [userDoc, paymentsSnapshot, pendingBills] = await Promise.all([
            userRef.get(),
            paymentsRef.get(),
            getPendingBillsForUser(userId)
        ]);

        if (!userDoc.exists) {
            console.warn(`User document not found for UID: ${userId}`);
            return null;
        }

        const userData = userDoc.data()!;
        const user: UserDashboardData = {
            name: userData.name || 'User',
            totalPaid: userData.totalPaid || 0,
            pending: userData.pending || 0,
        };

        const unsortedPayments = paymentsSnapshot.docs.map(doc => {
            const data = doc.data();
            let paymentDate: Date;

            if (data.date && typeof data.date.toDate === 'function') {
                paymentDate = data.date.toDate();
            } else if (data.date && (typeof data.date === 'string' || typeof data.date === 'number')) {
                paymentDate = new Date(data.date);
            } else {
                paymentDate = new Date();
            }

            if (isNaN(paymentDate.getTime())) {
                paymentDate = new Date();
            }

            return {
                id: doc.id,
                amount: data.amount || 0,
                date: paymentDate,
                notes: data.notes || '',
                razorpay_payment_id: data.razorpay_payment_id || null, 
            };
        });

        const sortedPayments = unsortedPayments.sort((a, b) => b.date.getTime() - a.date.getTime());

        const paymentHistory: PaymentHistoryItem[] = sortedPayments.map(payment => {
            const dateString = format(payment.date, 'dd/MM/yyyy');
            return {
                id: payment.id,
                amount: payment.amount,
                date: dateString,
                notes: payment.notes || `Payment on ${dateString}`,
                razorpay_payment_id: payment.razorpay_payment_id,
            };
        });

        return { user, paymentHistory, pendingBills };

    } catch (error) {
        console.error("Error fetching user dashboard data for UID:", userId, error);
        throw new Error("Could not fetch user data.");
    }
}

async function createRazorpayLink(options: any) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        console.error('Razorpay API keys are not configured.');
        return { success: false, message: 'Payment processing is currently unavailable.' };
    }

    const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    try {
        const paymentLink = await instance.paymentLink.create(options);
        return { success: true, url: paymentLink.short_url };
    } catch (error) {
        console.error('Error creating Razorpay payment link:', error);
        return { success: false, message: 'Could not initiate payment. Please try again later.' };
    }
}


export async function createPaymentLink(userId: string) {
    const adminDb = getAdminDb();
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) return { success: false, message: 'User not found.' };
    
    const userData = userDoc.data()!;
    const pendingAmount = userData.pending || 0;
    if (pendingAmount <= 0) return { success: false, message: 'You have no pending amount to pay.' };

    const amountInPaisa = Math.round(pendingAmount * 100);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';

    return createRazorpayLink({
        amount: amountInPaisa,
        currency: "INR",
        accept_partial: false,
        description: "UQBA COMMITTEE - Total Dues",
        customer: { name: userData.name, email: userData.email, contact: userData.phone },
        notify: { sms: true, email: true },
        reminder_enable: true,
        notes: { userId: userId, type: 'total_due' },
        callback_url: `${appUrl}/dashboard`,
        callback_method: "get"
    });
}

export async function createPaymentLinkForBill(userId: string, billId: string) {
    const adminDb = getAdminDb();

    const [userDoc, billDoc] = await Promise.all([
        adminDb.collection('users').doc(userId).get(),
        adminDb.collection('bills').doc(billId).get()
    ]);

    if (!userDoc.exists() || !billDoc.exists()) {
        return { success: false, message: 'User or bill not found.' };
    }

    const userData = userDoc.data()!;
    const billData = billDoc.data()!;
    const billAmount = billData.amount || 0;

    if (billAmount <= 0) {
        return { success: false, message: 'This bill has no amount due.' };
    }

    const amountInPaisa = Math.round(billAmount * 100);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';

    return createRazorpayLink({
        amount: amountInPaisa,
        currency: "INR",
        accept_partial: false,
        description: billData.notes || `Payment for Bill`,
        customer: { name: userData.name, email: userData.email, contact: userData.phone },
        notify: { sms: true, email: true },
        notes: { userId: userId, billId: billId, type: 'single_bill' },
        callback_url: `${appUrl}/dashboard`,
        callback_method: "get"
    });
}
