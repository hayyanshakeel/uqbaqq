'use client';
import { useState, useTransition, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, Loader2 } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import type { Expense } from '@/lib/data-service';
import { addExpenseAction, deleteExpenseAction } from './actions';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


type ExpenditureClientProps = {
    initialExpenses: Expense[];
};

const expenseCategories = ['Utilities', 'Event', 'Tech', 'Charity', 'Maintenance', 'General'];


export default function ExpenditureClient({ initialExpenses }: ExpenditureClientProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    const formRef = useRef<HTMLFormElement>(null);
    const [category, setCategory] = useState<string | undefined>(undefined);


    const handleAddExpense = async (formData: FormData) => {
        if (category) {
            formData.append('category', category);
        }

        startTransition(async () => {
            const result = await addExpenseAction(formData);
            if (result.success) {
                toast({ title: "Success", description: result.message });
                setIsDialogOpen(false);
                formRef.current?.reset();
                setCategory(undefined);
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
        });
    }

    const confirmDeleteExpense = (id: string) => {
        setExpenseToDelete(id);
        setIsConfirmOpen(true);
    };

    const handleDeleteExpense = () => {
        if (!expenseToDelete) return;
        startTransition(async () => {
            const result = await deleteExpenseAction(expenseToDelete);
            if (result.success) {
                toast({ title: "Success", description: result.message });
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
            setIsConfirmOpen(false);
            setExpenseToDelete(null);
        });
    };
    
    return (
        <>
            <main className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold font-headline tracking-tight">Expenditure Management</h2>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Add Expense
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add New Expense</DialogTitle>
                            </DialogHeader>
                            <form ref={formRef} action={handleAddExpense}>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="date" className="text-right">Date</Label>
                                        <Input id="date" name="date" type="date" className="col-span-3" defaultValue={new Date().toISOString().substring(0, 10)} required />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="amount" className="text-right">Amount (₹)</Label>
                                        <Input id="amount" name="amount" type="number" step="0.01" placeholder="e.g., 500.00" className="col-span-3" required />
                                    </div>
                                     <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="category" className="text-right">Category</Label>
                                         <Select name="category" onValueChange={setCategory} value={category} required>
                                            <SelectTrigger className="col-span-3">
                                                <SelectValue placeholder="Select a category" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {expenseCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="description" className="text-right">Description</Label>
                                        <Textarea id="description" name="description" placeholder="Describe the expense" className="col-span-3" required />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button type="submit" disabled={isPending}>
                                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save Expense
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Expense History</CardTitle>
                        <CardDescription>A record of all committee expenditures.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {/* Desktop Table */}
                        <div className="hidden md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {initialExpenses.map((expense) => (
                                        <TableRow key={expense.id}>
                                            <TableCell>{new Date(expense.date).toLocaleDateString()}</TableCell>
                                            <TableCell className="font-medium">{expense.description}</TableCell>
                                            <TableCell><Badge variant="outline">{expense.category}</Badge></TableCell>
                                            <TableCell className="text-right">₹{expense.amount.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => confirmDeleteExpense(expense.id)} disabled={isPending}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {initialExpenses.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">No expenses recorded yet.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        {/* Mobile Card View */}
                        <div className="space-y-4 md:hidden">
                            {initialExpenses.map((expense) => (
                                <Card key={expense.id} className="p-0">
                                    <CardContent className="p-4 flex flex-col gap-2">
                                        <div className="flex justify-between items-start">
                                            <div className="flex flex-col">
                                                 <p className="font-semibold">{expense.description}</p>
                                                 <p className="text-sm text-muted-foreground">{new Date(expense.date).toLocaleDateString()}</p>
                                            </div>
                                             <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive -mt-2 -mr-2" onClick={() => confirmDeleteExpense(expense.id)} disabled={isPending}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                         <div className="flex justify-between items-end pt-2">
                                             <Badge variant="outline">{expense.category}</Badge>
                                             <p className="text-xl font-bold">₹{expense.amount.toFixed(2)}</p>
                                         </div>
                                    </CardContent>
                                </Card>
                            ))}
                            {initialExpenses.length === 0 && (
                                <div className="h-24 text-center flex items-center justify-center">
                                    <p>No expenses recorded yet.</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </main>
            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the expense record.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setExpenseToDelete(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction disabled={isPending} onClick={handleDeleteExpense}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
