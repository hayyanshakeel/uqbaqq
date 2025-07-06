'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const SETTINGS_COLLECTION = 'app_settings';
const BILLING_DOC_ID = 'billing';

// Schema for validating the input
const BillingSettingsSchema = z.object({
  monthlyAmount: z.coerce.number().positive('Amount must be a positive number.'),
});

/**
 * Fetches the current billing settings from Firestore.
 * @returns An object containing the monthly amount. Defaults to 250 if not set.
 */
export async function getBillingSettings(): Promise<{ monthlyAmount: number }> {
  try {
    const adminDb = getAdminDb();
    const docRef = adminDb.collection(SETTINGS_COLLECTION).doc(BILLING_DOC_ID);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      return { monthlyAmount: docSnap.data()?.monthlyAmount || 250 };
    }
    // Return a default value if no setting is found in the database
    return { monthlyAmount: 250 };
  } catch (error) {
    console.error("Error fetching billing settings:", error);
    // Return default on error to prevent the app from crashing
    return { monthlyAmount: 250 };
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
  };

  // Validate the input from the form
  const validatedFields = BillingSettingsSchema.safeParse(rawData);

  if (!validatedFields.success) {
    console.error("Validation failed:", validatedFields.error.flatten().fieldErrors);
    return { success: false, message: 'Please provide a valid positive number.' };
  }

  try {
    const { monthlyAmount } = validatedFields.data;
    const adminDb = getAdminDb();
    const docRef = adminDb.collection(SETTINGS_COLLECTION).doc(BILLING_DOC_ID);

    // Use set with merge: true to create the document if it doesn't exist, or update it if it does.
    await docRef.set({ monthlyAmount }, { merge: true });

    // Revalidate the path to ensure the new value is shown on refresh
    revalidatePath('/admin/settings');
    return { success: true, message: `Monthly bill amount updated to ₹${monthlyAmount}.` };

  } catch (error) {
    console.error('Error updating billing settings:', error);
    return { success: false, message: 'Failed to update settings.' };
  }
}
