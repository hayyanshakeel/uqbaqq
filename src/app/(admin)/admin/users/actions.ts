'use server';

import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { differenceInMonths, parse, startOfMonth, addMonths, lastDayOfMonth, isValid, format, isAfter } from 'date-fns';
import * as admin from 'firebase-admin';
import type { Bill } from '@/lib/data-service';

// Schema for validating new user data from the form
const UserSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  email: z.string().email('Invalid email address.'),
  // FIX: Added a regular expression to ensure the phone number is exactly 10 digits.
  phone: z.string().regex(/^\d{10}$/, 'Phone number must be 10 digits.'),
  password: z.string().min(6, 'Password must be at least 6 characters long.'),
  joining_date: z.string().min(1, 'Joining date is required.'),
});

/**
 * Creates a new user in Firebase Auth and Firestore.
 */
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
        console.error("Validation failed:", validatedFields.error.flatten().fieldErrors);
        // Return the specific validation error message to the client for better UX.
        const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
        return { success: false, message: firstError || 'Please fill out all fields correctly.' };
    }

    const { name, email, phone, password, joining_date } = validatedFields.data;
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();

    // FIX: Format the phone number to E.164 standard by adding the country code.
    // This assumes an Indian country code (+91).
    const formattedPhoneNumber = `+91${phone}`;

    try {
        // Create user in Firebase Authentication
        const userRecord = await adminAuth.createUser({
            email: email,
            emailVerified: true,
            password: password,
            displayName: name,
            phoneNumber: formattedPhoneNumber, // Use the correctly formatted number
        });

        // Add user data to Firestore
        await adminDb.collection('users').doc(userRecord.uid).set({
            name,
            email,
            phone: formattedPhoneNumber, // Store the formatted number
            joined: joining_date,
            status: 'pending',
            totalPaid: 0,
            pending: 0,
            createdAt: new Date(),
        });
        
        revalidatePath('/admin/users');
        return { success: true, message: 'User added successfully!' };

    } catch (error: any) {
        console.error('Error adding user:', error);
        
        let message = 'Failed to add user.';
        if (error.code === 'auth/email-already-exists') {
            message = 'A user with this email already exists.';
        } else if (error.code === 'auth/invalid-phone-number') {
            message = 'The phone number is invalid. Please ensure it is a valid 10-digit number.';
        } else if (error.message) {
            message = error.message;
        }
        
        return { success: false, message };
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
