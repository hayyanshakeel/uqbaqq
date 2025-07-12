'use server';
import { getAdminDb } from './firebase-admin';
import { startOfMonth, subMonths, format, parseISO } from 'date-fns'; // Import parseISO
import * as admin from 'firebase-admin';

const ADMIN_EMAIL = 'sheikhhayyaan@gmail.com';

export interface User {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    status: 'paid' | 'pending' | 'overdue' | 'deceased';
    joined: string; 
    totalPaid: number;
    pending: number;
    lastPaidOn?: string;
}

export interface Bill {
    id: string;
    amount: number;
    date: string;
    notes: string;
}


export interface Expense {
    id: string;
    date: string; 
    description: string;
    amount: number;
    category: string;
}

export async function getAllUsers(): Promise<User[]> {
    const adminDb = getAdminDb();
    const snapshot = await adminDb.collection('users').orderBy('name').get();

    if (snapshot.empty) {
        return [];
    }

    const users = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data();
        // FIX: Use parseISO to reliably parse the ISO string from the database
        const joinedDate = data.joined ? parseISO(data.joined) : new Date();
        
        const paymentsSnapshot = await adminDb.collection('payments')
            .where('userId', '==', doc.id)
            .orderBy('date', 'desc')
            .limit(1)
            .get();

        let lastPaidOn = 'N/A';
        if (!paymentsSnapshot.empty) {
            lastPaidOn = format(paymentsSnapshot.docs[0].data().date.toDate(), 'dd/MM/yyyy');
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

// ... All other functions in this file remain the same ...
