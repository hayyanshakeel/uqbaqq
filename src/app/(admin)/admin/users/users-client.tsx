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


export async function sendPaymentLinkAction(userId: string) {
    if (!userId) {
        return { success: false, message: 'User ID is required.' };
    }

    const settings = await getBillingSettings();
    if (!settings.manualBulkPayment) {
        return { success: false, message: 'This feature is disabled in the settings.' };
    }

    try {
        const result = await createPaymentLink(userId);
        if (result.success) {
            return { success: true, message: `Payment link sent successfully.` };
        } else {
            return { success: false, message: result.message || 'Failed to send payment link.' };
        }
    } catch (error: any) {
        console.error("Error sending payment link:", error);
        return { success: false, message: error.message };
    }
}
export async function markAsDeceasedAction(userId: string, formData: FormData) {
    const dateOfDeathStr = formData.get('dateOfDeath') as string;

    if (!userId || !dateOfDeathStr) {
        return { success: false, message: 'User ID and Date of Death are required.' };
    }

    try {
        const adminDb = getAdminDb();
        const adminAuth = getAdminAuth();
        const userRef = adminDb.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            throw new Error("User not found.");
        }
        
        const userData = userDoc.data()!;
        const joiningDate = new Date(userData.joined).toISOString().split('T')[0];
        
        const { totalDues } = calculateDuesForPeriod(joiningDate, dateOfDeathStr);
        const finalPending = totalDues - (userData.totalPaid || 0);

        await userRef.update({
            status: 'deceased',
            pending: finalPending < 0 ? 0 : finalPending, 
            dateOfDeath: new Date(dateOfDeathStr)
        });

        await adminAuth.updateUser(userId, { disabled: true });

        revalidatePath('/admin/users');
        revalidatePath('/admin/dashboard');

        return { success: true, message: 'User has been marked as deceased. Their account is now inactive and balance finalized.' };
    } catch (error: any) {
        console.error("Error marking user as deceased:", error);
        return { success: false, message: error.message };
    }
}

export async function recalculateBalanceUntilDateAction(userId: string, formData: FormData) {
    const untilMonthStr = formData.get('untilMonth') as string; // Expects "YYYY-MM" format

    if (!userId || !untilMonthStr) {
        return { success: false, message: 'User ID and "Paid Until" month are required.' };
    }
    try {
        const adminDb = getAdminDb();
        const userRef = adminDb.collection('users').doc(userId);

        const untilDate = lastDayOfMonth(new Date(`${untilMonthStr}-01T12:00:00Z`));
        const today = new Date();

        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found!');
            const userData = userDoc.data()!;
            const joiningDate = new Date(userData.joined).toISOString().split('T')[0];

            // 1. Clear existing bills and payments for this user
            const billsQuery = adminDb.collection('bills').where('userId', '==', userId);
            const paymentsQuery = adminDb.collection('payments').where('userId', '==', userId);
            const [billsSnapshot, paymentsSnapshot] = await Promise.all([transaction.get(billsQuery), transaction.get(paymentsQuery)]);
            
            billsSnapshot.forEach(doc => transaction.delete(doc.ref));
            paymentsSnapshot.forEach(doc => transaction.delete(doc.ref));

            // 2. Calculate paid amount and create a single consolidated payment
            const { totalDues: paidAmount } = calculateDuesForPeriod(joiningDate, format(untilDate, 'yyyy-MM-dd'));
            if (paidAmount > 0) {
                const paymentRef = adminDb.collection('payments').doc();
                transaction.set(paymentRef, {
                    userId,
                    amount: paidAmount,
                    date: untilDate,
                    notes: `Bulk historic payment record until ${format(untilDate, 'MMM yyyy')}.`,
                    type: 'manual_recalculation',
                    createdAt: new Date()
                });
            }

            // 3. Calculate new pending balance and generate new pending bills
            let newPending = 0;
            const pendingPeriodStart = startOfMonth(addMonths(untilDate, 1));

            if (isAfter(today, pendingPeriodStart)) {
                const { totalDues: pendingAmount, monthlyBreakdown: pendingBills } = calculateDuesForPeriod(
                    format(pendingPeriodStart, 'yyyy-MM-dd'),
                    format(today, 'yyyy-MM-dd')
                );
                newPending = pendingAmount;

                // Create new bill documents for the pending period
                pendingBills.forEach(bill => {
                    const billRef = adminDb.collection('bills').doc();
                    transaction.set(billRef, {
                        userId,
                        amount: bill.fee,
                        dueDate: bill.month,
                        notes: `Bill for ${format(bill.month, 'MMMM yyyy')}`,
                        status: 'pending',
                        createdAt: new Date()
                    });
                });
            }

            // 4. Update user document
            transaction.update(userRef, {
                totalPaid: paidAmount,
                pending: newPending,
                status: newPending <= 0 ? 'paid' : 'pending'
            });
        });

        revalidatePath('/admin/users');
        revalidatePath('/admin/dashboard');
        revalidatePath('/dashboard');

        return { success: true, message: `Balance recalculated successfully. User is now marked as paid until ${untilMonthStr}.` };

    } catch (error: any) {
        console.error("Error in recalculate balance action:", error);
        return { success: false, message: error.message || 'An unexpected error occurred.' };
    }
}


