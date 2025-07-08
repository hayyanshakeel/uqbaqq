import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import Link from "next/link";

// The Logo component is causing the issue in this specific layout.
// We will replace it with simple text for now to fix the crash.
function UserLogo() {
  return (
    <h1
      className="whitespace-nowrap text-xl sm:text-2xl md:text-3xl font-headline font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-purple-500 to-blue-500 animate-gradient-flow [background-size:200%_200%]"
    >
      UQBA COMMITTEE
    </h1>
  );
}


export default function UserLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen flex flex-col bg-background">
            <header className="sticky top-0 z-40 w-full border-b bg-card">
                <div className="container relative flex h-16 items-center">
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                        <UserLogo />
                    </div>
                    <div className="ml-auto flex items-center justify-end space-x-4">
                        <nav className="flex items-center space-x-1">
                            <Link href="/login">
                                <Button variant="ghost">
                                    <LogOut className="h-5 w-5 mr-2" />
                                    Logout
                                </Button>
                            </Link>
                        </nav>
                    </div>
                </div>
            </header>
            <main className="flex-1">
                {children}
            </main>
             <footer className="py-6 md:px-8 md:py-0 bg-card border-t">
                <div className="container flex flex-col items-center justify-center gap-4 md:h-24 md:flex-row">
                    <p className="text-balance text-center text-sm leading-loose text-muted-foreground">
                        Built with ♡ for the community. © {new Date().getFullYear()} UQBA COMMITTEE.
                    </p>
                </div>
            </footer>
        </div>
    );
}
