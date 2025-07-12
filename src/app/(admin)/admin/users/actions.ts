'use server';

import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { differenceInMonths, parse, startOfMonth, addMonths, lastDayOfMonth, isValid, format, isAfter, parseISO, endOfMonth } from 'date-fns';
import * as admin from 'firebase-admin';
import type { Bill } from '@/lib/data-service';
import { createPaymentLink } from '@/app/(user)/dashboard/actions';

// --- Fee Structure & Calculation Helpers ---
const feeStructure = [
    { start: '2001-05-01', end: '2007-04-30', fee: 30 },
    { start: '2007-05-01', end: '2014-04-30', fee: 50 },
    { start: '2014-05-01', end: '2019-06-30', fee: 100 },
    { start: '2019-07-01', end: '2024-03-31', fee: 200 },
    { start: '2024-04-01', end: '9999-12-31', fee: 250 }
];

function parseDate(dateString: string): Date {
    const date = parseISO(dateString);
    if (!isValid(date)) throw new Error(`Invalid date encountered: ${dateString}`);
    return date;
}

function calculateDuesForPeriod(startDateStr: string, endDateStr: string): { totalDues: number; monthlyBreakdown: { month: Date, fee: number }[] } {
    const startDate = startOfMonth(parseDate(startDateStr));
    const endDate = startOfMonth(parseDate(endDateStr));
    let totalDues = 0;
    const monthlyBreakdown: { month: Date, fee: number }[] = [];
    if (isAfter(startDate, endDate)) return { totalDues: 0, monthlyBreakdown: [] };
    const totalMonths = differenceInMonths(endDate, startDate) + 1;
    for (let i = 0; i < totalMonths; i++) {
        const monthDate = addMonths(startDate, i);
        const applicableTier = feeStructure.find(tier => {
            const tierStart = parseDate(tier.start);
            const tierEnd = parseDate(tier.end);
            return monthDate >= tierStart && monthDate <= tierEnd;
        });
        if (applicableTier) {
            totalDues += applicableTier.fee;
            monthlyBreakdown.push({ month: monthDate, fee: applicableTier.fee });
        }
    }
    return { totalDues, monthlyBreakdown };
}

// --- Zod Schemas ---
const UserSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  email: z.string().email('Invalid email address.'),
  phone: z.string().regex(/^\d{10}$/, 'Phone number must be 10 digits.'),
  password: z.string().min(6, 'Password must be at least 6 characters long.'),
  joining_date: z.string().min(1, 'Joining date is required.'),
});

const MissedBillSchema = z.object({
    amount: z.coerce.number().positive('Amount must be positive.'),
    date: z.string().min(1, 'Date is required.'),
    notes: z.string().min(1, 'Notes are required.'),
});

// --- Server Actions ---

export async function addUserAction(formData: FormData) {
    const validatedFields = UserSchema.safeParse(Object.fromEntries(formData));
    if (!validatedFields.success) {
        const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
        return { success: false, message: firstError || 'Please fill out all fields correctly.' };
    }
    const { name, email, phone, password, joining_date } = validatedFields.data;
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();
    const formattedPhoneNumber = `+91${phone}`;
    try {
        const userRecord = await adminAuth.createUser({ email, emailVerified: true, password, displayName: name, phoneNumber: formattedPhoneNumber });
        const { totalDues, monthlyBreakdown } = calculateDuesForPeriod(joining_date, new Date().toISOString());
        const batch = adminDb.batch();
        const userRef = adminDb.collection('users').doc(userRecord.uid);
        batch.set(userRef, { name, email, phone: formattedPhoneNumber, joined: joining_date, status: totalDues > 0 ? 'pending' : 'paid', totalPaid: 0, pending: totalDues, createdAt: new Date() });
        monthlyBreakdown.forEach(bill => {
            const billRef = adminDb.collection('bills').doc();
            batch.set(billRef, { userId: userRecord.uid, amount: bill.fee, dueDate: bill.month, notes: `Monthly bill for ${format(bill.month, 'MMMM yyyy')}`, status: 'pending', createdAt: new Date() });
        });
        await batch.commit();
        revalidatePath('/admin/users');
        return { success: true, message: 'User added successfully with all pending dues calculated.' };
    } catch (error: any) {
        let message = 'Failed to add user.';
        if (error.code === 'auth/email-already-exists') message = 'A user with this email already exists.';
        else if (error.code === 'auth/invalid-phone-number') message = 'The phone number is invalid.';
        else if (error.message) message = error.message;
        return { success: false, message };
    }
}

export async function addMissedBillAction(userId: string, formData: FormData) {
    const validatedFields = MissedBillSchema.safeParse(Object.fromEntries(formData));
    if (!validatedFields.success) return { success: false, message: 'Invalid bill data.' };
    const { amount, date, notes } = validatedFields.data;
    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);
    try {
        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User not found.");
            const userData = userDoc.data()!;
            const newPending = (userData.pending || 0) + amount;
            transaction.update(userRef, { pending: newPending, status: 'pending' });
            const billRef = adminDb.collection('bills').doc();
            transaction.set(billRef, { userId, amount, dueDate: parseISO(date), notes, status: 'pending', createdAt: new Date() });
        });
        revalidatePath('/admin/users');
        revalidatePath('/dashboard');
        return { success: true, message: 'Missed bill added successfully.' };
    } catch (error: any) {
        return { success: false, message: error.message || 'Failed to add missed bill.' };
    }
}

