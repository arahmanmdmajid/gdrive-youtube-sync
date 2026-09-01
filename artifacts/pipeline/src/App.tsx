import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isLoggedIn, getStoredUser } from "@/lib/auth";
import { logout } from "@/lib/student-api";
import { ThemeProvider } from "@/lib/theme";
import StudentLogin from "@/pages/student/login";
import StudentRegister from "@/pages/student/register";
import StudentSubjects from "@/pages/student/subjects";
import StudentSubjectDetail from "@/pages/student/subject-detail";
import StudentClassProgress from "@/pages/student/class-progress";
import AdminStudents from "@/pages/student/admin-students";
import AdminStudentDetail from "@/pages/student/admin-student-detail";
import StudentLibrary from "@/pages/student/library";
import StudentLibraryCategory from "@/pages/student/library-category";
import StudentSchedule from "@/pages/student/schedule";

const Layout = lazy(() => import("@/components/layout").then((m) => ({ default: m.Layout })));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Jobs = lazy(() => import("@/pages/jobs"));
const Drive = lazy(() => import("@/pages/drive"));
const Settings = lazy(() => import("@/pages/settings"));
const Library = lazy(() => import("@/pages/library"));
const Schedule = lazy(() => import("@/pages/schedule"));
const NotFound = lazy(() => import("@/pages/not-found"));

// A stale/invalid JWT (expired, or issued before a secret rotation) makes every
// student-api call 401 forever with no visible error — queries just settle into
// an empty state. Force a clean logout+redirect-to-login on any 401 in student
// mode so the user gets a working re-auth prompt instead of a silently blank page.
function handlePossibleAuthError(error: unknown) {
  if (import.meta.env.VITE_APP_MODE === "student" && error instanceof ApiError && error.status === 401) {
    logout();
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handlePossibleAuthError }),
  mutationCache: new MutationCache({ onError: handlePossibleAuthError }),
});

/** Admin accounts have full access, including student routes. */
function RequireStudent({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Redirect to="/login" />;
  return <>{children}</>;
}

/** Class progress is admin-only — bounce students back to their subjects. */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Redirect to="/login" />;
  if (getStoredUser()?.role !== "admin") return <Redirect to="/" />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  if (isLoggedIn()) return <Redirect to="/" />;
  return <>{children}</>;
}

function StudentRouter() {
  return (
    <Switch>
      <Route path="/login">
        <RedirectIfAuthed>
          <StudentLogin />
        </RedirectIfAuthed>
      </Route>
      <Route path="/register">
        <RedirectIfAuthed>
          <StudentRegister />
        </RedirectIfAuthed>
      </Route>
      <Route path="/">
        <RequireStudent>
          <StudentSubjects />
        </RequireStudent>
      </Route>
      <Route path="/subject/:serial">
        <RequireStudent>
          <StudentSubjectDetail />
        </RequireStudent>
      </Route>
      <Route path="/library">
        <RequireStudent>
          <StudentLibrary />
        </RequireStudent>
      </Route>
      <Route path="/library/:category">
        <RequireStudent>
          <StudentLibraryCategory />
        </RequireStudent>
      </Route>
      <Route path="/schedule">
        <RequireStudent>
          <StudentSchedule />
        </RequireStudent>
      </Route>
      <Route path="/class">
        <RequireAdmin>
          <StudentClassProgress />
        </RequireAdmin>
      </Route>
      <Route path="/admin/students">
        <RequireAdmin>
          <AdminStudents />
        </RequireAdmin>
      </Route>
      <Route path="/admin/students/:id">
        <RequireAdmin>
          <AdminStudentDetail />
        </RequireAdmin>
      </Route>
    </Switch>
  );
}

function AdminRouter() {
  return (
    <Suspense fallback={null}>
      <Layout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/jobs" component={Jobs} />
          <Route path="/drive" component={Drive} />
          <Route path="/settings" component={Settings} />
          <Route path="/library" component={Library} />
          <Route path="/schedule" component={Schedule} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </Suspense>
  );
}

function App() {
  const isStudent = import.meta.env.VITE_APP_MODE === "student";

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            {isStudent ? <StudentRouter /> : <AdminRouter />}
          </WouterRouter>
        </ThemeProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
