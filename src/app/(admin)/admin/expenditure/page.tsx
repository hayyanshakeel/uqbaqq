import { getAllExpenditures } from "@/lib/data-service";
import ExpenditureClient from "./expenditure-client";

export default async function ExpenditurePage() {
    const expenses = await getAllExpenditures();

    return <ExpenditureClient initialExpenses={expenses} />;
}
