import { 
  useListDriveFiles, 
  useCreateJob,
  getListJobsQueryKey,
  getListDriveFilesQueryKey,
  getGetPipelineStatsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Film, Check } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

export default function Drive() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: files, isLoading, error } = useListDriveFiles();

  const createJobMutation = useCreateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListDriveFilesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPipelineStatsQueryKey() });
        toast({ title: "File queued for upload" });
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
        driveFileSizeBytes: file.sizeBytes
      }
    });
  };

  const bytesToMB = (bytes?: number | null) => {
    if (!bytes) return "-";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-foreground">Drive Files</h1>
          <p className="text-muted-foreground mt-1">Browse videos in the configured source folder</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/settings">Configure Folder</Link>
        </Button>
      </div>

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
          ) : !files || files.length === 0 ? (
            <div className="text-center p-12 bg-muted/20">
              <p className="text-muted-foreground mb-4">No video files found in the configured folder.</p>
              <Button asChild><Link href="/settings">Check Settings</Link></Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-mono text-xs w-[40px]"></TableHead>
                  <TableHead className="font-mono text-xs">FILE NAME</TableHead>
                  <TableHead className="font-mono text-xs">SIZE</TableHead>
                  <TableHead className="font-mono text-xs">CREATED</TableHead>
                  <TableHead className="font-mono text-xs text-right">ACTION</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map(file => (
                  <TableRow key={file.id} className="border-border">
                    <TableCell>
                      <Film className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="truncate max-w-[300px]" title={file.name}>
                        {file.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {bytesToMB(file.sizeBytes)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {file.createdTime ? format(new Date(file.createdTime), "MMM d, yyyy HH:mm") : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {file.alreadyQueued ? (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                          <Check className="mr-1 h-3 w-3" /> Queued
                        </Badge>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={() => handleQueue(file)}
                          disabled={createJobMutation.isPending}
                          data-testid={`btn-queue-${file.id}`}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Queue for Upload
                        </Button>
                      )}
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
