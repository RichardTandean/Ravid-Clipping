'use client';

import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">Ravid Clipping</h1>
        <p className="text-lg text-muted-foreground">
          Transform long videos into engaging short-form content
        </p>
        <Button asChild size="lg">
          <Link href="/register">Get Started</Link>
        </Button>
      </div>
    </main>
  );
}
