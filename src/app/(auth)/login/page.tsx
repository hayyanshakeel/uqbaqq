'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, firebaseError } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    // Render an error message if Firebase is not configured
    if (firebaseError) {
        return (
            <div className="flex min-h-screen items-center justify-center p-4 bg-black">
                <Card className="w-full max-w-md shadow-2xl bg-card/80 backdrop-blur-sm z-10">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl text-destructive">Configuration Error</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-destructive-foreground text-center">{firebaseError}</p>
                        <p className="mt-4 text-sm text-muted-foreground text-center">
                            Please check the environment variables and restart the server.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }


    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!auth) {
            toast({
                variant: "destructive",
                title: "Sign In Failed",
                description: "Firebase is not configured correctly.",
            });
            return;
        }

        setIsLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Check if the signed-in user is the admin.
            if (user.email && user.email.toLowerCase() === 'sheikhhayyaan@gmail.com') {
                router.push('/admin/dashboard');
            } else {
                router.push('/dashboard');
            }
        } catch (error: any) {
            let errorMessage = "An unknown error occurred.";
            switch (error.code) {
                case 'auth/user-not-found':
                case 'auth/invalid-credential':
                    errorMessage = 'Invalid email or password. Please try again.';
                    break;
                case 'auth/wrong-password':
                    errorMessage = 'Incorrect password. Please try again.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'The email address is not valid.';
                    break;
                case 'auth/too-many-requests':
                     errorMessage = 'Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.';
                     break;
                default:
                    errorMessage = "An unexpected error occurred. Please try again.";
                    console.error("Firebase Auth Error:", error);
                    break;
            }
            toast({
                variant: "destructive",
                title: "Sign In Failed",
                description: errorMessage,
            });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-4 bg-black relative overflow-hidden">
            <div className="absolute w-96 h-96 bg-purple-500/20 rounded-full -translate-x-1/4 -translate-y-1/4 top-0 left-0 animate-pulse blur-3xl" />
            <div className="absolute w-96 h-96 bg-cyan-500/20 rounded-full translate-x-1/4 translate-y-1/4 bottom-0 right-0 animate-pulse [animation-delay:500ms] blur-3xl" />
            
            <Card className="w-full max-w-md shadow-2xl bg-card/80 backdrop-blur-sm z-10">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-2">
                       <Logo />
                    </div>
                </CardHeader>
                <CardContent>
                   <form onSubmit={handleSignIn} className="space-y-4">
                       <div className="space-y-2">
                           <Label htmlFor="email">Email</Label>
                           <Input 
                               id="email" 
                               type="email" 
                               placeholder="name@example.com" 
                               required 
                               value={email}
                               onChange={(e) => setEmail(e.target.value)}
                               disabled={isLoading}
                               autoComplete="email"
                            />
                       </div>
                       <div className="space-y-2">
                           <Label htmlFor="password">Password</Label>
                           <Input 
                                id="password" 
                                type="password" 
                                required 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isLoading}
                                autoComplete="current-password"
                           />
                       </div>
                       <Button 
                           type="submit" 
                           className="w-full h-12 text-base text-white bg-gradient-to-r from-teal-400 via-purple-500 to-blue-500 animate-gradient-flow [background-size:200%_200%]"
                           disabled={isLoading}
                       >
                           {isLoading ? <Loader2 className="animate-spin" /> : "Sign In"}
                       </Button>
                   </form>
                </CardContent>
                <CardFooter className="justify-center text-center pt-2">
                     <p className="text-xs text-muted-foreground">
                        © {new Date().getFullYear()} UQBA COMMITTEE. All rights reserved.
                     </p>
                </CardFooter>
            </Card>
        </div>
    );
}
