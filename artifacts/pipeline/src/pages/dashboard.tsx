import {
  useGetPipelineStats,
  useTriggerPipeline,
  useTriggerUpload,
  useReconcilePlaylist,
  useListJobs,
  getGetPipelineStatsQueryKey,
  getListJobsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Play, Upload, Activity, Clock, CheckCircle, AlertCircle, RefreshCw, Loader2, ArrowRight, ListVideo } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useGetPipelineStats({
    query: { queryKey: getGetPipelineStatsQueryKey(), refetchInterval: 30000 }
  });

  const { data: jobs, isLoading: jobsLoading } = useListJobs(undefined, {
    query: { queryKey: getListJobsQueryKey(), refetchInterval: 30000 }
  });

  const triggerMutation = useTriggerPipeline({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetPipelineStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        toast({
          title: "Scan Complete",
          description: `Scanned ${data.totalScanned} files. Queued ${data.newJobsCreated} new jobs. (${data.alreadyQueued} already queued)`,
        });
      },
      onError: (err: any) => {
        toast({
          title: "Scan Failed",
          description: err?.message || "An error occurred while scanning Drive.",
          variant: "destructive"
        });
      }
    }
  });

  const uploadMutation = useTriggerUpload({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetPipelineStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        toast({
          title: data.started === 0 ? "Nothing to upload" : "Upload started",
          description: data.message,
        });
      },
      onError: (err: any) => {
        toast({
          title: "Upload Failed",
          description: err?.message || "Could not start the upload.",
          variant: "destructive"
        });
      }
    }
  });

  const reconcileMutation = useReconcilePlaylist({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetPipelineStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        toast({
          title: "Playlist synced",
          description: `${data.inserted.length} added, ${data.removed.length} removed, ${data.restored.length} restored`,
        });
      },
      onError: (err: any) => {
        toast({
          title: "Sync Failed",
          description: err?.message || "Could not sync the playlist.",
          variant: "destructive"
        });
      }
    }
  });

  const recentJobs = jobs?.slice(0, 5) || [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-foreground">Mission Control</h1>
          <p className="text-muted-foreground mt-1">Google Drive to YouTube Upload Pipeline</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending}
            data-testid="button-scan-now"
            className="gap-2 font-mono font-medium"
          >
            {triggerMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Scan Now
          </Button>
          <Button
            variant="outline"
            onClick={() => reconcileMutation.mutate()}
            disabled={reconcileMutation.isPending}
            data-testid="button-sync-playlist"
            className="gap-2 font-mono font-medium"
          >
            {reconcileMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <ListVideo className="h-4 w-4" />
            )}
            Sync Playlist
          </Button>
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={uploadMutation.isPending || !stats?.pending}
            data-testid="button-upload-now"
            className="gap-2 font-mono font-medium"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload Pending
            {!!stats?.pending && (
              <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-mono">
                {stats.pending}
              </span>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          title="Needs Review"
          value={stats?.needs_review}
          icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
          loading={statsLoading}
          highlight={!!stats?.needs_review}
        />
        <StatCard
          title="Pending"
          value={stats?.pending}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          loading={statsLoading}
        />
        <StatCard
          title="Processing"
          value={stats?.processing}
          icon={<RefreshCw className="h-4 w-4 text-amber-500" />}
          loading={statsLoading}
        />
        <StatCard
          title="Done"
          value={stats?.done}
          icon={<CheckCircle className="h-4 w-4 text-green-500" />}
          loading={statsLoading}
        />
        <StatCard
          title="Failed"
          value={stats?.failed}
          icon={<AlertCircle className="h-4 w-4 text-destructive" />}
          loading={statsLoading}
        />
      </div>

      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest jobs in the pipeline</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/jobs" data-testid="link-view-all-jobs">
              View All <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {jobsLoading ? (
            <div className="flex justify-center p-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : recentJobs.length === 0 ? (
            <div className="text-center p-8 border-t border-border bg-muted/20">
              <p className="text-muted-foreground">No jobs yet — go to Drive to queue videos or trigger a scan.</p>
              <Button variant="link" asChild className="mt-2">
                <Link href="/drive">Browse Drive</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-mono text-xs text-muted-foreground">FILE</TableHead>
                  <TableHead className="font-mono text-xs text-muted-foreground">STATUS</TableHead>
                  <TableHead className="font-mono text-xs text-muted-foreground text-right">TIME</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentJobs.map(job => (
                  <TableRow key={job.id} className="border-border" data-testid={`row-job-${job.id}`}>
                    <TableCell className="font-medium text-sm truncate max-w-[200px]" title={job.driveFileName}>
                      {job.driveFileName}
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon, loading, highlight }: { title: string, value?: number, icon: React.ReactNode, loading: boolean, highlight?: boolean }) {
  return (
    <Card className={`shadow-sm ${highlight ? "border-amber-500/40 bg-amber-500/5" : "border-border"}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium font-mono text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-16 bg-muted animate-pulse rounded" />
        ) : (
          <div className="text-2xl font-bold font-mono" data-testid={`stat-${title.toLowerCase()}`}>
            {value ?? 0}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function JobStatusBadge({ status }: { status: string }) {
  let colorClass = "";

  switch (status) {
    case "needs_review":
      colorClass = "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/30";
      break;
    case "done":
      colorClass = "bg-success/10 text-success hover:bg-success/20 border-success/20";
      break;
    case "failed":
      colorClass = "bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20";
      break;
    case "processing":
      colorClass = "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20";
      break;
    case "rejected":
      colorClass = "bg-muted/50 text-muted-foreground hover:bg-muted border-border line-through";
      break;
    case "removed":
      colorClass = "bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border-orange-500/30";
      break;
    case "pending":
    default:
      colorClass = "bg-muted text-muted-foreground hover:bg-muted/80 border-border";
      break;
  }

  const label = status === "needs_review" ? "review" : status;

  return (
    <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider ${colorClass}`}>
      {label}
    </Badge>
  );
}
