export const dynamic = 'force-dynamic';

import { getAllUsers } from "@/lib/data-service";
// FIX: Import `UsersClient` as a named export using curly braces {}
import { UsersClient } from "./users-client";
// FIX: Import the server actions that will be passed to the client component
import { addUserAction, deleteUserAction } from "./actions";

export default async function UsersPage() {
    const users = await getAllUsers();

    // FIX: Pass the imported server actions as props to the UsersClient component.
    // The client component needs these functions to perform its tasks.
    return (
        <UsersClient 
            initialUsers={users} 
            addUserAction={addUserAction}
            deleteUserAction={deleteUserAction}
        />
    );
}
