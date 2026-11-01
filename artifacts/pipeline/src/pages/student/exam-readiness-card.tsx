import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useExamReadiness, useSaveStudyPlan, type ExamReadiness } from "@/lib/student-api";

/** "3h 5m", "45m". */
function formatHm(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** "29 Dec" from a plain YYYY-MM-DD date, with no time zone shifting it. */
function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground truncate">{hint}</p>}
    </div>
  );
}

function PlanForm({ data }: { data: ExamReadiness }) {
  const save = useSaveStudyPlan();
  const [hours, setHours] = useState(data.plan ? String(data.plan.hoursPerDay) : "");
  const [days, setDays] = useState(String(data.plan?.daysPerWeek ?? 7));

  // Follow the saved plan when it loads or changes.
  useEffect(() => {
    if (data.plan) {
      setHours(String(data.plan.hoursPerDay));
      setDays(String(data.plan.daysPerWeek));
    }
  }, [data.plan?.hoursPerDay, data.plan?.daysPerWeek]);

  const hoursNumber = Number(hours);
  const valid = hours.trim() !== "" && Number.isFinite(hoursNumber) && hoursNumber >= 1 / 60 && hoursNumber <= 24;
  const changed = !data.plan || hoursNumber !== data.plan.hoursPerDay || Number(days) !== data.plan.daysPerWeek;

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate({ hoursPerDay: hoursNumber, daysPerWeek: Number(days) });
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="plan-hours" className="text-xs text-muted-foreground">Hours a day</Label>
          <Input
            id="plan-hours"
            type="number"
            inputMode="decimal"
            step="0.25"
            min="0"
            max="24"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-28"
            data-testid="plan-hours"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="plan-days" className="text-xs text-muted-foreground">Study days a week</Label>
          <select
            id="plan-days"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="flex h-9 w-28 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-testid="plan-days"
          >
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" disabled={!valid || !changed || save.isPending} data-testid="plan-save">
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
          Save
        </Button>
      </div>
      {hours.trim() !== "" && !valid && (
        <p className="text-xs text-destructive">Hours a day must be more than 0 and at most 24.</p>
      )}
      {save.isError && <p className="text-xs text-destructive">Could not save. Please try again.</p>}
    </form>
  );
}

export function ExamReadinessCard() {
  const { data, isLoading, isError } = useExamReadiness();

  if (isLoading) return <Skeleton className="h-40 mb-6" />;
  if (isError || !data) return null; // the tracker is extra; the subjects below still work

  const pct = data.seconds.total ? Math.round((data.seconds.completed / data.seconds.total) * 100) : 0;
  const planning = data.state === "needs_plan" || data.state === "on_track" || data.state === "at_risk";
  const atRisk = data.state === "at_risk";

  return (
    <Card className="mb-6" data-testid="exam-readiness">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Exam readiness</h2>
          <span className="text-xs text-muted-foreground shrink-0">
            {data.state === "exam_passed"
              ? "The exam date has passed"
              : `${data.daysToExam} ${data.daysToExam === 1 ? "day" : "days"} to the exam`}
          </span>
        </div>

        {data.lectures.total > 0 && (
          <>
            <div className="space-y-1.5">
              <Progress value={pct} className="h-2" aria-label="Study time completed" />
              <p className="text-xs text-muted-foreground">{pct}% of study time completed</p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Lectures completed" value={`${data.lectures.completed} / ${data.lectures.total}`} />
              <Stat label="Lectures left" value={String(data.lectures.remaining)} />
              <Stat label="Time completed" value={formatHm(data.seconds.completed)} hint={`of ${formatHm(data.seconds.total)}`} />
              <Stat label="Time left" value={formatHm(data.seconds.remaining)} />
            </div>
            {data.approximate && (
              <p className="text-xs text-muted-foreground">Some lecture lengths are not known yet, so these times are approximate.</p>
            )}
          </>
        )}

        {data.state === "done" || data.state === "no_lectures" ? (
          <p className="flex items-center gap-2 text-sm">
            {data.state === "done" && <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
            {data.message}
          </p>
        ) : null}

        {planning && (
          <>
            <PlanForm data={data} />
            {data.message && (
              <div
                className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                  atRisk ? "border-destructive/40 bg-destructive/5" : data.state === "on_track" ? "border-success/40 bg-success/5" : "border-border"
                }`}
                data-testid="plan-message"
              >
                {atRisk && <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                {data.state === "on_track" && <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />}
                <div className="space-y-1">
                  <p>{data.message}</p>
                  {data.state === "on_track" && data.projection && (
                    <p className="text-xs text-muted-foreground">
                      Minimum to finish on time: {data.projection.minHoursPerDay} hours a day
                      {data.plan && data.plan.daysPerWeek < 7 ? `, ${data.plan.daysPerWeek} days a week` : ""}.
                    </p>
                  )}
                </div>
              </div>
            )}
            {data.comparison.length > 0 && (
              <table className="w-full text-sm" data-testid="plan-comparison">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="font-normal pb-1">Hours a day</th>
                    <th className="font-normal pb-1">Finish date</th>
                    <th className="font-normal pb-1 text-right">Exam</th>
                  </tr>
                </thead>
                <tbody>
                  {data.comparison.map((row) => (
                    <tr key={row.hoursPerDay} className={data.plan?.hoursPerDay === row.hoursPerDay ? "font-medium" : ""}>
                      <td className="py-0.5">{row.hoursPerDay}</td>
                      <td className="py-0.5">{formatDay(row.finishDate)}</td>
                      <td className={`py-0.5 text-right ${row.status === "at_risk" ? "text-destructive" : "text-success"}`}>
                        {row.status === "at_risk" ? "Too late" : "On time"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
