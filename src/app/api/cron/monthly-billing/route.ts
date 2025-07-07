import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export async function GET(request: NextRequest) {
  // 1. Secure the endpoint with a Cron Secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const adminDb = getAdminDb();
    console.log("Cron Job: Starting monthly billing process...");

    // 2. Get the current monthly billing amount from settings
    const settingsRef = adminDb.collection('app_settings').doc('billing');
    const settingsDoc = await settingsRef.get();
    const monthlyAmount = settingsDoc.data()?.monthlyAmount || 250; // Default to 250 if not set

    // 3. Get all active users (not deceased)
    const usersSnapshot = await adminDb.collection('users').where('status', '!=', 'deceased').get();

    if (usersSnapshot.empty) {
      console.log("Cron Job: No active users found. Exiting.");
      return NextResponse.json({ success: true, message: 'No active users to bill.' });
    }

    let successCount = 0;
    const batch = adminDb.batch();

    // 4. Loop through each user and update their balance
    usersSnapshot.forEach(userDoc => {
      const userData = userDoc.data();
      const newPending = (userData.pending || 0) + monthlyAmount;
      
      const userRef = adminDb.collection('users').doc(userDoc.id);
      batch.update(userRef, { 
        pending: newPending,
        status: 'pending' // Set their status to pending
      });

      // Create a record of the bill
      const billRef = adminDb.collection('bills').doc();
      batch.set(billRef, {
          userId: userDoc.id,
          amount: monthlyAmount,
          dueDate: new Date(),
          notes: `Automatic monthly bill for ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`,
          status: 'pending',
          createdAt: new Date()
      });

      successCount++;
    });

    // 5. Commit all the updates at once
    await batch.commit();
    
    // 6. Revalidate paths to ensure data is fresh
    revalidatePath('/admin/users');
    revalidatePath('/admin/dashboard');

    console.log(`Cron Job: Successfully billed ${successCount} users.`);
    return NextResponse.json({ success: true, message: `Successfully billed ${successCount} users.` });

  } catch (error: any) {
    console.error("Cron Job Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
