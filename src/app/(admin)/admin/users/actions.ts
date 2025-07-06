'use server';

import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export async function addUserAction(formData: FormData) {
    const name = formData.get('name') as string;
    const phone = formData.get('phone') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!name || !phone || !email || !password) {
        return { success: false, message: 'All fields are required.' };
    }

    if (password.length < 6) {
        return { success: false, message: 'Password must be at least 6 characters long.' };
    }

    try {
        // Create user in Firebase Auth
        const userRecord = await adminAuth.createUser({
            email,
            password,
            displayName: name,
            // phone number needs to be in E.164 format for Firebase Auth
            // we will just store it in firestore for now
        });

        // Create user document in Firestore with the UID as the document ID
        await adminDb.collection('users').doc(userRecord.uid).set({
            name,
            phone,
            email,
            status: 'pending',
            joined: new Date().toISOString(),
            totalPaid: 0,
            pending: 250, // Default pending amount
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
    if (!userId) {
        return { success: false, message: 'User ID is required.' };
    }

    try {
        // Delete user from Firestore
        await adminDb.collection('users').doc(userId).delete();
        
        // Delete user from Firebase Auth
        await adminAuth.deleteUser(userId);
        
        revalidatePath('/admin/users');
        return { success: true, message: 'User deleted successfully from Auth and Firestore.' };
    } catch (error: any) {
        console.error('Error deleting user:', error);
        // Handle case where user is not found in Auth (might have been deleted already)
        if (error.code === 'auth/user-not-found') {
            revalidatePath('/admin/users');
            return { success: true, message: 'User was already deleted from Auth, removed from list.'};
        }
        return { success: false, message: 'Failed to delete user.' };
    }
}

export async function recordPaymentAction(formData: FormData) {
    const userId = formData.get('userId') as string;
    const amountStr = formData.get('amount') as string;
    const paymentDateStr = formData.get('paymentDate') as string;
    const notes = formData.get('notes') as string | null;

    const amount = parseFloat(amountStr);

    if (!userId || !amountStr || !paymentDateStr) {
        return { success: false, message: 'User ID, amount, and date are required.' };
    }

    if (isNaN(amount) || amount <= 0) {
        return { success: false, message: 'Amount must be a positive number.' };
    }

    try {
        const userRef = adminDb.collection('users').doc(userId);
        
        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('User not found!');
            }
            const userData = userDoc.data()!;
            
            const newTotalPaid = (userData.totalPaid || 0) + amount;
            const newPending = (userData.pending || 0) - amount;

            transaction.update(userRef, {
                totalPaid: newTotalPaid,
                pending: newPending < 0 ? 0 : newPending,
                status: newPending <= 0 ? 'paid' : 'pending'
            });

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
        revalidatePath(`/dashboard`); // Revalidate user dashboard
        return { success: true, message: `Payment of ₹${amount.toFixed(2)} recorded.` };
    } catch (error) {
        console.error('Error recording payment:', error);
        const message = error instanceof Error ? error.message : 'Failed to record payment.';
        return { success: false, message };
    }
}


export async function addMissedBillAction(formData: FormData) {
    const userId = formData.get('userId') as string;
    const amountStr = formData.get('amount') as string;
    const billingMonth = formData.get('billingMonth') as string; // YYYY-MM
    const notes = formData.get('notes') as string | null;

    const amount = parseFloat(amountStr);

    if (!userId || !amountStr || !billingMonth) {
        return { success: false, message: 'User ID, amount, and billing month are required.' };
    }

    if (isNaN(amount) || amount <= 0) {
        return { success: false, message: 'Amount must be a positive number.' };
    }

    try {
        const userRef = adminDb.collection('users').doc(userId);

        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('User not found!');
            }
            const userData = userDoc.data()!;

            const newPending = (userData.pending || 0) + amount;

            transaction.update(userRef, {
                pending: newPending,
                status: 'pending' // if they were paid, now they are not
            });

            // Using a new 'bills' collection to track dues explicitly.
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
        revalidatePath(`/dashboard`); // Revalidate user dashboard
        return { success: true, message: `Missed bill of ₹${amount.toFixed(2)} added.` };
    } catch (error) {
        console.error('Error adding missed bill:', error);
        const message = error instanceof Error ? error.message : 'Failed to add missed bill.';
        return { success: false, message };
    }
}

export async function reverseLastPaymentAction(userId: string) {
    if (!userId) {
        return { success: false, message: 'User ID is required.' };
    }

    try {
        const paymentQuery = adminDb.collection('payments')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(1);
        
        const paymentSnapshot = await paymentQuery.get();

        if (paymentSnapshot.empty) {
            return { success: false, message: 'No recorded payments found for this user to reverse.' };
        }
        
        const lastPaymentDoc = paymentSnapshot.docs[0];
        const lastPaymentData = lastPaymentDoc.data();
        const amount = lastPaymentData.amount;
        
        const userRef = adminDb.collection('users').doc(userId);

        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('User not found!');
            }
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

    } catch (error) {
        console.error('Error reversing payment:', error);
        const message = error instanceof Error ? error.message : 'Failed to reverse payment.';
        return { success: false, message };
    }
}


export async function reverseLastBillAction(userId: string) {
    if (!userId) {
        return { success: false, message: 'User ID is required.' };
    }

    try {
        const billQuery = adminDb.collection('bills')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(1);

        const billSnapshot = await billQuery.get();

        if (billSnapshot.empty) {
            return { success: false, message: 'No recorded bills found for this user to reverse.' };
        }

        const lastBillDoc = billSnapshot.docs[0];
        const lastBillData = lastBillDoc.data();
        const amount = lastBillData.amount;

        const userRef = adminDb.collection('users').doc(userId);

        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('User not found!');
            }
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

    } catch (error) {
        console.error('Error reversing bill:', error);
        const message = error instanceof Error ? error.message : 'Failed to reverse bill.';
        return { success: false, message };
    }
}
