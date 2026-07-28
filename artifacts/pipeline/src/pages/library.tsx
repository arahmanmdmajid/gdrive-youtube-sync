import { useState } from "react";
import {
  useListLibraryResources,
  useScanLibrary,
  useUpdateLibraryResource,
  useDeleteLibraryResource,
  getListLibraryResourcesQueryKey,
  type LibraryResource,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCcw, ExternalLink, Pencil, Trash2 } from "lucide-react";
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

const CATEGORY_LABELS: Record<string, string> = {
  "6.1": "Tafseer",
  "6.2": "Usul al-Tafseer, Hadith & Fara'idh",
  "6.3": "Fiqh",
  "6.4": "Usul al-Fiqh",
  "6.5": "Aqaid & Falakiyat",
  "6.6": "Arabic Language & Prosody",
  misc: "Miscellaneous & Past Papers",
};
const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS);

function formatSize(bytes?: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

type EditState = { id: number; title: string; category: string };

export default function Library() {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = categoryFilter === "all" ? undefined : { category: categoryFilter };
  const { data: resources, isLoading } = useListLibraryResources(params, {
    query: { queryKey: getListLibraryResourcesQueryKey(params) },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListLibraryResourcesQueryKey() });

  const scanMutation = useScanLibrary({
    mutation: {
      onSuccess: (data) => {
        invalidate();
        const unmapped = data.unmappedFolders.length
          ? ` Unmapped folders: ${data.unmappedFolders.join(", ")}.`
          : "";
        toast({
          title: "Scan complete",
          description: `Scanned ${data.scanned} files, catalogued ${data.inserted} new, skipped ${data.skipped} already known.${unmapped}`,
        });
      },
      onError: (err: any) => {
        toast({ title: "Scan failed", description: err?.message ?? "An error occurred.", variant: "destructive" });
      },
    },
  });

  const updateMutation = useUpdateLibraryResource({
    mutation: {
      onSuccess: () => {
        invalidate();
        setEditState(null);
        toast({ title: "Resource updated" });
      },
      onError: () => toast({ title: "Failed to update resource", variant: "destructive" }),
    },
  });

  const toggleVisibleMutation = useUpdateLibraryResource({
    mutation: {
      onSuccess: () => invalidate(),
      onError: () => toast({ title: "Failed to update visibility", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteLibraryResource({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDeleteId(null);
        toast({ title: "Resource removed from catalog" });
      },
      onError: () => toast({ title: "Failed to remove resource", variant: "destructive" }),
    },
  });

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-foreground">Library</h1>
          <p className="text-muted-foreground mt-1">Books, past papers, and other reference PDFs</p>
        </div>
        <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending} className="gap-2">
          {scanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Scan Library Folder
        </Button>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-mono">Resources</CardTitle>
            <CardDescription>{resources?.length ?? 0} catalogued</CardDescription>
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORY_OPTIONS.map((code) => (
                <SelectItem key={code} value={code}>
                  {code === "misc" ? CATEGORY_LABELS[code] : `${code} ${CATEGORY_LABELS[code]}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !resources || resources.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No resources catalogued yet — set a Books Folder ID in Settings, then scan.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Visible</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources.map((r: LibraryResource) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-md truncate" title={r.driveFileName}>
                      {r.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{CATEGORY_LABELS[r.category] ?? r.category}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatSize(r.sizeBytes)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={r.visible}
                        onCheckedChange={(checked) =>
                          toggleVisibleMutation.mutate({ id: r.id, data: { visible: checked } })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" asChild title="Open in Drive">
                          <a href={`https://drive.google.com/file/d/${r.driveFileId}/view`} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit"
                          onClick={() => setEditState({ id: r.id, title: r.title, category: r.category })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remove from catalog"
                          onClick={() => setDeleteId(r.id)}
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

      <Dialog open={editState !== null} onOpenChange={(open) => !open && setEditState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit resource</DialogTitle>
            <DialogDescription>Update the display title or category shown to students.</DialogDescription>
          </DialogHeader>
          {editState && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={editState.title}
                  onChange={(e) => setEditState({ ...editState, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={editState.category}
                  onValueChange={(v) => setEditState({ ...editState, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code === "misc" ? CATEGORY_LABELS[code] : `${code} ${CATEGORY_LABELS[code]}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditState(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editState?.title.trim() || updateMutation.isPending}
              onClick={() =>
                editState &&
                updateMutation.mutate({
                  id: editState.id,
                  data: { title: editState.title.trim(), category: editState.category },
                })
              }
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from catalog?</AlertDialogTitle>
            <AlertDialogDescription>
              This only removes the catalog entry — the file stays in Google Drive and can be re-scanned later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
