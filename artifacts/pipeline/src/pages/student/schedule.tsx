import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StudentLayout } from "@/components/student-layout";
import { useStudentSchedule } from "@/lib/student-api";
import { getAllTimezones, getBrowserTimezone, getUtcOffsetLabel, convertPktSlot, formatTimeLabel } from "@/lib/timezone";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const DAY_LABELS: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday",
};

const STORAGE_KEY = "student-schedule-timezone";
const HOUR_FORMAT_STORAGE_KEY = "student-schedule-24h";

export default function StudentSchedule() {
  const { data: slots, isLoading } = useStudentSchedule();
  const [timezone, setTimezone] = useState(() => localStorage.getItem(STORAGE_KEY) || getBrowserTimezone());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [use24Hour, setUse24Hour] = useState(() => localStorage.getItem(HOUR_FORMAT_STORAGE_KEY) === "true");
  const allTimezones = useMemo(
    () => getAllTimezones().map((tz) => ({ tz, offset: getUtcOffsetLabel(tz) })),
    [],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, timezone);
  }, [timezone]);

  useEffect(() => {
    localStorage.setItem(HOUR_FORMAT_STORAGE_KEY, String(use24Hour));
  }, [use24Hour]);

  const isPkt = timezone === "Asia/Karachi";

  // Conversion is a fixed shift applied uniformly to every slot (PKT has no
  // DST, and the reference week is chosen to avoid the target timezone's own
  // DST transitions), so it can never map two distinct PKT slots onto the
  // same converted (day, time) — safe to key a flat map by the result.
  const { days, times, slotMap } = useMemo(() => {
    const map = new Map<string, { dayOfWeek: number; timeSlot: string; pktTimeSlot: string; serial: string; subjectAr: string; teacherAr: string; subjectEn: string; teacherEn: string }>();
    const dayset = new Set<number>();
    const timeset = new Set<string>();
    for (const s of slots ?? []) {
      const converted = isPkt ? { dayOfWeek: s.dayOfWeek, timeSlot: s.timeSlot } : convertPktSlot(s.dayOfWeek, s.timeSlot, timezone);
      const key = `${converted.dayOfWeek}|${converted.timeSlot}`;
      map.set(key, { ...s, dayOfWeek: converted.dayOfWeek, timeSlot: converted.timeSlot, pktTimeSlot: s.timeSlot });
      dayset.add(converted.dayOfWeek);
      timeset.add(converted.timeSlot);
    }
    return {
      days: [...dayset].sort((a, b) => a - b),
      times: [...timeset].sort(),
      slotMap: map,
    };
  }, [slots, timezone, isPkt]);

  const offsetLabel = getUtcOffsetLabel(timezone);

  return (
    <StudentLayout>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Schedule</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Weekly class timetable{isPkt ? " — all times in Pakistan Standard Time (PKT)" : " — converted to your selected timezone"}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="hour-format-switch" className="text-xs text-muted-foreground">24h</Label>
            <Switch id="hour-format-switch" checked={use24Hour} onCheckedChange={setUse24Hour} />
          </div>

          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                <Globe className="h-3.5 w-3.5" />
                <span className="max-w-[180px] truncate">{timezone}</span>
                <span className="text-muted-foreground">{offsetLabel}</span>
                <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <Command>
                <CommandInput placeholder="Search timezone or city…" />
                <CommandList>
                  <CommandEmpty>No timezone found.</CommandEmpty>
                  <CommandGroup>
                    {allTimezones.map(({ tz, offset }) => (
                      <CommandItem
                        key={tz}
                        value={tz}
                        onSelect={() => { setTimezone(tz); setPickerOpen(false); }}
                      >
                        <Check className={cn("h-4 w-4", tz === timezone ? "opacity-100" : "opacity-0")} />
                        <span className="truncate flex-1">{tz}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{offset}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
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
                    <td className="p-3 text-sm text-muted-foreground whitespace-nowrap align-top">{formatTimeLabel(t, use24Hour)}</td>
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
                              {!isPkt && (
                                <div className="text-[11px] text-muted-foreground/50">PKT {formatTimeLabel(slot.pktTimeSlot, use24Hour)}</div>
                              )}
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
