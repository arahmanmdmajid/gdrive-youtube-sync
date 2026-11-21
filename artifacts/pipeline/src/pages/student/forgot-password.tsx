import { useState, FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2 } from "lucide-react";
import { useResetPassword } from "@/lib/student-api";

export default function StudentForgotPassword() {
  const [, navigate] = useLocation();
  const [inviteCode, setInviteCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const reset = useResetPassword();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    reset.mutate({ inviteCode, username, password }, { onSuccess: () => navigate("/") });
  }

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Forgot your password?</CardTitle>
          <CardDescription>
            Enter the invite code shared with the class and your username, then choose a password. You may use the same
            password as before if you like.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inviteCode">Invite code</Label>
              <Input id="inviteCode" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
            {reset.isError && (
              <p className="text-sm text-destructive">
                {reset.error instanceof Error
                  ? reset.error.message.replace(/^HTTP \d+ [^:]*: ?/, "")
                  : "Could not reset the password"}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={reset.isPending}>
              {reset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Set password and sign in
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link href="/" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
