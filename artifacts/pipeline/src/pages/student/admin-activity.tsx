import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentLayout } from "@/components/student-layout";
import { useAuthEvents, type AuthEventKind, type AuthEventCounts } from "@/lib/student-api";

const LABEL: Record<AuthEventKind, string> = {
  login_ok: "Signed in",
  login_failed: "Failed sign-in",
  register: "Registered",
  reset_ok: "Password reset",
  reset_refused: "Reset refused",
};

const REASON: Record<string, string> = {
  unknown_user: "no such username",
  wrong_password: "wrong password",
  wrong_invite_code: "wrong invite code",
  too_many_attempts: "too many wrong codes",
  no_student: "no student with that username",
};

const FAILURES: AuthEventKind[] = ["login_failed", "reset_refused"];

function Counts({ title, counts }: { title: string; counts: AuthEventCounts }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-medium mb-2">{title}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {(Object.keys(LABEL) as AuthEventKind[]).map((k) => (
            <div key={k} className="flex justify-between">
              <span className="text-muted-foreground">{LABEL[k]}</span>
              <span className={FAILURES.includes(k) && counts[k] > 0 ? "font-semibold text-destructive" : "font-mono"}>{counts[k]}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminActivity() {
  const { data, isLoading, error } = useAuthEvents();
  const [failuresOnly, setFailuresOnly] = useState(false);
  const events = (data?.events ?? []).filter((e) => !failuresOnly || FAILURES.includes(e.event));

  return (
    <StudentLayout>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h1 className="text-xl font-semibold">Activity</h1>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={failuresOnly} onChange={(e) => setFailuresOnly(e.target.checked)} />
          Failures only
        </label>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Sign-ins, failed sign-ins, registrations and password resets. Passwords and invite codes are never recorded. Times are in your local time.
      </p>

      {isLoading && <Skeleton className="h-40 w-full" />}
      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message.replace(/^HTTP \d+ [^:]*: ?/, "") : "Could not load the activity."}
        </p>
      )}

      {data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Counts title="Last 24 hours" counts={data.summary.last24h} />
            <Counts title="Last 7 days" counts={data.summary.last7d} />
          </div>

          <Card>
            <CardContent className="p-4">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">{failuresOnly ? "No failures recorded." : "Nothing recorded yet."}</p>
              ) : (
                events.map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0 text-sm">
                    <div className="min-w-0">
                      <p className={FAILURES.includes(e.event) ? "font-medium text-destructive" : "font-medium"}>
                        {LABEL[e.event] ?? e.event}
                        {e.reason && <span className="font-normal text-muted-foreground"> · {REASON[e.reason] ?? e.reason}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {e.username ? `@${e.username}` : "no username"}
                        {e.ipHash && <> · device {e.ipHash.slice(0, 6)}</>}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{format(new Date(e.createdAt), "d MMM, HH:mm")}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </StudentLayout>
  );
}
