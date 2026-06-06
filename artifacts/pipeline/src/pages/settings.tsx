import { useEffect } from "react";
import { 
  useGetSettings, 
  useUpdateSettings, 
  useListYoutubePlaylists,
  getGetSettingsQueryKey
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
import { Loader2, Save } from "lucide-react";

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

  const { data: settings, isLoading: settingsLoading } = useGetSettings();
  const { data: playlists, isLoading: playlistsLoading } = useListYoutubePlaylists();

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
                      onValueChange={field.onChange} 
                      value={field.value || ""} 
                      disabled={playlistsLoading}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-playlist">
                          <SelectValue placeholder={playlistsLoading ? "Loading playlists..." : "Select a playlist (or none)"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">None (Upload to channel only)</SelectItem>
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
    </div>
  );
}
