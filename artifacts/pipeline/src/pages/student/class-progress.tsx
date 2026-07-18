import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentLayout } from "@/components/student-layout";
import { useClassProgress } from "@/lib/student-api";
import { getStoredUser } from "@/lib/auth";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function StudentClassProgress() {
  const { data, isLoading } = useClassProgress();
  const me = getStoredUser();

  const students = [...(data?.students ?? [])].sort((a, b) => b.completed - a.completed);
  const total = data?.total ?? 0;

  return (
    <StudentLayout>
      <div className="flex items-baseline justify-between gap-2 mb-6">
        <h1 className="text-xl font-semibold">Class progress</h1>
        {!isLoading && <span className="text-sm text-muted-foreground">{total} lectures total</span>}
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <Card>
          <CardContent className="p-6 space-y-4">
            {students.map((student) => {
              const pct = total ? Math.round((student.completed / total) * 100) : 0;
              const isMe = student.userId === me?.id;
              return (
                <div key={student.userId} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {initials(student.displayName)}
                  </div>
                  <span className="w-32 truncate text-sm">
                    {student.displayName}
                    {isMe && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  <Progress value={pct} className="h-2 flex-1" />
                  <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                    {student.completed} · {pct}%
                  </span>
                </div>
              );
            })}
            {students.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No classmates registered yet.</p>
            )}
          </CardContent>
        </Card>
      )}
    </StudentLayout>
  );
}
