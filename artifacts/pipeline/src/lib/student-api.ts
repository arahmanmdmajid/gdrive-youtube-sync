import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { storeSession, clearSession, type StudentUser } from "./auth";

export interface Subject {
  serial: string;
  nameEn: string;
  teacherEn: string;
  total: number;
  completed: number;
  inProgress: number;
  latest: string | null;
}

export type ProgressStatus = "not_started" | "in_progress" | "completed";

export interface Lecture {
  id: number;
  title: string;
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  driveCreatedTime: string | null;
  progress: ProgressStatus;
}

export interface ClassStudent {
  userId: number;
  displayName: string;
  completed: number;
}

interface AuthResponse {
  token: string;
  user: StudentUser;
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: { inviteCode: string; username: string; password: string; displayName: string }) =>
      customFetch<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => storeSession(data.token, data.user),
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      customFetch<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => storeSession(data.token, data.user),
  });
}

export function logout() {
  clearSession();
  window.location.href = "/";
}

export function useSubjects() {
  return useQuery({
    queryKey: ["student", "subjects"],
    queryFn: () => customFetch<{ subjects: Subject[] }>("/api/student/subjects"),
  });
}

export function useSubjectLectures(serial: string) {
  return useQuery({
    queryKey: ["student", "lectures", serial],
    queryFn: () =>
      customFetch<{ subject: Pick<Subject, "serial" | "nameEn" | "teacherEn">; lectures: Lecture[] }>(
        `/api/student/subjects/${serial}/lectures`,
      ),
  });
}

export function useSetProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, status }: { jobId: number; status: ProgressStatus }) =>
      customFetch<{ jobId: number; status: ProgressStatus }>(`/api/student/progress/${jobId}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student"] });
    },
  });
}

export function useClassProgress() {
  return useQuery({
    queryKey: ["student", "class-progress"],
    queryFn: () => customFetch<{ total: number; students: ClassStudent[] }>("/api/student/class-progress"),
  });
}

export function useContinueLecture() {
  return useQuery({
    queryKey: ["student", "continue"],
    queryFn: () =>
      customFetch<{ lecture: (Omit<Lecture, "progress"> & { serial: string }) | null }>("/api/student/continue"),
  });
}
