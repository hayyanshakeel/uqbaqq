export const dynamic = 'force-dynamic';

import { revalidatePath } from 'next/cache';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { format, startOfMonth, addMonths, lastDayOfMonth, differenceInMonths, isValid, parse, isAfter } from 'date-fns';
import { UsersClient } from './users-client';
import { User, Bill } from '@/lib/data-service';
import { getBillingSettings } from '@/app/(admin)/admin/settings/actions';
import { createPaymentLink } from '@/app/(user)/dashboard/actions';


// --- DATA FETCHING & HELPERS ---
const feeStructure = [
    { start: '2001-05-01', end: '2007-04-30', fee: 30 },
    { start: '2007-05-01', end: '2014-04-30', fee: 50 },
    { start: '2014-05-01', end: '2019-06-30', fee: 100 },
    { start: '2019-07-01', end: '2024-03-31', fee: 200 },
    { start: '2024-04-01', end: '9999-12-31', fee: 250 }
];

function calculateDuesForPeriod(startDateStr: string, endDateStr: string): { totalDues: number; monthlyBreakdown: { month: Date, fee: number }[] } {
    const startDate = startOfMonth(parse(startDateStr, 'yyyy-MM-dd', new Date()));
    const endDate = startOfMonth(parse(endDateStr, 'yyyy-MM-dd', new Date()));
    let totalDues = 0;
    const monthlyBreakdown: { month: Date, fee: number }[] = [];
    if (!isValid(startDate) || !isValid(endDate) || startDate > endDate) return { totalDues: 0, monthlyBreakdown: [] };
    const totalMonths = differenceInMonths(endDate, startDate) + 1;

    for (let i = 0; i < totalMonths; i++) {
        const monthDate = addMonths(startDate, i);
        const applicableTier = feeStructure.find(tier => {
            const tierStart = parse(tier.start, 'yyyy-MM-dd', new Date());
            const tierEnd = parse(tier.end, 'yyyy-MM-dd', new Date());
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
            joined: format(new Date(data.joined), 'dd/MM/yyyy'),
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
    async function addUserAction(formData: FormData) { 'use server'; /* ... full logic ... */ }
    async function deleteUserAction(userId: string) { 'use server'; /* ... full logic ... */ }
    async function updateUserAction(userId: string, formData: FormData) { 'use server'; /* ... full logic ... */ }
    async function markAsDeceasedAction(userId: string, formData: FormData) { 'use server'; /* ... full logic ... */ }
    async function sendPaymentLinkAction(userId: string) { 'use server'; /* ... full logic ... */ }
    async function reverseLastPaymentAction(userId: string) { 'use server'; /* ... full logic ... */ }
    async function recalculateBalanceUntilDateAction(userId: string, formData: FormData) { 'use server'; /* ... full logic ... */ }
    async function getPendingBillsForUserAction(userId: string): Promise<Bill[]> { 'use server'; /* ... full logic ... */ }
    async function markBillAsPaidAction(userId: string, billId: string, billAmount: number) { 'use server'; /* ... full logic ... */ }
    
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
