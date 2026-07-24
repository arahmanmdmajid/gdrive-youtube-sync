import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { BookOpen, Users, LogOut, GraduationCap, Sun, Moon } from "lucide-react";
import { getStoredUser } from "@/lib/auth";
import { logout } from "@/lib/student-api";
import { useTheme } from "@/lib/theme";

export function StudentLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const user = getStoredUser();
  const { theme, toggleTheme } = useTheme();

  const navigation =
    user?.role === "admin"
      ? [{ name: "Class progress", href: "/class", icon: Users }]
      : [{ name: "Subjects", href: "/", icon: BookOpen }];

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="border-b border-border sticky top-0 bg-background z-10">
        <div className="mx-auto max-w-3xl px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <GraduationCap className="h-5 w-5 text-primary" />
            <span>Class Lectures</span>
          </div>
          <nav className="flex items-center gap-1">
            {navigation.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.name} href={item.href}>
                  <Button variant={isActive ? "secondary" : "ghost"} size="sm" className="gap-1.5">
                    <item.icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.name}</span>
                  </Button>
                </Link>
              );
            })}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={logout} title="Sign out">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{user?.displayName ?? "Sign out"}</span>
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-8 py-12">{children}</main>
    </div>
  );
}
