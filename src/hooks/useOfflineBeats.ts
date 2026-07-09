import { useState, useCallback } from 'react';
import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { supabase } from '@/integrations/supabase/client';
import { useConnectivity } from './useConnectivity';
import { toast } from './use-toast';

/**
 * Hook for managing beats with offline support
 */
export function useOfflineBeats() {
  const connectivityStatus = useConnectivity();
  const isOnline = connectivityStatus === 'online';
  const [loading, setLoading] = useState(false);

  /**
   * Create beat with offline support
   */
  const createBeat = useCallback(async (beatData: any) => {
    try {
      setLoading(true);

      if (isOnline) {
        // Online: Submit directly
        const { data, error } = await supabase
          .from('beats')
          .insert(beatData)
          .select()
          .single();

        if (error) throw error;

        // Cache the new beat
        await offlineStorage.save(STORES.BEATS, data);

        toast({
          title: "Beat Created",
          description: "Beat has been created successfully.",
        });

        return { success: true, offline: false, data };
      } else {
        // Offline: Queue for sync
        const offlineBeat = {
          ...beatData,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await offlineStorage.save(STORES.BEATS, offlineBeat);
        await offlineStorage.addToSyncQueue('CREATE_BEAT', offlineBeat);

        toast({
          title: "Beat Saved Offline",
          description: "Beat will be created when you're back online.",
        });

        return { success: true, offline: true, data: offlineBeat };
      }
    } catch (error: any) {
      console.error('Error creating beat:', error);
      toast({
        title: "Failed to Create Beat",
        description: error.message || "Failed to create beat",
        variant: "destructive",
      });
      return { success: false, offline: false, data: null };
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  /**
   * Update beat with offline support
   */
  const updateBeat = useCallback(async (beatId: string, updates: any) => {
    try {
      setLoading(true);

      if (isOnline) {
        // Online: Update directly
        const { data, error } = await supabase
          .from('beats')
          .update(updates)
          .eq('id', beatId)
          .select()
          .single();

        if (error) throw error;

        // Update cache
        await offlineStorage.save(STORES.BEATS, data);

        toast({
          title: "Beat Updated",
          description: "Beat has been updated successfully.",
        });

        return { success: true, offline: false, data };
      } else {
        // Offline: Queue for sync
        const cachedBeat = await offlineStorage.getById(STORES.BEATS, beatId);
        
        if (!cachedBeat) {
          throw new Error('Beat not found in offline storage');
        }
        
        const updatedBeat = {
          ...(cachedBeat as any),
          ...updates,
          updated_at: new Date().toISOString()
        };

        await offlineStorage.save(STORES.BEATS, updatedBeat);
        await offlineStorage.addToSyncQueue('UPDATE_BEAT', {
          id: beatId,
          updates: {
            ...updates,
            updated_at: new Date().toISOString()
          }
        });

        toast({
          title: "Beat Updated Offline",
          description: "Changes will sync when you're back online.",
        });

        return { success: true, offline: true, data: updatedBeat };
      }
    } catch (error: any) {
      console.error('Error updating beat:', error);
      toast({
        title: "Failed to Update Beat",
        description: error.message || "Failed to update beat",
        variant: "destructive",
      });
      return { success: false, offline: false, data: null };
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  /**
   * Get all beats (from cache or server)
   */
  const getAllBeats = useCallback(async () => {
    try {
      setLoading(true);

      if (isOnline) {
        // Online: Fetch from server and cache
        const { data, error } = await supabase
          .from('beats')
          .select('*')
          .eq('is_active', true)
          .order('beat_name');

        if (error) throw error;

        // Update cache
        if (data) {
          for (const beat of data) {
            await offlineStorage.save(STORES.BEATS, beat);
          }
        }

        return { success: true, data: data || [] };
      } else {
        // Offline: Load from cache, filter out inactive beats
        const cachedBeats = await offlineStorage.getAll(STORES.BEATS);
        const activeBeats = (cachedBeats as any[]).filter((beat: any) => beat.is_active !== false);
        return { success: true, data: activeBeats || [] };
      }
    } catch (error: any) {
      console.error('Error fetching beats:', error);
      
      // Try cache on error, filter out inactive beats
      const cachedBeats = await offlineStorage.getAll(STORES.BEATS);
      const activeBeats = (cachedBeats as any[]).filter((beat: any) => beat.is_active !== false);
      return { success: true, data: activeBeats || [] };
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  /**
   * Delete beat with offline support
   */
  const deleteBeat = useCallback(async (beatId: string) => {
    try {
      setLoading(true);

      if (isOnline) {
        // Online: route through the safe guard so beats with history are deactivated instead of destroyed.
        const { deactivateOrDeleteBeat } = await import("@/utils/safeRetailerBeatDelete");
        const res = await deactivateOrDeleteBeat(beatId);

        if (res.action === "failed") {
          return { success: false, offline: false };
        }

        // Keep local cache in sync (whether deleted or deactivated).
        if (res.action === "deleted") {
          await offlineStorage.delete(STORES.BEATS, beatId);
        } else {
          const cached: any = await offlineStorage.getById(STORES.BEATS, beatId);
          if (cached) {
            await offlineStorage.save(STORES.BEATS, { ...cached, is_active: false });
          }
        }

        // Clear all beat_plans associated with this beat from cache
        const cachedPlans = await offlineStorage.getAll(STORES.BEAT_PLANS);
        const plansToDelete = (cachedPlans as any[]).filter((plan: any) => plan.beat_id === beatId);
        for (const plan of plansToDelete) {
          await offlineStorage.delete(STORES.BEAT_PLANS, (plan as any).id);
        }

        // Update retailers in cache to unassign from this beat (only when actually deleted)
        if (res.action === "deleted") {
          const cachedRetailers = await offlineStorage.getAll(STORES.RETAILERS);
          const retailersToUpdate = (cachedRetailers as any[]).filter((r: any) => r.beat_id === beatId);
          for (const retailer of retailersToUpdate) {
            const retailerData = retailer as any;
            await offlineStorage.save(STORES.RETAILERS, {
              ...retailerData,
              beat_id: 'unassigned',
              beat_name: null
            });
          }
        }

        return { success: true, offline: false, action: res.action };
      } else {
        // Offline: Queue for sync
        await offlineStorage.delete(STORES.BEATS, beatId);
        
        // Clear beat plans from cache
        const cachedPlans = await offlineStorage.getAll(STORES.BEAT_PLANS);
        const plansToDelete = (cachedPlans as any[]).filter((plan: any) => plan.beat_id === beatId);
        for (const plan of plansToDelete) {
          await offlineStorage.delete(STORES.BEAT_PLANS, (plan as any).id);
        }
        
        // Update retailers in cache
        const cachedRetailers = await offlineStorage.getAll(STORES.RETAILERS);
        const retailersToUpdate = (cachedRetailers as any[]).filter((r: any) => r.beat_id === beatId);
        for (const retailer of retailersToUpdate) {
          const retailerData = retailer as any;
          await offlineStorage.save(STORES.RETAILERS, {
            ...retailerData,
            beat_id: 'unassigned',
            beat_name: null
          });
        }
        
        await offlineStorage.addToSyncQueue('DELETE_BEAT', { id: beatId });

        toast({
          title: "Beat Deletion Queued",
          description: "Beat will be deleted when you're back online.",
        });

        return { success: true, offline: true };
      }
    } catch (error: any) {
      console.error('Error deleting beat:', error);
      toast({
        title: "Failed to Delete Beat",
        description: error.message || "Failed to delete beat",
        variant: "destructive",
      });
      return { success: false, offline: false };
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  /**
   * Create or update beat plan (add to today's plan)
   */
  const addBeatToPlan = useCallback(async (beatPlanData: any) => {
    try {
      setLoading(true);

      if (isOnline) {
        // Online: Insert as additional beat plan (don't overwrite existing ones)
        const { data, error } = await supabase
          .from('beat_plans')
          .insert(beatPlanData)
          .select()
          .single();

        if (error) throw error;

        // Cache the plan
        await offlineStorage.save(STORES.BEAT_PLANS, data);

        toast({
          title: "Beat Added to Plan",
          description: "Beat has been added as an additional beat for the day.",
        });

        return { success: true, offline: false, data };
      } else {
        // Offline: Queue for sync
        const offlinePlan = {
          ...beatPlanData,
          id: beatPlanData.id || crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await offlineStorage.save(STORES.BEAT_PLANS, offlinePlan);
        await offlineStorage.addToSyncQueue('CREATE_BEAT_PLAN', offlinePlan);

        toast({
          title: "Beat Plan Saved Offline",
          description: "Plan will sync when you're back online.",
        });

        return { success: true, offline: true, data: offlinePlan };
      }
    } catch (error: any) {
      console.error('Error adding beat to plan:', error);
      toast({
        title: "Failed to Add Beat to Plan",
        description: error.message || "Failed to add beat to plan",
        variant: "destructive",
      });
      return { success: false, offline: false, data: null };
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  /**
   * Get beat plans (from cache or server)
   */
  const getBeatPlans = useCallback(async (userId: string, planDate?: string) => {
    try {
      if (isOnline) {
        // Online: Fetch from server
        let query = supabase
          .from('beat_plans')
          .select('*')
          .eq('user_id', userId);

        if (planDate) {
          query = query.eq('plan_date', planDate);
        }

        const { data, error } = await query.order('plan_date', { ascending: false });

        if (error) throw error;

        // Update cache
        if (data) {
          for (const plan of data) {
            await offlineStorage.save(STORES.BEAT_PLANS, plan);
          }
        }

        return { success: true, data: data || [] };
      } else {
        // Offline: Load from cache
        const cachedPlans = await offlineStorage.getAll(STORES.BEAT_PLANS);
        const filteredPlans = (cachedPlans as any[]).filter((plan: any) => {
          if (plan.user_id !== userId) return false;
          if (planDate && plan.plan_date !== planDate) return false;
          return true;
        });
        return { success: true, data: filteredPlans };
      }
    } catch (error: any) {
      console.error('Error fetching beat plans:', error);
      
      // Try cache on error
      const cachedPlans = await offlineStorage.getAll(STORES.BEAT_PLANS);
      return { success: true, data: cachedPlans || [] };
    }
  }, [isOnline]);

  return {
    createBeat,
    updateBeat,
    deleteBeat,
    getAllBeats,
    addBeatToPlan,
    getBeatPlans,
    loading,
    isOnline
  };
}
