import * as admin from 'firebase-admin';

function ensureAdminInitialized() {
  if (admin.apps.length > 0) {
    return;
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    // This check is important for debugging, but in a serverless environment
    // like Vercel, we rely on the function not being called if vars are missing.
    // Throwing an error here can cause build failures.
    console.error("Firebase server environment variables are not fully configured.");
    // In a real scenario, you might want to throw here if you expect these to always be present.
    // For Vercel build, we will let it fail inside the function call if it gets that far.
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
    });
  } catch (error: any) {
    // This can happen in local dev with hot-reloading.
    if (!/already exists/i.test(error.message)) {
      console.error('Firebase admin initialization error', error);
    }
  }
}

export function getAdminDb() {
  ensureAdminInitialized();
  return admin.firestore();
}

export function getAdminAuth() {
  ensureAdminInitialized();
  return admin.auth();
}