export async function updateUserAction(userId: string, formData: FormData) {
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();

    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const password = formData.get('password') as string;

    if (!name || !email || !phone) {
        return { success: false, message: 'Name, email, and phone are required.' };
    }

    try {
        const firestoreUpdatePayload = { name, email, phone };
        
        const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;

        const authUpdatePayload: { displayName: string; email: string; phoneNumber: string; password?: string } = { 
            displayName: name, 
            email, 
            phoneNumber: formattedPhone
        };
        
        if (password) {
            if (password.length < 6) {
                return { success: false, message: 'New password must be at least 6 characters long.' };
            }
            authUpdatePayload.password = password;
        }

        await adminAuth.updateUser(userId, authUpdatePayload);
        await adminDb.collection('users').doc(userId).update(firestoreUpdatePayload);

        revalidatePath('/admin/users');
        return { success: true, message: 'User details updated successfully.' };
    } catch (error: any) {
        console.error("Error updating user:", error);
        return { success: false, message: error.message || 'Failed to update user details.' };
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

    if (password.length < 6) {
        return { success: false, message: 'Password must be at least 6 characters long.' };
    }

    try {
        const userRecord = await adminAuth.createUser({
            email,
            password,
            displayName: name,
        });
        
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
        
        // Create individual bill documents for each pending month
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
        console.error('Error adding user:', error);
        let message = 'Failed to add user.';
        if (error.code === 'auth/email-already-exists') {
            message = 'This email address is already in use by another account.';
        } else if (error.code === 'auth/invalid-password') {
            message = 'The password is not strong enough.';
        }
        return { success: false, message };
    }
}

export async function deleteUserAction(userId: string) {
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();
    if (!userId) {
        return { success: false, message: 'User ID is required.' };
    }

    try {
        // Also delete bills and payments associated with the user
        const batch = adminDb.batch();
        const billsQuery = adminDb.collection('bills').where('userId', '==', userId);
        const paymentsQuery = adminDb.collection('payments').where('userId', '==', userId);
        
        const [billsSnapshot, paymentsSnapshot] = await Promise.all([billsQuery.get(), paymentsQuery.get()]);
        
        billsSnapshot.forEach(doc => batch.delete(doc.ref));
        paymentsSnapshot.forEach(doc => batch.delete(doc.ref));
        
        const userRef = adminDb.collection('users').doc(userId);
        batch.delete(userRef);
        
        await batch.commit();
        await adminAuth.deleteUser(userId);
        
        revalidatePath('/admin/users');
        return { success: true, message: 'User deleted successfully from Auth and Firestore.' };
    } catch (error: any) {
        console.error('Error deleting user:', error);
        if (error.code === 'auth/user-not-found') {
            revalidatePath('/admin/users');
            return { success: true, message: 'User was already deleted from Auth, removed from list.'};
        }
        return { success: false, message: 'Failed to delete user.' };
    }
}

export async function addMissedBillAction(formData: FormData) {
    const adminDb = getAdminDb();
    const userId = formData.get('userId') as string;
    const amountStr = formData.get('amount') as string;
    const billingMonth = formData.get('billingMonth') as string;
    const notes = formData.get('notes') as string | null;

    const amount = parseFloat(amountStr);

    if (!userId || !amountStr || !billingMonth || isNaN(amount) || amount <= 0) {
        return { success: false, message: 'Please provide a valid user, amount, and billing month.' };
    }

    try {
        const userRef = adminDb.collection('users').doc(userId);

        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found!');

            const userData = userDoc.data()!;
            const newPending = (userData.pending || 0) + amount;

            transaction.update(userRef, {
                pending: newPending,
                status: 'pending'
            });

            const billRef = adminDb.collection('bills').doc();
            transaction.set(billRef, {
                userId,
                amount,
                dueDate: new Date(billingMonth + '-01'),
                notes: notes || `Manually added bill for ${billingMonth}`,
                status: 'pending',
                createdAt: new Date()
            });
        });

        revalidatePath('/admin/users');
        revalidatePath('/admin/dashboard');
        revalidatePath(`/dashboard`);
        return { success: true, message: `Missed bill of ₹${amount.toFixed(2)} added.` };
    } catch (error: any) {
        console.error('Error adding missed bill:', error);
        const message = error instanceof Error ? error.message : 'Failed to add missed bill.';
        return { success: false, message };
    }
}

