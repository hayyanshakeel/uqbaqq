'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, Download, Search, MoreHorizontal, Trash2, CreditCard, CalendarPlus, Loader2, Undo2, Edit, History, HeartCrack, Send, SplitSquareHorizontal, RefreshCw } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import type { User, Bill } from '@/lib/data-service';
import { 
    addUserAction, 
    deleteUserAction, 
    addMissedBillAction, 
    reverseLastPaymentAction, 
    reverseLastBillAction, 
    updateUserAction, 
    recalculateBalanceUntilDateAction, 
    markAsDeceasedAction, 
    sendPaymentLinkAction,
    getPendingMonthsForUser,
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
    const [isAddUserOpen, setIsAddUserOpen] = useState(false);
    const [isEditUserOpen, setIsEditUserOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isRecalculateOpen, setIsRecalculateOpen] = useState(false);
    const [isAddMissedBillOpen, setIsAddMissedBillOpen] = useState(false);
    const [isSplitBillOpen, setIsSplitBillOpen] = useState(false);
    const [isMarkAsDeceasedOpen, setIsMarkAsDeceasedOpen] = useState(false);
    const [isPayBillsOpen, setIsPayBillsOpen] = useState(false);
    const [pendingBills, setPendingBills] = useState<Bill[]>([]);
    const [isLoadingBills, setIsLoadingBills] = useState(false); // New state for loading bills
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{ action: () => void, title: string, description: string } | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [payingBillId, setPayingBillId] = useState<string | null>(null);

    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const addUserFormRef = useRef<HTMLFormElement>(null);
    const editUserFormRef = useRef<HTMLFormElement>(null);
    const recalculateFormRef = useRef<HTMLFormElement>(null);
    const addMissedBillFormRef = useRef<HTMLFormElement>(null);
    const splitBillFormRef = useRef<HTMLFormElement>(null);
    const deceasedFormRef = useRef<HTMLFormElement>(null);

    const handleSplitBill = async (formData: FormData) => {
        startTransition(async () => {
            const result = await splitMissedBillAction(formData);
            if (result.success) {
                toast({ title: "Success", description: result.message });
                setIsSplitBillOpen(false);
                splitBillFormRef.current?.reset();
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
    }

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

    const handleRecalculateBalance = async (formData: FormData) => {
        if (!selectedUser) return;
        setConfirmAction({
            title: `Recalculate Balance for ${selectedUser.name}?`,
            description: "This will ERASE all previous payment and bill history for this user and create a new consolidated payment record. It will then generate new bills for any outstanding months. This action is irreversible.",
            action: () => startTransition(async () => {
                const result = await recalculateBalanceUntilDateAction(selectedUser.id, formData);
                if (result.success) {
                    toast({ title: "Balance Recalculated", description: result.message });
                    setIsRecalculateOpen(false);
                } else {
                    toast({ variant: "destructive", title: "Error", description: result.message });
                }
            })
        });
        setIsConfirmOpen(true);
    };

    const handleMarkAsDeceased = async (formData: FormData) => {
        if (!selectedUser) return;
        startTransition(async () => {
            const result = await markAsDeceasedAction(selectedUser.id, formData);
            if (result.success) {
                toast({ title: "User Status Updated", description: result.message });
                setIsMarkAsDeceasedOpen(false);
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
        });
    };

    const confirmDeleteUser = (user: User) => {
        setConfirmAction({
            title: `Delete ${user.name}?`,
            description: "This will permanently delete the user's account and all associated data from authentication and the database. This action cannot be undone.",
            action: () => startTransition(async () => {
                const result = await deleteUserAction(user.id);
                if (result.success) {
                    toast({ title: "User Deleted", description: result.message });
                } else {
                    toast({ variant: "destructive", title: "Error", description: result.message });
                }
            })
        });
        setIsConfirmOpen(true);
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

    const handleAddMissedBill = async (formData: FormData) => {
        startTransition(async () => {
            const result = await addMissedBillAction(formData);
            if (result.success) {
                toast({ title: "Bill Added", description: result.message });
                setIsAddMissedBillOpen(false);
                addMissedBillFormRef.current?.reset();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
        });
    };
    
    const handleReversePayment = (userId: string) => {
        setConfirmAction({
            title: 'Reverse Last Payment?',
            description: 'This will find the most recent payment record, delete it, and update the user\'s balance. This action cannot be undone.',
            action: () => startTransition(async () => {
                const result = await reverseLastPaymentAction(userId);
                if (result.success) {
                    toast({ title: "Action Successful", description: result.message });
                } else {
                    toast({ variant: "destructive", title: "Error", description: result.message });
                }
            })
        });
        setIsConfirmOpen(true);
    };
    
    const handleReverseBill = (userId: string) => {
        setConfirmAction({
            title: 'Reverse Last Added Bill?',
            description: 'This will find the most recent bill record, delete it, and update the user\'s balance. This action cannot be undone.',
            action: () => startTransition(async () => {
                const result = await reverseLastBillAction(userId);
                if (result.success) {
                    toast({ title: "Action Successful", description: result.message });
                } else {
                    toast({ variant: "destructive", title: "Error", description: result.message });
                }
            })
        });
        setIsConfirmOpen(true);
    };

    const handleSendPaymentLink = (userId: string) => {
        startTransition(async () => {
            const result = await sendPaymentLinkAction(userId);
            if (result.success) {
                toast({ title: "Action Successful", description: result.message });
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
        });
    };

    const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
        const searchTerm = event.target.value.toLowerCase();
        const newFilteredUsers = initialUsers.filter(user => 
            user.name.toLowerCase().includes(searchTerm) ||
            (user.phone && user.phone.toLowerCase().includes(searchTerm)) ||
            (user.email && user.email.toLowerCase().includes(searchTerm))
        );
        setFilteredUsers(newFilteredUsers);
    };

    const handleExportData = async () => {
        setIsExporting(true);
        const headers = ['name', 'email', 'phone', 'status', 'joined', 'lastPaidOn', 'totalPaid', 'pending', 'pendingMonths'];
        const csvRows = [headers.join(",")];
        
        for (const user of filteredUsers) {
            const pendingMonths = await getPendingMonthsForUser(user.id);
            const row = [
                `"${user.name.replace(/"/g, '""')}"`,
                user.email || '',
                user.phone || '',
                user.status,
                user.joined,
                user.lastPaidOn || 'N/A',
                user.totalPaid.toFixed(2),
                user.pending.toFixed(2),
                `"${pendingMonths}"`
            ].join(",");
            csvRows.push(row);
        }

        const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join("\n"));
        const link = document.createElement("a");
        link.setAttribute("href", csvContent);
        link.setAttribute("download", "uqba-users-export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsExporting(false);
    };


    useEffect(() => {
        setFilteredUsers(initialUsers);
    }, [initialUsers]);

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

    const openRecalculateDialog = (user: User) => {
        setSelectedUser(user);
        setIsRecalculateOpen(true);
    };

    const openAddMissedBillDialog = (user: User) => {
        setSelectedUser(user);
        setIsAddMissedBillOpen(true);
    };
    
    const openSplitBillDialog = (user: User) => {
        setSelectedUser(user);
        setIsSplitBillOpen(true);
    };

    const openMarkAsDeceasedDialog = (user: User) => {
        setSelectedUser(user);
        setIsMarkAsDeceasedOpen(true);
    };

    const UserActionsDropdown = ({ user }: { user: User }) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0" disabled={isPending}>
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => openPayBillsDialog(user)}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    <span>Pay Pending Bills</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => handleSendPaymentLink(user.id)}>
                    <Send className="mr-2 h-4 w-4" />
                    <span>Send Payment Link</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openRecalculateDialog(user)}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    <span>Recalculate Balance</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openEditUserDialog(user)}>
                    <Edit className="mr-2 h-4 w-4" />
                    <span>Edit User</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openAddMissedBillDialog(user)}>
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    <span>Add Single Missed Bill</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openSplitBillDialog(user)}>
                    <SplitSquareHorizontal className="mr-2 h-4 w-4" />
                    <span>Add & Split Bill</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => handleReversePayment(user.id)} className="text-destructive focus:text-destructive">
                    <Undo2 className="mr-2 h-4 w-4" />
                    <span>Reverse Last Payment</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleReverseBill(user.id)} className="text-destructive focus:text-destructive">
                    <Undo2 className="mr-2 h-4 w-4" />
                    <span>Reverse Last Bill</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openMarkAsDeceasedDialog(user)} className="text-destructive focus:text-destructive">
                    <HeartCrack className="mr-2 h-4 w-4" />
                    <span>Mark as Deceased</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => confirmDeleteUser(user)} className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Delete User</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <>
            <main className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-3xl font-bold font-headline tracking-tight">User Management</h2>
                        <p className="text-muted-foreground">Manage all committee members and their payment records.</p>
                    </div>
                    <div className="flex items-center space-x-2 flex-wrap gap-2">
                        <Button variant="outline" onClick={handleExportData} disabled={isExporting}>
                            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                             Export Data
                        </Button>
                        <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                            <DialogTrigger asChild>
                                <Button><PlusCircle className="mr-2 h-4 w-4" /> Add User</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add New User</DialogTitle>
                                    <DialogDescription>
                                        This will create a new user account and add them to the member list.
                                    </DialogDescription>
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
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search users by name, email or phone..." className="pl-10" onChange={handleSearch} />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="hidden md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Joined</TableHead>
                                        <TableHead>Last Paid</TableHead>
                                        <TableHead className="text-right">Total Paid</TableHead>
                                        <TableHead className="text-right">Pending</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredUsers.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell className="font-medium">{user.name}<br/><span className="text-xs text-muted-foreground">{user.email}</span></TableCell>
                                            <TableCell>
                                                <Badge variant={user.status === 'paid' ? 'default' : user.status === 'deceased' ? 'destructive' : 'secondary'}>
                                                    {user.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{user.joined}</TableCell>
                                            <TableCell>{user.lastPaidOn}</TableCell>
                                            <TableCell className="text-right">₹{user.totalPaid.toFixed(2)}</TableCell>
                                            <TableCell className="text-right text-destructive font-semibold">₹{user.pending.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">
                                                <UserActionsDropdown user={user} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredUsers.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-24 text-center">No users found.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="space-y-4 md:hidden">
                             {filteredUsers.map((user) => (
                                <Card key={user.id}>
                                    <CardHeader className="p-4 flex flex-row items-start justify-between space-x-4">
                                        <div>
                                            <CardTitle className="text-base">{user.name}</CardTitle>
                                            <CardDescription className="text-xs break-all">{user.email}</CardDescription>
                                        </div>
                                        <div className="flex-shrink-0">
                                           <UserActionsDropdown user={user} />
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0 space-y-2">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-muted-foreground">Status</span>
                                            <Badge variant={user.status === 'paid' ? 'default' : user.status === 'deceased' ? 'destructive' : 'secondary'}>
                                                {user.status}
                                            </Badge>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-muted-foreground">Joined</span>
                                            <span>{user.joined}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-muted-foreground">Last Paid</span>
                                            <span>{user.lastPaidOn}</span>
                                        </div>
                                         <div className="flex justify-between items-center text-sm">
                                            <span className="text-muted-foreground">Total Paid</span>
                                            <span className="font-medium">₹{user.totalPaid.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-muted-foreground">Pending</span>
                                            <span className="font-semibold text-destructive">₹{user.pending.toFixed(2)}</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                            {filteredUsers.length === 0 && (
                                <div className="h-24 text-center flex items-center justify-center">
                                    <p>No users found.</p>
                                </div>
                            )}
                        </div>
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

            {/* Other dialogs... */}
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

            <Dialog open={isRecalculateOpen} onOpenChange={setIsRecalculateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Recalculate Balance for {selectedUser?.name}</DialogTitle>
                        <DialogDescription>
                            Select the month up to which the user's payments are clear.
                        </DialogDescription>
                    </DialogHeader>
                    <form ref={recalculateFormRef} action={handleRecalculateBalance}>
                        <Input type="hidden" name="userId" value={selectedUser?.id || ''} />
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="untilMonth" className="text-right">Paid Until Month</Label>
                                <Input id="untilMonth" name="untilMonth" type="month" className="col-span-3" required />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Recalculate Balance
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            
            <Dialog open={isMarkAsDeceasedOpen} onOpenChange={setIsMarkAsDeceasedOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Mark {selectedUser?.name} as Deceased</DialogTitle>
                        <DialogDescription>
                            This will finalize the user's balance based on the date of death.
                        </DialogDescription>
                    </DialogHeader>
                    <form ref={deceasedFormRef} action={handleMarkAsDeceased}>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="dateOfDeath" className="text-right">Date of Death</Label>
                                <Input id="dateOfDeath" name="dateOfDeath" type="date" className="col-span-3" required />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit" variant="destructive" disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Confirm & Finalize Balance
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            
            <Dialog open={isSplitBillOpen} onOpenChange={setIsSplitBillOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add & Split Bill for {selectedUser?.name}</DialogTitle>
                        <DialogDescription>
                            Enter a total amount and a date range to split the amount evenly.
                        </DialogDescription>
                    </DialogHeader>
                    <form ref={splitBillFormRef} action={handleSplitBill}>
                        <Input type="hidden" name="userId" value={selectedUser?.id || ''} />
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="startMonth" className="text-right">Start Month</Label>
                                <Input id="startMonth" name="startMonth" type="month" className="col-span-3" required />
                            </div>
                             <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="endMonth" className="text-right">End Month</Label>
                                <Input id="endMonth" name="endMonth" type="month" className="col-span-3" required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="totalAmount" className="text-right">Total Amount (₹)</Label>
                                <Input id="totalAmount" name="totalAmount" type="number" step="0.01" placeholder="e.g., 1000" className="col-span-3" required />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Split & Save
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddMissedBillOpen} onOpenChange={setIsAddMissedBillOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Single Missed Bill for {selectedUser?.name}</DialogTitle>
                        <DialogDescription>
                            Add a charge for a missed payment from a previous month.
                        </DialogDescription>
                    </DialogHeader>
                    <form ref={addMissedBillFormRef} action={handleAddMissedBill}>
                        <Input type="hidden" name="userId" value={selectedUser?.id || ''} />
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="billingMonth" className="text-right">Billing Month</Label>
                                <Input id="billingMonth" name="billingMonth" type="month" className="col-span-3" required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="amount" className="text-right">Amount (₹)</Label>
                                <Input id="amount" name="amount" type="number" step="0.01" defaultValue={250} className="col-span-3" required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="notes" className="text-right">Notes</Label>
                                <Textarea id="notes" name="notes" placeholder="e.g., Missed payment for January 2024" className="col-span-3" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Add Bill
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmAction?.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmAction(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isPending}
                            onClick={() => {
                                confirmAction?.action();
                                setIsConfirmOpen(false);
                                setConfirmAction(null);
                            }}
                        >
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Continue"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
