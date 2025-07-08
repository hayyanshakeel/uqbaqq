import { redirect } from 'next/navigation';
import { getUserDashboardData } from './actions';
import DashboardClient from './dashboard-client';

// You'll need to implement this based on your auth system
// This is a placeholder - replace with your actual auth check
async function getCurrentUser() {
    // Replace this with your actual auth logic
    // For example, if using cookies:
    // const { cookies } = require('next/headers');
    // const userCookie = cookies().get('user');
    // return userCookie ? JSON.parse(userCookie.value) : null;
    
    // For now, returning a mock user - REPLACE THIS
    return { uid: 'mock-user-id' };
}

export default async function DashboardPage() {
    const user = await getCurrentUser();
    
    if (!user) {
        redirect('/login');
    }

    const dashboardData = await getUserDashboardData(user.uid);

    if (!dashboardData) {
        return (
            <div className="container mx-auto p-6">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-red-600">Error Loading Dashboard</h1>
                    <p className="mt-2 text-gray-600">Unable to load your dashboard data. Please try again later.</p>
                </div>
            </div>
        );
    }

    return <DashboardClient dashboardData={dashboardData} userId={user.uid} />;
}
