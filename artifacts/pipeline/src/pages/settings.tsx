import { useEffect, useState, useRef } from "react";
import {
  useGetSettings,
  useUpdateSettings,
  useListYoutubePlaylists,
  useListLectureNames,
  useCreateLectureName,
  useUpdateLectureName,
  useDeleteLectureName,
  getGetSettingsQueryKey,
  getListLectureNamesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Plus, Trash2, Pencil, Check, X } from "lucide-react";

const formSchema = z.object({
  driveFolderId: z.string().min(1, "Drive folder ID is required"),
  youtubePlaylistId: z.string().nullable().optional(),
  autoSync: z.boolean().default(false),
  syncIntervalMinutes: z.coerce.number().min(5).max(1440).default(60),
});

type FormValues = z.infer<typeof formSchema>;

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newLectureName, setNewLectureName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const { data: settings, isLoading: settingsLoading } = useGetSettings();
  const { data: playlists, isLoading: playlistsLoading } = useListYoutubePlaylists();
  const { data: lectureNames } = useListLectureNames();

  const createLectureNameMutation = useCreateLectureName({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLectureNamesQueryKey() });
        setNewLectureName("");
        toast({ title: "Lecture name added" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to add lecture name", description: err.message ?? "Name may already exist", variant: "destructive" });
      }
    }
  });

  const updateLectureNameMutation = useUpdateLectureName({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLectureNamesQueryKey() });
        setEditingId(null);
        toast({ title: "Lecture name updated" });
      },
      onError: () => toast({ title: "Failed to update lecture name", variant: "destructive" })
    }
  });

  const deleteLectureNameMutation = useDeleteLectureName({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLectureNamesQueryKey() });
        toast({ title: "Lecture name removed" });
      },
      onError: () => toast({ title: "Failed to remove lecture name", variant: "destructive" })
    }
  });

  const handleAddLectureName = () => {
    const trimmed = newLectureName.trim();
    if (!trimmed) return;
    createLectureNameMutation.mutate({ data: { name: trimmed } });
  };

  const startEditing = (id: number, currentName: string) => {
    setEditingId(id);
    setEditingValue(currentName);
    // Focus the input on next render
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const trimmed = editingValue.trim();
    if (!trimmed) return;
    updateLectureNameMutation.mutate({ id: editingId, data: { name: trimmed } });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingValue("");
  };

  const updateMutation = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        toast({ title: "Settings saved successfully" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to save settings", description: err.message, variant: "destructive" });
      }
    }
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      driveFolderId: "",
      youtubePlaylistId: null,
      autoSync: false,
      syncIntervalMinutes: 60,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        driveFolderId: settings.driveFolderId || "",
        youtubePlaylistId: settings.youtubePlaylistId,
        autoSync: settings.autoSync,
        syncIntervalMinutes: settings.syncIntervalMinutes,
      });
    }
  }, [settings, form]);

  const onSubmit = (values: FormValues) => {
    // Find playlist name for the id
    const playlistName = playlists?.find(p => p.id === values.youtubePlaylistId)?.title || null;
    
    updateMutation.mutate({
      data: {
        ...values,
        youtubePlaylistName: playlistName,
        // Send null if empty string
        youtubePlaylistId: values.youtubePlaylistId || null
      }
    });
  };

  if (settingsLoading) {
    return (
      <div className="p-8 max-w-3xl mx-auto flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-mono tracking-tight text-foreground">Pipeline Settings</h1>
        <p className="text-muted-foreground mt-1">Configure sources, destinations, and automation</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-mono">Source Configuration</CardTitle>
              <CardDescription>Where should the pipeline look for new videos?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="driveFolderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono">Google Drive Folder ID</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 1a2B3c4D5e6F7g8H9i0J" className="font-mono text-sm" {...field} data-testid="input-drive-folder" />
                    </FormControl>
                    <FormDescription>
                      The ID from the Google Drive folder URL.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-mono">Destination Configuration</CardTitle>
              <CardDescription>Where should videos be published?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="youtubePlaylistId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono">YouTube Playlist (Optional)</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                      value={field.value || "none"}
                      disabled={playlistsLoading}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-playlist">
                          <SelectValue placeholder={playlistsLoading ? "Loading playlists..." : "Select a playlist (or none)"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None (Upload to channel only)</SelectItem>
                        {playlists?.map(playlist => (
                          <SelectItem key={playlist.id} value={playlist.id}>
                            {playlist.title} ({playlist.itemCount} videos)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Videos will be added to this playlist automatically after upload.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-mono">Automation</CardTitle>
              <CardDescription>Configure background sync behavior</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="autoSync"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base font-mono">Auto Sync</FormLabel>
                      <FormDescription>
                        Automatically scan Drive folder and queue new videos
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-auto-sync"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {form.watch("autoSync") && (
                <FormField
                  control={form.control}
                  name="syncIntervalMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono">Sync Interval (Minutes)</FormLabel>
                      <FormControl>
                        <Input type="number" min={5} max={1440} {...field} data-testid="input-sync-interval" />
                      </FormControl>
                      <FormDescription>
                        How often to scan for new files (minimum 5 minutes).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateMutation.isPending} className="gap-2" data-testid="btn-save-settings">
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Configuration
            </Button>
          </div>
        </form>
      </Form>

      {/* Lecture Names — outside the settings form, managed independently */}
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-mono">Lecture Names</CardTitle>
          <CardDescription>
            Pre-configured names used when reviewing jobs. Format: <span className="font-mono text-foreground">Subject | Teacher</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new */}
          <div className="flex gap-2">
            <Input
              value={newLectureName}
              onChange={(e) => setNewLectureName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddLectureName()}
              placeholder="e.g. Fiqh | Sheikh Abdullah"
              className="font-mono text-sm"
              data-testid="input-lecture-name"
            />
            <Button
              onClick={handleAddLectureName}
              disabled={!newLectureName.trim() || createLectureNameMutation.isPending}
              className="shrink-0"
              data-testid="btn-add-lecture-name"
            >
              {createLectureNameMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>

          {/* List */}
          {!lectureNames || lectureNames.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lecture names configured yet.</p>
          ) : (
            <ul className="space-y-1">
              {lectureNames.map((ln) => (
                <li
                  key={ln.id}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 bg-muted/20"
                >
                  {editingId === ln.id ? (
                    <>
                      <Input
                        ref={editInputRef}
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="flex-1 h-7 font-mono text-sm py-0"
                        dir="rtl"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={commitEdit}
                        disabled={!editingValue.trim() || updateLectureNameMutation.isPending}
                        className="h-7 w-7 text-green-600 hover:text-green-700 shrink-0"
                        title="Save"
                      >
                        {updateLectureNameMutation.isPending
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Check className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={cancelEdit}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 font-mono text-sm" dir="rtl">{ln.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEditing(ln.id, ln.name)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                        title="Edit"
                        data-testid={`btn-edit-lecture-name-${ln.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteLectureNameMutation.mutate({ id: ln.id })}
                        disabled={deleteLectureNameMutation.isPending}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        title="Delete"
                        data-testid={`btn-delete-lecture-name-${ln.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
