'use server';
import { adminDb } from './firebase-admin';
import { startOfMonth, subMonths, format } from 'date-fns';
import * as admin from 'firebase-admin';

const ADMIN_EMAIL = 'sheikhhayyaan@gmail.com';

export interface User {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    status: 'paid' | 'pending' | 'overdue';
    joined: string; // Should be ISO string
    totalPaid: number;
    pending: number;
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
    const sixMonthsAgo = startOfMonth(subMonths(new Date(), 5));
    const paymentsSnapshot = await adminDb.collection('payments')
        .where('date', '>=', sixMonthsAgo)
        .orderBy('date', 'asc')
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
    // A more complex system would track bills vs payments
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
    const snapshot = await adminDb.collection('users').orderBy('name').get();

    if (snapshot.empty) {
        return [];
    }

    const users = snapshot.docs.map(doc => {
        const data = doc.data();
        const joinedDate = data.joined ? new Date(data.joined) : new Date();
        return {
            id: doc.id,
            name: data.name || 'N/A',
            phone: data.phone || 'N/A',
            status: data.status || 'pending',
            joined: format(joinedDate, 'dd/MM/yyyy'),
            totalPaid: data.totalPaid || 0,
            pending: data.pending || 0,
            email: data.email || undefined,
        };
    });

    return users.filter(user => user.email?.toLowerCase() !== ADMIN_EMAIL);
}


export async function getAllExpenditures(): Promise<Expense[]> {
    const snapshot = await adminDb.collection('expenditures').orderBy('date', 'desc').get();

    if (snapshot.empty) {
        return [];
    }

    return snapshot.docs.map(doc => {
        const data = doc.data();
        // Firestore timestamps need to be converted to JS Date objects, then to ISO strings
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
