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
    // Handles both 'yyyy-MM-dd' and 'yyyy-MM' formats
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

// --- Zod Schemas for Validation ---

const UserSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  email: z.string().email('Invalid email address.'),
  phone: z.string().regex(/^\d{10}$/, 'Phone number must be 10 digits.'),
  password: z.string().min(6, 'Password must be at least 6 characters long.'),
  joining_date: z.string().min(1, 'Joining date is required.'),
});

const RecalculateSchema = z.object({
    untilMonth: z.string().min(1, 'A date is required.')
});


// --- Server Actions ---

export async function addUserAction(formData: FormData) {
    const rawData = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        password: formData.get('password'),
        joining_date: formData.get('joining_date'),
    };

    const validatedFields = UserSchema.safeParse(rawData);

    if (!validatedFields.success) {
        const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
        return { success: false, message: firstError || 'Please fill out all fields correctly.' };
    }

    const { name, email, phone, password, joining_date } = validatedFields.data;
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();
    const formattedPhoneNumber = `+91${phone}`;

    try {
        const userRecord = await adminAuth.createUser({
            email: email,
            emailVerified: true,
            password: password,
            displayName: name,
            phoneNumber: formattedPhoneNumber,
        });

        const { totalDues, monthlyBreakdown } = calculateDuesForPeriod(joining_date, new Date().toISOString());
        
        const batch = adminDb.batch();

        const userRef = adminDb.collection('users').doc(userRecord.uid);
        batch.set(userRef, {
            name,
            email,
            phone: formattedPhoneNumber,
            joined: joining_date,
            status: totalDues > 0 ? 'pending' : 'paid',
            totalPaid: 0,
            pending: totalDues,
            createdAt: new Date(),
        });

        monthlyBreakdown.forEach(bill => {
            const billRef = adminDb.collection('bills').doc();
            batch.set(billRef, {
                userId: userRecord.uid,
                amount: bill.fee,
                dueDate: bill.month,
                notes: `Monthly bill for ${format(bill.month, 'MMMM yyyy')}`,
                status: 'pending',
                createdAt: new Date()
            });
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

export async function recalculateBalanceUntilDateAction(userId: string, formData: FormData) {
    const validatedFields = RecalculateSchema.safeParse({ untilMonth: formData.get('untilMonth') });

    if (!validatedFields.success) {
        return { success: false, message: 'Invalid date provided.' };
    }
    
    const { untilMonth } = validatedFields.data;
    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);

    try {
        const userDoc = await userRef.get();
        if (!userDoc.exists) throw new Error('User not found.');
        
        const joiningDate = userDoc.data()!.joined;
        const paidUntilDate = endOfMonth(parseDate(untilMonth)).toISOString();

        // Calculate dues from joining to the specified 'paid until' date
        const { totalDues: totalAmountPaid } = calculateDuesForPeriod(joiningDate, paidUntilDate);

        // Calculate pending dues from the 'paid until' date to today
        const nextMonthAfterPaid = addMonths(parseDate(paidUntilDate), 1).toISOString();
        const { totalDues: newPendingAmount } = calculateDuesForPeriod(nextMonthAfterPaid, new Date().toISOString());

        await userRef.update({
            totalPaid: totalAmountPaid,
            pending: newPendingAmount,
            status: newPendingAmount > 0 ? 'pending' : 'paid'
        });

        revalidatePath('/admin/users');
        return { success: true, message: `Balance recalculated successfully. User is marked as paid until ${format(parseDate(untilMonth), 'MMMM yyyy')}.` };

    } catch (error: any) {
        console.error("Recalculation error:", error);
        return { success: false, message: error.message || 'Failed to recalculate balance.' };
    }
}


// --- Other Actions (Stubs for completeness, implement as needed) ---

export async function updateUserAction(userId: string, formData: FormData) {
    // ... implementation for updating user details
    return { success: true, message: 'User updated successfully (Not Implemented).' };
}

export async function markAsDeceasedAction(userId: string, formData: FormData) {
    // ... implementation for marking user as deceased
    return { success: true, message: 'User marked as deceased (Not Implemented).' };
}

export async function sendPaymentLinkAction(userId: string) {
    return createPaymentLink(userId);
}

export async function reverseLastPaymentAction(userId: string) {
    // ... implementation for reversing the last payment
    return { success: true, message: 'Last payment reversed (Not Implemented).' };
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

export async function markBillAsPaidAction(userId: string, billId: string, billAmount: number) {
    if (!userId || !billId || typeof billAmount === 'undefined') {
        return { success: false, message: 'Required fields are missing.' };
    }
    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);
    const billRef = adminDb.collection('bills').doc(billId);

    try {
        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found');
            const userData = userDoc.data()!;
            const newTotalPaid = (userData.totalPaid || 0) + billAmount;
            const newPending = Math.max(0, (userData.pending || 0) - billAmount);
            transaction.update(userRef, {
                totalPaid: newTotalPaid,
                pending: newPending,
                status: newPending <= 0 ? 'paid' : 'pending'
            });
            transaction.update(billRef, { status: 'paid' });
            const paymentRef = adminDb.collection('payments').doc();
            transaction.set(paymentRef, {
                userId, amount: billAmount, date: new Date(),
                notes: `Manual payment for bill: ${billDoc.data()?.notes || billId}`,
                type: 'manual_bill_payment', createdAt: new Date()
            });
        });
        revalidatePath('/admin/users');
        revalidatePath('/dashboard');
        return { success: true, message: 'Bill marked as paid!' };
    } catch (error: any) {
        return { success: false, message: error.message || 'Failed to mark bill as paid.' };
    }
}

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
