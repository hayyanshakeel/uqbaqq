export const dynamic = 'force-dynamic';

import { getBillingSettings } from './actions';
import SettingsClient from './settings-client';

export default async function SettingsPage() {
    // Fetch the current setting from the database on the server
    const { monthlyAmount } = await getBillingSettings();

    // Render the client component and pass the fetched amount as a prop
    return <SettingsClient initialMonthlyAmount={monthlyAmount} />;
}
