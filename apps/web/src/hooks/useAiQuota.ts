import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { IAiQuotaStatus } from '@tradevault/shared';

export function useAiQuota() {
  const queryClient = useQueryClient();

  const quotaQuery = useQuery({
    queryKey: ['ai-quota'],
    queryFn: async (): Promise<IAiQuotaStatus> => {
      const res = await api.settings.getAiQuota();
      return res.data;
    },
    refetchInterval: 20000,
    staleTime: 10000,
  });

  const updateLimitsMutation = useMutation({
    mutationFn: (data: { dailyLimit?: number; minuteLimit?: number; tier?: string }) =>
      api.settings.updateAiQuotaLimits(data),
    onSuccess: (res) => {
      queryClient.setQueryData(['ai-quota'], res.data);
      queryClient.invalidateQueries({ queryKey: ['ai-quota'] });
    },
  });

  return {
    ...quotaQuery,
    quota: quotaQuery.data,
    updateLimits: updateLimitsMutation.mutateAsync,
    isUpdatingLimits: updateLimitsMutation.isPending,
  };
}

