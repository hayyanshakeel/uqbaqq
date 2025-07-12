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
    receipt_url?: string;
}

export async function getUserDashboardData(userId: string): Promise<{user: UserDashboardData, paymentHistory: PaymentHistoryItem[], pendingBills: Bill[]} | null> {
    if (!userId) return null;
    const adminDb = getAdminDb();

    try {
        const userRef = adminDb.collection('users').doc(userId);
        const paymentsRef = adminDb.collection('payments').where('userId', '==', userId).orderBy('date', 'desc');

        const [userDoc, paymentsSnapshot, pendingBills] = await Promise.all([
            userRef.get(),
            paymentsRef.get(),
            getPendingBillsForUser(userId)
        ]);

        if (!userDoc.exists) return null;

        const userData = userDoc.data()!;
        const user: UserDashboardData = {
            name: userData.name || 'User',
            totalPaid: userData.totalPaid || 0,
            pending: userData.pending || 0,
        };
        
        const paymentHistory: PaymentHistoryItem[] = paymentsSnapshot.docs.map(doc => {
            const data = doc.data();
            const paymentDate = data.date?.toDate ? data.date.toDate() : new Date();
            return {
                id: doc.id,
                amount: data.amount || 0,
                date: format(paymentDate, 'dd/MM/yyyy'),
                notes: data.notes || '',
                razorpay_payment_id: data.razorpay_payment_id || null,
                receipt_url: data.receipt_url || null,
            };
        });

        return { user, paymentHistory, pendingBills };

    } catch (error) {
        console.error("Error fetching user dashboard data:", error);
        throw new Error("Could not fetch user data.");
    }
}

async function createRazorpayLink(options: any) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        return { success: false, message: 'Payment processing is unavailable.' };
    }
    const instance = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const paymentLink = await instance.paymentLink.create(options);
    return { success: true, url: paymentLink.short_url };
}

export async function createPaymentLink(userId: string) {
    const adminDb = getAdminDb();
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) return { success: false, message: 'User not found.' };
    
    const userData = userDoc.data()!;
    const pendingAmount = userData.pending || 0;
    if (pendingAmount <= 0) return { success: false, message: 'No pending amount.' };

    return createRazorpayLink({
        amount: Math.round(pendingAmount * 100),
        currency: "INR",
        description: "UQBA Committee - Total Dues",
        customer: { name: userData.name, email: userData.email, contact: userData.phone },
        notify: { sms: true, email: true },
        reminder_enable: true,
        notes: { userId: userId, type: 'total_due' },
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
        callback_method: "get"
    });
}
