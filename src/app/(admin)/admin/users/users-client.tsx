'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, Search, MoreHorizontal, Trash2, CreditCard, Loader2, Edit } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { User, Bill } from '@/lib/data-service';
import { addUserAction, deleteUserAction, getPendingBillsForUserAction, markBillAsPaidAction } from './actions';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type UsersClientProps = {
    initialUsers: User[];
    addUserAction: (formData: FormData) => Promise<{ success: boolean; message: string; }>;
    deleteUserAction: (userId: string) => Promise<{ success: boolean; message: string; }>;
};

export function UsersClient({ initialUsers, addUserAction, deleteUserAction }: UsersClientProps) {
    const [filteredUsers, setFilteredUsers] = useState(initialUsers);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [pendingBills, setPendingBills] = useState<Bill[]>([]);
    const [isAddUserOpen, setIsAddUserOpen] = useState(false);
    const [isPayBillsOpen, setIsPayBillsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{ action: () => void, title: string, description: string } | null>(null);
    
    const router = useRouter();
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setFilteredUsers(initialUsers);
    }, [initialUsers]);

    const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>, action: (formData: FormData) => void) => {
        e.preventDefault();
        action(new FormData(e.currentTarget));
    };

    const handleAction = (action: () => Promise<any>) => {
        startTransition(async () => {
            const result = await action();
            if (result.success) {
                toast({ title: 'Success', description: result.message });
                setIsConfirmOpen(false);
                router.refresh();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };

    const openPayBillsDialog = async (user: User) => {
        setSelectedUser(user);
        setIsPayBillsOpen(true);
        setIsLoading(true);
        const bills = await getPendingBillsForUserAction(user.id);
        setPendingBills(bills);
        setIsLoading(false);
    };

    const confirmAndDelete = (user: User) => {
        setConfirmAction({
            title: `Delete ${user.name}?`,
            description: "This will permanently delete the user and all their data.",
            action: () => handleAction(() => deleteUserAction(user.id))
        });
        setIsConfirmOpen(true);
    };
    
    return (
        <>
            <main className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold font-headline tracking-tight">User Management</h2>
                    <Button onClick={() => setIsAddUserOpen(true)}><PlusCircle className="mr-2 h-4 w-4" /> Add User</Button>
                </div>
                <Card>
                    <CardHeader>
                        <Input placeholder="Search users..." onChange={(e) => setFilteredUsers(initialUsers.filter(u => u.name.toLowerCase().includes(e.target.value.toLowerCase())))} />
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead>Last Paid</TableHead><TableHead className="text-right">Pending</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {filteredUsers.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell>{user.name}<br/><span className="text-xs text-muted-foreground">{user.email}</span></TableCell>
                                        <TableCell><Badge variant={user.status === 'paid' ? 'default' : 'destructive'}>{user.status}</Badge></TableCell>
                                        <TableCell>{user.joined}</TableCell>
                                        <TableCell>{user.lastPaidOn}</TableCell>
                                        <TableCell className="text-right text-destructive font-semibold">₹{user.pending.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => openPayBillsDialog(user)}><CreditCard className="mr-2 h-4 w-4"/>Pay Bills</DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => confirmAndDelete(user)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4"/>Delete User</DropdownMenuItem>
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

            <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
                    <form onSubmit={(e) => handleFormSubmit(e, addUserAction)} className="space-y-4 pt-4">
                        <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="add-name" className="text-right">Name</Label><Input id="add-name" name="name" required className="col-span-3"/></div>
                        <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="add-phone" className="text-right">Phone</Label><Input id="add-phone" name="phone" required className="col-span-3"/></div>
                        <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="add-email" className="text-right">Email</Label><Input id="add-email" name="email" type="email" required className="col-span-3"/></div>
                        <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="add-password" className="text-right">Password</Label><Input id="add-password" name="password" type="password" required className="col-span-3"/></div>
                        <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="add-joining_date" className="text-right">Joining Date</Label><Input id="add-joining_date" name="joining_date" type="date" required className="col-span-3"/></div>
                        <DialogFooter><Button type="submit" disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : "Save"}</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isPayBillsOpen} onOpenChange={setIsPayBillsOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Pay Bills for {selectedUser?.name}</DialogTitle></DialogHeader>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto p-4">
                        {isLoading ? <Loader2 className="animate-spin mx-auto"/> :
                            pendingBills.length > 0 ? pendingBills.map(bill => (
                                <div key={bill.id} className="flex items-center justify-between border p-2 rounded-md">
                                    <span>{bill.notes} ({bill.date})</span>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="destructive">₹{bill.amount}</Badge>
                                        <Button size="sm" onClick={() => handleAction(() => markBillAsPaidAction(selectedUser!.id, bill.id, bill.amount))} disabled={isPending}>{isPending ? <Loader2 className="animate-spin"/> : "Mark Paid"}</Button>
                                    </div>
                                </div>
                            )) : <p>No pending bills.</p>}
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                 <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle><AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setIsConfirmOpen(false)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => {actionToConfirm?.action(); setIsConfirmOpen(false);}} disabled={isPending}>{isPending ? <Loader2 className="animate-spin"/> : "Continue"}</AlertDialogAction>
                    </AlertDialogFooter>
                 </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
