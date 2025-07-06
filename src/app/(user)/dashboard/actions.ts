'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { format } from 'date-fns';
import Razorpay from 'razorpay';

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
    // Add the payment ID field to be passed to the UI
    razorpay_payment_id?: string;
}

export async function getUserDashboardData(userId: string): Promise<{user: UserDashboardData, paymentHistory: PaymentHistoryItem[]} | null> {
    if (!userId) return null;
    const adminDb = getAdminDb();

    try {
        const userRef = adminDb.collection('users').doc(userId);
        const paymentsRef = adminDb.collection('payments').where('userId', '==', userId);

        const [userDoc, paymentsSnapshot] = await Promise.all([
            userRef.get(),
            paymentsRef.get()
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
                // Get the payment ID from the document data
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
                // Pass the payment ID to the final array
                razorpay_payment_id: payment.razorpay_payment_id,
            };
        });

        return { user, paymentHistory };

    } catch (error) {
        console.error("Error fetching user dashboard data for UID:", userId, error);
        throw new Error("Could not fetch user data.");
    }
}


export async function createPaymentLink(userId: string) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        console.error('Razorpay API keys are not configured.');
        return { success: false, message: 'Payment processing is currently unavailable.' };
    }
    const adminDb = getAdminDb();
    
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        return { success: false, message: 'User not found.' };
    }
    const userData = userDoc.data()!;
    const pendingAmount = userData.pending || 0;

    if (pendingAmount <= 0) {
        return { success: false, message: 'You have no pending amount to pay.' };
    }

    const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const amountInPaisa = Math.round(pendingAmount * 100);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';

    try {
        const paymentLink = await instance.paymentLink.create({
            amount: amountInPaisa,
            currency: "INR",
            accept_partial: false,
            description: "UQBA COMMITTEE Monthly Dues",
            customer: {
                name: userData.name,
                email: userData.email,
                contact: userData.phone,
            },
            notify: {
                sms: true,
                email: true,
            },
            reminder_enable: true,
            notes: {
                userId: userId,
            },
            callback_url: `${appUrl}/dashboard`,
            callback_method: "get"
        });

        return { success: true, url: paymentLink.short_url };
    } catch (error) {
        console.error('Error creating Razorpay payment link:', error);
        return { success: false, message: 'Could not initiate payment. Please try again later.' };
    }
}
