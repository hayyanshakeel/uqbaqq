import { cn } from "@/lib/utils";

export function Logo({ withText = true }: { withText?: boolean }) {
  return (
    <div className="flex items-center">
      {withText && (
        <h1
          className="whitespace-nowrap text-xl sm:text-2xl md:text-3xl font-headline font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-purple-500 to-blue-500 animate-gradient-flow [background-size:200%_200%]"
        >
          UQBA COMMITTEE
        </h1>
      )}
    </div>
  );
}
