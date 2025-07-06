'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firebaseError } from '@/lib/firebase';
import { getUserDashboardData, UserDashboardData, PaymentHistoryItem, createPaymentLink } from './actions';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight, CheckCircle, Clock, Loader2 } from "lucide-react";
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export default function UserDashboard() {
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<{user: UserDashboardData, paymentHistory: PaymentHistoryItem[]} | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (firebaseError || !auth) {
        console.error(firebaseError);
        setLoading(false);
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (currentUser.email && currentUser.email.toLowerCase() === 'sheikhhayyaan@gmail.com') {
          router.replace('/admin/dashboard');
          return;
        }
        try {
            const data = await getUserDashboardData(currentUser.uid);
            setDashboardData(data);
        } catch(error) {
            console.error("Failed to fetch dashboard data:", error);
            setDashboardData(null);
        } finally {
            setLoading(false);
        }
      } else {
        router.replace('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handlePayNow = async () => {
    if (!auth || !auth.currentUser) return;
    setIsPaying(true);

    try {
        const result = await createPaymentLink(auth.currentUser.uid);
        if (result.success && result.url) {
            window.location.href = result.url; // Use window.location to redirect to external site
        } else {
            toast({
                variant: 'destructive',
                title: 'Payment Error',
                description: result.message || 'Could not initiate payment.'
            });
            setIsPaying(false);
        }
    } catch (error) {
        console.error('Payment initiation failed:', error);
        toast({
            variant: 'destructive',
            title: 'Payment Error',
            description: 'An unexpected error occurred. Please try again.'
        });
        setIsPaying(false);
    }
  };
  
  if (firebaseError) {
    return (
        <div className="container mx-auto p-4 md:p-8 text-center">
            <Card className="max-w-md mx-auto">
                <CardHeader>
                    <CardTitle className="text-2xl text-destructive">Configuration Error</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-destructive-foreground">{firebaseError}</p>
                    <p className="mt-4 text-sm text-muted-foreground">
                        Please contact the site administrator or check your environment variables.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
  }

  if (loading) {
    return <DashboardLoadingSkeleton />;
  }

  if (!dashboardData || !dashboardData.user) {
    return (
      <div className="container mx-auto p-4 md:p-8 text-center">
        <h1 className="text-2xl font-bold">Could not load dashboard data.</h1>
        <p className="text-muted-foreground">This can happen if your user profile is not yet fully set up. Please contact an administrator.</p>
      </div>
    );
  }
  
  const { user: userData, paymentHistory } = dashboardData;
  const hasPendingPayment = userData.pending > 0;

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-headline font-bold text-foreground">Assalamu Alaikum, {userData.name}</h1>
        <p className="text-muted-foreground">Welcome to your welfare dashboard. Here's your payment summary.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <Card className="border-green-500/50 border-2 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">₹{userData.totalPaid.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Thank you for your contributions.</p>
          </CardContent>
        </Card>
        <Card className={hasPendingPayment ? "border-destructive/50 border-2 shadow-lg" : "border-gray-500/50"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payment Pending</CardTitle>
            <Clock className={`h-5 w-5 ${hasPendingPayment ? 'text-destructive' : 'text-gray-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${hasPendingPayment ? 'text-destructive' : ''}`}>₹{userData.pending.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{hasPendingPayment ? "Please clear your dues." : "All dues are clear."}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <p className="text-sm text-muted-foreground">A record of your payments.</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hasPendingPayment && (
                <TableRow className='bg-destructive/5'>
                  <TableCell className="font-medium">-</TableCell>
                  <TableCell>Outstanding Dues</TableCell>
                  <TableCell>
                    <Badge variant="destructive">Pending</Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">₹{userData.pending.toFixed(2)}</TableCell>
                </TableRow>
              )}
              {paymentHistory.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{payment.date}</TableCell>
                  <TableCell className="font-medium">{payment.notes}</TableCell>
                  <TableCell>
                    <Badge variant='default' className='bg-green-600'>Paid</Badge>
                  </TableCell>
                  <TableCell className="text-right">₹{payment.amount.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {!hasPendingPayment && paymentHistory.length === 0 && (
                <TableRow>
                    <TableCell colSpan={4} className="text-center h-24">No payment history found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        {hasPendingPayment && (
            <CardFooter className="border-t px-6 py-4 bg-muted/20">
                <div className="flex justify-between items-center w-full">
                    <p className="text-muted-foreground font-medium">You have a pending payment.</p>
                     <Button onClick={handlePayNow} disabled={isPaying}>
                        {isPaying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Pay Now 
                        <ArrowRight className="ml-2 h-4 w-4" />
                     </Button>
                </div>
            </CardFooter>
        )}
      </Card>
    </div>
  );
}

function DashboardLoadingSkeleton() {
    return (
        <div className="container mx-auto p-4 md:p-8 animate-pulse">
            <div className="mb-8 space-y-2">
                <Skeleton className="h-8 w-1/2 rounded-lg" />
                <Skeleton className="h-4 w-3/4 rounded-lg" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 mb-8">
                <Card>
                    <CardHeader><Skeleton className="h-5 w-1/4 rounded-lg" /></CardHeader>
                    <CardContent><Skeleton className="h-8 w-1/2 rounded-lg" /></CardContent>
                </Card>
                <Card>
                    <CardHeader><Skeleton className="h-5 w-1/4 rounded-lg" /></CardHeader>
                    <CardContent><Skeleton className="h-8 w-1/2 rounded-lg" /></CardContent>
                </Card>
            </div>
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-1/3 mb-2 rounded-lg" />
                    <Skeleton className="h-4 w-1/2 rounded-lg" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-full rounded-lg" />
                        <Skeleton className="h-10 w-full rounded-lg" />
                        <Skeleton className="h-10 w-full rounded-lg" />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
