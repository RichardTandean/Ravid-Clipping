"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  const handleLogout = () => {
    // TODO: Implement actual logout logic
    router.push("/login")
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Bar */}
      <nav className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <h1 className="text-xl font-bold">Ravid Clipping</h1>
            <div className="hidden md:flex space-x-6">
              <Button variant="link" className="text-foreground" onClick={() => router.push("/clips")}>
                My Clips
              </Button>
              <Button variant="link" className="text-muted-foreground">
                Settings
              </Button>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>
        {children}
      </main>
    </div>
  )
} 