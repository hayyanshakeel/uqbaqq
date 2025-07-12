'use server';

import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { differenceInMonths, parse, startOfMonth, addMonths, lastDayOfMonth, isValid, format, isAfter } from 'date-fns';
import { getBillingSettings } from '@/app/(admin)/admin/settings/actions';
import { createPaymentLink } from '@/app/(user)/dashboard/actions';
import * as admin from 'firebase-admin';
import { Bill } from '@/lib/data-service';

const feeStructure = [
    { start: '2001-05-01', end: '2007-04-30', fee: 30 },
    { start: '2007-05-01', end: '2014-04-30', fee: 50 },
    { start: '2014-05-01', end: '2019-06-30', fee: 100 },
    { start: '2019-07-01', end: '2024-03-31', fee: 200 },
    { start: '2024-04-01', end: '9999-12-31', fee: 250 }
];

function calculateDuesForPeriod(startDateStr: string, endDateStr: string): { totalDues: number; monthlyBreakdown: { month: Date, fee: number }[] } {
    const startDate = startOfMonth(parse(startDateStr, 'yyyy-MM-dd', new Date()));
    const endDate = startOfMonth(parse(endDateStr, 'yyyy-MM-dd', new Date()));
    let totalDues = 0;
    const monthlyBreakdown: { month: Date, fee: number }[] = [];
    if (!isValid(startDate) || !isValid(endDate) || startDate > endDate) return { totalDues: 0, monthlyBreakdown: [] };
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
            const [userDoc, billDoc] = await Promise.all([transaction.get(userRef), transaction.get(billRef)]);
            if (!userDoc.exists) throw new Error('User not found');
            if (!billDoc.exists) throw new Error('Bill not found');
            const userData = userDoc.data()!;
            const newTotalPaid = (userData.totalPaid || 0) + billAmount;
            const newPending = (userData.pending || 0) - billAmount;
            transaction.update(userRef, {
                totalPaid: newTotalPaid,
                pending: newPending < 0 ? 0 : newPending,
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

export async function recalculateBalanceUntilDateAction(userId: string, formData: FormData) {
    const untilMonthStr = formData.get('untilMonth') as string;
    if (!userId || !untilMonthStr) return { success: false, message: 'Required fields are missing.' };
    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);
    const untilDate = lastDayOfMonth(new Date(`${untilMonthStr}-01T12:00:00Z`));
    const today = new Date();

    try {
        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found!');
            
            const userData = userDoc.data()!;
            const joiningDate = new Date(userData.joined).toISOString().split('T')[0];
            const billsQuery = adminDb.collection('bills').where('userId', '==', userId);
            const paymentsQuery = adminDb.collection('payments').where('userId', '==', userId);
            const [billsSnapshot, paymentsSnapshot] = await Promise.all([transaction.get(billsQuery), transaction.get(paymentsQuery)]);
            
            billsSnapshot.forEach(doc => transaction.delete(doc.ref));
            paymentsSnapshot.forEach(doc => transaction.delete(doc.ref));

            const { totalDues: paidAmount } = calculateDuesForPeriod(joiningDate, format(untilDate, 'yyyy-MM-dd'));
            if (paidAmount > 0) {
                transaction.set(adminDb.collection('payments').doc(), {
                    userId, amount: paidAmount, date: untilDate,
                    notes: `Bulk historic payment up to ${format(untilDate, 'MMM yyyy')}.`,
                    type: 'manual_recalculation', createdAt: new Date()
                });
            }

            let newPending = 0;
            const pendingPeriodStart = startOfMonth(addMonths(untilDate, 1));
            if (isAfter(today, pendingPeriodStart)) {
                const { monthlyBreakdown: pendingBills } = calculateDuesForPeriod(format(pendingPeriodStart, 'yyyy-MM-dd'), format(today, 'yyyy-MM-dd'));
                newPending = pendingBills.reduce((acc, bill) => acc + bill.fee, 0);
                pendingBills.forEach(bill => {
                    transaction.set(adminDb.collection('bills').doc(), {
                        userId, amount: bill.fee, dueDate: bill.month,
                        notes: `Bill for ${format(bill.month, 'MMMM yyyy')}`,
                        status: 'pending', createdAt: new Date()
                    });
                });
            }

            transaction.update(userRef, { totalPaid: paidAmount, pending: newPending, status: newPending <= 0 ? 'paid' : 'pending' });
        });
        revalidatePath('/admin/users');
        revalidatePath('/dashboard');
        return { success: true, message: `Balance recalculated successfully.` };
    } catch (error: any) {
        return { success: false, message: error.message || 'Failed to recalculate.' };
    }
}

export async function reverseLastPaymentAction(userId: string) {
    const adminDb = getAdminDb();
    if (!userId) return { success: false, message: 'User ID is required.' };

    try {
        const paymentsQuery = adminDb.collection('payments').where('userId', '==', userId).orderBy('createdAt', 'desc').limit(1);
        const paymentSnapshot = await paymentsQuery.get();
        if (paymentSnapshot.empty) return { success: false, message: 'No payments to reverse.' };
        
        const lastPaymentDoc = paymentSnapshot.docs[0];
        const amountToReverse = lastPaymentDoc.data().amount;
        const userRef = adminDb.collection('users').doc(userId);

        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found!');
            
            transaction.update(userRef, {
                totalPaid: admin.firestore.FieldValue.increment(-amountToReverse),
                pending: admin.firestore.FieldValue.increment(amountToReverse),
                status: 'pending'
            });
            transaction.delete(lastPaymentDoc.ref);
        });

        revalidatePath('/admin/users');
        revalidatePath('/dashboard');
        return { success: true, message: `Successfully reversed last payment of ₹${amountToReverse}.` };
    } catch (error: any) {
        return { success: false, message: 'Failed to reverse payment.' };
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
