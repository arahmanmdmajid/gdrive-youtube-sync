import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Check, CheckCircle2, Circle, ExternalLink, Loader2, PlayCircle, Undo2 } from "lucide-react";
import { StudentLayout } from "@/components/student-layout";
import { useSubjectLectures, useSetProgress, type Lecture } from "@/lib/student-api";

/**
 * Every lecture title in a subject repeats the "{serial} {subject}" and
 * usually "{teacher}" too (both already shown in the page header), which
 * pushes the one part that actually varies per row — the date — out of view
 * on narrow screens. Strip what's redundant so the row shows just what's
 * distinguishing. Older/manually-added titles don't all follow the same
 * segment count (some skip the teacher), so this strips leading segments
 * one at a time rather than requiring one exact combined prefix.
 */
function shortLectureLabel(title: string, subjectPrefix: string, teacherEn: string): string {
  let rest = title.startsWith(subjectPrefix) ? title.slice(subjectPrefix.length) : title;
  const segments = rest.split("|").map((s) => s.trim()).filter(Boolean);
  if (segments[0] === teacherEn) segments.shift();
  rest = segments.join(" · ").trim();
  return rest || title;
}

function LectureRow({
  lecture,
  subjectPrefix,
  teacherEn,
  open,
  onToggleOpen,
}: {
  lecture: Lecture;
  subjectPrefix: string;
  teacherEn: string;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const setProgress = useSetProgress();
  const label = shortLectureLabel(lecture.title, subjectPrefix, teacherEn);

  function openPlayer() {
    onToggleOpen();
    if (!open && lecture.progress === "not_started") {
      setProgress.mutate({ jobId: lecture.id, status: "in_progress" });
    }
  }

  const statusIcon =
    lecture.progress === "completed" ? (
      <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
    ) : lecture.progress === "in_progress" ? (
      <PlayCircle className="h-5 w-5 text-primary shrink-0" />
    ) : (
      <Circle className="h-5 w-5 text-muted-foreground/50 shrink-0" />
    );

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-3 py-[1.125rem]">
        {statusIcon}
        <button
          type="button"
          onClick={openPlayer}
          className="flex-1 min-w-0 text-left"
          data-testid={`lecture-${lecture.id}`}
          title={lecture.title}
        >
          <p className="text-sm truncate">{label}</p>
          <p className="text-xs text-muted-foreground">
            {lecture.progress === "completed"
              ? "Completed"
              : lecture.progress === "in_progress"
                ? "In progress"
                : "Not started"}
          </p>
        </button>
        {lecture.progress !== "completed" ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={setProgress.isPending}
            onClick={() => setProgress.mutate({ jobId: lecture.id, status: "completed" })}
          >
            {setProgress.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            <span className="hidden sm:inline">Mark completed</span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 text-muted-foreground"
            disabled={setProgress.isPending}
            onClick={() => setProgress.mutate({ jobId: lecture.id, status: "in_progress" })}
          >
            {setProgress.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            <span className="hidden sm:inline">Undo</span>
          </Button>
        )}
      </div>
      {open && lecture.youtubeVideoId && (
        <div className="pb-4 space-y-2">
          <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${lecture.youtubeVideoId}`}
              title={lecture.title}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          {lecture.youtubeUrl && (
            <a
              href={lecture.youtubeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              Open on YouTube
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function StudentSubjectDetail() {
  const params = useParams<{ serial: string }>();
  const [searchParams] = useSearchParams();
  const { data, isLoading } = useSubjectLectures(params.serial);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    const requested = Number(searchParams.get("open"));
    if (requested) setOpenId(requested);
  }, [searchParams]);

  const lectures = data?.lectures ?? [];
  const completed = lectures.filter((l) => l.progress === "completed").length;
  const subjectPrefix =
    data?.subject && data.subject.serial !== "other"
      ? `${data.subject.serial} ${data.subject.nameEn}`
      : "";
  const teacherEn = data?.subject.teacherEn ?? "";

  return (
    <StudentLayout>
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" />
        All subjects
      </Link>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h1 className="text-xl font-semibold">
              {data?.subject.serial !== "other" && (
                <span className="text-muted-foreground mr-2">{data?.subject.serial}</span>
              )}
              {data?.subject.nameEn}
            </h1>
            <span className="text-sm text-muted-foreground shrink-0">
              {completed} / {lectures.length} completed
            </span>
          </div>
          {data?.subject.teacherEn && (
            <p className="text-sm text-muted-foreground mb-4">{data.subject.teacherEn}</p>
          )}

          <Card>
            <CardContent className="py-1">
              {lectures.map((lecture) => (
                <LectureRow
                  key={lecture.id}
                  lecture={lecture}
                  subjectPrefix={subjectPrefix}
                  teacherEn={teacherEn}
                  open={openId === lecture.id}
                  onToggleOpen={() => setOpenId(openId === lecture.id ? null : lecture.id)}
                />
              ))}
              {lectures.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No lectures uploaded yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </StudentLayout>
  );
}
