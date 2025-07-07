'use client';

import { useState, useTransition } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { IndianRupee, Bell, Loader2, Send } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { updateBillingSettings } from './actions';

type Settings = {
    monthlyAmount: number;
    automaticReminders: boolean;
    manualBulkPayment: boolean;
};

type SettingsClientProps = {
    initialSettings: Settings;
};

export default function SettingsClient({ initialSettings }: SettingsClientProps) {
    const [monthlyAmount, setMonthlyAmount] = useState(initialSettings.monthlyAmount);
    const [automaticReminders, setAutomaticReminders] = useState(initialSettings.automaticReminders);
    const [manualBulkPayment, setManualBulkPayment] = useState(initialSettings.manualBulkPayment);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        formData.set('automaticReminders', automaticReminders ? 'on' : 'off');
        formData.set('manualBulkPayment', manualBulkPayment ? 'on' : 'off');

        startTransition(async () => {
            const result = await updateBillingSettings(formData);
            if (result.success) {
                toast({
                    title: "Settings Saved",
                    description: result.message,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: result.message,
                });
            }
        });
    };

    return (
        <main className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold font-headline tracking-tight">Settings</h2>

            <form onSubmit={handleFormSubmit} className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Billing Configuration</CardTitle>
                        <CardDescription>
                            Set the standard monthly payment amount for all members.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="monthly-amount">Monthly Bill Amount (₹)</Label>
                            <div className="relative">
                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                <Input
                                    id="monthly-amount"
                                    name="monthlyAmount"
                                    type="number"
                                    value={monthlyAmount}
                                    onChange={(e) => setMonthlyAmount(Number(e.target.value))}
                                    className="pl-10"
                                    required
                                />
                            </div>
                        </div>
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
                            <Switch
                                checked={automaticReminders}
                                onCheckedChange={setAutomaticReminders}
                                name="automaticReminders"
                            />
                        </div>
                        <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
                            <div className='space-y-0.5'>
                               <h3 className="font-medium">Manual Payment Links</h3>
                               <p className='text-sm text-muted-foreground'>
                                   Allow admins to send payment links for outstanding dues.
                               </p>
                            </div>
                             <Switch
                                checked={manualBulkPayment}
                                onCheckedChange={setManualBulkPayment}
                                name="manualBulkPayment"
                            />
                        </div>
                    </CardContent>
                </Card>
                 <div className="col-span-full">
                    <Button type="submit" disabled={isPending} className="w-full md:w-auto">
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save All Settings
                    </Button>
                </div>
            </form>
        </main>
    );
}
