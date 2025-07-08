'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreditCard, History, Receipt, AlertCircle, Loader2 } from 'lucide-react';
import { createPaymentLink, createPaymentLinkForBill, getReceiptUrl } from './actions';
import { UserDashboardData, PaymentHistoryItem } from './actions';
import { Bill } from '@/lib/data-service';

interface DashboardClientProps {
    dashboardData: {
        user: UserDashboardData;
        paymentHistory: PaymentHistoryItem[];
        pendingBills: Bill[];
    };
    userId: string;
}

export default function DashboardClient({ dashboardData, userId }: DashboardClientProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [loadingBillId, setLoadingBillId] = useState<string | null>(null);
    const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);
    const { user, paymentHistory, pendingBills } = dashboardData;

    const handlePayment = async () => {
        setIsLoading(true);
        try {
            const result = await createPaymentLink(userId);
            if (result.success && result.url) {
                window.open(result.url, '_blank');
            } else {
                alert(result.message || 'Failed to create payment link');
            }
        } catch (error) {
            console.error('Payment error:', error);
            alert('An error occurred while processing payment');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBillPayment = async (billId: string) => {
        setLoadingBillId(billId);
        try {
            const result = await createPaymentLinkForBill(userId, billId);
            if (result.success && result.url) {
                window.open(result.url, '_blank');
            } else {
                alert(result.message || 'Failed to create payment link');
            }
        } catch (error) {
            console.error('Bill payment error:', error);
            alert('An error occurred while processing payment');
        } finally {
            setLoadingBillId(null);
        }
    };
    
    const handleViewReceipt = async (payment: PaymentHistoryItem) => {
        // Use the unique payment document ID for loading state
        setLoadingReceiptId(payment.id); 
        try {
            // If it's a Razorpay payment and has a direct URL, use it.
            if (payment.receipt_url) {
                window.open(payment.receipt_url, '_blank');
                return; 
            }
            // If it's a Razorpay payment without a stored URL, fetch it.
            if (payment.razorpay_payment_id) {
                 const result = await getReceiptUrl(payment.razorpay_payment_id);
                if (result.success && result.url) {
                    window.open(result.url, '_blank');
                } else {
                    alert(result.message || 'Could not retrieve Razorpay receipt.');
                }
                return;
            }
            // Otherwise, it's a manual payment, so navigate to our internal receipt page.
            router.push(`/receipt/${payment.id}`);

        } catch (error) {
            console.error('Receipt error:', error);
            alert('An error occurred while fetching the receipt.');
        } finally {
            setLoadingReceiptId(null);
        }
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Welcome, {user.name}!</h1>
                    <p className="text-muted-foreground">Manage your payments and view your history</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                            ₹{user.totalPaid.toLocaleString()}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Amount</CardTitle>
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">
                            ₹{user.pending.toLocaleString()}
                        </div>
                        {user.pending > 0 && (
                            <Button 
                                onClick={handlePayment}
                                disabled={isLoading}
                                className="mt-2"
                            >
                                {isLoading ? 'Processing...' : 'Pay Now'}
                            </Button>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Pending Bills */}
            {pendingBills.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Receipt className="h-5 w-5" />
                            Pending Bills
                        </CardTitle>
                        <CardDescription>
                            Outstanding bills that need payment
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {pendingBills.map((bill) => (
                                <div key={bill.id} className="flex items-center justify-between p-3 border rounded">
                                    <div className="flex-1">
                                        <div className="font-medium">{bill.notes}</div>
                                        <div className="text-sm text-muted-foreground">{bill.date}</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge variant="destructive">
                                            ₹{bill.amount.toLocaleString()}
                                        </Badge>
                                        <Button
                                            size="sm"
                                            onClick={() => handleBillPayment(bill.id)}
                                            disabled={loadingBillId === bill.id}
                                        >
                                            {loadingBillId === bill.id ? 'Processing...' : 'Pay'}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Payment History */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Payment History
                    </CardTitle>
                    <CardDescription>
                        Your recent payment transactions
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {paymentHistory.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No payment history found
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {paymentHistory.map((payment) => (
                                <div key={payment.id} className="flex items-center justify-between p-3 border rounded">
                                    <div className="flex-1">
                                        <div className="font-medium">{payment.notes}</div>
                                        <div className="text-sm text-muted-foreground">
                                            {payment.date}
                                            {payment.razorpay_payment_id && (
                                                <span className="ml-2 text-xs">
                                                    ID: {payment.razorpay_payment_id}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary">
                                            ₹{payment.amount.toLocaleString()}
                                        </Badge>
                                        {/* This button will now show for ALL payments */}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleViewReceipt(payment)}
                                            disabled={loadingReceiptId === payment.id}
                                        >
                                            {loadingReceiptId === payment.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Receipt className="h-4 w-4" />
                                            )}
                                            <span className="ml-2 hidden sm:inline">Receipt</span>
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
