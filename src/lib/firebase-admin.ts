import * as admin from 'firebase-admin';

// This function ensures that Firebase Admin is initialized only once.
function ensureAdminInitialized() {
  // If the app is already initialized, do nothing.
  if (admin.apps.length > 0) {
    return;
  }

  // Vercel environment variable should contain the full JSON string.
  const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountString) {
    console.error("Firebase server environment variable 'FIREBASE_SERVICE_ACCOUNT_JSON' is not set.");
    // This will cause a clear error if the environment variable is missing.
    throw new Error("Firebase Admin SDK credentials are not configured. Please set the FIREBASE_SERVICE_ACCOUNT_JSON environment variable.");
  }

  try {
    // Parse the JSON string from the environment variable.
    const serviceAccount = JSON.parse(serviceAccountString);

    // Initialize the app with the parsed credentials.
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
    });
     console.log("Firebase Admin SDK initialized successfully.");
  } catch (error: any) {
    // This catches errors both from JSON.parse and from initializeApp.
    console.error('Firebase admin initialization error', error);
    // Re-throw the error to ensure the server process fails clearly if initialization is impossible.
    throw new Error(`Failed to initialize Firebase Admin SDK: ${error.message}`);
  }
}

// Export a function to get the Firestore database instance.
export function getAdminDb() {
  ensureAdminInitialized();
  return admin.firestore();
}

// Export a function to get the Auth instance.
export function getAdminAuth() {
  ensureAdminInitialized();
  return admin.auth();
}
