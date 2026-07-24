import { useRef, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StudentLayout } from "@/components/student-layout";
import {
  useAdminStudents,
  useInviteCode,
  useUpdateInviteCode,
  useResetStudentPassword,
  useRemoveStudent,
  type RosterStudent,
} from "@/lib/student-api";
import { Check, Copy, KeyRound, Loader2, Pencil, Trash2, X } from "lucide-react";

function InviteCodeCard() {
  const { data, isLoading } = useInviteCode();
  const updateMutation = useUpdateInviteCode();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEditing() {
    setValue(data?.inviteCode ?? "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    updateMutation.mutate(trimmed, { onSuccess: () => setEditing(false) });
  }

  function copyCode() {
    if (!data?.inviteCode) return;
    navigator.clipboard.writeText(data.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className="mb-6">
      <CardContent className="py-4 space-y-2">
        <p className="text-sm font-medium">Invite code</p>
        <p className="text-xs text-muted-foreground">Students need this code to register.</p>
        {isLoading ? (
          <Skeleton className="h-9 w-48" />
        ) : editing ? (
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="max-w-xs font-mono"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={commit}
              disabled={!value.trim() || updateMutation.isPending}
              className="h-8 w-8 text-success"
              title="Save"
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setEditing(false)} className="h-8 w-8" title="Cancel">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <code className="rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm">
              {data?.inviteCode ?? "Not set"}
            </code>
            <Button variant="ghost" size="icon" onClick={copyCode} className="h-8 w-8" title="Copy">
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={startEditing} className="h-8 w-8" title="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminStudents() {
  const { data, isLoading } = useAdminStudents();
  const resetPasswordMutation = useResetStudentPassword();
  const removeMutation = useRemoveStudent();

  const [passwordTarget, setPasswordTarget] = useState<RosterStudent | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [removeTarget, setRemoveTarget] = useState<RosterStudent | null>(null);

  const students = data?.students ?? [];
  const total = data?.total ?? 0;

  function submitPassword() {
    if (!passwordTarget || passwordValue.length < 6) return;
    resetPasswordMutation.mutate(
      { id: passwordTarget.id, password: passwordValue },
      {
        onSuccess: () => {
          setPasswordTarget(null);
          setPasswordValue("");
        },
      },
    );
  }

  return (
    <StudentLayout>
      <h1 className="text-xl font-semibold mb-6">Manage students</h1>

      <InviteCodeCard />

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <Card>
          <CardContent className="p-6 space-y-1">
            {students.map((student) => {
              const pct = total ? Math.round((student.completed / total) * 100) : 0;
              return (
                <div
                  key={student.id}
                  className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                >
                  <Link href={`/admin/students/${student.id}`} className="flex-1 min-w-0 group">
                    <p className="text-sm font-medium truncate group-hover:underline">{student.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{student.username} · joined {format(new Date(student.createdAt), "d MMM yyyy")} · {student.completed}/{total} ({pct}%)
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    title="Reset password"
                    onClick={() => {
                      setPasswordTarget(student);
                      setPasswordValue("");
                    }}
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Remove"
                    onClick={() => setRemoveTarget(student)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            {students.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No students registered yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={passwordTarget !== null} onOpenChange={(open) => !open && setPasswordTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {passwordTarget?.displayName}. They'll need to sign in again with it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPassword()}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPasswordTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitPassword} disabled={passwordValue.length < 6 || resetPasswordMutation.isPending}>
              {resetPasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes their account and all recorded progress. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeTarget && removeMutation.mutate({ id: removeTarget.id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StudentLayout>
  );
}
