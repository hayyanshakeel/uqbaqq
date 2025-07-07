'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Upload, Download, Search, MoreHorizontal, Trash2, CreditCard, CalendarPlus, Loader2, Undo2, Edit } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@/lib/data-service';
import { addUserAction, deleteUserAction, recordPaymentAction, addMissedBillAction, reverseLastPaymentAction, reverseLastBillAction, importUsersFromCsvAction, updateUserAction } from './actions';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type UsersClientProps = {
    users: User[];
};

export default function UsersClient({ users: initialUsers }: UsersClientProps) {
    const [filteredUsers, setFilteredUsers] = useState(initialUsers);
    const [isAddUserOpen, setIsAddUserOpen] = useState(false);
    const [isEditUserOpen, setIsEditUserOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
    const [isAddMissedBillOpen, setIsAddMissedBillOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{ action: () => void, title: string, description: string } | null>(null);

    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const addUserFormRef = useRef<HTMLFormElement>(null);
    const editUserFormRef = useRef<HTMLFormElement>(null);
    const recordPaymentFormRef = useRef<HTMLFormElement>(null);
    const addMissedBillFormRef = useRef<HTMLFormElement>(null);

    const handleImport = () => {
        if (!selectedFile) {
            toast({ variant: "destructive", title: "No File Selected", description: "Please select a CSV file to import." });
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const csvData = event.target?.result as string;
            startTransition(async () => {
                const result = await importUsersFromCsvAction(csvData);
                if (result.success) {
                    toast({ title: "Import Successful", description: result.message });
                } else {
                    toast({ variant: "destructive", title: "Import Failed", description: `${result.message} Check console for details.` });
                    console.error("Import Errors:", result.errors);
                }
                setIsImportOpen(false);
                setSelectedFile(null);
            });
        };
        reader.readAsText(selectedFile);
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

    const handleRecordPayment = async (formData: FormData) => {
        startTransition(async () => {
            const result = await recordPaymentAction(formData);
            if (result.success) {
                toast({ title: "Payment Recorded", description: result.message });
                setIsRecordPaymentOpen(false);
                recordPaymentFormRef.current?.reset();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
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

    const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
        const searchTerm = event.target.value.toLowerCase();
        const newFilteredUsers = initialUsers.filter(user => 
            user.name.toLowerCase().includes(searchTerm) ||
            (user.phone && user.phone.toLowerCase().includes(searchTerm)) ||
            (user.email && user.email.toLowerCase().includes(searchTerm))
        );
        setFilteredUsers(newFilteredUsers);
    };

    const handleDownloadTemplate = () => {
        const headers = ['name', 'email', 'phone', 'password', 'joining_date', 'last_payment_month'];
        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + "New Member,new@example.com,1234567890,newPass123,2023-01-15,2023-12\n"
            + "Existing Member,user1@example.com,,,,2015-06-01,2024-03";

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "uqba-import-template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportData = () => {
        const headers = ['name', 'email', 'phone', 'status', 'joined', 'totalPaid', 'pending'];
        const csvRows = [headers.join(",")];
        
        filteredUsers.forEach(user => {
            const row = [
                `"${user.name.replace(/"/g, '""')}"`,
                user.email || '',
                user.phone || '',
                user.status,
                user.joined,
                user.totalPaid.toFixed(2),
                user.pending.toFixed(2)
            ].join(",");
            csvRows.push(row);
        });

        const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join("\n"));
        const link = document.createElement("a");
        link.setAttribute("href", csvContent);
        link.setAttribute("download", "uqba-users-export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    useEffect(() => {
        setFilteredUsers(initialUsers);
    }, [initialUsers]);

    const openEditUserDialog = (user: User) => {
        setSelectedUser(user);
        setIsEditUserOpen(true);
    };

    const openRecordPaymentDialog = (user: User) => {
        setSelectedUser(user);
        setIsRecordPaymentOpen(true);
    };

    const openAddMissedBillDialog = (user: User) => {
        setSelectedUser(user);
        setIsAddMissedBillOpen(true);
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
                <DropdownMenuItem onSelect={() => openEditUserDialog(user)}>
                    <Edit className="mr-2 h-4 w-4" />
                    <span>Edit User</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openRecordPaymentDialog(user)}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    <span>Record Payment</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openAddMissedBillDialog(user)}>
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    <span>Add Missed Bill</span>
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
                        <Button variant="outline" onClick={handleExportData}><Download className="mr-2 h-4 w-4" /> Export Data</Button>
                        <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Import / Create</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Import or Create Users from CSV</DialogTitle>
                                    <DialogDescription>
                                        Upload a CSV to update existing users or create new ones. The system will calculate all dues automatically.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="csv-file">CSV File</Label>
                                        <Input id="csv-file" type="file" accept=".csv" onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)} />
                                        <p className="text-sm text-muted-foreground">
                                            <b>Required:</b> `email`, `joining_date`.<br/>
                                            <b>For new users:</b> `name`, `phone`, `password` are also required.<br/>
                                            <b>Important:</b> Use `last_payment_month` in YYYY-MM format.
                                        </p>
                                    </div>
                                    <Button variant="link" className="p-0 h-auto justify-start" onClick={handleDownloadTemplate}>Download Template</Button>
                                </div>
                                <DialogFooter>
                                    <Button onClick={handleImport} disabled={isPending || !selectedFile}>
                                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Process File
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
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
                                            <Label htmlFor="name" className="text-right">Name</Label>
                                            <Input id="name" name="name" className="col-span-3" placeholder="Full Name" required />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="phone" className="text-right">Phone</Label>
                                            <Input id="phone" name="phone" className="col-span-3" placeholder="Phone Number" required />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="email" className="text-right">Email</Label>
                                            <Input id="email" name="email" type="email" className="col-span-3" placeholder="user@example.com" required />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="password" className="text-right">Password</Label>
                                            <Input id="password" name="password" type="password" className="col-span-3" placeholder="********" required />
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
                                        <TableHead>Email</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Phone</TableHead>
                                        <TableHead>Joined</TableHead>
                                        <TableHead className="text-right">Total Paid</TableHead>
                                        <TableHead className="text-right">Pending</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredUsers.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell className="font-medium">{user.name}</TableCell>
                                            <TableCell>{user.email}</TableCell>
                                            <TableCell>
                                                <Badge variant={user.status === 'paid' ? 'default' : user.status === 'pending' ? 'secondary' : 'destructive'}>
                                                    {user.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{user.phone}</TableCell>
                                            <TableCell>{user.joined}</TableCell>
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
                                            <Badge variant={user.status === 'paid' ? 'default' : user.status === 'pending' ? 'secondary' : 'destructive'}>
                                                {user.status}
                                            </Badge>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-muted-foreground">Phone</span>
                                            <span>{user.phone}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-muted-foreground">Joined</span>
                                            <span>{user.joined}</span>
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

            {/* --- Edit User Dialog --- */}
            <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit User: {selectedUser?.name}</DialogTitle>
                        <DialogDescription>
                            Update the user's details here. Changes will be saved to both authentication and the database.
                        </DialogDescription>
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
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="edit-password" className="text-right">New Password</Label>
                                <Input id="edit-password" name="password" type="password" className="col-span-3" placeholder="Leave blank to keep unchanged" />
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

            <Dialog open={isRecordPaymentOpen} onOpenChange={setIsRecordPaymentOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Record Payment for {selectedUser?.name}</DialogTitle>
                        <DialogDescription>
                            Current pending amount is ₹{selectedUser?.pending.toFixed(2)}. Enter the amount paid.
                        </DialogDescription>
                    </DialogHeader>
                    <form ref={recordPaymentFormRef} action={handleRecordPayment}>
                        <Input type="hidden" name="userId" value={selectedUser?.id || ''} />
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="amount" className="text-right">Amount (₹)</Label>
                                <Input id="amount" name="amount" type="number" step="0.01" defaultValue={selectedUser?.pending} className="col-span-3" required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="paymentDate" className="text-right">Date</Label>
                                <Input id="paymentDate" name="paymentDate" type="date" className="col-span-3" defaultValue={new Date().toISOString().substring(0, 10)} required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="notes" className="text-right">Notes</Label>
                                <Textarea id="notes" name="notes" placeholder="Optional notes about the payment" className="col-span-3" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Record Payment
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddMissedBillOpen} onOpenChange={setIsAddMissedBillOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Missed Bill for {selectedUser?.name}</DialogTitle>
                        <DialogDescription>
                            Add a charge for a missed payment from a previous month. This will increase their pending balance.
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
