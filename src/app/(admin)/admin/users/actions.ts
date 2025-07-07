'use server';

import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { differenceInMonths, parse, startOfMonth, addMonths } from 'date-fns';

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
    // Use a specific format for parsing to avoid ambiguity
    const startDate = startOfMonth(parse(startDateStr, 'yyyy-MM-dd', new Date()));
    const endDate = startOfMonth(parse(endDateStr, 'yyyy-MM-dd', new Date()));
    let totalDues = 0;

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
        return 0;
    }
    
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


// --- CSV IMPORT ACTION ---
export async function importUsersFromCsvAction(csvData: string) {
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const data = lines.slice(1);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const todayStr = new Date().toISOString().split('T')[0]; // yyyy-MM-dd format

    for (const [index, row] of data.entries()) {
        const values = row.split(',').map(v => v.trim());
        const entry = headers.reduce((obj, header, i) => {
            obj[header] = values[i];
            return obj;
        }, {} as Record<string, string>);

        const { name, email, phone, password, joining_date, last_payment_month, admission_fee, misc_dues } = entry;

        if (!email || !joining_date) {
            errors.push(`Row ${index + 2}: Missing required fields (email, joining_date).`);
            errorCount++;
            continue;
        }

        try {
            const usersRef = adminDb.collection('users');
            const querySnapshot = await usersRef.where('email', '==', email).limit(1).get();

            const admissionFeeNum = parseFloat(admission_fee) || 0;
            const miscDuesNum = parseFloat(misc_dues) || 0;
            
            // Calculate total amount they should have paid from joining until today
            const totalDuesToDate = calculateDuesForPeriod(joining_date, todayStr);

            // Calculate amount they have actually paid based on the last_payment_month
            const lastPaymentDate = last_payment_month ? `${last_payment_month}-28` : null; // Use end of month
            const totalPaid = lastPaymentDate ? calculateDuesForPeriod(joining_date, lastPaymentDate) : 0;
            
            const pending = (totalDuesToDate + admissionFeeNum + miscDuesNum) - totalPaid;

            if (querySnapshot.empty) {
                if (!name || !phone || !password) {
                    errors.push(`Row ${index + 2}: New user requires name, phone, and password.`);
                    errorCount++;
                    continue;
                }
                if (password.length < 6) {
                     errors.push(`Row ${index + 2}: Password for new user ${name} must be at least 6 characters.`);
                     errorCount++;
                     continue;
                }

                const userRecord = await adminAuth.createUser({ email, password, displayName: name, phoneNumber: phone });

                await usersRef.doc(userRecord.uid).set({
                    name, phone, email, totalPaid,
                    pending: pending < 0 ? 0 : pending,
                    status: pending <= 0 ? 'paid' : 'pending',
                    joined: new Date(joining_date).toISOString(),
                });

            } else {
                const userDoc = querySnapshot.docs[0];
                await userDoc.ref.update({
                    totalPaid,
                    pending: pending < 0 ? 0 : pending,
                    status: pending <= 0 ? 'paid' : 'pending',
                    joined: new Date(joining_date).toISOString(),
                    name: name || userDoc.data().name,
                    phone: phone || userDoc.data().phone,
                });
            }

            successCount++;
        } catch (error: any) {
            errors.push(`Row ${index + 2} (${email}): ${error.message}`);
            errorCount++;
        }
    }

    revalidatePath('/admin/users');
    revalidatePath('/admin/dashboard');

    return {
        success: errorCount === 0,
        message: `Import complete. ${successCount} users processed. ${errorCount} rows failed.`,
        errors
    };
}

// --- Server Action to Update User Details and Password ---
export async function updateUserAction(userId: string, formData: FormData) {
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();

    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const password = formData.get('password') as string; // Get the new password

    if (!name || !email || !phone) {
        return { success: false, message: 'Name, email, and phone are required.' };
    }

    try {
        const firestoreUpdatePayload = { name, email, phone };
        
        // Prepare the payload for Firebase Auth update
        const authUpdatePayload: { displayName: string; email: string; phoneNumber: string; password?: string } = { 
            displayName: name, 
            email, 
            phoneNumber: phone 
        };
        
        // Only add the password to the payload if a new one was provided
        if (password) {
            if (password.length < 6) {
                return { success: false, message: 'New password must be at least 6 characters long.' };
            }
            authUpdatePayload.password = password;
        }

        // Update Firebase Authentication
        await adminAuth.updateUser(userId, authUpdatePayload);

        // Update Firestore Database
        await adminDb.collection('users').doc(userId).update(firestoreUpdatePayload);

        revalidatePath('/admin/users');
        return { success: true, message: 'User details updated successfully.' };
    } catch (error: any) {
        console.error("Error updating user:", error);
        if (error.code === 'auth/email-already-exists') {
            return { success: false, message: 'This email address is already in use by another account.' };
        }
        return { success: false, message: 'Failed to update user details.' };
    }
}


// --- Existing User Actions (Unchanged) ---
export async function addUserAction(formData: FormData) {
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();
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
        const userRecord = await adminAuth.createUser({
            email,
            password,
            displayName: name,
        });

        await adminDb.collection('users').doc(userRecord.uid).set({
            name,
            phone,
            email,
            status: 'pending',
            joined: new Date().toISOString(),
            totalPaid: 0,
            pending: 250,
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
    } catch (error) {
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
    } catch (error) {
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

    } catch (error) {
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

    } catch (error) {
        console.error('Error reversing bill:', error);
        const message = error instanceof Error ? error.message : 'Failed to reverse bill.';
        return { success: false, message };
    }
}
