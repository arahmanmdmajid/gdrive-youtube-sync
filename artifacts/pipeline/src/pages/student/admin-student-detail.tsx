import { Link, useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { StudentLayout } from "@/components/student-layout";
import { useStudentDrilldown } from "@/lib/student-api";

export default function AdminStudentDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data, isLoading } = useStudentDrilldown(id);

  const subjects = data?.subjects ?? [];
  const totalLectures = subjects.reduce((sum, s) => sum + s.total, 0);
  const totalCompleted = subjects.reduce((sum, s) => sum + s.completed, 0);
  const overallPct = totalLectures ? Math.round((totalCompleted / totalLectures) * 100) : 0;

  return (
    <StudentLayout>
      <Link
        href="/admin/students"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Manage students
      </Link>

      <div className="mb-6">
        {isLoading ? (
          <Skeleton className="h-7 w-48" />
        ) : (
          <>
            <h1 className="text-xl font-semibold">{data?.student.displayName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              @{data?.student.username} · {totalCompleted} of {totalLectures} lectures completed · {overallPct}%
            </p>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {subjects.map((subject) => {
            const pct = subject.total ? Math.round((subject.completed / subject.total) * 100) : 0;
            const done = subject.completed === subject.total && subject.total > 0;
            return (
              <Card key={subject.serial}>
                <CardContent className="py-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {subject.serial !== "other" && (
                          <span className="text-muted-foreground mr-1.5">{subject.serial}</span>
                        )}
                        {subject.nameEn}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {subject.teacherEn ? `${subject.teacherEn} · ` : ""}
                        {subject.total} lectures
                      </p>
                    </div>
                    {done && <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />}
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    {done
                      ? "All completed"
                      : subject.completed === 0 && subject.inProgress === 0
                        ? "Not started"
                        : `${subject.completed} of ${subject.total} completed`}
                  </p>
                </CardContent>
              </Card>
            );
          })}
          {subjects.length === 0 && (
            <p className="col-span-2 py-4 text-center text-sm text-muted-foreground">No lectures available yet.</p>
          )}
        </div>
      )}
    </StudentLayout>
  );
}
