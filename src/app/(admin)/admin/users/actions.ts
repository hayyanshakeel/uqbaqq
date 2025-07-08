'use server';

import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { differenceInMonths, parse, startOfMonth, addMonths, lastDayOfMonth, isValid, format } from 'date-fns';
import { getBillingSettings } from '@/app/(admin)/admin/settings/actions';
import { createPaymentLink } from '@/app/(user)/dashboard/actions';
import * as admin from 'firebase-admin';

// --- Fee Structure Definition ---
const feeStructure = [
    { start: '2001-05-01', end: '2007-04-30', fee: 30 },
    { start: '2007-05-01', end: '2014-04-30', fee: 50 },
    { start: '2014-05-01', end: '2019-06-30', fee: 100 },
    { start: '2019-07-01', end: '2024-03-31', fee: 200 },
    { start: '2024-04-01', end: '9999-12-31', fee: 250 }
];

// --- Helper function to calculate dues for a given period ---
function calculateDuesForPeriod(startDateStr: string, endDateStr: string): number {
    const startDate = startOfMonth(parse(startDateStr, 'yyyy-MM-dd', new Date()));
    const endDate = startOfMonth(parse(endDateStr, 'yyyy-MM-dd', new Date()));
    let totalDues = 0;

    if (!isValid(startDate) || !isValid(endDate)) {
        throw new Error(`Invalid date format encountered. Start: "${startDateStr}", End: "${endDateStr}"`);
    }

    if (startDate > endDate) return 0;
    
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
        }
    }
    return totalDues;
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
        
        const finalDues = calculateDuesForPeriod(joiningDate, dateOfDeathStr);
        const finalPending = finalDues - (userData.totalPaid || 0);

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

export async function recordBulkPaymentAction(userId: string, formData: FormData) {
    const fromMonthStr = formData.get('fromMonth') as string;
    const toMonthStr = formData.get('toMonth') as string;

    if (!userId || !fromMonthStr || !toMonthStr) {
        return { success: false, message: 'User ID, From Month, and To Month are required.' };
    }

    try {
        const adminDb = getAdminDb();
        const userRef = adminDb.collection('users').doc(userId);
        
        const startDate = startOfMonth(new Date(`${fromMonthStr}-01T12:00:00Z`));
        const endDate = lastDayOfMonth(new Date(`${toMonthStr}-01T12:00:00Z`));

        // Fetch all pending bills for the user first
        const allPendingBillsQuery = adminDb.collection('bills')
            .where('userId', '==', userId)
            .where('status', '==', 'pending');

        const allPendingBillsSnapshot = await allPendingBillsQuery.get();
        
        // Filter the bills in code to avoid complex queries
        const billsToPay = allPendingBillsSnapshot.docs.filter(doc => {
            const dueDate = doc.data().dueDate.toDate();
            return dueDate >= startDate && dueDate <= endDate;
        });

        if (billsToPay.length === 0) {
            return { success: false, message: 'No pending bills found in the selected date range.' };
        }

        let totalAmountPaid = 0;
        billsToPay.forEach(doc => {
            totalAmountPaid += doc.data().amount || 0;
        });

        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found!');
            
            const userData = userDoc.data()!;
            const newTotalPaid = (userData.totalPaid || 0) + totalAmountPaid;
            const newPending = (userData.pending || 0) - totalAmountPaid;

            transaction.update(userRef, {
                totalPaid: newTotalPaid,
                pending: newPending < 0 ? 0 : newPending,
                status: newPending <= 0 ? 'paid' : 'pending'
            });

            billsToPay.forEach(doc => {
                transaction.update(doc.ref, { status: 'paid' });
            });

            const paymentRef = adminDb.collection('payments').doc();
            transaction.set(paymentRef, {
                userId,
                amount: totalAmountPaid,
                date: new Date(),
                notes: `Bulk payment for ${fromMonthStr} to ${toMonthStr}.`,
                type: 'manual_bulk_record',
                createdAt: new Date()
            });
        });

        revalidatePath('/admin/users');
        revalidatePath('/admin/dashboard');
        revalidatePath(`/dashboard`);

        return { success: true, message: `Successfully recorded payment of ₹${totalAmountPaid.toFixed(2)} for the selected period.` };

    } catch (error: any) {
        console.error("Error in bulk record action:", error);
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
    const joiningDate = formData.get('joining_date') as string;

    if (!name || !phone || !email || !password || !joiningDate) {
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
        const totalDues = calculateDuesForPeriod(joiningDate, todayStr);

        await adminDb.collection('users').doc(userRecord.uid).set({
            name,
            phone,
            email,
            status: 'pending',
            joined: new Date(joiningDate).toISOString(),
            totalPaid: 0,
            pending: totalDues,
        });
        
        revalidatePath('/admin/users');
        return { success: true, message: `${name} has been successfully added.` };
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
        await adminDb.collection('users').doc(userId).delete();
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

export async function recordPaymentAction(formData: FormData) {
    const adminDb = getAdminDb();
    const userId = formData.get('userId') as string;
    const amountStr = formData.get('amount') as string;
    const paymentDateStr = formData.get('paymentDate') as string;
    const notes = formData.get('notes') as string | null;

    const amount = parseFloat(amountStr);

    if (!userId || !amountStr || !paymentDateStr || isNaN(amount) || amount <= 0) {
        return { success: false, message: 'Please provide a valid user, amount, and date.' };
    }

    try {
        const userRef = adminDb.collection('users').doc(userId);
        const pendingBillsQuery = adminDb.collection('bills').where('userId', '==', userId).where('status', '==', 'pending');
        
        const pendingBillsSnapshot = await pendingBillsQuery.get();

        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found!');
            
            const userData = userDoc.data()!;
            const newTotalPaid = (userData.totalPaid || 0) + amount;
            const newPending = (userData.pending || 0) - amount;

            transaction.update(userRef, {
                totalPaid: newTotalPaid,
                pending: newPending < 0 ? 0 : newPending,
                status: newPending <= 0 ? 'paid' : 'pending'
            });

            if (newPending <= 0) {
                pendingBillsSnapshot.docs.forEach(doc => {
                    transaction.update(doc.ref, { status: 'paid' });
                });
            }

            const paymentRef = adminDb.collection('payments').doc();
            transaction.set(paymentRef, {
                userId,
                amount,
                date: new Date(paymentDateStr),
                notes: notes || `Payment recorded on ${new Date(paymentDateStr).toLocaleDateString()}`,
                type: 'manual_record',
                createdAt: new Date()
            });
        });

        revalidatePath('/admin/users');
        revalidatePath('/admin/dashboard');
        revalidatePath(`/dashboard`);
        return { success: true, message: `Payment of ₹${amount.toFixed(2)} recorded.` };
    } catch (error: any) {
        console.error('Error recording payment:', error);
        const message = error instanceof Error ? error.message : 'Failed to record payment.';
        return { success: false, message };
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
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found!');
            
            const userData = userDoc.data()!;
            const newTotalPaid = (userData.totalPaid || 0) - amount;
            const newPending = (userData.pending || 0) + amount;

            transaction.update(userRef, {
                totalPaid: newTotalPaid < 0 ? 0 : newTotalPaid,
                pending: newPending,
                status: 'pending'
            });

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
                notes: `Bill for ${format(billingDate, 'MMMM<y_bin_46>')}`,
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
