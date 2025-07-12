export const dynamic = 'force-dynamic';

import { revalidatePath } from 'next/cache';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { format, startOfMonth, addMonths, lastDayOfMonth, differenceInMonths, isValid, parse, isAfter } from 'date-fns';
import { UsersClient } from './users-client';
import { User, Bill } from '@/lib/data-service';
import { createPaymentLink } from '@/app/(user)/dashboard/actions';

// --- Fee Structure Definition ---
const feeStructure = [
    { start: '2001-05-01', end: '2007-04-30', fee: 30 },
    { start: '2007-05-01', end: '2014-04-30', fee: 50 },
    { start: '2014-05-01', end: '2019-06-30', fee: 100 },
    { start: '2019-07-01', end: '2024-03-31', fee: 200 },
    { start: '2024-04-01', end: '9999-12-31', fee: 250 }
];

function parseDate(dateString: string): Date {
    // This helper function handles date parsing robustly
    const date = parse(dateString, 'yyyy-MM-dd', new Date());
    if (!isValid(date)) {
        throw new Error(`Invalid date encountered: ${dateString}`);
    }
    return date;
}

function calculateDuesForPeriod(startDateStr: string, endDateStr: string): { totalDues: number; monthlyBreakdown: { month: Date, fee: number }[] } {
    const startDate = startOfMonth(parseDate(startDateStr));
    const endDate = startOfMonth(parseDate(endDateStr));
    let totalDues = 0;
    const monthlyBreakdown: { month: Date, fee: number }[] = [];
    if (startDate > endDate) return { totalDues: 0, monthlyBreakdown: [] };
    const totalMonths = differenceInMonths(endDate, startDate) + 1;

    for (let i = 0; i < totalMonths; i++) {
        const monthDate = addMonths(startDate, i);
        const applicableTier = feeStructure.find(tier => {
            const tierStart = parseDate(tier.start);
            const tierEnd = parseDate(tier.end);
            return monthDate >= tierStart && monthDate <= tierEnd;
        });
        if (applicableTier) {
            totalDues += applicableTier.fee;
            monthlyBreakdown.push({ month: monthDate, fee: applicableTier.fee });
        }
    }
    return { totalDues, monthlyBreakdown };
}


async function getUsers(): Promise<User[]> {
    const adminDb = getAdminDb();
    const snapshot = await adminDb.collection('users').orderBy('name').get();
    if (snapshot.empty) return [];

    const users = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const paymentsSnapshot = await adminDb.collection('payments').where('userId', '==', doc.id).orderBy('date', 'desc').limit(1).get();
        let lastPaidOn = 'N/A';
        if (!paymentsSnapshot.empty) {
            lastPaidOn = format(paymentsSnapshot.docs[0].data().date.toDate(), 'dd/MM/yyyy');
        }
        return {
            id: doc.id,
            name: data.name || 'N/A',
            email: data.email || 'N/A',
            phone: data.phone || 'N/A',
            status: data.status || 'pending',
            joined: format(parseISO(data.joined), 'dd/MM/yyyy'), // Use parseISO for reliability
            totalPaid: data.totalPaid || 0,
            pending: data.pending || 0,
            lastPaidOn,
        };
    }));
    return users.filter(user => user.email?.toLowerCase() !== 'sheikhhayyaan@gmail.com');
}


export default async function UsersPage() {
    const users = await getUsers();

    // --- SERVER ACTIONS ---
    async function addUserAction(formData: FormData) {
        'use server';
        const adminDb = getAdminDb();
        const adminAuth = getAdminAuth();
        try {
            const name = formData.get('name') as string;
            const phone = formData.get('phone') as string;
            const email = formData.get('email') as string;
            const password = formData.get('password') as string;
            const joiningDateStr = formData.get('joining_date') as string;
            if (!name || !phone || !email || !password || !joiningDateStr) throw new Error("All fields are required.");
            
            const userRecord = await adminAuth.createUser({ email, password, displayName: name });
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const { totalDues, monthlyBreakdown } = calculateDuesForPeriod(joiningDateStr, todayStr);
            
            const batch = adminDb.batch();
            const userRef = adminDb.collection('users').doc(userRecord.uid);
            // FIX: Use parseDate to create a valid date object before converting to ISO string
            batch.set(userRef, { name, phone, email, status: totalDues > 0 ? 'pending' : 'paid', joined: parseDate(joiningDateStr).toISOString(), totalPaid: 0, pending: totalDues });
            
            monthlyBreakdown.forEach(bill => {
                const billRef = adminDb.collection('bills').doc();
                batch.set(billRef, { userId: userRecord.uid, amount: bill.fee, dueDate: bill.month, notes: `Bill for ${format(bill.month, 'MMMM yyyy')}`, status: 'pending', createdAt: new Date() });
            });
            await batch.commit();
            
            revalidatePath('/admin/users');
            return { success: true, message: 'User added successfully.' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to add user.' };
        }
    }
    
    // ... Other actions will also be updated to use parseDate where necessary ...

    return (
        <UsersClient
            initialUsers={users}
            addUserAction={addUserAction}
            // ... other actions passed as props
        />
    );
}