export async function reverseLastPaymentAction(userId: string) {
    const adminDb = getAdminDb();
    if (!userId) return { success: false, message: 'User ID is required.' };

    try {
        const paymentQuery = adminDb.collection('payments').where('userId', '==', userId);
        const paymentSnapshot = await paymentQuery.get();

        if (paymentSnapshot.empty) {
            return { success: false, message: 'No recorded payments found for this user to reverse.' };
        }
        
        const lastPaymentDoc = paymentSnapshot.docs.sort((a, b) => b.data().createdAt.toMillis() - a.data().createdAt.toMillis())[0];
        
        const lastPaymentData = lastPaymentDoc.data();
        const amount = lastPaymentData.amount;
        
        const userRef = adminDb.collection('users').doc(userId);

        await adminDb.runTransaction(async (transaction) => {
            // --- ALL READS FIRST ---
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found!');

            const paidBillsQuery = adminDb.collection('bills').where('userId', '==', userId).where('status', '==', 'paid');
            const paidBillsSnapshot = await transaction.get(paidBillsQuery);
            
            // --- ALL WRITES AFTER ---
            const userData = userDoc.data()!;
            const newTotalPaid = (userData.totalPaid || 0) - amount;
            const newPending = (userData.pending || 0) + amount;

            transaction.update(userRef, {
                totalPaid: newTotalPaid < 0 ? 0 : newTotalPaid,
                pending: newPending,
                status: 'pending'
            });

            let amountToUncover = amount;
            const sortedPaidBills = paidBillsSnapshot.docs.sort((a, b) => b.data().dueDate.toMillis() - a.data().dueDate.toMillis());

            for (const doc of sortedPaidBills) {
                if (amountToUncover > 0) {
                    transaction.update(doc.ref, { status: 'pending' });
                    amountToUncover -= doc.data().amount;
                } else {
                    break;
                }
            }

            transaction.delete(lastPaymentDoc.ref);
        });

        revalidatePath('/admin/users');
        revalidatePath('/admin/dashboard');
        revalidatePath(`/dashboard`);
        return { success: true, message: `Successfully reversed the last payment of ₹${amount.toFixed(2)}.` };

    } catch (error: any) {
        console.error('Error reversing payment:', error);
        const message = error instanceof Error ? error.message : 'Failed to reverse payment.';
        return { success: false, message };
    }
}

