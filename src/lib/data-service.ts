'use server';
import { getAdminDb } from './firebase-admin';
import { startOfMonth, subMonths, format } from 'date-fns';
import * as admin from 'firebase-admin';

const ADMIN_EMAIL = 'sheikhhayyaan@gmail.com';

export interface User {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    status: 'paid' | 'pending' | 'overdue' | 'deceased';
    joined: string; // Should be ISO string
    totalPaid: number;
    pending: number;
    lastPaidOn?: string; // New field for the last payment date
}

export interface Bill {
    id: string;
    amount: number;
    date: string;
    notes: string;
}


export interface Expense {
    id: string;
    date: string; // ISO string
    description: string;
    amount: number;
    category: string;
}

// A simplified aggregation. In a real large-scale app, this might be done with a Cloud Function.
export async function getDashboardKpis() {
    const adminDb = getAdminDb();
    const usersSnapshot = await adminDb.collection('users').get();
    const expendituresSnapshot = await adminDb.collection('expenditures').get();
    
    const regularUsers = usersSnapshot.docs.filter(doc => doc.data().email?.toLowerCase() !== ADMIN_EMAIL);

    let totalPayments = 0;
    // Summing from users' totalPaid field for consistency.
    regularUsers.forEach(doc => {
        totalPayments += doc.data().totalPaid || 0;
    });

    let paidUsers = 0;
    let pendingUsersCount = 0;
    regularUsers.forEach(doc => {
        const user = doc.data();
        if (user.pending === 0) {
            paidUsers++;
        } else {
            pendingUsersCount++;
        }
    });
    
    let totalExpenditure = 0;
    expendituresSnapshot.forEach(doc => {
        totalExpenditure += doc.data().amount || 0;
    });

    return {
        totalPayments: totalPayments,
        paidUsers: `+${paidUsers}`,
        pendingUsers: `+${pendingUsersCount}`,
        totalExpenditure: totalExpenditure,
    };
}


export async function getPaymentOverview() {
    const adminDb = getAdminDb();
    const sixMonthsAgo = startOfMonth(subMonths(new Date(), 5));
    // The orderBy clause is removed to prevent index-related errors.
    const paymentsSnapshot = await adminDb.collection('payments')
        .where('date', '>=', sixMonthsAgo)
        .get();

    // Initialize months
    const monthlyData: { [key: string]: { month: string; paid: number; pending: number } } = {};
    for (let i = 5; i >= 0; i--) {
        const date = subMonths(new Date(), i);
        const monthKey = format(date, 'MMM');
        monthlyData[monthKey] = { month: monthKey, paid: 0, pending: 0 };
    }

    paymentsSnapshot.forEach(doc => {
        const payment = doc.data();
        const paymentDate = (payment.date.toDate as () => Date)();
        const monthKey = format(paymentDate, 'MMM');
        if (monthlyData[monthKey]) {
            monthlyData[monthKey].paid += payment.amount || 0;
        }
    });

    // For pending data, let's make a simple assumption for now
    const usersSnapshot = await adminDb.collection('users').where('pending', '>', 0).get();
    const totalPending = usersSnapshot.docs.reduce((acc, doc) => {
        if(doc.data().email?.toLowerCase() !== ADMIN_EMAIL) {
            return acc + (doc.data().pending || 0);
        }
        return acc;
    }, 0);

    const months = Object.keys(monthlyData);
    if (months.length > 0) {
       const pendingPerMonth = totalPending / months.length;
       months.forEach(month => {
            monthlyData[month].pending = Math.round(pendingPerMonth / 100) * 100; // rough estimate
       });
    }


    return Object.values(monthlyData);
}


// This function is for the dashboard widget, so it only needs a subset of fields.
export async function getUsersWithPendingPayments(): Promise<Pick<User, 'id' | 'name' | 'email' | 'pending'>[]> {
    const adminDb = getAdminDb();
    const snapshot = await adminDb.collection('users')
        .where('pending', '>', 0)
        .orderBy('pending', 'desc')
        .limit(6) // Fetch one more in case admin is in the list
        .get();

    if (snapshot.empty) {
        return [];
    }

    const users = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        email: doc.data().email,
        pending: doc.data().pending,
    }));

    return users.filter(user => user.email?.toLowerCase() !== ADMIN_EMAIL).slice(0, 5);
}

export async function getAllUsers(): Promise<User[]> {
    const adminDb = getAdminDb();
    const snapshot = await adminDb.collection('users').orderBy('name').get();

    if (snapshot.empty) {
        return [];
    }

    const users = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const joinedDate = data.joined ? new Date(data.joined) : new Date();

        // Fetch the last payment for each user
        const paymentsSnapshot = await adminDb.collection('payments')
            .where('userId', '==', doc.id)
            .orderBy('date', 'desc')
            .limit(1)
            .get();

        let lastPaidOn = 'N/A';
        if (!paymentsSnapshot.empty) {
            const lastPayment = paymentsSnapshot.docs[0].data();
            if (lastPayment.date) {
                lastPaidOn = format(lastPayment.date.toDate(), 'dd/MM/yyyy');
            }
        }

        return {
            id: doc.id,
            name: data.name || 'N/A',
            phone: data.phone || 'N/A',
            status: data.status || 'pending',
            joined: format(joinedDate, 'dd/MM/yyyy'),
            totalPaid: data.totalPaid || 0,
            pending: data.pending || 0,
            email: data.email || undefined,
            lastPaidOn: lastPaidOn,
        };
    }));

    return users.filter(user => user.email?.toLowerCase() !== ADMIN_EMAIL);
}


export async function getAllExpenditures(): Promise<Expense[]> {
    const adminDb = getAdminDb();
    const snapshot = await adminDb.collection('expenditures').orderBy('date', 'desc').get();

    if (snapshot.empty) {
        return [];
    }

    return snapshot.docs.map(doc => {
        const data = doc.data();
        const expenseDate = data.date instanceof admin.firestore.Timestamp
            ? data.date.toDate().toISOString()
            : data.date;

        return {
            id: doc.id,
            date: expenseDate,
            description: data.description || 'N/A',
            amount: data.amount || 0,
            category: data.category || 'General',
        };
    });
}
export async function getPendingBillsForUser(userId: string): Promise<Bill[]> {
    if (!userId) return [];
    const adminDb = getAdminDb();

    try {
        const billsSnapshot = await adminDb.collection('bills')
            .where('userId', '==', userId)
            .where('status', '==', 'pending')
            // .orderBy('dueDate', 'asc') // This requires a composite index, removing it to prevent errors.
            .get();

        if (billsSnapshot.empty) {
            return [];
        }

        const bills = billsSnapshot.docs.map(doc => {
            const data = doc.data();
            const dueDate = data.dueDate instanceof admin.firestore.Timestamp
                ? data.dueDate.toDate()
                : new Date(data.dueDate);

            return {
                id: doc.id,
                amount: data.amount || 0,
                date: dueDate, // Keep as Date object for sorting
                notes: data.notes || `Bill for ${format(dueDate, 'MMMM yyyy')}`,
            };
        });
        
        // Sort the bills in memory instead of in the query
        bills.sort((a, b) => a.date.getTime() - b.date.getTime());

        // Format the date to a string after sorting is complete
        return bills.map(bill => ({
            ...bill,
            date: format(bill.date, 'dd/MM/yyyy'),
        }));

    } catch (error) {
        console.error(`Error fetching pending bills for user ${userId}:`, error);
        return [];
    }
}
