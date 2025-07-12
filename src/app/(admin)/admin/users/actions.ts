'use server';

import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { differenceInMonths, parse, startOfMonth, addMonths, lastDayOfMonth, isValid, format, isAfter } from 'date-fns';
import { getBillingSettings } from '@/app/(admin)/admin/settings/actions';
import { createPaymentLink } from '@/app/(user)/dashboard/actions';
import * as admin from 'firebase-admin';
import { Bill } from '@/lib/data-service';

// --- Fee Structure Definition ---
const feeStructure = [
    { start: '2001-05-01', end: '2007-04-30', fee: 30 },
    { start: '2007-05-01', end: '2014-04-30', fee: 50 },
    { start: '2014-05-01', end: '2019-06-30', fee: 100 },
    { start: '2019-07-01', end: '2024-03-31', fee: 200 },
    { start: '2024-04-01', end: '9999-12-31', fee: 250 }
];

// --- Helper function to calculate dues for a given period ---
function calculateDuesForPeriod(startDateStr: string, endDateStr: string): { totalDues: number; monthlyBreakdown: { month: Date, fee: number }[] } {
    const startDate = startOfMonth(parse(startDateStr, 'yyyy-MM-dd', new Date()));
    const endDate = startOfMonth(parse(endDateStr, 'yyyy-MM-dd', new Date()));
    let totalDues = 0;
    const monthlyBreakdown: { month: Date, fee: number }[] = [];


    if (!isValid(startDate) || !isValid(endDate)) {
        throw new Error(`Invalid date format encountered. Start: "${startDateStr}", End: "${endDateStr}"`);
    }

    if (startDate > endDate) return { totalDues: 0, monthlyBreakdown: [] };
    
    const totalMonths = differenceInMonths(endDate, startDate) + 1;

    for (let i = 0; i < totalMonths; i++) {
        const monthDate = addMonths(startDate, i);
        
        const applicableTier = feeStructure.find(tier => {
            const tierStart = parse(tier.start, 'yyyy-MM-dd', new Date());
            const tierEnd = parse(tier.end, 'yyyy-MM-dd', new Date());
            return monthDate >= tierStart && monthDate <= tierEnd;
        });

        if (applicableTier) {
            totalDues += applicableTier.fee;
            monthlyBreakdown.push({ month: monthDate, fee: applicableTier.fee });
        }
    }
    return { totalDues, monthlyBreakdown };
}

// ACTION: Fetch pending bills for the admin modal
export async function getPendingBillsForUserAction(userId: string): Promise<Bill[]> {
    if (!userId) return [];
    const adminDb = getAdminDb();
    const billsSnapshot = await adminDb.collection('bills')
        .where('userId', '==', userId)
        .where('status', '==', 'pending')
        .orderBy('dueDate', 'asc')
        .get();

    if (billsSnapshot.empty) {
        return [];
    }

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

// ACTION: Mark a specific bill as paid
export async function markBillAsPaidAction(userId: string, billId: string, billAmount: number) {
    if (!userId || !billId || !billAmount) {
        return { success: false, message: 'User ID, Bill ID, and amount are required.' };
    }

    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);
    const billRef = adminDb.collection('bills').doc(billId);

    try {
        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found');
            
            const billDoc = await transaction.get(billRef);
            if (!billDoc.exists) throw new Error('Bill not found');

            const userData = userDoc.data()!;
            const newTotalPaid = (userData.totalPaid || 0) + billAmount;
            const newPending = (userData.pending || 0) - billAmount;

            // Update user's main balance
            transaction.update(userRef, {
                totalPaid: newTotalPaid,
                pending: newPending < 0 ? 0 : newPending,
                status: newPending <= 0 ? 'paid' : 'pending'
            });

            // Mark the specific bill as paid
            transaction.update(billRef, { status: 'paid' });

            // Create a corresponding payment record
            const paymentRef = adminDb.collection('payments').doc();
            transaction.set(paymentRef, {
                userId,
                amount: billAmount,
                date: new Date(),
                notes: `Manual payment for bill: ${billDoc.data()?.notes || billId}`,
                type: 'manual_bill_payment',
                createdAt: new Date()
            });
        });

        revalidatePath('/admin/users');
        revalidatePath('/admin/dashboard');
        revalidatePath(`/dashboard`); // Revalidate user's dashboard
        return { success: true, message: 'Bill marked as paid successfully!' };
    } catch (error: any) {
        console.error("Error marking bill as paid:", error);
        return { success: false, message: error.message || 'Failed to mark bill as paid.' };
    }
}


export async function updateUserAction(userId: string, formData: FormData) {
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();

    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    
    if (!name || !email || !phone) {
        return { success: false, message: 'Name, email, and phone are required.' };
    }

    try {
        await adminAuth.updateUser(userId, { displayName: name, email });
        await adminDb.collection('users').doc(userId).update({ name, email, phone });
        revalidatePath('/admin/users');
        return { success: true, message: 'User details updated successfully.' };
    } catch (error: any) {
        return { success: false, message: 'Failed to update user.' };
    }
}

export async function addUserAction(formData: FormData) {
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();
    const name = formData.get('name') as string;
    const phone = formData.get('phone') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const joiningDateStr = formData.get('joining_date') as string;

    if (!name || !phone || !email || !password || !joiningDateStr) {
        return { success: false, message: 'All fields are required.' };
    }

    try {
        const userRecord = await adminAuth.createUser({ email, password, displayName: name });
        
        const todayStr = new Date().toISOString().split('T')[0];
        const { totalDues, monthlyBreakdown } = calculateDuesForPeriod(joiningDateStr, todayStr);

        const batch = adminDb.batch();

        const userRef = adminDb.collection('users').doc(userRecord.uid);
        batch.set(userRef, {
            name,
            phone,
            email,
            status: totalDues > 0 ? 'pending' : 'paid',
            joined: new Date(joiningDateStr).toISOString(),
            totalPaid: 0,
            pending: totalDues,
        });
        
        monthlyBreakdown.forEach(bill => {
            const billRef = adminDb.collection('bills').doc();
            batch.set(billRef, {
                userId: userRecord.uid,
                amount: bill.fee,
                dueDate: bill.month,
                notes: `Automatic bill for ${format(bill.month, 'MMMM yyyy')}`,
                status: 'pending',
                createdAt: new Date()
            });
        });

        await batch.commit();
        
        revalidatePath('/admin/users');
        return { success: true, message: `${name} has been successfully added with ${monthlyBreakdown.length} pending bills.` };
    } catch (error: any) {
        let message = 'Failed to add user.';
        if (error.code === 'auth/email-already-exists') {
            message = 'This email address is already in use by another account.';
        }
        return { success: false, message };
    }
}