export async function reverseLastBillAction(userId: string) {
    const adminDb = getAdminDb();
    if (!userId) return { success: false, message: 'User ID is required.' };

    try {
        const billQuery = adminDb.collection('bills').where('userId', '==', userId);
        const billSnapshot = await billQuery.get();

        if (billSnapshot.empty) {
            return { success: false, message: 'No recorded bills found for this user to reverse.' };
        }

        const lastBillDoc = billSnapshot.docs.sort((a, b) => b.data().createdAt.toMillis() - a.data().createdAt.toMillis())[0];
        const lastBillData = lastBillDoc.data();
        const amount = lastBillData.amount;

        const userRef = adminDb.collection('users').doc(userId);

        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found!');
            
            const userData = userDoc.data()!;
            const newPending = (userData.pending || 0) - amount;

            transaction.update(userRef, {
                pending: newPending < 0 ? 0 : newPending,
                status: newPending <= 0 ? 'paid' : 'pending'
            });

            transaction.delete(lastBillDoc.ref);
        });
        
        revalidatePath('/admin/users');
        revalidatePath('/admin/dashboard');
        revalidatePath(`/dashboard`);
        return { success: true, message: `Successfully reversed the last bill of ₹${amount.toFixed(2)}.` };

    } catch (error: any) {
        console.error('Error reversing bill:', error);
        const message = error instanceof Error ? error.message : 'Failed to reverse bill.';
        return { success: false, message };
    }
}

export async function getPendingMonthsForUser(userId: string): Promise<string> {
    if (!userId) return 'N/A';
    const adminDb = getAdminDb();
    try {
        const billsSnapshot = await adminDb.collection('bills')
            .where('userId', '==', userId)
            .where('status', '==', 'pending')
            .orderBy('dueDate', 'asc')
            .get();

        if (billsSnapshot.empty) {
            return 'None';
        }

        const months = billsSnapshot.docs.map(doc => {
            const data = doc.data();
            const dueDate = data.dueDate.toDate(); 
            return format(dueDate, 'MMM-yy'); 
        });

        return months.join(', ');

    } catch (error: any) {
        console.error(`Error fetching pending months for user ${userId}:`, error);
        return 'Error fetching';
    }
}
export async function splitMissedBillAction(formData: FormData) {
    const adminDb = getAdminDb();
    const userId = formData.get('userId') as string;
    const totalAmount = parseFloat(formData.get('totalAmount') as string);
    const startMonthStr = formData.get('startMonth') as string; 
    const endMonthStr = formData.get('endMonth') as string; 

    if (!userId || isNaN(totalAmount) || totalAmount <= 0 || !startMonthStr || !endMonthStr) {
        return { success: false, message: 'Invalid data provided. Please fill all fields correctly.' };
    }

    try {
        const startDate = startOfMonth(new Date(`${startMonthStr}-01T12:00:00Z`));
        const endDate = startOfMonth(new Date(`${endMonthStr}-01T12:00:00Z`));
        
        if (startDate > endDate) {
            return { success: false, message: 'Start month must be before or same as end month.' };
        }

        const numberOfMonths = differenceInMonths(endDate, startDate) + 1;
        if (numberOfMonths <= 0) {
            return { success: false, message: 'Invalid month range.' };
        }

        const totalAmountInCents = Math.round(totalAmount * 100);
        const amountPerMonthInCents = Math.floor(totalAmountInCents / numberOfMonths);
        let remainderInCents = totalAmountInCents % numberOfMonths;
        
        const batch = adminDb.batch();

        for (let i = 0; i < numberOfMonths; i++) {
            const billingDate = addMonths(startDate, i);
            const billRef = adminDb.collection('bills').doc();

            let currentMonthAmountInCents = amountPerMonthInCents;
            if (remainderInCents > 0) {
                currentMonthAmountInCents++;
                remainderInCents--;
            }
            
            batch.set(billRef, {
                userId,
                amount: currentMonthAmountInCents / 100,
                dueDate: billingDate,
                notes: `Bill for ${format(billingDate, 'MMMM yyyy')}`,
                status: 'pending',
                createdAt: new Date()
            });
        }

        const userRef = adminDb.collection('users').doc(userId);
        batch.update(userRef, {
            pending: admin.firestore.FieldValue.increment(totalAmount),
            status: 'pending'
        });

        await batch.commit();

        revalidatePath('/admin/users');
        revalidatePath('/admin/dashboard');
        revalidatePath('/dashboard');

        return { success: true, message: `Successfully split ₹${totalAmount} into ${numberOfMonths} bills.` };
    } catch (error: any) {
        console.error('Error splitting bill:', error);
        return { success: false, message: error.message || 'An unexpected error occurred while splitting the bill.' };
    }
}
