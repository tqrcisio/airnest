import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Attempt, Dag, Manifest, Run } from './types';

const liveRefreshMs = 3000;

export const useManifest = () =>
  useQuery({ queryKey: ['manifest'], queryFn: () => api<Manifest>('/manifest'), refetchInterval: liveRefreshMs * 5 });

export const useDags = () =>
  useQuery({ queryKey: ['dags'], queryFn: () => api<Dag[]>('/dags'), refetchInterval: liveRefreshMs });

export const useDag = (dagId: string) =>
  useQuery({ queryKey: ['dags', dagId], queryFn: () => api<Dag>(`/dags/${dagId}`), refetchInterval: liveRefreshMs });

export const useRuns = (dagId: string, limit = 25) =>
  useQuery({
    queryKey: ['dags', dagId, 'runs', limit],
    queryFn: () => api<Run[]>(`/dags/${dagId}/runs?limit=${limit}`),
    refetchInterval: liveRefreshMs,
  });

export const useRun = (runId: string) =>
  useQuery({ queryKey: ['runs', runId], queryFn: () => api<Run>(`/runs/${runId}`), refetchInterval: liveRefreshMs });

export const useAttempts = (runId: string, taskId: string | null) =>
  useQuery({
    queryKey: ['runs', runId, 'attempts', taskId],
    queryFn: () => api<Attempt[]>(`/runs/${runId}/tasks/${taskId}/attempts`),
    enabled: taskId !== null,
    refetchInterval: liveRefreshMs,
  });

export function useDagActions(dagId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dags'] }),
      queryClient.invalidateQueries({ queryKey: ['manifest'] }),
    ]);

  const trigger = useMutation({
    mutationFn: (params: Record<string, unknown>) =>
      api<Run>(`/dags/${dagId}/runs`, { method: 'POST', body: JSON.stringify({ params }) }),
    onSuccess: refresh,
  });
  const pause = useMutation({
    mutationFn: () => api<void>(`/dags/${dagId}/pause`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const unpause = useMutation({
    mutationFn: () => api<void>(`/dags/${dagId}/unpause`, { method: 'POST' }),
    onSuccess: refresh,
  });
  return { trigger, pause, unpause };
}
