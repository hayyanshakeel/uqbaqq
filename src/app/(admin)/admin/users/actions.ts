'use server';

import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { differenceInMonths, parse, startOfMonth, addMonths, lastDayOfMonth, isValid, format, isAfter } from 'date-fns';

// This file has been simplified to remove actions not used by the basic client.
// We will add them back once the page is stable.

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
    const joiningDate = formData.get('joining_date') as string;

    if (!name || !phone || !email || !password || !joiningDate) {
        return { success: false, message: 'All fields are required.' };
    }

    try {
        const userRecord = await adminAuth.createUser({ email, password, displayName: name });
        await adminDb.collection('users').doc(userRecord.uid).set({
            name,
            phone,
            email,
            status: 'pending',
            joined: new Date(joiningDate).toISOString(),
            totalPaid: 0,
            pending: 0, // Simplified for now
        });
        revalidatePath('/admin/users');
        return { success: true, message: `${name} has been successfully added.` };
    } catch (error: any) {
        let message = 'Failed to add user.';
        if (error.code === 'auth/email-already-exists') {
            message = 'This email address is already in use by another account.';
        }
        return { success: false, message };
    }
}
