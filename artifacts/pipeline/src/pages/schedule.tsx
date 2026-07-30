import { useEffect, useMemo, useState } from "react";
import {
  useListSchedule,
  useUpsertScheduleSlot,
  useDeleteScheduleSlot,
  upsertScheduleSlot,
  getListScheduleQueryKey,
  type ScheduleSlot,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { formatTimeLabel } from "@/lib/timezone";
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";

const HOUR_FORMAT_STORAGE_KEY = "admin-schedule-24h";

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

function cardId(dayOfWeek: number, timeSlot: string) {
  return `${dayOfWeek}:${timeSlot}`;
}

function DraggableCard({ slot, onOpen, use24Hour }: { slot: ScheduleSlot; onOpen: () => void; use24Hour: boolean }) {
  const id = cardId(slot.dayOfWeek, slot.timeSlot);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-md border border-border bg-card hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-1 p-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left space-y-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-mono text-muted-foreground">{formatTimeLabel(slot.timeSlot, use24Hour)}</span>
            <span className="text-xs font-mono text-muted-foreground/70">{slot.serial}</span>
          </div>
          <div className="text-sm font-medium truncate">{slot.subjectEn}</div>
          <div className="text-xs text-muted-foreground truncate">{slot.teacherEn}</div>
          <div className="text-xs text-muted-foreground/70 truncate" dir="rtl">{slot.subjectAr} — {slot.teacherAr}</div>
        </button>
      </div>
    </div>
  );
}

export default function Schedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: slots, isLoading } = useListSchedule();
  const [editState, setEditState] = useState<EditState | null>(null);
  const [reordering, setReordering] = useState(false);
  const [use24Hour, setUse24Hour] = useState(() => localStorage.getItem(HOUR_FORMAT_STORAGE_KEY) === "true");

  useEffect(() => {
    localStorage.setItem(HOUR_FORMAT_STORAGE_KEY, String(use24Hour));
  }, [use24Hour]);

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

  const { days, byDay } = useMemo(() => {
    const dayset = new Set<number>();
    const grouped = new Map<number, ScheduleSlot[]>();
    for (const s of slots ?? []) {
      dayset.add(s.dayOfWeek);
      const bucket = grouped.get(s.dayOfWeek) ?? [];
      bucket.push(s);
      grouped.set(s.dayOfWeek, bucket);
    }
    for (const bucket of grouped.values()) bucket.sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));
    return { days: [...dayset].sort((a, b) => a - b), byDay: grouped };
  }, [slots]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const [activeDay] = String(active.id).split(":");
    const [overDay] = String(over.id).split(":");
    if (activeDay !== overDay) return; // reordering is only within the same day's column

    const dayOfWeek = Number(activeDay);
    const daySlots = byDay.get(dayOfWeek);
    if (!daySlots) return;

    const oldIndex = daySlots.findIndex((s) => cardId(s.dayOfWeek, s.timeSlot) === active.id);
    const newIndex = daySlots.findIndex((s) => cardId(s.dayOfWeek, s.timeSlot) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const times = daySlots.map((s) => s.timeSlot);
    const reordered = arrayMove(daySlots, oldIndex, newIndex);

    setReordering(true);
    try {
      await Promise.all(
        reordered.map((slotContent, i) =>
          upsertScheduleSlot(dayOfWeek, times[i], {
            serial: slotContent.serial,
            subjectAr: slotContent.subjectAr,
            teacherAr: slotContent.teacherAr,
            subjectEn: slotContent.subjectEn,
            teacherEn: slotContent.teacherEn,
          }),
        ),
      );
      invalidate();
    } catch (err: any) {
      toast({ title: "Failed to reorder", description: err?.message, variant: "destructive" });
    } finally {
      setReordering(false);
    }
  };

  const openCell = (dayOfWeek: number, timeSlot: string) => {
    const existing = byDay.get(dayOfWeek)?.find((s) => s.timeSlot === timeSlot);
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

  const [addingForDay, setAddingForDay] = useState<number | null>(null);
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
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-foreground">Class Schedule</h1>
          <p className="text-muted-foreground mt-1">
            Weekly timetable — drives automatic video title generation (times in PKT). Drag a card up or down within its day to reorder.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Label htmlFor="hour-format-switch" className="text-xs text-muted-foreground">24h</Label>
          <Switch id="hour-format-switch" checked={use24Hour} onCheckedChange={setUse24Hour} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}>
            {days.map((d) => {
              const daySlots = byDay.get(d) ?? [];
              return (
                <Card key={d} className="border-border bg-card shadow-sm">
                  <CardHeader className="py-3 px-3">
                    <CardTitle className="text-sm font-mono">{DAY_LABELS[d] ?? d}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-2 space-y-2">
                    <SortableContext
                      items={daySlots.map((s) => cardId(s.dayOfWeek, s.timeSlot))}
                      strategy={verticalListSortingStrategy}
                    >
                      {daySlots.map((slot) => (
                        <DraggableCard key={cardId(slot.dayOfWeek, slot.timeSlot)} slot={slot} onOpen={() => openCell(slot.dayOfWeek, slot.timeSlot)} use24Hour={use24Hour} />
                      ))}
                    </SortableContext>

                    {addingForDay === d ? (
                      <div className="flex items-center gap-1.5 p-1">
                        <Input
                          autoFocus
                          placeholder="HH:MM"
                          value={newTimeSlot}
                          onChange={(e) => setNewTimeSlot(e.target.value)}
                          className="h-8 font-mono text-xs"
                        />
                        <Button
                          size="sm"
                          disabled={!/^\d{2}:\d{2}$/.test(newTimeSlot)}
                          onClick={() => {
                            openCell(d, newTimeSlot);
                            setNewTimeSlot("");
                            setAddingForDay(null);
                          }}
                        >
                          Add
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAddingForDay(null); setNewTimeSlot(""); }}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingForDay(d)}
                        className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:border-primary/40 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add class
                      </button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DndContext>
      )}

      {reordering && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 shadow-md text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving new order…
        </div>
      )}

      <Dialog open={editState !== null} onOpenChange={(open) => !open && setEditState(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editState?.isNew ? "Add Class" : "Edit Class"}</DialogTitle>
            <DialogDescription>
              {editState && `${DAY_LABELS[editState.dayOfWeek] ?? editState.dayOfWeek} at ${formatTimeLabel(editState.timeSlot, use24Hour)} (PKT)`}
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
