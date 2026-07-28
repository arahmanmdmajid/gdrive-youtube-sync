import { useState } from "react";
import { Link, useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { StudentLayout } from "@/components/student-layout";
import { useLibrary, type LibraryResource } from "@/lib/student-api";

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

function ResourceRow({ resource, open, onToggleOpen }: { resource: LibraryResource; open: boolean; onToggleOpen: () => void }) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button type="button" onClick={onToggleOpen} className="flex w-full items-center gap-3 py-[1.125rem] text-left">
        <FileText className="h-5 w-5 text-muted-foreground/50 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate" title={resource.title}>
            {resource.title}
          </p>
          {resource.sizeBytes && <p className="text-xs text-muted-foreground">{formatSize(resource.sizeBytes)}</p>}
        </div>
      </button>
      {open && (
        <div className="pb-4 space-y-2">
          <div className="aspect-[3/4] sm:aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
            <iframe
              src={`https://drive.google.com/file/d/${resource.driveFileId}/preview`}
              title={resource.title}
              className="h-full w-full"
              allow="autoplay"
            />
          </div>
          <a
            href={`https://drive.google.com/file/d/${resource.driveFileId}/view`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            Open in Drive
          </a>
        </div>
      )}
    </div>
  );
}

export default function StudentLibraryCategory() {
  const params = useParams<{ category: string }>();
  const { data, isLoading } = useLibrary();
  const [openId, setOpenId] = useState<number | null>(null);

  const group = data?.categories.find((c) => c.code === params.category);

  return (
    <StudentLayout>
      <Link href="/library" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" />
        Library
      </Link>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !group ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Category not found.</p>
      ) : (
        <>
          <h1 className="text-xl font-semibold mb-1">
            {group.code !== "misc" && <span className="text-muted-foreground mr-2">{group.code}</span>}
            {group.label}
          </h1>
          <p className="text-sm text-muted-foreground mb-4">{group.resources.length} books</p>

          <Card>
            <CardContent className="py-1">
              {group.resources.map((resource) => (
                <ResourceRow
                  key={resource.id}
                  resource={resource}
                  open={openId === resource.id}
                  onToggleOpen={() => setOpenId(openId === resource.id ? null : resource.id)}
                />
              ))}
              {group.resources.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No books in this category yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </StudentLayout>
  );
}
