'use client';
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { IndianRupee, Bell } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

export default function SettingsPage() {
    const [monthlyAmount, setMonthlyAmount] = useState(250);
    const { toast } = useToast();

    const handleSaveSettings = () => {
        // In a real app, this would be a server action to update Firestore
        toast({
            title: "Settings Saved",
            description: `The monthly bill amount has been updated to ₹${monthlyAmount}.`,
        });
    };

    return (
        <main className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold font-headline tracking-tight">Settings</h2>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Billing Configuration</CardTitle>
                        <CardDescription>
                            Set the standard monthly payment amount for all members. This will reflect in the next billing cycle.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="monthly-amount">Monthly Bill Amount (₹)</Label>
                            <div className="relative">
                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                <Input 
                                    id="monthly-amount" 
                                    type="number" 
                                    value={monthlyAmount}
                                    onChange={(e) => setMonthlyAmount(Number(e.target.value))}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                        <Button onClick={handleSaveSettings}>Save Changes</Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>System & Notifications</CardTitle>
                        <CardDescription>
                            Configure system-wide settings and automated notifications.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
                            <div className='space-y-0.5'>
                               <h3 className="font-medium">Automatic Billing Cron</h3>
                               <p className='text-sm text-muted-foreground'>
                                   Enable to automatically generate bills on the 1st of every month.
                               </p>
                            </div>
                            <Switch defaultChecked />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
