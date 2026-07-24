import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isLoggedIn, getStoredUser } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import StudentLogin from "@/pages/student/login";
import StudentRegister from "@/pages/student/register";
import StudentSubjects from "@/pages/student/subjects";
import StudentSubjectDetail from "@/pages/student/subject-detail";
import StudentClassProgress from "@/pages/student/class-progress";

const Layout = lazy(() => import("@/components/layout").then((m) => ({ default: m.Layout })));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Jobs = lazy(() => import("@/pages/jobs"));
const Drive = lazy(() => import("@/pages/drive"));
const Settings = lazy(() => import("@/pages/settings"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient();

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
      <Route path="/class">
        <RequireAdmin>
          <StudentClassProgress />
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
