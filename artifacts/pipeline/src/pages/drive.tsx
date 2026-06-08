import { useState } from "react";
import {
  useListDriveFiles,
  useCreateJob,
  getListJobsQueryKey,
  getListDriveFilesQueryKey,
  getGetPipelineStatsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Film, Check, AlertTriangle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

type ViewFilter = "all" | "eligible" | "skipped";

export default function Drive() {
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: files, isLoading, error } = useListDriveFiles();

  const createJobMutation = useCreateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListDriveFilesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPipelineStatsQueryKey() });
        toast({ title: "File queued for review" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to queue file", description: err.message, variant: "destructive" });
      }
    }
  });

  const handleQueue = (file: any) => {
    createJobMutation.mutate({
      data: {
        driveFileId: file.id,
        driveFileName: file.name,
        driveFileSizeBytes: file.sizeBytes,
        driveCreatedTime: file.createdTime,
      }
    });
  };

  const bytesToMB = (bytes?: number | null) => {
    if (!bytes) return "-";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const eligibleCount = files?.filter(f => !f.skipReason).length ?? 0;
  const skippedCount = files?.filter(f => f.skipReason).length ?? 0;

  const visibleFiles = files?.filter(f => {
    if (viewFilter === "eligible") return !f.skipReason;
    if (viewFilter === "skipped") return !!f.skipReason;
    return true;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-foreground">Drive Files</h1>
          <p className="text-muted-foreground mt-1">All videos in the source folder</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/settings">Configure Folder</Link>
        </Button>
      </div>

      {/* Summary + filter */}
      {files && files.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-muted-foreground font-mono">
            <span className="text-foreground font-medium">{files.length} total</span>
            <span>·</span>
            <span className="text-green-600 dark:text-green-400">{eligibleCount} eligible</span>
            <span>·</span>
            <span className="text-muted-foreground">{skippedCount} skipped</span>
          </div>
          <ToggleGroup
            type="single"
            value={viewFilter}
            onValueChange={(v) => v && setViewFilter(v as ViewFilter)}
            className="font-mono text-xs"
          >
            <ToggleGroupItem value="all" className="text-xs px-3">All</ToggleGroupItem>
            <ToggleGroupItem value="eligible" className="text-xs px-3">Eligible</ToggleGroupItem>
            <ToggleGroupItem value="skipped" className="text-xs px-3">Skipped</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      <Card className="border-border bg-card shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center p-12 text-destructive">
              <p>Failed to load Drive files. Please check your folder ID in settings.</p>
            </div>
          ) : !visibleFiles || visibleFiles.length === 0 ? (
            <div className="text-center p-12 bg-muted/20">
              <p className="text-muted-foreground mb-4">
                {files?.length === 0
                  ? "No video files found in the configured folder."
                  : "No files match the current filter."}
              </p>
              {files?.length === 0 && (
                <Button asChild><Link href="/settings">Check Settings</Link></Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-mono text-xs w-[40px]"></TableHead>
                  <TableHead className="font-mono text-xs">FILE NAME</TableHead>
                  <TableHead className="font-mono text-xs">SIZE</TableHead>
                  <TableHead className="font-mono text-xs">RECORDED</TableHead>
                  <TableHead className="font-mono text-xs">UPLOADED</TableHead>
                  <TableHead className="font-mono text-xs">FILTER REASON</TableHead>
                  <TableHead className="font-mono text-xs text-right">ACTION</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleFiles.map(file => {
                  const isSkipped = !!file.skipReason;
                  return (
                    <TableRow
                      key={file.id}
                      className={`border-border ${isSkipped ? "opacity-50" : ""}`}
                    >
                      <TableCell>
                        <Film className={`h-4 w-4 ${isSkipped ? "text-muted-foreground/50" : "text-muted-foreground"}`} />
                      </TableCell>
                      <TableCell className="font-medium">
                        <a
                          href={`https://drive.google.com/file/d/${file.id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group/link inline-flex items-center gap-1.5 hover:text-primary transition-colors"
                          title={`Open in Google Drive: ${file.name}`}
                        >
                          <span className="truncate max-w-[300px]">{file.name}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover/link:opacity-60 transition-opacity" />
                        </a>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        <span>{bytesToMB(file.sizeBytes)}</span>
                        {file.isSuspiciousSize && (
                          <span className="ml-1.5 text-amber-500" title="Large file — may be a batch recording">
                            <AlertTriangle className="inline h-3 w-3" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {file.createdTime ? format(new Date(file.createdTime), "MMM d, yyyy HH:mm") : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {file.modifiedTime ? format(new Date(file.modifiedTime), "MMM d, yyyy HH:mm") : "-"}
                      </TableCell>
                      <TableCell>
                        {file.skipReason ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono text-muted-foreground border-border"
                            title={file.skipReason}
                          >
                            {file.skipReason}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono text-green-600 dark:text-green-400 border-green-500/20 bg-green-500/5"
                          >
                            eligible
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {file.alreadyQueued ? (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-mono text-[10px]">
                            <Check className="mr-1 h-3 w-3" /> Queued
                          </Badge>
                        ) : !isSkipped ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleQueue(file)}
                            disabled={createJobMutation.isPending}
                            data-testid={`btn-queue-${file.id}`}
                          >
                            <Plus className="mr-2 h-4 w-4" /> Queue
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
