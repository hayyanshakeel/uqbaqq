import { getAdminDb } from '@/lib/firebase-admin';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// This function fetches the payment and user data from Firestore
async function getPaymentDetails(paymentId: string) {
    const adminDb = getAdminDb();
    const paymentDoc = await adminDb.collection('payments').doc(paymentId).get();

    if (!paymentDoc.exists) {
        return null;
    }

    const paymentData = paymentDoc.data()!;
    const userDoc = await adminDb.collection('users').doc(paymentData.userId).get();
    
    if (!userDoc.exists) {
        return { payment: paymentData, user: null };
    }

    return {
        payment: paymentData,
        user: userDoc.data(),
    };
}

// This is the server component for the receipt page
export default async function ReceiptPage({ params }: { params: { paymentId: string } }) {
    const details = await getPaymentDetails(params.paymentId);

    if (!details) {
        notFound();
    }

    const { payment, user } = details;
    const paymentDate = payment.date?.toDate ? format(payment.date.toDate(), 'PPP') : 'N/A';

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-8 flex items-center justify-center">
            <Card className="w-full max-w-2xl mx-auto shadow-lg">
                <CardHeader className="bg-gray-50 dark:bg-gray-800 p-6 rounded-t-lg">
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle className="text-3xl font-bold text-gray-800 dark:text-gray-100">Payment Receipt</CardTitle>
                            <CardDescription className="text-gray-500 dark:text-gray-400">UQBA COMMITTEE</CardDescription>
                        </div>
                        <div className="text-right">
                            <p className="font-semibold text-gray-700 dark:text-gray-200">Receipt #{params.paymentId.substring(0, 8)}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Date: {paymentDate}</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <h3 className="font-semibold text-gray-600 dark:text-gray-300 mb-2">Billed To</h3>
                            <p className="text-gray-800 dark:text-gray-100 font-medium">{user?.name || 'N/A'}</p>
                            <p className="text-gray-600 dark:text-gray-400">{user?.email || 'No email'}</p>
                            <p className="text-gray-600 dark:text-gray-400">{user?.phone || 'No phone'}</p>
                        </div>
                        <div className="text-left md:text-right">
                             <h3 className="font-semibold text-gray-600 dark:text-gray-300 mb-2">Payment Details</h3>
                             <p className="text-gray-800 dark:text-gray-100">
                                <span className="font-medium">Payment ID: </span> 
                                {payment.razorpay_payment_id || 'Manual Entry'}
                            </p>
                             <p className="text-gray-800 dark:text-gray-100">
                                <span className="font-medium">Type: </span> 
                                {payment.type === 'razorpay' ? 'Online (Razorpay)' : 'Manual'}
                            </p>
                        </div>
                    </div>

                    <Separator className="my-6" />

                    <div>
                        <h3 className="font-semibold text-lg mb-4 text-gray-700 dark:text-gray-200">Transaction Summary</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600 dark:text-gray-400">Description:</span>
                                <span className="font-medium text-gray-800 dark:text-gray-100 text-right">{payment.notes || 'Payment'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600 dark:text-gray-400">Amount Paid:</span>
                                <span className="font-medium text-gray-800 dark:text-gray-100">₹{payment.amount?.toFixed(2) || '0.00'}</span>
                            </div>
                        </div>
                    </div>

                    <Separator className="my-6" />

                    <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">TOTAL PAID</p>
                        <p className="text-4xl font-extrabold text-green-600">₹{payment.amount?.toFixed(2) || '0.00'}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
