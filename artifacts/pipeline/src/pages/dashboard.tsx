import { 
  useGetPipelineStats, 
  useTriggerPipeline, 
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
import { Play, Activity, Clock, CheckCircle, AlertCircle, RefreshCw, Loader2, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useGetPipelineStats({
    query: { refetchInterval: 30000 }
  });

  const { data: jobs, isLoading: jobsLoading } = useListJobs(undefined, {
    query: { refetchInterval: 30000 }
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

  const recentJobs = jobs?.slice(0, 5) || [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-foreground">Mission Control</h1>
          <p className="text-muted-foreground mt-1">Google Drive to YouTube Upload Pipeline</p>
        </div>
        <Button 
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

function StatCard({ title, value, icon, loading }: { title: string, value?: number, icon: React.ReactNode, loading: boolean }) {
  return (
    <Card className="border-border shadow-sm">
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
  let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
  let colorClass = "";

  switch (status) {
    case "done":
      colorClass = "bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20";
      break;
    case "failed":
      colorClass = "bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20";
      break;
    case "processing":
      colorClass = "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20";
      break;
    case "pending":
    default:
      colorClass = "bg-muted text-muted-foreground hover:bg-muted/80 border-border";
      break;
  }

  return (
    <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider ${colorClass}`}>
      {status}
    </Badge>
  );
}
