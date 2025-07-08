'use client';

import { useEffect, useState, Suspense } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firebaseError } from '@/lib/firebase';
import { getUserDashboardData, UserDashboardData, PaymentHistoryItem, createPaymentLink, createPaymentLinkForBill, Bill } from './actions';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight, CheckCircle, Clock, Loader2, Download, FileText } from "lucide-react";
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [dashboardData, setDashboardData] = useState<{user: UserDashboardData, paymentHistory: PaymentHistoryItem[], pendingBills: Bill[]} | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaying, setIsPaying] = useState<string | boolean>(false); // Can be true, false, or a billId
  const [isVerifying, setIsVerifying] = useState(false);

  const refreshDashboardData = async (userId: string) => {
    try {
      const data = await getUserDashboardData(userId);
      setDashboardData(data);
    } catch (error) {
      console.error("Failed to refresh dashboard data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not refresh dashboard data." });
    }
  };

  useEffect(() => {
    if (firebaseError || !auth) {
      console.error(firebaseError);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        await refreshDashboardData(currentUser.uid);
        setLoading(false);

        const paymentStatus = searchParams.get('razorpay_payment_link_status');
        if (paymentStatus === 'paid') {
          setIsVerifying(true);
          toast({ title: "Payment Successful", description: "Verifying and updating your dashboard..." });

          const timer = setTimeout(() => {
            refreshDashboardData(currentUser.uid).then(() => {
              setIsVerifying(false);
              router.replace('/dashboard');
            });
          }, 3000);

          return () => clearTimeout(timer);
        }
      } else {
        router.replace('/login');
      }
    });

    return () => unsubscribe();
  }, [router, searchParams, toast]);

  const handleDownloadReceipt = (payment: PaymentHistoryItem, userName: string) => {
    const receiptContent = `
      <html>
        <head>
          <title>Payment Receipt - ${payment.razorpay_payment_id || payment.id}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 2rem; background-color: #f9fafb; color: #111827; }
            .container { max-width: 600px; margin: auto; background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); position: relative; overflow: hidden; }
            h1 { font-size: 1.5rem; color: #111827; margin-bottom: 0.5rem; border-bottom: 2px solid #d1d5db; padding-bottom: 0.5rem; }
            .details { margin-top: 1.5rem; }
            .detail-item { display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid #f3f4f6; }
            .detail-item span:first-child { font-weight: 500; color: #4b5563; }
            .detail-item span:last-child { font-weight: 600; text-align: right; }
            .total { font-size: 1.25rem; font-weight: bold; text-align: right; margin-top: 1.5rem; }
            .footer { text-align: center; margin-top: 2rem; font-size: 0.875rem; color: #6b7281; }
            .paid-stamp {
              position: absolute;
              top: 90px;
              right: -50px;
              font-size: 3rem;
              font-weight: bold;
              color: #16a34a;
              border: 5px solid #16a34a;
              padding: 0.5rem 2rem;
              transform: rotate(-30deg);
              opacity: 0.15;
              text-transform: uppercase;
              z-index: 1;
              pointer-events: none;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="paid-stamp">Paid</div>
            <h1>Uqba Bill</h1>
            <p class="footer">Payment Receipt</p>
            <div class="details">
              <div class="detail-item"><span>Payment ID</span> <span>${payment.razorpay_payment_id || payment.id}</span></div>
              <div class="detail-item"><span>Billed To</span> <span>${userName}</span></div>
              <div class="detail-item"><span>Payment Date</span> <span>${payment.date}</span></div>
              <div class="detail-item"><span>Description</span> <span>${payment.notes}</span></div>
            </div>
            <div class="total">
              <span>Amount Paid:</span>
              <span>₹${payment.amount.toFixed(2)}</span>
            </div>
            <div class="footer">
              Thank you for your contribution.
            </div>
          </div>
        </body>
      </html>
    `;
    const receiptWindow = window.open('', '_blank');
    receiptWindow?.document.write(receiptContent);
    receiptWindow?.document.close();
    receiptWindow?.focus();
  };

  const handlePay = async (billId: string | null = null) => {
    if (!auth || !auth.currentUser) return;
    setIsPaying(billId || true);
    
    try {
      const result = billId 
        ? await createPaymentLinkForBill(auth.currentUser.uid, billId)
        : await createPaymentLink(auth.currentUser.uid);

      if (result.success && result.url) {
        window.location.href = result.url;
      } else {
        toast({ variant: 'destructive', title: 'Payment Error', description: result.message || 'Could not initiate payment.' });
        setIsPaying(false);
      }
    } catch (error) {
      console.error('Payment initiation failed:', error);
      toast({ variant: 'destructive', title: 'Payment Error', description: 'An unexpected error occurred. Please try again.' });
      setIsPaying(false);
    }
  };

  if (isVerifying) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <h1 className="text-2xl font-bold">Verifying your payment...</h1>
        <p className="text-muted-foreground">Please wait, this may take a few seconds.</p>
      </div>
    );
  }
  
  if (firebaseError) {
    return (
      <div className="container mx-auto p-4 md:p-8 text-center">
        <Card className="max-w-md mx-auto"><CardHeader><CardTitle className="text-2xl text-destructive">Configuration Error</CardTitle></CardHeader><CardContent><p>{firebaseError}</p></CardContent></Card>
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
        <p className="text-muted-foreground">Please contact an administrator.</p>
      </div>
    );
  }
  
  const { user: userData, paymentHistory, pendingBills } = dashboardData;
  const hasPendingPayment = userData.pending > 0;

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-headline font-bold text-foreground">Assalamu Alaikum, {userData.name}</h1>
        <p className="text-muted-foreground">Welcome to your welfare dashboard. Here's your payment summary.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <Card className="border-green-500/50 border-2 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Paid</CardTitle><CheckCircle className="h-5 w-5 text-green-500" /></CardHeader>
          <CardContent><div className="text-3xl font-bold">₹{userData.totalPaid.toFixed(2)}</div><p className="text-xs text-muted-foreground">Thank you for your contributions.</p></CardContent>
        </Card>
        <Card className={hasPendingPayment ? "border-destructive/50 border-2 shadow-lg" : "border-gray-500/50"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Payment Pending</CardTitle><Clock className={`h-5 w-5 ${hasPendingPayment ? 'text-destructive' : 'text-gray-500'}`} /></CardHeader>
          <CardContent><div className={`text-3xl font-bold ${hasPendingPayment ? 'text-destructive' : ''}`}>₹{userData.pending.toFixed(2)}</div><p className="text-xs text-muted-foreground">{hasPendingPayment ? "Please clear your dues." : "All dues are clear."}</p></CardContent>
        </Card>
      </div>
      {hasPendingPayment && (
          <Card className='mb-8'>
            <CardHeader><CardTitle>Pending Bills</CardTitle><p className="text-sm text-muted-foreground">You can pay for individual bills below.</p></CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pendingBills.map(bill => (
                            <TableRow key={bill.id}>
                                <TableCell>{bill.date}</TableCell>
                                <TableCell className="font-medium">{bill.notes}</TableCell>
                                <TableCell className="text-right font-semibold">₹{bill.amount.toFixed(2)}</TableCell>
                                <TableCell className="text-right">
                                    <Button onClick={() => handlePay(bill.id)} disabled={!!isPaying} size="sm">
                                        {isPaying === bill.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                                        Pay
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
             <CardFooter className="border-t px-6 py-4 bg-muted/20"><div className="flex justify-between items-center w-full"><p className="text-muted-foreground font-medium">Or pay the total outstanding amount.</p><Button onClick={() => handlePay(null)} disabled={!!isPaying}>{isPaying === true && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Pay Total<ArrowRight className="ml-2 h-4 w-4" /></Button></div></CardFooter>
          </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Payment History</CardTitle><p className="text-sm text-muted-foreground">A record of your past payments.</p></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Receipt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentHistory.map((payment) => (<TableRow key={payment.id}><TableCell>{payment.date}</TableCell><TableCell className="font-medium">{payment.notes}</TableCell><TableCell><Badge variant='default' className='bg-green-600'>Paid</Badge></TableCell><TableCell className="text-right">₹{payment.amount.toFixed(2)}</TableCell>
                <TableCell className="text-right">
                    <Button variant="outline" size="icon" onClick={() => handleDownloadReceipt(payment, userData.name)}>
                        <Download className="h-4 w-4" />
                        <span className="sr-only">Download Receipt</span>
                    </Button>
                </TableCell>
              </TableRow>))}
              {paymentHistory.length === 0 && (<TableRow><TableCell colSpan={5} className="text-center h-24">No payment history found.</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function UserDashboardPage() {
    return (
        <Suspense fallback={<DashboardLoadingSkeleton />}>
            <Dashboard />
        </Suspense>
    );
}

function DashboardLoadingSkeleton() {
    return (
        <div className="container mx-auto p-4 md:p-8 animate-pulse">
            <div className="mb-8 space-y-2"><Skeleton className="h-8 w-1/2 rounded-lg" /><Skeleton className="h-4 w-3/4 rounded-lg" /></div>
            <div className="grid gap-4 md:grid-cols-2 mb-8"><Card><CardHeader><Skeleton className="h-5 w-1/4 rounded-lg" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2 rounded-lg" /></CardContent></Card><Card><CardHeader><Skeleton className="h-5 w-1/4 rounded-lg" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2 rounded-lg" /></CardContent></Card></div>
            <Card><CardHeader><Skeleton className="h-6 w-1/3 mb-2 rounded-lg" /><Skeleton className="h-4 w-1/2 rounded-lg" /></CardHeader><CardContent><div className="space-y-2"><Skeleton className="h-10 w-full rounded-lg" /><Skeleton className="h-10 w-full rounded-lg" /><Skeleton className="h-10 w-full rounded-lg" /></div></CardContent></Card>
        </div>
    );
}
