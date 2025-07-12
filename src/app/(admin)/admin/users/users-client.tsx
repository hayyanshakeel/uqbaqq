'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, Download, Search, MoreHorizontal, Trash2, CreditCard, CalendarPlus, Loader2, Undo2, Edit, HeartCrack, Send, SplitSquareHorizontal, RefreshCw } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import type { User, Bill } from '@/lib/data-service';
import { 
    addUserAction, 
    deleteUserAction, 
    addMissedBillAction, 
    reverseLastPaymentAction, 
    updateUserAction, 
    recalculateBalanceUntilDateAction, 
    markAsDeceasedAction, 
    sendPaymentLinkAction,
    splitMissedBillAction,
    getPendingBillsForUserAction,
    markBillAsPaidAction
} from './actions';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type UsersClientProps = {
    users: User[];
};

export default function UsersClient({ users: initialUsers }: UsersClientProps) {
    const [filteredUsers, setFilteredUsers] = useState(initialUsers);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [pendingBills, setPendingBills] = useState<Bill[]>([]);
    const [dialogs, setDialogs] = useState({
        add: false, edit: false, recalculate: false, addMissed: false,
        split: false, deceased: false, payBills: false
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{ action: () => void, title: string, description: string } | null>(null);
    
    const router = useRouter();
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setFilteredUsers(initialUsers);
    }, [initialUsers]);

    const handleAction = (action: Function, ...args: any) => {
        startTransition(async () => {
            const result = await action(...args);
            if (result.success) {
                toast({ title: 'Success', description: result.message });
                router.refresh(); // Refresh data on success
                setDialogs(prev => ({...prev, add: false, edit: false, recalculate: false, addMissed: false, split: false, deceased: false, payBills: false}));
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };
    
    const openDialog = (dialog: keyof typeof dialogs, user?: User) => {
        if (user) setSelectedUser(user);
        setDialogs(prev => ({...prev, [dialog]: true}));
    };

    const openPayBillsDialog = async (user: User) => {
        setSelectedUser(user);
        setDialogs(prev => ({ ...prev, payBills: true }));
        setIsLoading(true);
        const bills = await getPendingBillsForUserAction(user.id);
        setPendingBills(bills);
        setIsLoading(false);
    };
    
    const handleMarkBillAsPaid = (billId: string, billAmount: number) => {
        if (!selectedUser) return;
        startTransition(async () => {
            const result = await markBillAsPaidAction(selectedUser.id, billId, billAmount);
            if (result.success) {
                toast({ title: "Success", description: result.message });
                const updatedBills = pendingBills.filter(bill => bill.id !== billId);
                setPendingBills(updatedBills);
                if (updatedBills.length === 0) setDialogs(prev => ({...prev, payBills: false}));
                router.refresh();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
        });
    };

    const confirmAndDelete = (user: User) => {
        setConfirmAction({
            title: `Delete ${user.name}?`,
            description: "This action cannot be undone.",
            action: () => handleAction(deleteUserAction, user.id)
        });
        setIsConfirmOpen(true);
    };

    return (
        <>
            <main className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                 {/* Header */}
                 <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold font-headline tracking-tight">User Management</h2>
                        <p className="text-muted-foreground">Manage all committee members and their payment records.</p>
                    </div>
                    <Button onClick={() => openDialog('add')}><PlusCircle className="mr-2 h-4 w-4" /> Add User</Button>
                </div>
                
                {/* User Table */}
                <Card>
                    <CardHeader>
                        <Input placeholder="Search users..." onChange={(e) => setFilteredUsers(initialUsers.filter(u => u.name.toLowerCase().includes(e.target.value.toLowerCase())))} />
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
                                        <TableCell>{user.name}<br/><span className="text-xs text-muted-foreground">{user.email}</span></TableCell>
                                        <TableCell><Badge variant={user.status === 'paid' ? 'default' : 'destructive'}>{user.status}</Badge></TableCell>
                                        <TableCell>{user.joined}</TableCell>
                                        <TableCell>{user.lastPaidOn}</TableCell>
                                        <TableCell className="text-right text-destructive font-semibold">₹{user.pending.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => openPayBillsDialog(user)}><CreditCard className="mr-2 h-4 w-4"/>Pay Pending Bills</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onSelect={() => openDialog('edit', user)}><Edit className="mr-2 h-4 w-4"/>Edit User</DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => openDialog('recalculate', user)}><RefreshCw className="mr-2 h-4 w-4"/>Recalculate Balance</DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => handleAction(sendPaymentLinkAction, user.id)}><Send className="mr-2 h-4 w-4"/>Send Payment Link</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onSelect={() => handleAction(reverseLastPaymentAction, user.id)} className="text-amber-600 focus:text-amber-600"><Undo2 className="mr-2 h-4 w-4"/>Reverse Last Payment</DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => openDialog('deceased', user)} className="text-destructive focus:text-destructive"><HeartCrack className="mr-2 h-4 w-4"/>Mark as Deceased</DropdownMenuItem>
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

            {/* Pay Bills Dialog */}
            <Dialog open={dialogs.payBills} onOpenChange={(open) => setDialogs(prev => ({...prev, payBills: open}))}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Pay Bills for {selectedUser?.name}</DialogTitle></DialogHeader>
                    {isLoading ? <Loader2 className="animate-spin mx-auto"/> :
                        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                            {pendingBills.length > 0 ? pendingBills.map(bill => (
                                <div key={bill.id} className="flex items-center justify-between border p-2 rounded-md">
                                    <span>{bill.notes} ({bill.date})</span>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="destructive">₹{bill.amount}</Badge>
                                        <Button size="sm" onClick={() => handleMarkBillAsPaid(bill.id, bill.amount)} disabled={isPending}>{isPending ? <Loader2 className="animate-spin"/> : "Mark Paid"}</Button>
                                    </div>
                                </div>
                            )) : <p>No pending bills.</p>}
                        </div>
                    }
                </DialogContent>
            </Dialog>
            
            {/* All other dialogs */}
            <Dialog open={dialogs.edit} onOpenChange={(open) => setDialogs(prev => ({...prev, edit: open}))}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Edit {selectedUser?.name}</DialogTitle></DialogHeader>
                    <form action={(fd) => handleAction(updateUserAction, selectedUser!.id, fd)}>
                         <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="name" className="text-right">Name</Label><Input id="name" name="name" defaultValue={selectedUser?.name} className="col-span-3"/></div>
                            <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="email" className="text-right">Email</Label><Input id="email" name="email" type="email" defaultValue={selectedUser?.email} className="col-span-3"/></div>
                            <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="phone" className="text-right">Phone</Label><Input id="phone" name="phone" defaultValue={selectedUser?.phone} className="col-span-3"/></div>
                            <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="password" className="text-right">New Password</Label><Input id="password" name="password" type="password" placeholder="Leave blank to keep unchanged" className="col-span-3"/></div>
                        </div>
                        <DialogFooter><Button type="submit" disabled={isPending}>{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Save</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                 <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle><AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmAction?.action}>Continue</AlertDialogAction></AlertDialogFooter>
                 </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
