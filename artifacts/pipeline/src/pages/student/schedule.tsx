import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentLayout } from "@/components/student-layout";
import { useStudentSchedule } from "@/lib/student-api";

const DAY_LABELS: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday",
};

export default function StudentSchedule() {
  const { data: slots, isLoading } = useStudentSchedule();

  const { days, times, slotMap } = useMemo(() => {
    const map = new Map<string, NonNullable<typeof slots>[number]>();
    const dayset = new Set<number>();
    const timeset = new Set<string>();
    for (const s of slots ?? []) {
      map.set(`${s.dayOfWeek}|${s.timeSlot}`, s);
      dayset.add(s.dayOfWeek);
      timeset.add(s.timeSlot);
    }
    return {
      days: [...dayset].sort((a, b) => a - b),
      times: [...timeset].sort(),
      slotMap: map,
    };
  }, [slots]);

  return (
    <StudentLayout>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Schedule</h1>
        <p className="text-sm text-muted-foreground mt-1">Weekly class timetable — all times in Pakistan Standard Time (PKT)</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : times.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No schedule available yet.</p>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-xs text-muted-foreground w-20">Time</th>
                  {days.map((d) => (
                    <th key={d} className="text-left p-3 text-xs text-muted-foreground">
                      {DAY_LABELS[d] ?? d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {times.map((t) => (
                  <tr key={t} className="border-b border-border last:border-b-0">
                    <td className="p-3 text-sm text-muted-foreground whitespace-nowrap align-top">{t}</td>
                    {days.map((d) => {
                      const slot = slotMap.get(`${d}|${t}`);
                      return (
                        <td key={d} className="p-3 align-top">
                          {slot ? (
                            <div className="space-y-0.5">
                              <div className="text-xs text-muted-foreground">{slot.serial}</div>
                              <div className="text-sm font-medium">{slot.subjectEn}</div>
                              <div className="text-xs text-muted-foreground">{slot.teacherEn}</div>
                              <div className="text-xs text-muted-foreground/70" dir="rtl">{slot.subjectAr} — {slot.teacherAr}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </StudentLayout>
  );
}
