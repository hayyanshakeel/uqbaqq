import { getDashboardKpis, getPaymentOverview, getUsersWithPendingPayments } from "@/lib/data-service";
import DashboardClient from "./dashboard-client";
import { DollarSign, Users, CreditCard, Activity } from "lucide-react";


export default async function DashboardPage() {
    const kpiDataPromise = getDashboardKpis();
    const chartDataPromise = getPaymentOverview();
    const pendingUsersPromise = getUsersWithPendingPayments();
    
    const [kpiData, chartData, pendingUsers] = await Promise.all([
        kpiDataPromise,
        chartDataPromise,
        pendingUsersPromise
    ]);

    const formattedKpiData = [
        { title: "Total Payments", value: `₹${kpiData.totalPayments.toFixed(2)}`, change: "+20.1% from last month", icon: 'DollarSign' as const },
        { title: "Paid Users", value: kpiData.paidUsers, change: "+180.1% from last month", icon: 'Users' as const },
        { title: "Pending Payments", value: kpiData.pendingUsers, change: "+19% from last month", icon: 'CreditCard' as const },
        { title: "Total Expenditure", value: `₹${kpiData.totalExpenditure.toFixed(2)}`, change: "+201 since last hour", icon: 'Activity' as const },
    ];

    return (
       <DashboardClient 
         kpiData={formattedKpiData} 
         chartData={chartData} 
         pendingUsers={pendingUsers} 
       />
    );
}
