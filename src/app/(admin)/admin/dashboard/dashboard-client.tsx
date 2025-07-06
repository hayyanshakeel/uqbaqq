'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Users, CreditCard, Activity } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

const icons = {
    DollarSign,
    Users,
    CreditCard,
    Activity
};

type KpiCard = {
    title: string;
    value: string;
    change: string;
    icon: keyof typeof icons;
};

type ChartData = {
    month: string;
    paid: number;
    pending: number;
};

type PendingUser = {
    id: string;
    name: string;
    email?: string;
    pending: number;
}

type DashboardClientProps = {
    kpiData: KpiCard[];
    chartData: ChartData[];
    pendingUsers: PendingUser[];
};

const chartConfig = {
  paid: {
    label: "Paid",
    color: "hsl(var(--chart-1))",
  },
  pending: {
    label: "Pending",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;


export default function DashboardClient({ kpiData, chartData, pendingUsers }: DashboardClientProps) {
    return (
        <main className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold font-headline tracking-tight">Dashboard</h2>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {kpiData.map((item, index) => {
                    const Icon = icons[item.icon];
                    return (
                        <Card key={index}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                                <Icon className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{item.value}</div>
                                <p className="text-xs text-muted-foreground">{item.change}</p>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <Card className="md:col-span-7">
                    <CardHeader>
                        <CardTitle>Payment Overview</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                       <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
                         <BarChart accessibilityLayer data={chartData}>
                           <XAxis
                             dataKey="month"
                             stroke="#888888"
                             fontSize={12}
                             tickLine={false}
                             axisLine={false}
                           />
                           <YAxis
                             stroke="#888888"
                             fontSize={12}
                             tickLine={false}
                             axisLine={false}
                             tickFormatter={(value) => `₹${value / 1000}K`}
                           />
                           <Tooltip cursor={{fill: 'hsl(var(--muted))'}} content={<ChartTooltipContent />} />
                           <Bar dataKey="paid" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                           <Bar dataKey="pending" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                         </BarChart>
                       </ChartContainer>
                    </CardContent>
                </Card>
                 <Card className="md:col-span-5">
                    <CardHeader>
                        <CardTitle>Users With Pending Payments</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {pendingUsers.length > 0 ? (
                            <div className="space-y-4">
                                {pendingUsers.map((user) => (
                                    <div key={user.id} className="flex items-center">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium leading-none">{user.name}</p>
                                            <p className="text-sm text-muted-foreground">{user.email || 'No email provided'}</p>
                                        </div>
                                        <div className="ml-auto font-medium text-destructive">₹{user.pending.toFixed(2)}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                <p>No users with pending payments. Great job!</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
