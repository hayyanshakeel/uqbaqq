import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { getBillingSettings } from '@/app/(admin)/admin/settings/actions'; // CORRECTED PATH
import { createPaymentLink } from '@/app/(user)/dashboard/actions';


export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const adminDb = getAdminDb();
    const settings = await getBillingSettings();

    // 1. Handle Automatic Billing
    console.log("Cron Job: Starting monthly billing process...");
    const settingsRef = adminDb.collection('app_settings').doc('billing');
    const settingsDoc = await settingsRef.get();
    const monthlyAmount = settingsDoc.data()?.monthlyAmount || 250;

    const usersSnapshot = await adminDb.collection('users').where('status', '!=', 'deceased').get();

    if (!usersSnapshot.empty) {
        let billSuccessCount = 0;
        const batch = adminDb.batch();

        usersSnapshot.forEach(userDoc => {
          const userData = userDoc.data();
          const newPending = (userData.pending || 0) + monthlyAmount;
          
          const userRef = adminDb.collection('users').doc(userDoc.id);
          batch.update(userRef, { 
            pending: newPending,
            status: 'pending'
          });

          const billRef = adminDb.collection('bills').doc();
          batch.set(billRef, {
              userId: userDoc.id,
              amount: monthlyAmount,
              dueDate: new Date(),
              notes: `Automatic monthly bill for ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`,
              status: 'pending',
              createdAt: new Date()
          });

          billSuccessCount++;
        });

        await batch.commit();
        console.log(`Cron Job: Successfully created bills for ${billSuccessCount} users.`);
    } else {
        console.log("Cron Job: No active users found to create bills for.");
    }

    // 2. Handle Automatic Payment Reminders
    if (settings.automaticReminders) {
        console.log("Cron Job: Sending automatic payment reminders...");
        const pendingUsersSnapshot = await adminDb.collection('users').where('pending', '>', 0).where('status', '!=', 'deceased').get();
        if (pendingUsersSnapshot.empty) {
            console.log("Cron Job: No users with pending payments to remind.");
        } else {
            let reminderSuccessCount = 0;
            for (const userDoc of pendingUsersSnapshot.docs) {
                try {
                    await createPaymentLink(userDoc.id);
                    reminderSuccessCount++;
                } catch (linkError) {
                    console.error(`Cron Job: Failed to create payment link for user ${userDoc.id}`, linkError);
                }
            }
            console.log(`Cron Job: Successfully sent payment reminders to ${reminderSuccessCount} users.`);
        }
    } else {
        console.log("Cron Job: Automatic payment reminders are disabled.");
    }
    
    revalidatePath('/admin/users');
    revalidatePath('/admin/dashboard');

    return NextResponse.json({ success: true, message: 'Cron job completed.' });

  } catch (error: any) {
    console.error("Cron Job Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
