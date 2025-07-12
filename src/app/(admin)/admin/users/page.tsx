export const dynamic = 'force-dynamic';

import { getAdminDb } from '@/lib/firebase-admin';
import { format, parseISO, isValid } from 'date-fns';
import { UsersClient } from './users-client';
import { User, Bill } from '@/lib/data-service';
import { 
    addUserAction, 
    deleteUserAction, 
    updateUserAction, 
    markAsDeceasedAction,
    sendPaymentLinkAction,
    reverseLastPaymentAction,
    recalculateBalanceUntilDateAction,
    getPendingBillsForUserAction,
    markBillAsPaidAction
} from './actions';

/**
 * Fetches and processes user data from Firestore.
 * This function is now more robust and handles cases where user data might be
 * missing or in an unexpected format, preventing crashes.
 * @returns A promise that resolves to an array of User objects.
 */
async function getUsers(): Promise<User[]> {
    const adminDb = getAdminDb();
    // Fetch all user documents from the 'users' collection, ordered by name.
    const snapshot = await adminDb.collection('users').orderBy('name').get();
    if (snapshot.empty) {
        return []; // Return an empty array if no users are found.
    }

    // Process each user document in parallel.
    const users = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data();
        
        // Fetch the most recent payment for the user to display 'lastPaidOn'.
        const paymentsSnapshot = await adminDb.collection('payments')
            .where('userId', '==', doc.id)
            .orderBy('date', 'desc')
            .limit(1)
            .get();
        
        let lastPaidOn = 'N/A';
        if (!paymentsSnapshot.empty) {
            const paymentDate = paymentsSnapshot.docs[0].data().date;
            // Safely check if paymentDate and its toDate method exist before calling.
            if (paymentDate && typeof paymentDate.toDate === 'function') {
                lastPaidOn = format(paymentDate.toDate(), 'dd/MM/yyyy');
            }
        }

        let joinedDateStr = 'N/A';
        // FIX: This block safely handles the 'joined' date.
        // It checks if 'data.joined' exists before trying to parse it.
        if (data.joined) {
            try {
                // A date can be a string (from older data) or a Firestore Timestamp.
                // This handles both cases.
                const dateObj = typeof data.joined === 'string' 
                    ? parseISO(data.joined) 
                    : data.joined.toDate();

                // Only format the date if it's a valid date object.
                if (isValid(dateObj)) {
                    joinedDateStr = format(dateObj, 'dd/MM/yyyy');
                }
            } catch (e) {
                // Log an error if parsing fails, but don't crash the app.
                console.error(`Could not parse 'joined' date for user ${doc.id}:`, data.joined, e);
            }
        }

        // Return a structured User object.
        return {
            id: doc.id,
            name: data.name || 'N/A',
            email: data.email || undefined, // Use undefined for safer filtering.
            phone: data.phone || 'N/A',
            status: data.status || 'pending',
            joined: joinedDateStr,
            totalPaid: data.totalPaid || 0,
            pending: data.pending || 0,
            lastPaidOn,
        };
    }));

    // Safely filter out the admin user from the final list.
    // The '?.' operator prevents an error if a user doesn't have an email.
    return users.filter(user => user.email?.toLowerCase() !== 'sheikhhayyaan@gmail.com');
}

/**
 * The main server component for the Users page.
 * It fetches the initial user data and passes it along with server actions
 * to the UsersClient component, which handles the UI and user interactions.
 */
export default async function UsersPage() {
    // Fetch the list of users.
    const users = await getUsers();

    // The UsersClient component will receive the user data and all the functions
    // it needs to perform actions like adding, deleting, or updating users.
    return (
        <UsersClient
            initialUsers={users}
            addUserAction={addUserAction}
            deleteUserAction={deleteUserAction}
            updateUserAction={updateUserAction}
            markAsDeceasedAction={markAsDeceasedAction}
            sendPaymentLinkAction={sendPaymentLinkAction}
            reverseLastPaymentAction={reverseLastPaymentAction}
            recalculateBalanceUntilDateAction={recalculateBalanceUntilDateAction}
            getPendingBillsForUserAction={getPendingBillsForUserAction}
            markBillAsPaidAction={markBillAsPaidAction}
        />
    );
}