export async function markMultipleBillsAsPaidAction(userId: string, billIds: string[]) {
    if (!userId || !billIds || billIds.length === 0) {
        return { success: false, message: 'No bills selected.' };
    }
    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);

    try {
        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found');
            const userData = userDoc.data()!;

            const billRefs = billIds.map(id => adminDb.collection('bills').doc(id));
            const billDocs = await transaction.getAll(...billRefs);

            let totalAmountPaid = 0;
            billDocs.forEach(billDoc => {
                if (billDoc.exists && billDoc.data()!.status === 'pending') {
                    totalAmountPaid += billDoc.data()!.amount;
                    transaction.update(billDoc.ref, { status: 'paid' });
                }
            });

            if (totalAmountPaid === 0) {
                throw new Error("Selected bills have already been paid or do not exist.");
            }

            const newTotalPaid = (userData.totalPaid || 0) + totalAmountPaid;
            const newPending = Math.max(0, (userData.pending || 0) - totalAmountPaid);
            
            transaction.update(userRef, {
                totalPaid: newTotalPaid,
                pending: newPending,
                status: newPending <= 0 ? 'paid' : 'pending'
            });

            const paymentRef = adminDb.collection('payments').doc();
            transaction.set(paymentRef, {
                userId,
                amount: totalAmountPaid,
                date: new Date(),
                notes: `Manual payment for ${billIds.length} bill(s).`,
                type: 'manual_bill_payment',
                createdAt: new Date()
            });
        });

        revalidatePath('/admin/users');
        revalidatePath('/dashboard');
        return { success: true, message: `Successfully paid ${billIds.length} bills.` };
    } catch (error: any) {
        return { success: false, message: error.message || 'Failed to pay bills.' };
    }
}

// Other actions remain the same...
export async function deleteUserAction(userId: string) {
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();
    if (!userId) return { success: false, message: 'User ID is required.' };
    try {
        const batch = adminDb.batch();
        const billsQuery = adminDb.collection('bills').where('userId', '==', userId);
        const paymentsQuery = adminDb.collection('payments').where('userId', '==', userId);
        const [billsSnapshot, paymentsSnapshot] = await Promise.all([billsQuery.get(), paymentsQuery.get()]);
        billsSnapshot.forEach(doc => batch.delete(doc.ref));
        paymentsSnapshot.forEach(doc => batch.delete(doc.ref));
        batch.delete(adminDb.collection('users').doc(userId));
        await batch.commit();
        await adminAuth.deleteUser(userId);
        revalidatePath('/admin/users');
        return { success: true, message: 'User deleted successfully.' };
    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            revalidatePath('/admin/users');
            return { success: true, message: 'User already deleted from Auth.'};
        }
        return { success: false, message: 'Failed to delete user.' };
    }
}

export async function getPendingBillsForUserAction(userId: string): Promise<Bill[]> {
    if (!userId) return [];
    const adminDb = getAdminDb();
    const billsSnapshot = await adminDb.collection('bills').where('userId', '==', userId).where('status', '==', 'pending').orderBy('dueDate', 'asc').get();
    if (billsSnapshot.empty) return [];
    return billsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            amount: data.amount,
            date: format(data.dueDate.toDate(), 'dd/MM/yyyy'),
            notes: data.notes,
        };
    });
}

export async function sendPaymentLinkAction(userId: string) {
    return createPaymentLink(userId);
}

export async function reverseLastPaymentAction(userId: string) {
    if (!userId) {
        return { success: false, message: 'User ID is required.' };
    }
    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);
    const paymentsRef = adminDb.collection('payments');
    try {
        const lastPaymentQuery = paymentsRef.where('userId', '==', userId).orderBy('date', 'desc').limit(1);
        const lastPaymentSnapshot = await lastPaymentQuery.get();
        if (lastPaymentSnapshot.empty) {
            return { success: false, message: 'No payments found for this user to reverse.' };
        }
        const lastPaymentDoc = lastPaymentSnapshot.docs[0];
        const lastPaymentData = lastPaymentDoc.data();
        const amountToReverse = lastPaymentData.amount;

        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found.');
            const userData = userDoc.data()!;

            const newTotalPaid = (userData.totalPaid || 0) - amountToReverse;
            const newPending = (userData.pending || 0) + amountToReverse;

            transaction.update(userRef, {
                totalPaid: newTotalPaid < 0 ? 0 : newTotalPaid,
                pending: newPending,
                status: 'pending'
            });

            transaction.delete(lastPaymentDoc.ref);
        });

        revalidatePath('/admin/users');
        revalidatePath('/admin/dashboard');
        revalidatePath('/dashboard');
        return { success: true, message: `Successfully reversed last payment of ₹${amountToReverse}.` };
    } catch (error: any) {
        console.error('Error reversing payment:', error);
        return { success: false, message: error.message || 'Failed to reverse payment.' };
    }
}

export async function updateUserAction(userId: string, formData: FormData) {
    return { success: false, message: 'Update user not implemented yet.' };
}

export async function markAsDeceasedAction(userId: string, formData: FormData) {
    return { success: false, message: 'Mark as deceased not implemented yet.' };
}
