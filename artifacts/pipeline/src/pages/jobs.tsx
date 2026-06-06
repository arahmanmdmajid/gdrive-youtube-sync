import { useState } from "react";
import { 
  useListJobs, 
  useDeleteJob, 
  useRetryJob,
  getListJobsQueryKey,
  getGetPipelineStatsQueryKey,
  ListJobsStatus
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, RefreshCcw, ExternalLink } from "lucide-react";
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

export default function Jobs() {
  const [statusFilter, setStatusFilter] = useState<ListJobsStatus | "all">("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = statusFilter === "all" ? undefined : { status: statusFilter };
  
  const { data: jobs, isLoading } = useListJobs(params, {
    query: { refetchInterval: 30000 }
  });

  const deleteMutation = useDeleteJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPipelineStatsQueryKey() });
        toast({ title: "Job deleted successfully" });
        setDeleteId(null);
      },
      onError: () => {
        toast({ title: "Failed to delete job", variant: "destructive" });
        setDeleteId(null);
      }
    }
  });

  const retryMutation = useRetryJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPipelineStatsQueryKey() });
        toast({ title: "Job queued for retry" });
      },
      onError: () => {
        toast({ title: "Failed to retry job", variant: "destructive" });
      }
    }
  });

  const bytesToMB = (bytes?: number | null) => {
    if (!bytes) return "-";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-mono tracking-tight text-foreground">Job Queue</h1>
        <p className="text-muted-foreground mt-1">Manage and monitor specific video uploads</p>
      </div>

      <div className="flex items-center justify-between">
        <Select 
          value={statusFilter} 
          onValueChange={(v) => setStatusFilter(v as any)}
        >
          <SelectTrigger className="w-[180px] font-mono" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
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
                  <TableHead className="font-mono text-xs">FILE NAME</TableHead>
                  <TableHead className="font-mono text-xs">SIZE</TableHead>
                  <TableHead className="font-mono text-xs">STATUS</TableHead>
                  <TableHead className="font-mono text-xs">CREATED</TableHead>
                  <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map(job => (
                  <TableRow key={job.id} className="border-border group">
                    <TableCell className="font-mono text-xs text-muted-foreground">#{job.id}</TableCell>
                    <TableCell className="font-medium">
                      <div className="truncate max-w-[250px]" title={job.driveFileName}>
                        {job.driveFileName}
                      </div>
                      {job.errorMessage && (
                        <div className="text-xs text-destructive mt-1 truncate max-w-[250px]" title={job.errorMessage}>
                          {job.errorMessage}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {bytesToMB(job.driveFileSizeBytes)}
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(job.createdAt), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete job #{deleteId}? This will remove it from the pipeline. It will not delete the file from Drive or YouTube.
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
