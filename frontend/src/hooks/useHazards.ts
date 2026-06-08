import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/services/supabaseClient'

export interface Hazard {
  id: string
  user_id: string
  location: { type: 'Point'; coordinates: [number, number] }
  address: string
  hazard_type: 'POTHOLE' | 'DEEP_POTHOLE' | 'CRACK' | 'UNEVEN_ROAD' | 'SPEED_BREAKER' | 'DEBRIS' | 'OTHER'
  severity: number
  confidence: number
  detection_method: 'AUTO_SENSOR' | 'MANUAL_REPORT' | 'AI_CLASSIFIED'
  sensor_data: Record<string, any>
  status: 'PENDING' | 'VERIFIED' | 'FALSE_POSITIVE' | 'RESOLVED' | 'DUPLICATE'
  verification_count: number
  verified_by: string[]
  ai_classification: Record<string, any> | null
  image_urls: string[]
  created_at: string
  updated_at: string
}

export const useHazards = (lat?: number, lng?: number, radius?: number) => {
  return useQuery({
    queryKey: ['hazards', lat, lng, radius],
    queryFn: async () => {
      if (!lat || !lng) return []

      const { data, error } = await supabase.rpc('get_nearby_hazards', {
        lat,
        lng,
        radius_km: radius || 5,
        limit: 100,
      })

      if (error) throw error
      return data as Hazard[]
    },
    enabled: !!lat && !!lng,
    staleTime: 1000 * 60 * 5,
  })
}

export const useCreateHazard = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (hazardData: Partial<Hazard>) => {
      const { data, error } = await supabase.from('hazards').insert([hazardData]).select().single()
      if (error) throw error
      return data as Hazard
    },
    onSuccess: (newHazard) => {
      queryClient.invalidateQueries({ queryKey: ['hazards'] })
      queryClient.setQueryData(['hazard', newHazard.id], newHazard)
    },
  })
}

export const useVerifyHazard = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ hazardId, verifyType }: { hazardId: string; verifyType: string }) => {
      const { data, error } = await supabase
        .from('verification_records')
        .insert([
          {
            hazard_id: hazardId,
            verification_type: verifyType,
          },
        ])
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hazards'] })
    },
  })
}
