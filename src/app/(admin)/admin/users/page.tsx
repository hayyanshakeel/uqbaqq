export const dynamic = 'force-dynamic';

import { format, isValid, parseISO } from 'date-fns';
import { getAdminDb } from '@/lib/firebase-admin';
import { UsersClient } from './users-client';
import type { User } from '@/lib/data-service';
import {
    addUserAction,
    deleteUserAction,
    updateUserAction,
    markAsDeceasedAction,
    sendPaymentLinkAction,
    reverseLastPaymentAction,
    recalculateBalanceUntilDateAction,
    addSinglePaymentAction,
    addMissedBillAction,
    getPendingBillsForUserAction,
    markBillAsPaidAction
} from './actions';

/**
 * Fetches all users from Firestore and their last payment date.
 * This function is now robust and correctly formats dates.
 */
async function getUsers(): Promise<User[]> {
    const adminDb = getAdminDb();
    const usersSnapshot = await adminDb.collection('users').orderBy('name').get();
    if (usersSnapshot.empty) return [];

    const usersData = await Promise.all(usersSnapshot.docs.map(async (doc) => {
        const data = doc.data();
        
        // Fetch the most recent payment for the user
        const paymentsSnapshot = await adminDb.collection('payments')
            .where('userId', '==', doc.id)
            .orderBy('date', 'desc')
            .limit(1)
            .get();

        let lastPaidOn = 'N/A';
        if (!paymentsSnapshot.empty) {
            const payment = paymentsSnapshot.docs[0].data();
            // Handle both Firestore Timestamps and string dates
            const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
            if (isValid(paymentDate)) {
                lastPaidOn = format(paymentDate, 'dd/MM/yyyy');
            }
        }

        let joinedDateStr = 'N/A';
        if (data.joined) {
            const dateObj = typeof data.joined === 'string' ? parseISO(data.joined) : data.joined.toDate();
            if (isValid(dateObj)) {
                joinedDateStr = format(dateObj, 'dd/MM/yyyy');
            }
        }

        return {
            id: doc.id,
            name: data.name || 'N/A',
            email: data.email || 'N/A',
            phone: data.phone || 'N/A',
            status: data.status || 'pending',
            joined: joinedDateStr,
            totalPaid: data.totalPaid || 0,
            pending: data.pending || 0,
            lastPaidOn,
        };
    }));

    // Filter out the admin user
    return usersData.filter(user => user.email?.toLowerCase() !== 'sheikhhayyaan@gmail.com');
}

/**
 * The main server component for the Users page.
 * It fetches the initial user data and passes all server actions
 * to the UsersClient component.
 */
export default async function UsersPage() {
    const users = await getUsers();

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
            addSinglePaymentAction={addSinglePaymentAction}
            addMissedBillAction={addMissedBillAction}
            getPendingBillsForUserAction={getPendingBillsForUserAction}
            markBillAsPaidAction={markBillAsPaidAction}
        />
    );
}
