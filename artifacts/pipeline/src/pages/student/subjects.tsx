import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Play } from "lucide-react";
import { StudentLayout } from "@/components/student-layout";
import { useSubjects, useContinueLecture } from "@/lib/student-api";
import { getStoredUser } from "@/lib/auth";

export default function StudentSubjects() {
  const { data, isLoading } = useSubjects();
  const { data: cont } = useContinueLecture();
  const user = getStoredUser();

  const subjects = data?.subjects ?? [];
  const totalLectures = subjects.reduce((sum, s) => sum + s.total, 0);
  const totalCompleted = subjects.reduce((sum, s) => sum + s.completed, 0);
  const overallPct = totalLectures ? Math.round((totalCompleted / totalLectures) * 100) : 0;

  return (
    <StudentLayout>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Assalamu alaikum{user ? `, ${user.displayName}` : ""}</h1>
        {!isLoading && (
          <p className="text-sm text-muted-foreground mt-1">
            {totalCompleted} of {totalLectures} lectures completed · {overallPct}%
          </p>
        )}
      </div>

      {cont?.lecture && (
        <Card className="mb-6 border-primary/40 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Continue where you left off</p>
              <p className="text-sm font-medium truncate">{cont.lecture.title}</p>
            </div>
            <Link href={`/subject/${cont.lecture.serial}?open=${cont.lecture.id}`}>
              <Button size="sm" className="gap-1.5 shrink-0">
                <Play className="h-4 w-4" />
                Resume
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

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
              <Link key={subject.serial} href={`/subject/${subject.serial}`}>
                <Card className="h-full transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/50 cursor-pointer">
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
              </Link>
            );
          })}
        </div>
      )}
    </StudentLayout>
  );
}
