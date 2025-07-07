'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const SETTINGS_COLLECTION = 'app_settings';
const BILLING_DOC_ID = 'billing';

// Schema for validating the input
const BillingSettingsSchema = z.object({
  monthlyAmount: z.coerce.number().positive('Amount must be a positive number.'),
  automaticReminders: z.preprocess((val) => val === 'on' || val === true, z.boolean()),
  manualBulkPayment: z.preprocess((val) => val === 'on' || val === true, z.boolean()),
});

/**
 * Fetches the current billing settings from Firestore.
 * @returns An object containing the monthly amount. Defaults to 250 if not set.
 */
export async function getBillingSettings(): Promise<{ monthlyAmount: number, automaticReminders: boolean, manualBulkPayment: boolean }> {
  try {
    const adminDb = getAdminDb();
    const docRef = adminDb.collection(SETTINGS_COLLECTION).doc(BILLING_DOC_ID);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const data = docSnap.data();
      return {
        monthlyAmount: data?.monthlyAmount || 250,
        automaticReminders: data?.automaticReminders === true,
        manualBulkPayment: data?.manualBulkPayment === true
      };
    }
    // Return a default value if no setting is found in the database
    return { monthlyAmount: 250, automaticReminders: false, manualBulkPayment: false };
  } catch (error) {
    console.error("Error fetching billing settings:", error);
    // Return default on error to prevent the app from crashing
    return { monthlyAmount: 250, automaticReminders: false, manualBulkPayment: false };
  }
}

/**
 * Updates the monthly bill amount in Firestore.
 * @param formData The form data containing the new monthly amount.
 * @returns An object indicating success or failure and a message.
 */
export async function updateBillingSettings(formData: FormData) {
  const rawData = {
    monthlyAmount: formData.get('monthlyAmount'),
    automaticReminders: formData.get('automaticReminders'),
    manualBulkPayment: formData.get('manualBulkPayment')
  };

  // Validate the input from the form
  const validatedFields = BillingSettingsSchema.safeParse(rawData);

  if (!validatedFields.success) {
    console.error("Validation failed:", validatedFields.error.flatten().fieldErrors);
    return { success: false, message: 'Please provide a valid positive number for the monthly amount.' };
  }

  try {
    const { monthlyAmount, automaticReminders, manualBulkPayment } = validatedFields.data;
    const adminDb = getAdminDb();
    const docRef = adminDb.collection(SETTINGS_COLLECTION).doc(BILLING_DOC_ID);

    // Use set with merge: true to create the document if it doesn't exist, or update it if it does.
    await docRef.set({ monthlyAmount, automaticReminders, manualBulkPayment }, { merge: true });

    // Revalidate the path to ensure the new value is shown on refresh
    revalidatePath('/admin/settings');
    return { success: true, message: `Settings have been updated successfully.` };

  } catch (error) {
    console.error('Error updating billing settings:', error);
    return { success: false, message: 'Failed to update settings.' };
  }
}
