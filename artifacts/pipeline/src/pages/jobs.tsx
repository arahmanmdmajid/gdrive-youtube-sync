import { useState, useMemo, useRef } from "react";
import {
  useListJobs,
  useDeleteJob,
  useRetryJob,
  useRestoreJob,
  useRestoreDoneJob,
  useApproveJob,
  usePatchJob,
  useRenameYoutubeTitle,
  useListLectureNames,
  getListJobsQueryKey,
  getGetPipelineStatsQueryKey,
  ListJobsStatus
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, RefreshCcw, ExternalLink, ClipboardCheck, Pencil, RotateCcw, Check, X } from "lucide-react";
import { format } from "date-fns";
import { JobStatusBadge } from "./dashboard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Format a JS Date as DD-MM-YYYY (preview only — server does the authoritative version) */
function previewDate(isoString?: string | null): string {
  if (!isoString) return "??-??-????";
  const d = new Date(isoString);
  // Shift to PKT (UTC+5)
  const pkt = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  const dd = String(pkt.getUTCDate()).padStart(2, "0");
  const mm = String(pkt.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = pkt.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Auto-build the YouTube description from a "Subject | Teacher" lecture name */
function buildDescription(lectureName: string, dateStr: string, driveFileName: string): string {
  const [subject, teacher] = lectureName.split(" | ");
  const lines: string[] = [];
  if (subject) lines.push(`Subject: ${subject.trim()}`);
  if (teacher) lines.push(`Teacher: ${teacher.trim()}`);
  lines.push(`Date: ${dateStr}`);
  lines.push(`Source file: ${driveFileName}`);
  lines.push(`Uploaded automatically by the class recording pipeline.`);
  return lines.join("\n");
}

type EditState = {
  id: number;
  status: string;
  /** The chosen lecture name from the dropdown (drives auto-title) */
  selectedLectureName: string;
  /** Manual override — only used when no lecture name is selected */
  proposedTitle: string;
  proposedDescription: string;
  driveFileName: string;
  driveCreatedTime?: string | null;
};

export default function Jobs() {
  const [statusFilter, setStatusFilter] = useState<ListJobsStatus | "all">("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [renameState, setRenameState] = useState<{ id: number; value: string } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = statusFilter === "all" ? undefined : { status: statusFilter };

  const { data: jobs, isLoading } = useListJobs(params, {
    query: { queryKey: getListJobsQueryKey(params), refetchInterval: 30000 }
  });

  const { data: lectureNames } = useListLectureNames();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPipelineStatsQueryKey() });
  };

  const deleteMutation = useDeleteJob({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Job rejected" }); setDeleteId(null); },
      onError: () => { toast({ title: "Failed to reject job", variant: "destructive" }); setDeleteId(null); }
    }
  });

  const restoreMutation = useRestoreJob({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Job restored to review queue" }); },
      onError: () => toast({ title: "Failed to restore job", variant: "destructive" })
    }
  });

  const retryMutation = useRetryJob({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Job queued for retry" }); },
      onError: () => { toast({ title: "Failed to retry job", variant: "destructive" }); }
    }
  });

  // Used when approving a needs_review job (title edits + status → pending)
  const approveMutation = useApproveJob({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Job approved and queued for upload" });
        setEditState(null);
      },
      onError: () => toast({ title: "Failed to approve job", variant: "destructive" })
    }
  });

  // Used when editing title of an already-pending job (no status change)
  const patchMutation = usePatchJob({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Title updated" });
        setEditState(null);
      },
      onError: () => toast({ title: "Failed to update title", variant: "destructive" })
    }
  });

  const renameTitleMutation = useRenameYoutubeTitle({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "YouTube title updated" }); setRenameState(null); },
      onError: (err: any) => toast({ title: "Failed to update YouTube title", description: err?.message, variant: "destructive" })
    }
  });

  const restoreDoneMutation = useRestoreDoneJob({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Job restored to done" }); },
      onError: () => toast({ title: "Failed to restore job", variant: "destructive" })
    }
  });

  const startRename = (job: { id: number; youtubeTitle?: string | null }) => {
    setRenameState({ id: job.id, value: job.youtubeTitle ?? "" });
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };
  const commitRename = () => {
    if (!renameState) return;
    const trimmed = renameState.value.trim();
    if (!trimmed) return;
    renameTitleMutation.mutate({ id: renameState.id, data: { title: trimmed } });
  };
  const cancelRename = () => setRenameState(null);

  const isSubmitting = approveMutation.isPending || patchMutation.isPending;

  const openEdit = (job: {
    id: number;
    status: string;
    proposedTitle?: string | null;
    proposedDescription?: string | null;
    driveFileName: string;
    driveCreatedTime?: string | null;
  }) => {
    setEditState({
      id: job.id,
      status: job.status,
      selectedLectureName: "",
      proposedTitle: job.proposedTitle ?? job.driveFileName,
      proposedDescription: job.proposedDescription ?? "",
      driveFileName: job.driveFileName,
      driveCreatedTime: job.driveCreatedTime,
    });
  };

  const handleSave = () => {
    if (!editState) return;
    const payload = editState.selectedLectureName
      ? { lectureName: editState.selectedLectureName, proposedDescription: editState.proposedDescription }
      : { proposedTitle: editState.proposedTitle, proposedDescription: editState.proposedDescription };

    if (editState.status === "needs_review") {
      approveMutation.mutate({ id: editState.id, data: payload });
    } else {
      patchMutation.mutate({ id: editState.id, data: payload });
    }
  };

  /** Preview title shown in the dialog before saving */
  const previewTitle = useMemo(() => {
    if (!editState) return "";
    if (editState.selectedLectureName) {
      return `${editState.selectedLectureName} | ${previewDate(editState.driveCreatedTime)}`;
    }
    return editState.proposedTitle;
  }, [editState]);

  const bytesToMB = (bytes?: number | null) => {
    if (!bytes) return "-";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const driveUrl = (fileId: string) => `https://drive.google.com/file/d/${fileId}/view`;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-mono tracking-tight text-foreground">Job Queue</h1>
        <p className="text-muted-foreground mt-1">Review and manage video uploads</p>
      </div>

      <div className="flex items-center justify-between">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as ListJobsStatus | "all")}
        >
          <SelectTrigger className="w-[180px] font-mono" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="needs_review">Needs Review</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="removed">Removed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border bg-card shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <div className="text-center p-12 bg-muted/20">
              <p className="text-muted-foreground">No jobs found matching your criteria.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="font-mono text-xs">ID</TableHead>
                  <TableHead className="font-mono text-xs">FILE / TITLE</TableHead>
                  <TableHead className="font-mono text-xs">SIZE</TableHead>
                  <TableHead className="font-mono text-xs">STATUS</TableHead>
                  <TableHead className="font-mono text-xs">RECORDED</TableHead>
                  <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map(job => (
                  <TableRow
                    key={job.id}
                    className={`border-border group ${job.status === "needs_review" ? "bg-amber-500/5" : job.status === "rejected" || job.status === "removed" ? "bg-muted/40 opacity-60" : ""}`}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">#{job.id}</TableCell>

                    <TableCell className="font-medium max-w-[300px]">
                      {/* Drive filename — link to the file, except for manually-added jobs (no real Drive source) */}
                      {job.source === "manual" ? (
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[220px] text-xs text-muted-foreground">{job.driveFileName}</span>
                          <Badge variant="outline" className="text-[10px] font-mono shrink-0">Manually added</Badge>
                        </div>
                      ) : (
                        <a
                          href={driveUrl(job.driveFileId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group/link inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          title={`Open in Google Drive: ${job.driveFileName}`}
                        >
                          <span className="truncate max-w-[270px]">{job.driveFileName}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover/link:opacity-60 transition-opacity" />
                        </a>
                      )}

                      {/* Proposed / final title */}
                      {job.status === "needs_review" && job.proposedTitle ? (
                        <div className="truncate text-sm font-medium text-amber-700 dark:text-amber-400 mt-0.5" title={job.proposedTitle}>
                          {job.proposedTitle}
                        </div>
                      ) : job.youtubeTitle ? (
                        renameState?.id === job.id ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Input
                              ref={renameInputRef}
                              value={renameState.value}
                              onChange={(e) => setRenameState({ ...renameState, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") cancelRename(); }}
                              placeholder="{serial} {Subject} | {Teacher} | DD-MM-YYYY"
                              className="flex-1 h-7 font-mono text-sm py-0"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={commitRename}
                              disabled={!renameState.value.trim() || renameTitleMutation.isPending}
                              className="h-7 w-7 text-green-600 hover:text-green-700 shrink-0"
                              title="Save"
                            >
                              {renameTitleMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={cancelRename}
                              className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <a
                            href={job.youtubeUrl ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group/yt inline-flex items-center gap-1 text-sm font-medium hover:text-primary transition-colors mt-0.5"
                            title={job.youtubeTitle}
                          >
                            <span className="truncate max-w-[270px]">{job.youtubeTitle}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover/yt:opacity-60 transition-opacity" />
                          </a>
                        )
                      ) : job.proposedTitle ? (
                        <div className="truncate text-sm font-medium text-foreground mt-0.5" title={job.proposedTitle}>
                          {job.proposedTitle}
                        </div>
                      ) : null}

                      {job.errorMessage && (
                        <div className="text-xs text-destructive mt-1 truncate" title={job.errorMessage}>
                          {job.errorMessage}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {bytesToMB(job.driveFileSizeBytes)}
                    </TableCell>

                    <TableCell>
                      <JobStatusBadge status={job.status} />
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {job.driveCreatedTime
                        ? format(new Date(job.driveCreatedTime), "MMM d, HH:mm")
                        : format(new Date(job.createdAt), "MMM d, HH:mm")}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Edit/review button for needs_review and pending */}
                        {(job.status === "needs_review" || job.status === "pending") && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openEdit(job)}
                            title={job.status === "needs_review" ? "Review & Approve" : "Edit Title"}
                            data-testid={`btn-edit-${job.id}`}
                            className={job.status === "needs_review"
                              ? "border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                              : ""}
                          >
                            {job.status === "needs_review"
                              ? <ClipboardCheck className="h-4 w-4" />
                              : <Pencil className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                        )}

                        {job.status === "failed" && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => retryMutation.mutate({ id: job.id })}
                            disabled={retryMutation.isPending}
                            title="Retry"
                            data-testid={`btn-retry-${job.id}`}
                          >
                            <RefreshCcw className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </Button>
                        )}

                        {job.status === "rejected" && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => restoreMutation.mutate({ id: job.id })}
                            disabled={restoreMutation.isPending}
                            title="Restore to review queue"
                            data-testid={`btn-restore-${job.id}`}
                            className="border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}

                        {job.status === "removed" && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => restoreDoneMutation.mutate({ id: job.id })}
                            disabled={restoreDoneMutation.isPending}
                            title="Mark as done again (after manually re-adding to playlist)"
                            data-testid={`btn-restore-done-${job.id}`}
                            className="border-orange-500/40 text-orange-600 hover:bg-orange-500/10"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}

                        {job.status === "done" && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => startRename(job)}
                            title="Rename YouTube title"
                            data-testid={`btn-rename-${job.id}`}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </Button>
                        )}

                        {job.youtubeUrl && (
                          <Button variant="outline" size="icon" asChild title="View on YouTube">
                            <a href={job.youtubeUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-youtube-${job.id}`}>
                              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </a>
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setDeleteId(job.id)}
                          className="hover:bg-destructive/10 hover:text-destructive border-transparent"
                          title="Delete"
                          data-testid={`btn-delete-${job.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit / Review dialog — shared for needs_review (approve) and pending (patch) */}
      <Dialog open={editState !== null} onOpenChange={(open) => !open && setEditState(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editState?.status === "needs_review" ? "Review Recording" : "Edit Title"}
            </DialogTitle>
            <DialogDescription>
              {editState?.status === "needs_review"
                ? "Confirm or edit the title and description before this video is queued for upload."
                : "Update the YouTube title and description. The job is already queued — changes apply before it uploads."}
            </DialogDescription>
          </DialogHeader>

          {editState && (
            <div className="space-y-4">
              {/* Drive file link */}
              <a
                href={driveUrl(jobs?.find(j => j.id === editState.id)?.driveFileId ?? "")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{editState.driveFileName}</span>
              </a>

              {/* Lecture name dropdown */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-lecture-name">Lecture Name</Label>
                {lectureNames && lectureNames.length > 0 ? (
                  <Select
                    value={editState.selectedLectureName || "none"}
                    onValueChange={(v) => {
                      const name = v === "none" ? "" : v;
                      const desc = name
                        ? buildDescription(name, previewDate(editState.driveCreatedTime), editState.driveFileName)
                        : editState.proposedDescription;
                      setEditState({ ...editState, selectedLectureName: name, proposedDescription: desc });
                    }}
                  >
                    <SelectTrigger id="edit-lecture-name" className="font-mono text-sm">
                      <SelectValue placeholder="Select a lecture name…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-muted-foreground">— none (use manual title below) —</SelectItem>
                      {lectureNames.map((ln) => (
                        <SelectItem key={ln.id} value={ln.name} className="font-mono">
                          {ln.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No lecture names configured.{" "}
                    <a href="/settings" className="underline hover:text-foreground">Add them in Settings.</a>
                  </p>
                )}
              </div>

              {/* Title preview / manual override */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-title" className="flex items-center justify-between">
                  <span>YouTube Title</span>
                  {editState.selectedLectureName && (
                    <span className="text-xs text-muted-foreground font-normal">auto-generated from lecture name + date</span>
                  )}
                </Label>
                <div
                  className={`rounded-md border px-3 py-2 text-sm font-mono min-h-[38px] ${
                    editState.selectedLectureName
                      ? "bg-muted/40 text-muted-foreground border-border"
                      : "bg-background border-input"
                  }`}
                >
                  {previewTitle || <span className="text-muted-foreground/50 italic">No title yet</span>}
                </div>
                {!editState.selectedLectureName && (
                  <p className="text-xs text-muted-foreground">Select a lecture name above, or the current proposed title will be kept.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editState.proposedDescription}
                  onChange={(e) => setEditState({ ...editState, proposedDescription: e.target.value })}
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditState(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSubmitting || (!editState?.selectedLectureName && !editState?.proposedTitle?.trim())}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editState?.status === "needs_review" ? (
                <><ClipboardCheck className="h-4 w-4 mr-2" /> Approve & Queue</>
              ) : (
                <><Pencil className="h-4 w-4 mr-2" /> Save Title</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Job #{deleteId} will be marked as rejected and removed from the review queue. The file will not be deleted from Drive. The pipeline will not re-scan it, but you can restore it at any time from the Rejected filter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
