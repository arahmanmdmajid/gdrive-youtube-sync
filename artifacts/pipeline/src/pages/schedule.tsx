import { useMemo, useState } from "react";
import {
  useListSchedule,
  useUpsertScheduleSlot,
  useDeleteScheduleSlot,
  getListScheduleQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2 } from "lucide-react";

const DAY_LABELS: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday",
};

type EditState = {
  dayOfWeek: number;
  timeSlot: string;
  isNew: boolean;
  serial: string;
  subjectAr: string;
  teacherAr: string;
  subjectEn: string;
  teacherEn: string;
};

export default function Schedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: slots, isLoading } = useListSchedule();
  const [editState, setEditState] = useState<EditState | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListScheduleQueryKey() });

  const upsertMutation = useUpsertScheduleSlot({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Schedule updated" }); setEditState(null); },
      onError: (err: any) => toast({ title: "Failed to save", description: err?.message, variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteScheduleSlot({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Slot removed" }); setEditState(null); },
      onError: () => toast({ title: "Failed to remove slot", variant: "destructive" }),
    },
  });

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

  const openCell = (dayOfWeek: number, timeSlot: string) => {
    const existing = slotMap.get(`${dayOfWeek}|${timeSlot}`);
    setEditState({
      dayOfWeek,
      timeSlot,
      isNew: !existing,
      serial: existing?.serial ?? "",
      subjectAr: existing?.subjectAr ?? "",
      teacherAr: existing?.teacherAr ?? "",
      subjectEn: existing?.subjectEn ?? "",
      teacherEn: existing?.teacherEn ?? "",
    });
  };

  const [newTimeSlot, setNewTimeSlot] = useState("");

  const handleSave = () => {
    if (!editState) return;
    upsertMutation.mutate({
      dayOfWeek: editState.dayOfWeek,
      timeSlot: editState.timeSlot,
      data: {
        serial: editState.serial,
        subjectAr: editState.subjectAr,
        teacherAr: editState.teacherAr,
        subjectEn: editState.subjectEn,
        teacherEn: editState.teacherEn,
      },
    });
  };

  const canSave = !!(
    editState?.serial.trim() &&
    editState?.subjectAr.trim() &&
    editState?.teacherAr.trim() &&
    editState?.subjectEn.trim() &&
    editState?.teacherEn.trim()
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-foreground">Class Schedule</h1>
          <p className="text-muted-foreground mt-1">Weekly timetable — drives automatic video title generation (times in PKT)</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="HH:MM"
            value={newTimeSlot}
            onChange={(e) => setNewTimeSlot(e.target.value)}
            className="w-24 font-mono text-sm"
          />
          <Button
            variant="outline"
            disabled={!/^\d{2}:\d{2}$/.test(newTimeSlot)}
            onClick={() => {
              openCell(days[0] ?? 1, newTimeSlot);
              setNewTimeSlot("");
            }}
            className="gap-1.5 shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add Time Slot
          </Button>
        </div>
      </div>

      <Card className="border-border bg-card shadow-sm overflow-x-auto">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : times.length === 0 ? (
            <div className="text-center p-12 bg-muted/20">
              <p className="text-muted-foreground">No schedule slots yet. Use "Add Time Slot" above to create the first one.</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-mono text-xs text-muted-foreground w-20">TIME</th>
                  {days.map((d) => (
                    <th key={d} className="text-left p-3 font-mono text-xs text-muted-foreground">
                      {DAY_LABELS[d] ?? d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {times.map((t) => (
                  <tr key={t} className="border-b border-border last:border-b-0">
                    <td className="p-3 font-mono text-sm text-muted-foreground whitespace-nowrap">{t}</td>
                    {days.map((d) => {
                      const slot = slotMap.get(`${d}|${t}`);
                      return (
                        <td key={d} className="p-2 align-top">
                          <button
                            type="button"
                            onClick={() => openCell(d, t)}
                            className="w-full h-full min-h-[3.5rem] rounded-md border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors p-2 text-left"
                          >
                            {slot ? (
                              <div className="space-y-0.5">
                                <div className="text-xs font-mono text-muted-foreground">{slot.serial}</div>
                                <div className="text-sm font-medium">{slot.subjectEn}</div>
                                <div className="text-xs text-muted-foreground">{slot.teacherEn}</div>
                                <div className="text-xs text-muted-foreground/70" dir="rtl">{slot.subjectAr} — {slot.teacherAr}</div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground/40">
                                <Plus className="h-4 w-4" />
                              </div>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editState !== null} onOpenChange={(open) => !open && setEditState(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editState?.isNew ? "Add Class" : "Edit Class"}</DialogTitle>
            <DialogDescription>
              {editState && `${DAY_LABELS[editState.dayOfWeek] ?? editState.dayOfWeek} at ${editState.timeSlot} (PKT)`}
            </DialogDescription>
          </DialogHeader>

          {editState && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="slot-serial">Serial</Label>
                <Input
                  id="slot-serial"
                  value={editState.serial}
                  onChange={(e) => setEditState({ ...editState, serial: e.target.value })}
                  placeholder="e.g. 1.1"
                  className="font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="slot-subject-en">Subject (English)</Label>
                  <Input
                    id="slot-subject-en"
                    value={editState.subjectEn}
                    onChange={(e) => setEditState({ ...editState, subjectEn: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="slot-teacher-en">Teacher (English)</Label>
                  <Input
                    id="slot-teacher-en"
                    value={editState.teacherEn}
                    onChange={(e) => setEditState({ ...editState, teacherEn: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="slot-subject-ar">Subject (Arabic)</Label>
                  <Input
                    id="slot-subject-ar"
                    value={editState.subjectAr}
                    onChange={(e) => setEditState({ ...editState, subjectAr: e.target.value })}
                    dir="rtl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="slot-teacher-ar">Teacher (Arabic)</Label>
                  <Input
                    id="slot-teacher-ar"
                    value={editState.teacherAr}
                    onChange={(e) => setEditState({ ...editState, teacherAr: e.target.value })}
                    dir="rtl"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {!editState?.isNew ? (
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-destructive gap-1.5"
                onClick={() => editState && deleteMutation.mutate({ dayOfWeek: editState.dayOfWeek, timeSlot: editState.timeSlot })}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remove
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditState(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!canSave || upsertMutation.isPending}>
                {upsertMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
