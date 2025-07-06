'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const ExpenseSchema = z.object({
    date: z.string().min(1, 'Date is required.'),
    description: z.string().min(1, 'Description is required.'),
    amount: z.coerce.number().positive('Amount must be a positive number.'),
    category: z.string().min(1, 'Category is required.'),
});

export async function addExpenseAction(formData: FormData) {
    const adminDb = getAdminDb();
    const rawData = {
        date: formData.get('date'),
        description: formData.get('description'),
        amount: formData.get('amount'),
        category: formData.get('category'),
    };

    const validatedFields = ExpenseSchema.safeParse(rawData);

    if (!validatedFields.success) {
        // A simple message is enough for the user, we log the details.
        console.error("Validation failed:", validatedFields.error.flatten().fieldErrors);
        return { success: false, message: 'Please fill out all fields correctly.' };
    }

    try {
        const { date, description, amount, category } = validatedFields.data;
        await adminDb.collection('expenditures').add({
            date: new Date(date),
            description,
            amount,
            category,
            createdAt: new Date(),
        });
        
        revalidatePath('/admin/expenditure');
        revalidatePath('/admin/dashboard'); // Also revalidate dashboard as it shows total expenditure
        return { success: true, message: 'Expense added successfully.' };

    } catch (error) {
        console.error('Error adding expense:', error);
        return { success: false, message: 'Failed to add expense.' };
    }
}


export async function deleteExpenseAction(expenseId: string) {
    const adminDb = getAdminDb();
    if (!expenseId) {
        return { success: false, message: 'Expense ID is required.' };
    }

    try {
        await adminDb.collection('expenditures').doc(expenseId).delete();
        
        revalidatePath('/admin/expenditure');
        revalidatePath('/admin/dashboard');
        return { success: true, message: 'Expense deleted successfully.' };

    } catch (error: any) {
        console.error('Error deleting expense:', error);
        return { success: false, message: 'Failed to delete expense.' };
    }
}
