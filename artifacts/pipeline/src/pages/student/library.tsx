import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentLayout } from "@/components/student-layout";
import { useLibrary } from "@/lib/student-api";

export default function StudentLibrary() {
  const { data, isLoading } = useLibrary();
  const categories = data?.categories ?? [];

  return (
    <StudentLayout>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Library</h1>
        <p className="text-sm text-muted-foreground mt-1">Books and past papers for reference</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No books available yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {categories.map((category) => (
            <Link key={category.code} href={`/library/${category.code}`}>
              <Card className="h-full transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/50 cursor-pointer">
                <CardContent className="py-4 space-y-1">
                  <p className="text-sm font-medium truncate">
                    {category.code !== "misc" && (
                      <span className="text-muted-foreground mr-1.5">{category.code}</span>
                    )}
                    {category.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{category.resources.length} books</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </StudentLayout>
  );
}
