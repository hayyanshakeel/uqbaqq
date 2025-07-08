'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User as FirebaseAuthUser } from 'firebase/auth';
import { auth, firebaseError } from '@/lib/firebase';
import { getUserDashboardData, UserDashboardData, PaymentHistoryItem } from './actions';
import { Bill } from '@/lib/data-service';
import DashboardClient from './dashboard-client';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// A skeleton loader to show while the user data is being fetched.
// This improves the user experience by providing immediate feedback.
function DashboardLoadingSkeleton() {
    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Skeleton className="h-9 w-64 mb-2" />
                    <Skeleton className="h-5 w-80" />
                </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-8 w-32" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-8 w-24" />
                    </CardContent>
                </Card>
            </div>
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-64 mt-2" />
                </CardHeader>
                <CardContent className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                </CardContent>
            </Card>
        </div>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const [dashboardData, setDashboardData] = useState<{
        user: UserDashboardData;
        paymentHistory: PaymentHistoryItem[];
        pendingBills: Bill[];
    } | null>(null);
    const [currentUser, setCurrentUser] = useState<FirebaseAuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Handle cases where Firebase might not be configured correctly.
        if (firebaseError) {
            setError(firebaseError);
            setIsLoading(false);
            return;
        }

        if (!auth) {
            setError("Firebase Auth is not initialized. Please check your configuration.");
            setIsLoading(false);
            return;
        }

        // Set up a listener for Firebase authentication state changes.
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // If a user is logged in, set their data and fetch dashboard info.
                setCurrentUser(user);
                try {
                    const data = await getUserDashboardData(user.uid);
                    if (data) {
                        setDashboardData(data);
                    } else {
                        setError('Failed to load dashboard data. Your user profile may not be fully set up.');
                    }
                } catch (e: any) {
                    console.error("Error fetching dashboard data:", e);
                    setError(e.message || 'An unexpected error occurred while fetching your data.');
                }
            } else {
                // If no user is logged in, redirect to the login page.
                router.push('/login');
            }
            // Data fetching is complete, so we can stop showing the loading skeleton.
            setIsLoading(false);
        });

        // Clean up the listener when the component unmounts.
        return () => unsubscribe();
    }, [router]);

    // Show a loading skeleton while we wait for authentication and data.
    if (isLoading) {
        return <DashboardLoadingSkeleton />;
    }

    // Display a clear error message if something went wrong.
    if (error) {
        return (
            <div className="container mx-auto p-6 text-center">
                <h1 className="text-2xl font-bold text-destructive">Error Loading Dashboard</h1>
                <p className="mt-2 text-muted-foreground">{error}</p>
                <p className="mt-1 text-sm text-muted-foreground">Please try refreshing the page or contact support if the problem persists.</p>
            </div>
        );
    }

    // Ensure we have all the necessary data before rendering the main dashboard.
    if (!dashboardData || !currentUser) {
        return (
             <div className="container mx-auto p-6 text-center">
                <h1 className="text-2xl font-bold text-destructive">Could Not Load Dashboard</h1>
                <p className="mt-2 text-muted-foreground">Unable to retrieve your dashboard information at this time.</p>
            </div>
        )
    }

    // Render the main dashboard client with the fetched data.
    return <DashboardClient dashboardData={dashboardData} userId={currentUser.uid} />;
}
