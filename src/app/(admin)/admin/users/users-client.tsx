'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, Search, MoreHorizontal, CreditCard, Loader2, Edit } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import type { User, Bill } from '@/lib/data-service';
import { 
    addUserAction, 
    updateUserAction,
    getPendingBillsForUserAction,
    markBillAsPaidAction
} from './actions';

type UsersClientProps = {
    users: User[];
};

export default function UsersClient({ users: initialUsers }: UsersClientProps) {
    const [filteredUsers, setFilteredUsers] = useState(initialUsers);
    const [isAddUserOpen, setIsAddUserOpen] = useState(false);
    const [isEditUserOpen, setIsEditUserOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isPayBillsOpen, setIsPayBillsOpen] = useState(false);
    const [pendingBills, setPendingBills] = useState<Bill[]>([]);
    const [isLoadingBills, setIsLoadingBills] = useState(false);
    const [payingBillId, setPayingBillId] = useState<string | null>(null);

    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const addUserFormRef = useRef<HTMLFormElement>(null);
    const editUserFormRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        setFilteredUsers(initialUsers);
    }, [initialUsers]);

    const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
        const searchTerm = event.target.value.toLowerCase();
        setFilteredUsers(
            initialUsers.filter(user =>
                user.name.toLowerCase().includes(searchTerm) ||
                (user.email && user.email.toLowerCase().includes(searchTerm))
            )
        );
    };

    const openEditUserDialog = (user: User) => {
        setSelectedUser(user);
        setIsEditUserOpen(true);
    };

    const openPayBillsDialog = async (user: User) => {
        setSelectedUser(user);
        setIsPayBillsOpen(true);
        setIsLoadingBills(true);
        try {
            const bills = await getPendingBillsForUserAction(user.id);
            setPendingBills(bills);
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "Could not fetch pending bills." });
            setIsPayBillsOpen(false);
        } finally {
            setIsLoadingBills(false);
        }
    };

    const handleMarkBillAsPaid = (billId: string, billAmount: number) => {
        if (!selectedUser) return;
        setPayingBillId(billId);
        startTransition(async () => {
            const result = await markBillAsPaidAction(selectedUser.id, billId, billAmount);
             if (result.success) {
                toast({ title: "Success", description: result.message });
                const updatedBills = pendingBills.filter(bill => bill.id !== billId);
                setPendingBills(updatedBills);
                if (updatedBills.length === 0) {
                    setIsPayBillsOpen(false);
                }
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
            setPayingBillId(null);
        });
    };

    const handleUpdateUser = async (formData: FormData) => {
        if (!selectedUser) return;
        startTransition(async () => {
            const result = await updateUserAction(selectedUser.id, formData);
            if (result.success) {
                toast({ title: "User Updated", description: result.message });
                setIsEditUserOpen(false);
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
        });
    };

    const handleAddUser = async (formData: FormData) => {
        startTransition(async () => {
            const result = await addUserAction(formData);
            if (result.success) {
                toast({ title: "User Added", description: result.message });
                setIsAddUserOpen(false);
                addUserFormRef.current?.reset();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
        });
    };

    return (
        <>
            <main className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold font-headline tracking-tight">User Management</h2>
                        <p className="text-muted-foreground">Manage all committee members and their payment records.</p>
                    </div>
                     <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                        <DialogTrigger asChild>
                            <Button><PlusCircle className="mr-2 h-4 w-4" /> Add User</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add New User</DialogTitle>
                            </DialogHeader>
                            <form ref={addUserFormRef} action={handleAddUser}>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="add-name" className="text-right">Name</Label>
                                        <Input id="add-name" name="name" className="col-span-3" placeholder="Full Name" required />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="add-phone" className="text-right">Phone</Label>
                                        <Input id="add-phone" name="phone" className="col-span-3" placeholder="Phone Number" required />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="add-email" className="text-right">Email</Label>
                                        <Input id="add-email" name="email" type="email" className="col-span-3" placeholder="user@example.com" required />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="add-password" className="text-right">Password</Label>
                                        <Input id="add-password" name="password" type="password" className="col-span-3" placeholder="********" required />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="add-joining_date" className="text-right">Joining Date</Label>
                                        <Input id="add-joining_date" name="joining_date" type="date" className="col-span-3" required />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button type="submit" disabled={isPending}>
                                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Add User
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                <Card>
                    <CardHeader>
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search users by name or email..." className="pl-10" onChange={handleSearch} />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Joined</TableHead>
                                    <TableHead>Last Paid</TableHead>
                                    <TableHead className="text-right">Pending</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">{user.name}<br /><span className="text-xs text-muted-foreground">{user.email}</span></TableCell>
                                        <TableCell>
                                            <Badge variant={user.status === 'paid' ? 'default' : user.status === 'deceased' ? 'destructive' : 'secondary'}>
                                                {user.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{user.joined}</TableCell>
                                        <TableCell>{user.lastPaidOn}</TableCell>
                                        <TableCell className="text-right text-destructive font-semibold">₹{user.pending.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <span className="sr-only">Open menu</span>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => openPayBillsDialog(user)}>
                                                        <CreditCard className="mr-2 h-4 w-4" />
                                                        <span>Pay Pending Bills</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => openEditUserDialog(user)}>
                                                        <Edit className="mr-2 h-4 w-4" />
                                                        <span>Edit User</span>
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </main>

            <Dialog open={isPayBillsOpen} onOpenChange={setIsPayBillsOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Pay Pending Bills for {selectedUser?.name}</DialogTitle>
                        <DialogDescription>
                           Click 'Mark as Paid' for each bill the user has paid. The balances will update automatically.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 max-h-[60vh] overflow-y-auto space-y-2">
                        {isLoadingBills ? (
                            <div className="flex justify-center items-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/>
                            </div>
                        ) : pendingBills.length > 0 ? (
                            pendingBills.map(bill => (
                                <div key={bill.id} className="flex items-center justify-between rounded-md border p-3">
                                    <div>
                                        <p className="font-medium">{bill.notes}</p>
                                        <p className="text-sm text-muted-foreground">{bill.date}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <Badge variant="destructive">₹{bill.amount.toFixed(2)}</Badge>
                                        <Button
                                            size="sm"
                                            onClick={() => handleMarkBillAsPaid(bill.id, bill.amount)}
                                            disabled={isPending}
                                        >
                                            {payingBillId === bill.id ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                                            ) : (
                                                <CreditCard className="mr-2 h-4 w-4"/>
                                            )}
                                            Mark as Paid
                                        </Button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-muted-foreground py-8">No pending bills for this user. Great!</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit User: {selectedUser?.name}</DialogTitle>
                    </DialogHeader>
                    <form ref={editUserFormRef} action={handleUpdateUser}>
                        <div className="grid gap-4 py-4">
                           <div className="grid grid-cols-4 items-center gap-4">
                               <Label htmlFor="edit-name" className="text-right">Name</Label>
                               <Input id="edit-name" name="name" className="col-span-3" defaultValue={selectedUser?.name} required />
                           </div>
                           <div className="grid grid-cols-4 items-center gap-4">
                               <Label htmlFor="edit-email" className="text-right">Email</Label>
                               <Input id="edit-email" name="email" type="email" className="col-span-3" defaultValue={selectedUser?.email} required />
                           </div>
                           <div className="grid grid-cols-4 items-center gap-4">
                               <Label htmlFor="edit-phone" className="text-right">Phone</Label>
                               <Input id="edit-phone" name="phone" className="col-span-3" defaultValue={selectedUser?.phone} required />
                           </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
