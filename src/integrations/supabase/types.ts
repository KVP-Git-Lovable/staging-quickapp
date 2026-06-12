export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accrual_config: {
        Row: {
          created_at: string
          credit_day: number
          divisor: number
          frequency: string
          id: string
          leave_type_id: string
          prorate_joining: boolean
          round_mode: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_day?: number
          divisor?: number
          frequency?: string
          id?: string
          leave_type_id: string
          prorate_joining?: boolean
          round_mode?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_day?: number
          divisor?: number
          frequency?: string
          id?: string
          leave_type_id?: string
          prorate_joining?: boolean
          round_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accrual_config_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: true
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_events: {
        Row: {
          activity_date: string
          activity_name: string | null
          activity_type: string
          budget: number | null
          collective_target: number | null
          comments: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          duration_type: string
          end_time: string | null
          event_name: string | null
          expected_footfall: string | null
          from_date: string | null
          half_day_type: string | null
          id: string
          individual_target: number | null
          landmark: string | null
          location: string | null
          price_book_id: string | null
          remarks: string | null
          retailer_id: string | null
          retailer_name: string | null
          sales_reps: string[] | null
          sales_target: number | null
          start_time: string | null
          status: string
          target_mode: string | null
          to_date: string | null
          total_days: number | null
          user_id: string
          visit_id: string | null
        }
        Insert: {
          activity_date?: string
          activity_name?: string | null
          activity_type?: string
          budget?: number | null
          collective_target?: number | null
          comments?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          duration_type?: string
          end_time?: string | null
          event_name?: string | null
          expected_footfall?: string | null
          from_date?: string | null
          half_day_type?: string | null
          id?: string
          individual_target?: number | null
          landmark?: string | null
          location?: string | null
          price_book_id?: string | null
          remarks?: string | null
          retailer_id?: string | null
          retailer_name?: string | null
          sales_reps?: string[] | null
          sales_target?: number | null
          start_time?: string | null
          status?: string
          target_mode?: string | null
          to_date?: string | null
          total_days?: number | null
          user_id: string
          visit_id?: string | null
        }
        Update: {
          activity_date?: string
          activity_name?: string | null
          activity_type?: string
          budget?: number | null
          collective_target?: number | null
          comments?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          duration_type?: string
          end_time?: string | null
          event_name?: string | null
          expected_footfall?: string | null
          from_date?: string | null
          half_day_type?: string | null
          id?: string
          individual_target?: number | null
          landmark?: string | null
          location?: string | null
          price_book_id?: string | null
          remarks?: string | null
          retailer_id?: string | null
          retailer_name?: string | null
          sales_reps?: string[] | null
          sales_target?: number | null
          start_time?: string | null
          status?: string
          target_mode?: string | null
          to_date?: string | null
          total_days?: number | null
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      additional_expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          bill_url: string | null
          category: string
          created_at: string
          custom_category: string | null
          description: string | null
          expense_date: string
          id: string
          rejection_reason: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bill_url?: string | null
          category: string
          created_at?: string
          custom_category?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bill_url?: string | null
          category?: string
          created_at?: string
          custom_category?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_autonomous_actions: {
        Row: {
          action_data: Json | null
          action_type: string
          can_undo: boolean | null
          created_at: string
          executed_at: string | null
          id: string
          status: string
          undo_until: string | null
          undone_at: string | null
          user_id: string
        }
        Insert: {
          action_data?: Json | null
          action_type: string
          can_undo?: boolean | null
          created_at?: string
          executed_at?: string | null
          id?: string
          status?: string
          undo_until?: string | null
          undone_at?: string | null
          user_id: string
        }
        Update: {
          action_data?: Json | null
          action_type?: string
          can_undo?: boolean | null
          created_at?: string
          executed_at?: string | null
          id?: string
          status?: string
          undo_until?: string | null
          undone_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_feature_feedback: {
        Row: {
          created_at: string | null
          feature: string
          feedback_type: string
          id: string
          retailer_id: string | null
          user_id: string | null
          visit_id: string | null
        }
        Insert: {
          created_at?: string | null
          feature: string
          feedback_type: string
          id?: string
          retailer_id?: string | null
          user_id?: string | null
          visit_id?: string | null
        }
        Update: {
          created_at?: string | null
          feature?: string
          feedback_type?: string
          id?: string
          retailer_id?: string | null
          user_id?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_feature_feedback_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feature_feedback_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          action_data: Json | null
          action_type: string | null
          category: string
          created_at: string
          description: string
          expires_at: string | null
          id: string
          insight_type: string
          is_actioned: boolean | null
          is_dismissed: boolean | null
          is_read: boolean | null
          priority: string
          reference_id: string | null
          reference_type: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_data?: Json | null
          action_type?: string | null
          category: string
          created_at?: string
          description: string
          expires_at?: string | null
          id?: string
          insight_type: string
          is_actioned?: boolean | null
          is_dismissed?: boolean | null
          is_read?: boolean | null
          priority?: string
          reference_id?: string | null
          reference_type?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_data?: Json | null
          action_type?: string | null
          category?: string
          created_at?: string
          description?: string
          expires_at?: string | null
          id?: string
          insight_type?: string
          is_actioned?: boolean | null
          is_dismissed?: boolean | null
          is_read?: boolean | null
          priority?: string
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_scheme_suggestions: {
        Row: {
          admin_modifications: Json | null
          analysis_type: string
          confidence_score: number | null
          created_at: string | null
          created_scheme_id: string | null
          data_signals: Json | null
          expected_benefit: string | null
          expires_at: string | null
          id: string
          reasoning: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          suggested_buy_quantity: number | null
          suggested_category_id: string | null
          suggested_condition_quantity: number | null
          suggested_description: string | null
          suggested_discount_amount: number | null
          suggested_discount_percentage: number | null
          suggested_end_date: string | null
          suggested_free_quantity: number | null
          suggested_min_order_value: number | null
          suggested_name: string
          suggested_product_id: string | null
          suggested_scheme_type: string
          suggested_start_date: string | null
          suggested_tier_data: Json | null
          target_ids: string[] | null
          target_names: string[] | null
          target_type: string
        }
        Insert: {
          admin_modifications?: Json | null
          analysis_type: string
          confidence_score?: number | null
          created_at?: string | null
          created_scheme_id?: string | null
          data_signals?: Json | null
          expected_benefit?: string | null
          expires_at?: string | null
          id?: string
          reasoning: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          suggested_buy_quantity?: number | null
          suggested_category_id?: string | null
          suggested_condition_quantity?: number | null
          suggested_description?: string | null
          suggested_discount_amount?: number | null
          suggested_discount_percentage?: number | null
          suggested_end_date?: string | null
          suggested_free_quantity?: number | null
          suggested_min_order_value?: number | null
          suggested_name: string
          suggested_product_id?: string | null
          suggested_scheme_type: string
          suggested_start_date?: string | null
          suggested_tier_data?: Json | null
          target_ids?: string[] | null
          target_names?: string[] | null
          target_type: string
        }
        Update: {
          admin_modifications?: Json | null
          analysis_type?: string
          confidence_score?: number | null
          created_at?: string | null
          created_scheme_id?: string | null
          data_signals?: Json | null
          expected_benefit?: string | null
          expires_at?: string | null
          id?: string
          reasoning?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          suggested_buy_quantity?: number | null
          suggested_category_id?: string | null
          suggested_condition_quantity?: number | null
          suggested_description?: string | null
          suggested_discount_amount?: number | null
          suggested_discount_percentage?: number | null
          suggested_end_date?: string | null
          suggested_free_quantity?: number | null
          suggested_min_order_value?: number | null
          suggested_name?: string
          suggested_product_id?: string | null
          suggested_scheme_type?: string
          suggested_start_date?: string | null
          suggested_tier_data?: Json | null
          target_ids?: string[] | null
          target_names?: string[] | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_scheme_suggestions_created_scheme_id_fkey"
            columns: ["created_scheme_id"]
            isOneToOne: false
            referencedRelation: "product_schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_scheme_suggestions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_likes: {
        Row: {
          created_at: string
          id: string
          liked_at: string
          page_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          liked_at?: string
          page_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          liked_at?: string
          page_type?: string
          user_id?: string
        }
        Relationships: []
      }
      analytics_views: {
        Row: {
          created_at: string
          id: string
          user_id: string
          viewed_at: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          viewed_at?: string
          visit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          viewed_at?: string
          visit_id?: string
        }
        Relationships: []
      }
      approval_audit_log: {
        Row: {
          action: string
          approval_request_id: string | null
          entity_id: string
          entity_type: string
          id: string
          level: number | null
          metadata: Json | null
          performed_by: string
          timestamp: string
        }
        Insert: {
          action: string
          approval_request_id?: string | null
          entity_id: string
          entity_type: string
          id?: string
          level?: number | null
          metadata?: Json | null
          performed_by: string
          timestamp?: string
        }
        Update: {
          action?: string
          approval_request_id?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          level?: number | null
          metadata?: Json | null
          performed_by?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_audit_log_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_config: {
        Row: {
          approval_mode: string
          created_at: string
          entity_type: string
          final_approval_role: string | null
          id: string
          max_levels: number
          skip_levels: boolean
          updated_at: string
          use_full_hierarchy: boolean
        }
        Insert: {
          approval_mode?: string
          created_at?: string
          entity_type: string
          final_approval_role?: string | null
          id?: string
          max_levels?: number
          skip_levels?: boolean
          updated_at?: string
          use_full_hierarchy?: boolean
        }
        Update: {
          approval_mode?: string
          created_at?: string
          entity_type?: string
          final_approval_role?: string | null
          id?: string
          max_levels?: number
          skip_levels?: boolean
          updated_at?: string
          use_full_hierarchy?: boolean
        }
        Relationships: []
      }
      approval_requests: {
        Row: {
          created_at: string
          current_level: number
          entity_id: string
          entity_type: string
          final_approved_by: string | null
          id: string
          requester_id: string
          status: string
          total_levels: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_level?: number
          entity_id: string
          entity_type: string
          final_approved_by?: string | null
          id?: string
          requester_id: string
          status?: string
          total_levels?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_level?: number
          entity_id?: string
          entity_type?: string
          final_approved_by?: string | null
          id?: string
          requester_id?: string
          status?: string
          total_levels?: number
          updated_at?: string
        }
        Relationships: []
      }
      approval_steps: {
        Row: {
          action_taken_at: string | null
          approval_request_id: string
          approver_id: string
          created_at: string
          id: string
          level: number
          rejection_reason: string | null
          status: string
        }
        Insert: {
          action_taken_at?: string | null
          approval_request_id: string
          approver_id: string
          created_at?: string
          id?: string
          level: number
          rejection_reason?: string | null
          status?: string
        }
        Update: {
          action_taken_at?: string | null
          approval_request_id?: string
          approver_id?: string
          created_at?: string
          id?: string
          level?: number
          rejection_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflows: {
        Row: {
          approval_mode: string
          created_at: string
          entity_type: string
          id: string
          is_active: boolean
          is_default: boolean
          updated_at: string
          workflow_name: string
        }
        Insert: {
          approval_mode?: string
          created_at?: string
          entity_type?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          updated_at?: string
          workflow_name: string
        }
        Update: {
          approval_mode?: string
          created_at?: string
          entity_type?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          updated_at?: string
          workflow_name?: string
        }
        Relationships: []
      }
      approvers: {
        Row: {
          approver_level: number
          created_at: string
          department: string | null
          id: string
          is_active: boolean | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approver_level: number
          created_at?: string
          department?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approver_level?: number
          created_at?: string
          department?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      aspirations_and_preferences: {
        Row: {
          career_goal: string | null
          created_at: string | null
          dream_role: string | null
          favorite_activity: string | null
          five_year_vision: string | null
          id: string
          motivation_driver: string | null
          preferred_reward: string | null
          preferred_work_style: string | null
          team_preference: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          career_goal?: string | null
          created_at?: string | null
          dream_role?: string | null
          favorite_activity?: string | null
          five_year_vision?: string | null
          id?: string
          motivation_driver?: string | null
          preferred_reward?: string | null
          preferred_work_style?: string | null
          team_preference?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          career_goal?: string | null
          created_at?: string | null
          dream_role?: string | null
          favorite_activity?: string | null
          five_year_vision?: string | null
          id?: string
          motivation_driver?: string | null
          preferred_reward?: string | null
          preferred_work_style?: string | null
          team_preference?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          check_in_address: string | null
          check_in_location: Json | null
          check_in_photo_url: string | null
          check_in_time: string | null
          check_out_address: string | null
          check_out_location: Json | null
          check_out_photo_url: string | null
          check_out_time: string | null
          created_at: string
          date: string
          face_match_confidence: number | null
          face_match_confidence_out: number | null
          face_verification_status: string | null
          face_verification_status_out: string | null
          id: string
          locked: boolean
          locked_at: string | null
          locked_by: string | null
          manual_override_reason: string | null
          notes: string | null
          regularized_request_id: string | null
          status: string
          total_hours: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          check_in_address?: string | null
          check_in_location?: Json | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_out_address?: string | null
          check_out_location?: Json | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          created_at?: string
          date?: string
          face_match_confidence?: number | null
          face_match_confidence_out?: number | null
          face_verification_status?: string | null
          face_verification_status_out?: string | null
          id?: string
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          manual_override_reason?: string | null
          notes?: string | null
          regularized_request_id?: string | null
          status?: string
          total_hours?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          check_in_address?: string | null
          check_in_location?: Json | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_out_address?: string | null
          check_out_location?: Json | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          created_at?: string
          date?: string
          face_match_confidence?: number | null
          face_match_confidence_out?: number | null
          face_verification_status?: string | null
          face_verification_status_out?: string | null
          id?: string
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          manual_override_reason?: string | null
          notes?: string | null
          regularized_request_id?: string | null
          status?: string
          total_hours?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_regularized_request_id_fkey"
            columns: ["regularized_request_id"]
            isOneToOne: false
            referencedRelation: "regularization_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_daily_admin_summary: {
        Row: {
          avg_hours: number | null
          created_at: string
          date: string
          id: string
          total_absent: number
          total_employees: number
          total_half_day: number
          total_hours_sum: number | null
          total_on_leave: number
          total_present: number
          updated_at: string
        }
        Insert: {
          avg_hours?: number | null
          created_at?: string
          date: string
          id?: string
          total_absent?: number
          total_employees?: number
          total_half_day?: number
          total_hours_sum?: number | null
          total_on_leave?: number
          total_present?: number
          updated_at?: string
        }
        Update: {
          avg_hours?: number | null
          created_at?: string
          date?: string
          id?: string
          total_absent?: number
          total_employees?: number
          total_half_day?: number
          total_hours_sum?: number | null
          total_on_leave?: number
          total_present?: number
          updated_at?: string
        }
        Relationships: []
      }
      attendance_user_monthly_summary: {
        Row: {
          absent_days: number
          avg_daily_hours: number | null
          created_at: string
          half_day_leave_days: number
          id: string
          leave_days: number
          lop_days: number | null
          month: number
          present_days: number
          regularized_days: number
          total_hours: number | null
          updated_at: string
          user_id: string
          working_days: number | null
          year: number
        }
        Insert: {
          absent_days?: number
          avg_daily_hours?: number | null
          created_at?: string
          half_day_leave_days?: number
          id?: string
          leave_days?: number
          lop_days?: number | null
          month: number
          present_days?: number
          regularized_days?: number
          total_hours?: number | null
          updated_at?: string
          user_id: string
          working_days?: number | null
          year: number
        }
        Update: {
          absent_days?: number
          avg_daily_hours?: number | null
          created_at?: string
          half_day_leave_days?: number
          id?: string
          leave_days?: number
          lop_days?: number | null
          month?: number
          present_days?: number
          regularized_days?: number
          total_hours?: number | null
          updated_at?: string
          user_id?: string
          working_days?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_user_monthly_summary_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_end_day_policy: {
        Row: {
          auto_close_time: string
          cancel_planned_visits: boolean
          close_in_progress_visits: boolean
          created_at: string
          id: string
          is_enabled: boolean
          last_activity_source: string
          mark_unproductive: boolean
          pre_warning_enabled: boolean
          pre_warning_minutes_before: number
          timezone: string
          updated_at: string
        }
        Insert: {
          auto_close_time?: string
          cancel_planned_visits?: boolean
          close_in_progress_visits?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_activity_source?: string
          mark_unproductive?: boolean
          pre_warning_enabled?: boolean
          pre_warning_minutes_before?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          auto_close_time?: string
          cancel_planned_visits?: boolean
          close_in_progress_visits?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_activity_source?: string
          mark_unproductive?: boolean
          pre_warning_enabled?: boolean
          pre_warning_minutes_before?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      badges: {
        Row: {
          badge_color: string | null
          created_at: string
          criteria_type: string
          criteria_value: number
          description: string | null
          icon: string
          id: string
          name: string
        }
        Insert: {
          badge_color?: string | null
          created_at?: string
          criteria_type: string
          criteria_value: number
          description?: string | null
          icon: string
          id?: string
          name: string
        }
        Update: {
          badge_color?: string | null
          created_at?: string
          criteria_type?: string
          criteria_value?: number
          description?: string | null
          icon?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      beat_allowances: {
        Row: {
          average_km: number | null
          average_time_minutes: number | null
          beat_id: string
          beat_name: string
          created_at: string
          daily_allowance: number
          id: string
          travel_allowance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          average_km?: number | null
          average_time_minutes?: number | null
          beat_id: string
          beat_name: string
          created_at?: string
          daily_allowance?: number
          id?: string
          travel_allowance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          average_km?: number | null
          average_time_minutes?: number | null
          beat_id?: string
          beat_name?: string
          created_at?: string
          daily_allowance?: number
          id?: string
          travel_allowance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      beat_audit_log: {
        Row: {
          action: string
          beat_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          new_user_id: string | null
          old_user_id: string | null
          performed_by: string
        }
        Insert: {
          action: string
          beat_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          new_user_id?: string | null
          old_user_id?: string | null
          performed_by: string
        }
        Update: {
          action?: string
          beat_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          new_user_id?: string | null
          old_user_id?: string | null
          performed_by?: string
        }
        Relationships: []
      }
      beat_coverage_assignments: {
        Row: {
          assigned_by: string
          beat_id: string
          beat_name: string
          coverage_user_id: string
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          primary_user_id: string
          reason: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          assigned_by: string
          beat_id: string
          beat_name: string
          coverage_user_id: string
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          primary_user_id: string
          reason?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string
          beat_id?: string
          beat_name?: string
          coverage_user_id?: string
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          primary_user_id?: string
          reason?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      beat_ownership_history: {
        Row: {
          beat_id: string
          beat_name: string
          created_at: string
          effective_date: string
          id: string
          new_owner_id: string
          new_owner_name: string | null
          old_owner_id: string
          old_owner_name: string | null
          reason: string | null
          transferred_at: string
          transferred_by: string
        }
        Insert: {
          beat_id: string
          beat_name: string
          created_at?: string
          effective_date?: string
          id?: string
          new_owner_id: string
          new_owner_name?: string | null
          old_owner_id: string
          old_owner_name?: string | null
          reason?: string | null
          transferred_at?: string
          transferred_by: string
        }
        Update: {
          beat_id?: string
          beat_name?: string
          created_at?: string
          effective_date?: string
          id?: string
          new_owner_id?: string
          new_owner_name?: string | null
          old_owner_id?: string
          old_owner_name?: string | null
          reason?: string | null
          transferred_at?: string
          transferred_by?: string
        }
        Relationships: []
      }
      beat_plans: {
        Row: {
          beat_data: Json
          beat_id: string
          beat_name: string
          created_at: string
          id: string
          joint_sales_manager_id: string | null
          plan_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          beat_data?: Json
          beat_id: string
          beat_name: string
          created_at?: string
          id?: string
          joint_sales_manager_id?: string | null
          plan_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          beat_data?: Json
          beat_id?: string
          beat_name?: string
          created_at?: string
          id?: string
          joint_sales_manager_id?: string | null
          plan_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      beat_user_access: {
        Row: {
          access_type: string
          beat_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          granted_by: string
          id: string
          is_active: boolean
          reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_type: string
          beat_id: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          granted_by: string
          id?: string
          is_active?: boolean
          reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_type?: string
          beat_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          granted_by?: string
          id?: string
          is_active?: boolean
          reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      beats: {
        Row: {
          average_km: number | null
          average_time_minutes: number | null
          beat_id: string
          beat_name: string
          category: string | null
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          distributor_id: string | null
          id: string
          is_active: boolean | null
          owner_id: string | null
          owner_name: string | null
          reactivated_at: string | null
          reactivated_by: string | null
          territory_id: string | null
          transferred_at: string | null
          transferred_by: string | null
          travel_allowance: number | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          average_km?: number | null
          average_time_minutes?: number | null
          beat_id?: string
          beat_name: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          distributor_id?: string | null
          id?: string
          is_active?: boolean | null
          owner_id?: string | null
          owner_name?: string | null
          reactivated_at?: string | null
          reactivated_by?: string | null
          territory_id?: string | null
          transferred_at?: string | null
          transferred_by?: string | null
          travel_allowance?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          average_km?: number | null
          average_time_minutes?: number | null
          beat_id?: string
          beat_name?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          distributor_id?: string | null
          id?: string
          is_active?: boolean | null
          owner_id?: string | null
          owner_name?: string | null
          reactivated_at?: string | null
          reactivated_by?: string | null
          territory_id?: string | null
          transferred_at?: string | null
          transferred_by?: string | null
          travel_allowance?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beats_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beats_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beats_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_request_items: {
        Row: {
          approved_budget: number | null
          asset_type: string
          branding_request_id: string | null
          created_at: string
          current_stage: string | null
          due_date: string | null
          id: string
          pending_status: string | null
          preferred_vendor: string | null
          updated_at: string
          vendor_budget: number | null
          vendor_confirmation_status: string | null
        }
        Insert: {
          approved_budget?: number | null
          asset_type: string
          branding_request_id?: string | null
          created_at?: string
          current_stage?: string | null
          due_date?: string | null
          id?: string
          pending_status?: string | null
          preferred_vendor?: string | null
          updated_at?: string
          vendor_budget?: number | null
          vendor_confirmation_status?: string | null
        }
        Update: {
          approved_budget?: number | null
          asset_type?: string
          branding_request_id?: string | null
          created_at?: string
          current_stage?: string | null
          due_date?: string | null
          id?: string
          pending_status?: string | null
          preferred_vendor?: string | null
          updated_at?: string
          vendor_budget?: number | null
          vendor_confirmation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branding_request_items_branding_request_id_fkey"
            columns: ["branding_request_id"]
            isOneToOne: false
            referencedRelation: "branding_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_requests: {
        Row: {
          approved_at: string | null
          assigned_vendor_id: string | null
          budget: number | null
          contract_document_url: string | null
          created_at: string
          description: string | null
          due_date: string | null
          executed_at: string | null
          id: string
          implementation_date: string | null
          implementation_photo_urls: string[] | null
          manager_comments: string | null
          manager_id: string | null
          measurement_photo_urls: string[] | null
          order_impact_notes: string | null
          pincode: string | null
          post_implementation_notes: string | null
          procurement_id: string | null
          requested_assets: string | null
          retailer_feedback_on_branding: string | null
          retailer_id: string
          size: string | null
          status: Database["public"]["Enums"]["branding_status"]
          title: string | null
          updated_at: string
          user_id: string
          vendor_budget: number | null
          vendor_confirmation_status: string | null
          vendor_due_date: string | null
          vendor_feedback: string | null
          vendor_rating: number | null
          verification_photo_url: string | null
          visit_id: string
        }
        Insert: {
          approved_at?: string | null
          assigned_vendor_id?: string | null
          budget?: number | null
          contract_document_url?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          executed_at?: string | null
          id?: string
          implementation_date?: string | null
          implementation_photo_urls?: string[] | null
          manager_comments?: string | null
          manager_id?: string | null
          measurement_photo_urls?: string[] | null
          order_impact_notes?: string | null
          pincode?: string | null
          post_implementation_notes?: string | null
          procurement_id?: string | null
          requested_assets?: string | null
          retailer_feedback_on_branding?: string | null
          retailer_id: string
          size?: string | null
          status?: Database["public"]["Enums"]["branding_status"]
          title?: string | null
          updated_at?: string
          user_id: string
          vendor_budget?: number | null
          vendor_confirmation_status?: string | null
          vendor_due_date?: string | null
          vendor_feedback?: string | null
          vendor_rating?: number | null
          verification_photo_url?: string | null
          visit_id: string
        }
        Update: {
          approved_at?: string | null
          assigned_vendor_id?: string | null
          budget?: number | null
          contract_document_url?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          executed_at?: string | null
          id?: string
          implementation_date?: string | null
          implementation_photo_urls?: string[] | null
          manager_comments?: string | null
          manager_id?: string | null
          measurement_photo_urls?: string[] | null
          order_impact_notes?: string | null
          pincode?: string | null
          post_implementation_notes?: string | null
          procurement_id?: string | null
          requested_assets?: string | null
          retailer_feedback_on_branding?: string | null
          retailer_id?: string
          size?: string | null
          status?: Database["public"]["Enums"]["branding_status"]
          title?: string | null
          updated_at?: string
          user_id?: string
          vendor_budget?: number | null
          vendor_confirmation_status?: string | null
          vendor_due_date?: string | null
          vendor_feedback?: string | null
          vendor_rating?: number | null
          verification_photo_url?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branding_requests_assigned_vendor_id_fkey"
            columns: ["assigned_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_notification_log: {
        Row: {
          created_at: string
          id: string
          message: string
          sent_by: string | null
          sent_count: number | null
          target_ids: string[] | null
          target_portals: string[] | null
          target_type: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sent_by?: string | null
          sent_count?: number | null
          target_ids?: string[] | null
          target_portals?: string[] | null
          target_type?: string | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sent_by?: string | null
          sent_count?: number | null
          target_ids?: string[] | null
          target_portals?: string[] | null
          target_type?: string | null
          title?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string | null
          id: string
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_feedback: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          message_id: string
          rating: number | null
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          message_id: string
          rating?: number | null
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          message_id?: string
          rating?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_badges: {
        Row: {
          badge_color: string | null
          created_at: string
          criteria_competency_id: string | null
          criteria_type: string
          criteria_value: number
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          points_awarded: number | null
        }
        Insert: {
          badge_color?: string | null
          created_at?: string
          criteria_competency_id?: string | null
          criteria_type: string
          criteria_value: number
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          points_awarded?: number | null
        }
        Update: {
          badge_color?: string | null
          created_at?: string
          criteria_competency_id?: string | null
          criteria_type?: string
          criteria_value?: number
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          points_awarded?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_badges_criteria_competency_id_fkey"
            columns: ["criteria_competency_id"]
            isOneToOne: false
            referencedRelation: "coach_competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_chat_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          message_type: string | null
          metadata: Json | null
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          message_type?: string | null
          metadata?: Json | null
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          message_type?: string | null
          metadata?: Json | null
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_competencies: {
        Row: {
          category: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      coach_daily_nudges: {
        Row: {
          created_at: string
          delivered_at: string | null
          id: string
          is_delivered: boolean | null
          is_interacted: boolean | null
          message: string | null
          nudge_type: string
          reference_id: string | null
          scheduled_for: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_delivered?: boolean | null
          is_interacted?: boolean | null
          message?: string | null
          nudge_type: string
          reference_id?: string | null
          scheduled_for?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_delivered?: boolean | null
          is_interacted?: boolean | null
          message?: string | null
          nudge_type?: string
          reference_id?: string | null
          scheduled_for?: string | null
          user_id?: string
        }
        Relationships: []
      }
      coach_feedback: {
        Row: {
          created_at: string
          feedback_text: string | null
          id: string
          is_helpful: boolean | null
          rating: number | null
          reference_id: string | null
          reference_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_text?: string | null
          id?: string
          is_helpful?: boolean | null
          rating?: number | null
          reference_id?: string | null
          reference_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          feedback_text?: string | null
          id?: string
          is_helpful?: boolean | null
          rating?: number | null
          reference_id?: string | null
          reference_type?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_learning_content: {
        Row: {
          competency_id: string | null
          content_body: string | null
          content_type: string
          content_url: string | null
          created_at: string
          description: string | null
          difficulty_level: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean | null
          points_on_completion: number | null
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          competency_id?: string | null
          content_body?: string | null
          content_type: string
          content_url?: string | null
          created_at?: string
          description?: string | null
          difficulty_level?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          points_on_completion?: number | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          competency_id?: string | null
          content_body?: string | null
          content_type?: string
          content_url?: string | null
          created_at?: string
          description?: string | null
          difficulty_level?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          points_on_completion?: number | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_learning_content_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "coach_competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_quiz_attempts: {
        Row: {
          answered_at: string
          id: string
          is_correct: boolean | null
          points_earned: number | null
          question_id: string | null
          user_answer: string | null
          user_id: string
        }
        Insert: {
          answered_at?: string
          id?: string
          is_correct?: boolean | null
          points_earned?: number | null
          question_id?: string | null
          user_answer?: string | null
          user_id: string
        }
        Update: {
          answered_at?: string
          id?: string
          is_correct?: boolean | null
          points_earned?: number | null
          question_id?: string | null
          user_answer?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_quiz_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "coach_quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_quiz_questions: {
        Row: {
          competency_id: string | null
          correct_answer: string
          created_at: string
          difficulty_level: string | null
          explanation: string | null
          id: string
          is_active: boolean | null
          learning_content_id: string | null
          options: Json | null
          points: number | null
          question: string
          question_type: string | null
        }
        Insert: {
          competency_id?: string | null
          correct_answer: string
          created_at?: string
          difficulty_level?: string | null
          explanation?: string | null
          id?: string
          is_active?: boolean | null
          learning_content_id?: string | null
          options?: Json | null
          points?: number | null
          question: string
          question_type?: string | null
        }
        Update: {
          competency_id?: string | null
          correct_answer?: string
          created_at?: string
          difficulty_level?: string | null
          explanation?: string | null
          id?: string
          is_active?: boolean | null
          learning_content_id?: string | null
          options?: Json | null
          points?: number | null
          question?: string
          question_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_quiz_questions_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "coach_competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_quiz_questions_learning_content_id_fkey"
            columns: ["learning_content_id"]
            isOneToOne: false
            referencedRelation: "coach_learning_content"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_scenario_attempts: {
        Row: {
          answered_at: string
          id: string
          is_best_choice: boolean | null
          points_earned: number | null
          scenario_id: string | null
          selected_option: string | null
          user_id: string
        }
        Insert: {
          answered_at?: string
          id?: string
          is_best_choice?: boolean | null
          points_earned?: number | null
          scenario_id?: string | null
          selected_option?: string | null
          user_id: string
        }
        Update: {
          answered_at?: string
          id?: string
          is_best_choice?: boolean | null
          points_earned?: number | null
          scenario_id?: string | null
          selected_option?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_scenario_attempts_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "coach_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_scenarios: {
        Row: {
          best_option: string
          competency_id: string | null
          created_at: string
          difficulty_level: string | null
          feedback: Json | null
          id: string
          is_active: boolean | null
          options: Json | null
          points: number | null
          scenario_text: string
          scenario_type: string | null
          title: string
        }
        Insert: {
          best_option: string
          competency_id?: string | null
          created_at?: string
          difficulty_level?: string | null
          feedback?: Json | null
          id?: string
          is_active?: boolean | null
          options?: Json | null
          points?: number | null
          scenario_text: string
          scenario_type?: string | null
          title: string
        }
        Update: {
          best_option?: string
          competency_id?: string | null
          created_at?: string
          difficulty_level?: string | null
          feedback?: Json | null
          id?: string
          is_active?: boolean | null
          options?: Json | null
          points?: number | null
          scenario_text?: string
          scenario_type?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_scenarios_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "coach_competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_user_badges: {
        Row: {
          badge_id: string | null
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id?: string | null
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string | null
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "coach_badges"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_user_competency_scores: {
        Row: {
          competency_id: string | null
          created_at: string
          current_score: number | null
          id: string
          last_calculated_at: string
          learning_engagement_score: number | null
          practical_score: number | null
          previous_score: number | null
          quiz_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          competency_id?: string | null
          created_at?: string
          current_score?: number | null
          id?: string
          last_calculated_at?: string
          learning_engagement_score?: number | null
          practical_score?: number | null
          previous_score?: number | null
          quiz_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          competency_id?: string | null
          created_at?: string
          current_score?: number | null
          id?: string
          last_calculated_at?: string
          learning_engagement_score?: number | null
          practical_score?: number | null
          previous_score?: number | null
          quiz_score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_user_competency_scores_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "coach_competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_user_overall_scores: {
        Row: {
          created_at: string
          id: string
          last_calculated_at: string
          overall_competency_score: number | null
          overall_learning_score: number | null
          rank_percentile: number | null
          total_content_completed: number | null
          total_correct_answers: number | null
          total_points_earned: number | null
          total_quizzes_attempted: number | null
          total_scenarios_completed: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_calculated_at?: string
          overall_competency_score?: number | null
          overall_learning_score?: number | null
          rank_percentile?: number | null
          total_content_completed?: number | null
          total_correct_answers?: number | null
          total_points_earned?: number | null
          total_quizzes_attempted?: number | null
          total_scenarios_completed?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_calculated_at?: string
          overall_competency_score?: number | null
          overall_learning_score?: number | null
          rank_percentile?: number | null
          total_content_completed?: number | null
          total_correct_answers?: number | null
          total_points_earned?: number | null
          total_quizzes_attempted?: number | null
          total_scenarios_completed?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_user_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          learning_content_id: string | null
          progress_percent: number | null
          started_at: string | null
          status: string | null
          time_spent_seconds: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          learning_content_id?: string | null
          progress_percent?: number | null
          started_at?: string | null
          status?: string | null
          time_spent_seconds?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          learning_content_id?: string | null
          progress_percent?: number | null
          started_at?: string | null
          status?: string | null
          time_spent_seconds?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_user_progress_learning_content_id_fkey"
            columns: ["learning_content_id"]
            isOneToOne: false
            referencedRelation: "coach_learning_content"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_user_streaks: {
        Row: {
          created_at: string
          current_streak: number | null
          id: string
          last_activity_date: string | null
          longest_streak: number | null
          total_learning_days: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_streak?: number | null
          id?: string
          last_activity_date?: string | null
          longest_streak?: number | null
          total_learning_days?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_streak?: number | null
          id?: string
          last_activity_date?: string | null
          longest_streak?: number | null
          total_learning_days?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          account_holder_name: string | null
          address: string | null
          bank_account: string | null
          bank_name: string | null
          contact_phone: string | null
          created_at: string | null
          currency: string
          date_format: string
          email: string | null
          gstin: string | null
          header_logo_url: string | null
          header_name: string | null
          id: string
          ifsc: string | null
          invoice_template: string | null
          logo_url: string | null
          name: string
          qr_code_url: string | null
          qr_upi: string | null
          state: string | null
          terms_conditions: string | null
          timezone: string
          updated_at: string | null
        }
        Insert: {
          account_holder_name?: string | null
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          currency?: string
          date_format?: string
          email?: string | null
          gstin?: string | null
          header_logo_url?: string | null
          header_name?: string | null
          id?: string
          ifsc?: string | null
          invoice_template?: string | null
          logo_url?: string | null
          name: string
          qr_code_url?: string | null
          qr_upi?: string | null
          state?: string | null
          terms_conditions?: string | null
          timezone?: string
          updated_at?: string | null
        }
        Update: {
          account_holder_name?: string | null
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          currency?: string
          date_format?: string
          email?: string | null
          gstin?: string | null
          header_logo_url?: string | null
          header_name?: string | null
          id?: string
          ifsc?: string | null
          invoice_template?: string | null
          logo_url?: string | null
          name?: string
          qr_code_url?: string | null
          qr_upi?: string | null
          state?: string | null
          terms_conditions?: string | null
          timezone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      company_product_categories: {
        Row: {
          categories_json: Json
          company_id: string
          created_at: string
          id: number
          updated_at: string
        }
        Insert: {
          categories_json?: Json
          company_id: string
          created_at?: string
          id?: never
          updated_at?: string
        }
        Update: {
          categories_json?: Json
          company_id?: string
          created_at?: string
          id?: never
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_product_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      competencies: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          level_definitions: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          level_definitions?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          level_definitions?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      competency_coaching_notes: {
        Row: {
          acknowledged_at: string | null
          action_items: Json | null
          competency_template_id: string | null
          created_at: string | null
          id: string
          is_acknowledged: boolean | null
          manager_id: string
          note: string
          scorecard_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          action_items?: Json | null
          competency_template_id?: string | null
          created_at?: string | null
          id?: string
          is_acknowledged?: boolean | null
          manager_id: string
          note: string
          scorecard_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          action_items?: Json | null
          competency_template_id?: string | null
          created_at?: string | null
          id?: string
          is_acknowledged?: boolean | null
          manager_id?: string
          note?: string
          scorecard_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competency_coaching_notes_competency_template_id_fkey"
            columns: ["competency_template_id"]
            isOneToOne: false
            referencedRelation: "competency_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competency_coaching_notes_scorecard_id_fkey"
            columns: ["scorecard_id"]
            isOneToOne: false
            referencedRelation: "user_monthly_scorecards"
            referencedColumns: ["id"]
          },
        ]
      }
      competency_templates: {
        Row: {
          calculation_formula: Json
          category: string
          competency_code: string
          competency_name: string
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          max_score: number | null
          role_type: string
          sort_order: number | null
          updated_at: string | null
          weightage: number
        }
        Insert: {
          calculation_formula?: Json
          category: string
          competency_code: string
          competency_name: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          max_score?: number | null
          role_type: string
          sort_order?: number | null
          updated_at?: string | null
          weightage: number
        }
        Update: {
          calculation_formula?: Json
          category?: string
          competency_code?: string
          competency_name?: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          max_score?: number | null
          role_type?: string
          sort_order?: number | null
          updated_at?: string | null
          weightage?: number
        }
        Relationships: []
      }
      competition_contacts: {
        Row: {
          competitor_id: string
          competitor_since: number | null
          contact_email: string | null
          contact_name: string
          contact_phone: string | null
          created_at: string
          designation: string | null
          hq: string | null
          id: string
          is_active: boolean | null
          level: string | null
          region_covered: string | null
          reporting_to: string | null
          role: string | null
          skill: string | null
          updated_at: string
        }
        Insert: {
          competitor_id: string
          competitor_since?: number | null
          contact_email?: string | null
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          designation?: string | null
          hq?: string | null
          id?: string
          is_active?: boolean | null
          level?: string | null
          region_covered?: string | null
          reporting_to?: string | null
          role?: string | null
          skill?: string | null
          updated_at?: string
        }
        Update: {
          competitor_id?: string
          competitor_since?: number | null
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          designation?: string | null
          hq?: string | null
          id?: string
          is_active?: boolean | null
          level?: string | null
          region_covered?: string | null
          reporting_to?: string | null
          role?: string | null
          skill?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_contacts_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competition_master"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_data: {
        Row: {
          competitor_id: string
          created_at: string
          id: string
          impact_level: string | null
          insight: string | null
          needs_attention: boolean | null
          photo_urls: string[] | null
          retailer_id: string
          selling_price: number | null
          sku_id: string | null
          stock_quantity: number | null
          unit: string | null
          updated_at: string
          user_id: string
          visit_id: string | null
          voice_note_urls: string[] | null
        }
        Insert: {
          competitor_id: string
          created_at?: string
          id?: string
          impact_level?: string | null
          insight?: string | null
          needs_attention?: boolean | null
          photo_urls?: string[] | null
          retailer_id: string
          selling_price?: number | null
          sku_id?: string | null
          stock_quantity?: number | null
          unit?: string | null
          updated_at?: string
          user_id: string
          visit_id?: string | null
          voice_note_urls?: string[] | null
        }
        Update: {
          competitor_id?: string
          created_at?: string
          id?: string
          impact_level?: string | null
          insight?: string | null
          needs_attention?: boolean | null
          photo_urls?: string[] | null
          retailer_id?: string
          selling_price?: number | null
          sku_id?: string | null
          stock_quantity?: number | null
          unit?: string | null
          updated_at?: string
          user_id?: string
          visit_id?: string | null
          voice_note_urls?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "competition_data_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competition_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_data_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "competition_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_insights: {
        Row: {
          action_required: boolean | null
          additional_notes: string | null
          category: string | null
          competitor_image_url: string
          competitor_name: string
          created_at: string
          description: string
          id: string
          impact_level: string | null
          insight_type: string
          location_info: string | null
          price_info: string | null
          product_category: string | null
          product_details: string | null
          retailer_id: string
          shelf_space: string | null
          updated_at: string
          user_id: string
          visit_id: string | null
        }
        Insert: {
          action_required?: boolean | null
          additional_notes?: string | null
          category?: string | null
          competitor_image_url?: string
          competitor_name: string
          created_at?: string
          description: string
          id?: string
          impact_level?: string | null
          insight_type: string
          location_info?: string | null
          price_info?: string | null
          product_category?: string | null
          product_details?: string | null
          retailer_id: string
          shelf_space?: string | null
          updated_at?: string
          user_id: string
          visit_id?: string | null
        }
        Update: {
          action_required?: boolean | null
          additional_notes?: string | null
          category?: string | null
          competitor_image_url?: string
          competitor_name?: string
          created_at?: string
          description?: string
          id?: string
          impact_level?: string | null
          insight_type?: string
          location_info?: string | null
          price_info?: string | null
          product_category?: string | null
          product_details?: string | null
          retailer_id?: string
          shelf_space?: string | null
          updated_at?: string
          user_id?: string
          visit_id?: string | null
        }
        Relationships: []
      }
      competition_master: {
        Row: {
          business_background: string | null
          competitor_name: string
          created_at: string
          focus: string | null
          head_office: string | null
          id: string
          key_financial_stats: Json | null
          regional_offices_count: number | null
          sales_team_size: number | null
          strategy: string | null
          supply_chain_info: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          business_background?: string | null
          competitor_name: string
          created_at?: string
          focus?: string | null
          head_office?: string | null
          id?: string
          key_financial_stats?: Json | null
          regional_offices_count?: number | null
          sales_team_size?: number | null
          strategy?: string | null
          supply_chain_info?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          business_background?: string | null
          competitor_name?: string
          created_at?: string
          focus?: string | null
          head_office?: string | null
          id?: string
          key_financial_stats?: Json | null
          regional_offices_count?: number | null
          sales_team_size?: number | null
          strategy?: string | null
          supply_chain_info?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      competition_skus: {
        Row: {
          competitor_id: string
          created_at: string
          id: string
          is_active: boolean | null
          sku_name: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          competitor_id: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          sku_name: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          competitor_id?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          sku_name?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_skus_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competition_master"
            referencedColumns: ["id"]
          },
        ]
      }
      counter_customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          loyalty_points: number | null
          name: string | null
          notes: string | null
          phone: string
          tags: string[] | null
          total_orders: number | null
          total_spent: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          loyalty_points?: number | null
          name?: string | null
          notes?: string | null
          phone: string
          tags?: string[] | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          loyalty_points?: number | null
          name?: string | null
          notes?: string | null
          phone?: string
          tags?: string[] | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      counter_sale_items: {
        Row: {
          base_qty: number | null
          conversion_to_base: number | null
          counter_sale_id: string
          created_at: string
          id: string
          line_total: number
          product_id: string
          product_name: string
          quantity: number
          rate: number
          uom_code: string | null
          uom_id: string | null
        }
        Insert: {
          base_qty?: number | null
          conversion_to_base?: number | null
          counter_sale_id: string
          created_at?: string
          id?: string
          line_total: number
          product_id: string
          product_name: string
          quantity: number
          rate: number
          uom_code?: string | null
          uom_id?: string | null
        }
        Update: {
          base_qty?: number | null
          conversion_to_base?: number | null
          counter_sale_id?: string
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string
          product_name?: string
          quantity?: number
          rate?: number
          uom_code?: string | null
          uom_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "counter_sale_items_counter_sale_id_fkey"
            columns: ["counter_sale_id"]
            isOneToOne: false
            referencedRelation: "counter_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      counter_sales: {
        Row: {
          cgst_amount: number | null
          created_at: string
          id: string
          pos_customer_id: string | null
          remarks: string | null
          sale_date: string
          sgst_amount: number | null
          subtotal: number | null
          tax_amount: number | null
          total_amount: number
          updated_at: string
          user_id: string
          visit_id: string | null
          walkin_name: string | null
          walkin_phone: string | null
        }
        Insert: {
          cgst_amount?: number | null
          created_at?: string
          id?: string
          pos_customer_id?: string | null
          remarks?: string | null
          sale_date?: string
          sgst_amount?: number | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
          user_id: string
          visit_id?: string | null
          walkin_name?: string | null
          walkin_phone?: string | null
        }
        Update: {
          cgst_amount?: number | null
          created_at?: string
          id?: string
          pos_customer_id?: string | null
          remarks?: string | null
          sale_date?: string
          sgst_amount?: number | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
          user_id?: string
          visit_id?: string | null
          walkin_name?: string | null
          walkin_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "counter_sales_pos_customer_id_fkey"
            columns: ["pos_customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_permission_assignments: {
        Row: {
          created_at: string
          end_date: string
          granted_by: string
          id: string
          is_active: boolean
          permission_set_id: string
          reason: string | null
          start_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          granted_by: string
          id?: string
          is_active?: boolean
          permission_set_id: string
          reason?: string | null
          start_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          granted_by?: string
          id?: string
          is_active?: boolean
          permission_set_id?: string
          reason?: string | null
          start_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_permission_assignments_permission_set_id_fkey"
            columns: ["permission_set_id"]
            isOneToOne: false
            referencedRelation: "permission_set_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          reference_id: string | null
          retailer_id: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          reference_id?: string | null
          retailer_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          reference_id?: string | null
          retailer_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_management_config: {
        Row: {
          config_name: string | null
          created_at: string | null
          credit_multiplier: number
          id: string
          is_active: boolean | null
          is_enabled: boolean
          lookback_period_months: number
          new_retailer_starting_score: number
          payment_term_days: number
          scoring_mode: string
          target_growth_rate_percent: number | null
          target_order_frequency: number | null
          territory_ids: string[]
          updated_at: string | null
          weight_growth_rate: number
          weight_order_frequency: number
          weight_repayment_dso: number
        }
        Insert: {
          config_name?: string | null
          created_at?: string | null
          credit_multiplier?: number
          id?: string
          is_active?: boolean | null
          is_enabled?: boolean
          lookback_period_months?: number
          new_retailer_starting_score?: number
          payment_term_days?: number
          scoring_mode?: string
          target_growth_rate_percent?: number | null
          target_order_frequency?: number | null
          territory_ids?: string[]
          updated_at?: string | null
          weight_growth_rate?: number
          weight_order_frequency?: number
          weight_repayment_dso?: number
        }
        Update: {
          config_name?: string | null
          created_at?: string | null
          credit_multiplier?: number
          id?: string
          is_active?: boolean | null
          is_enabled?: boolean
          lookback_period_months?: number
          new_retailer_starting_score?: number
          payment_term_days?: number
          scoring_mode?: string
          target_growth_rate_percent?: number | null
          target_order_frequency?: number | null
          territory_ids?: string[]
          updated_at?: string | null
          weight_growth_rate?: number
          weight_order_frequency?: number
          weight_repayment_dso?: number
        }
        Relationships: []
      }
      credit_note_items: {
        Row: {
          barcode: string | null
          cgst_amount: number | null
          created_at: string | null
          credit_note_id: string
          hsn_code: string | null
          id: string
          original_invoice_number: string | null
          original_order_id: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          rate: number | null
          sgst_amount: number | null
          taxable_amount: number | null
          total: number | null
          unit: string | null
        }
        Insert: {
          barcode?: string | null
          cgst_amount?: number | null
          created_at?: string | null
          credit_note_id: string
          hsn_code?: string | null
          id?: string
          original_invoice_number?: string | null
          original_order_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          rate?: number | null
          sgst_amount?: number | null
          taxable_amount?: number | null
          total?: number | null
          unit?: string | null
        }
        Update: {
          barcode?: string | null
          cgst_amount?: number | null
          created_at?: string | null
          credit_note_id?: string
          hsn_code?: string | null
          id?: string
          original_invoice_number?: string | null
          original_order_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          rate?: number | null
          sgst_amount?: number | null
          taxable_amount?: number | null
          total?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_items_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount_in_words: string | null
          cgst_total: number | null
          created_at: string | null
          created_by: string | null
          credit_note_date: string
          credit_note_number: string
          id: string
          reason: string
          reason_notes: string | null
          retailer_id: string | null
          retailer_name: string | null
          sgst_total: number | null
          status: string
          sub_total: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          amount_in_words?: string | null
          cgst_total?: number | null
          created_at?: string | null
          created_by?: string | null
          credit_note_date?: string
          credit_note_number: string
          id?: string
          reason?: string
          reason_notes?: string | null
          retailer_id?: string | null
          retailer_name?: string | null
          sgst_total?: number | null
          status?: string
          sub_total?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          amount_in_words?: string | null
          cgst_total?: number | null
          created_at?: string | null
          created_by?: string | null
          credit_note_date?: string
          credit_note_number?: string
          id?: string
          reason?: string
          reason_notes?: string | null
          retailer_id?: string | null
          retailer_name?: string | null
          sgst_total?: number | null
          status?: string
          sub_total?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_invoice_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          template_file_url: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          template_file_url: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          template_file_url?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      customer_portal_cart: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          retailer_id: string
          source: string
          unit: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          retailer_id: string
          source?: string
          unit?: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          retailer_id?: string
          source?: string
          unit?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string | null
          gstin: string | null
          id: string
          name: string
          state: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string | null
          gstin?: string | null
          id?: string
          name: string
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string | null
          gstin?: string | null
          id?: string
          name?: string
          state?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_beat_plans: {
        Row: {
          assigned_by: string
          assigned_user_id: string
          assignment_type: string
          beat_id: string
          created_at: string
          id: string
          notes: string | null
          plan_date: string
          status: string
        }
        Insert: {
          assigned_by: string
          assigned_user_id: string
          assignment_type: string
          beat_id: string
          created_at?: string
          id?: string
          notes?: string | null
          plan_date: string
          status?: string
        }
        Update: {
          assigned_by?: string
          assigned_user_id?: string
          assignment_type?: string
          beat_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          plan_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_beat_plans_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_beat_plans_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_gps_distance: {
        Row: {
          date: string
          id: string
          point_count: number
          total_km: number
          updated_at: string
          user_id: string
        }
        Insert: {
          date: string
          id?: string
          point_count?: number
          total_km?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          date?: string
          id?: string
          point_count?: number
          total_km?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_retailer_assignments: {
        Row: {
          assigned_to: string
          assignment_type: string
          beat_id: string
          created_at: string
          created_by: string
          id: string
          plan_date: string
          retailer_id: string
          source_plan_id: string | null
          stop_order: number | null
        }
        Insert: {
          assigned_to: string
          assignment_type: string
          beat_id: string
          created_at?: string
          created_by: string
          id?: string
          plan_date: string
          retailer_id: string
          source_plan_id?: string | null
          stop_order?: number | null
        }
        Update: {
          assigned_to?: string
          assignment_type?: string
          beat_id?: string
          created_at?: string
          created_by?: string
          id?: string
          plan_date?: string
          retailer_id?: string
          source_plan_id?: string | null
          stop_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_retailer_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_retailer_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_retailer_assignments_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_retailer_assignments_source_plan_id_fkey"
            columns: ["source_plan_id"]
            isOneToOne: false
            referencedRelation: "daily_beat_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_exceptions: {
        Row: {
          created_at: string
          delivery_run_id: string
          description: string | null
          exception_type: string
          id: string
          packing_list_id: string
          resolved: boolean | null
        }
        Insert: {
          created_at?: string
          delivery_run_id: string
          description?: string | null
          exception_type: string
          id?: string
          packing_list_id: string
          resolved?: boolean | null
        }
        Update: {
          created_at?: string
          delivery_run_id?: string
          description?: string | null
          exception_type?: string
          id?: string
          packing_list_id?: string
          resolved?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_exceptions_delivery_run_id_fkey"
            columns: ["delivery_run_id"]
            isOneToOne: false
            referencedRelation: "delivery_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_exceptions_packing_list_id_fkey"
            columns: ["packing_list_id"]
            isOneToOne: false
            referencedRelation: "packing_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_run_packing_lists: {
        Row: {
          created_at: string
          delivery_run_id: string
          id: string
          packing_list_id: string
          sequence_order: number
        }
        Insert: {
          created_at?: string
          delivery_run_id: string
          id?: string
          packing_list_id: string
          sequence_order?: number
        }
        Update: {
          created_at?: string
          delivery_run_id?: string
          id?: string
          packing_list_id?: string
          sequence_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_run_packing_lists_delivery_run_id_fkey"
            columns: ["delivery_run_id"]
            isOneToOne: false
            referencedRelation: "delivery_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_run_packing_lists_packing_list_id_fkey"
            columns: ["packing_list_id"]
            isOneToOne: true
            referencedRelation: "packing_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_runs: {
        Row: {
          agent_id: string | null
          completed_at: string | null
          created_at: string
          delivery_mode: string | null
          dispatch_date: string | null
          driver_name: string | null
          expected_delivery_date: string | null
          id: string
          lr_number: string | null
          notes: string | null
          route_id: string | null
          run_number: string
          start_time: string | null
          status: string
          tracking_id: string | null
          transporter_name: string | null
          updated_at: string
          vehicle_id: string | null
          vehicle_number: string | null
        }
        Insert: {
          agent_id?: string | null
          completed_at?: string | null
          created_at?: string
          delivery_mode?: string | null
          dispatch_date?: string | null
          driver_name?: string | null
          expected_delivery_date?: string | null
          id?: string
          lr_number?: string | null
          notes?: string | null
          route_id?: string | null
          run_number?: string
          start_time?: string | null
          status?: string
          tracking_id?: string | null
          transporter_name?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_number?: string | null
        }
        Update: {
          agent_id?: string | null
          completed_at?: string | null
          created_at?: string
          delivery_mode?: string | null
          dispatch_date?: string | null
          driver_name?: string | null
          expected_delivery_date?: string | null
          id?: string
          lr_number?: string | null
          notes?: string | null
          route_id?: string | null
          run_number?: string
          start_time?: string | null
          status?: string
          tracking_id?: string | null
          transporter_name?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_number?: string | null
        }
        Relationships: []
      }
      device_battery_logs: {
        Row: {
          battery_level: number
          created_at: string
          id: string
          is_charging: boolean
          recorded_at: string
          user_id: string
        }
        Insert: {
          battery_level: number
          created_at?: string
          id?: string
          is_charging?: boolean
          recorded_at?: string
          user_id: string
        }
        Update: {
          battery_level?: number
          created_at?: string
          id?: string
          is_charging?: boolean
          recorded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      distributor_attachments: {
        Row: {
          created_at: string | null
          distributor_id: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          distributor_id?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          distributor_id?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distributor_attachments_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_beat_mappings: {
        Row: {
          beat_id: string
          created_at: string
          created_by: string | null
          distributor_id: string
          id: string
        }
        Insert: {
          beat_id: string
          created_at?: string
          created_by?: string | null
          distributor_id: string
          id?: string
        }
        Update: {
          beat_id?: string
          created_at?: string
          created_by?: string | null
          distributor_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_beat_mappings_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_business_plan_month_products: {
        Row: {
          business_plan_id: string
          created_at: string
          id: string
          month_name: string
          month_number: number
          percentage: number
          product_id: string
          product_name: string
          quantity_target: number | null
          revenue_target: number | null
          updated_at: string
        }
        Insert: {
          business_plan_id: string
          created_at?: string
          id?: string
          month_name: string
          month_number: number
          percentage?: number
          product_id: string
          product_name: string
          quantity_target?: number | null
          revenue_target?: number | null
          updated_at?: string
        }
        Update: {
          business_plan_id?: string
          created_at?: string
          id?: string
          month_name?: string
          month_number?: number
          percentage?: number
          product_id?: string
          product_name?: string
          quantity_target?: number | null
          revenue_target?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_business_plan_month_products_business_plan_id_fkey"
            columns: ["business_plan_id"]
            isOneToOne: false
            referencedRelation: "distributor_business_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_business_plan_month_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_business_plan_months: {
        Row: {
          business_plan_id: string
          created_at: string
          id: string
          month_name: string
          month_number: number
          quantity_target: number | null
          target_revenue: number | null
          updated_at: string
        }
        Insert: {
          business_plan_id: string
          created_at?: string
          id?: string
          month_name: string
          month_number: number
          quantity_target?: number | null
          target_revenue?: number | null
          updated_at?: string
        }
        Update: {
          business_plan_id?: string
          created_at?: string
          id?: string
          month_name?: string
          month_number?: number
          quantity_target?: number | null
          target_revenue?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_business_plan_months_business_plan_id_fkey"
            columns: ["business_plan_id"]
            isOneToOne: false
            referencedRelation: "distributor_business_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_business_plan_products: {
        Row: {
          business_plan_id: string
          created_at: string
          id: string
          product_id: string
          product_name: string
          quantity_target: number | null
          revenue_target: number | null
        }
        Insert: {
          business_plan_id: string
          created_at?: string
          id?: string
          product_id: string
          product_name: string
          quantity_target?: number | null
          revenue_target?: number | null
        }
        Update: {
          business_plan_id?: string
          created_at?: string
          id?: string
          product_id?: string
          product_name?: string
          quantity_target?: number | null
          revenue_target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "distributor_business_plan_products_business_plan_id_fkey"
            columns: ["business_plan_id"]
            isOneToOne: false
            referencedRelation: "distributor_business_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_business_plan_retailers: {
        Row: {
          business_plan_id: string
          created_at: string
          growth_percent: number | null
          id: string
          last_year_revenue: number | null
          quantity_target: number | null
          retailer_id: string
          retailer_name: string
          target_revenue: number | null
        }
        Insert: {
          business_plan_id: string
          created_at?: string
          growth_percent?: number | null
          id?: string
          last_year_revenue?: number | null
          quantity_target?: number | null
          retailer_id: string
          retailer_name: string
          target_revenue?: number | null
        }
        Update: {
          business_plan_id?: string
          created_at?: string
          growth_percent?: number | null
          id?: string
          last_year_revenue?: number | null
          quantity_target?: number | null
          retailer_id?: string
          retailer_name?: string
          target_revenue?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "distributor_business_plan_retailers_business_plan_id_fkey"
            columns: ["business_plan_id"]
            isOneToOne: false
            referencedRelation: "distributor_business_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_business_plans: {
        Row: {
          coverage_target: string | null
          created_at: string
          distributor_id: string
          id: string
          notes: string | null
          quantity_target: number | null
          quantity_unit: string | null
          revenue_target: number | null
          territory_target: string | null
          updated_at: string
          year: number
        }
        Insert: {
          coverage_target?: string | null
          created_at?: string
          distributor_id: string
          id?: string
          notes?: string | null
          quantity_target?: number | null
          quantity_unit?: string | null
          revenue_target?: number | null
          territory_target?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          coverage_target?: string | null
          created_at?: string
          distributor_id?: string
          id?: string
          notes?: string | null
          quantity_target?: number | null
          quantity_unit?: string | null
          revenue_target?: number | null
          territory_target?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "distributor_business_plans_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_claims: {
        Row: {
          approved_amount: number | null
          bill_urls: string[] | null
          claim_amount: number
          claim_date: string
          claim_number: string
          claim_type: string
          created_at: string
          created_by_user_id: string | null
          damage_reason: string | null
          description: string | null
          distributor_id: string
          expense_category: string | null
          expense_date: string | null
          id: string
          km_traveled: number | null
          paid_at: string | null
          payment_reference: string | null
          product_details: Json | null
          reference_id: string | null
          reference_number: string | null
          reference_type: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scheme_name: string | null
          scheme_period: string | null
          status: string
          supporting_docs: string[] | null
          target_achieved: number | null
          updated_at: string
          vehicle_number: string | null
        }
        Insert: {
          approved_amount?: number | null
          bill_urls?: string[] | null
          claim_amount?: number
          claim_date?: string
          claim_number: string
          claim_type: string
          created_at?: string
          created_by_user_id?: string | null
          damage_reason?: string | null
          description?: string | null
          distributor_id: string
          expense_category?: string | null
          expense_date?: string | null
          id?: string
          km_traveled?: number | null
          paid_at?: string | null
          payment_reference?: string | null
          product_details?: Json | null
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheme_name?: string | null
          scheme_period?: string | null
          status?: string
          supporting_docs?: string[] | null
          target_achieved?: number | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Update: {
          approved_amount?: number | null
          bill_urls?: string[] | null
          claim_amount?: number
          claim_date?: string
          claim_number?: string
          claim_type?: string
          created_at?: string
          created_by_user_id?: string | null
          damage_reason?: string | null
          description?: string | null
          distributor_id?: string
          expense_category?: string | null
          expense_date?: string | null
          id?: string
          km_traveled?: number | null
          paid_at?: string | null
          payment_reference?: string | null
          product_details?: Json | null
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheme_name?: string | null
          scheme_period?: string | null
          status?: string
          supporting_docs?: string[] | null
          target_achieved?: number | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distributor_claims_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_collection_policy: {
        Row: {
          allocation_strategy: string
          allow_manual_override: boolean
          allow_unallocated_amount: boolean
          created_at: string
          distributor_id: string
          id: string
          updated_at: string
        }
        Insert: {
          allocation_strategy?: string
          allow_manual_override?: boolean
          allow_unallocated_amount?: boolean
          created_at?: string
          distributor_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          allocation_strategy?: string
          allow_manual_override?: boolean
          allow_unallocated_amount?: boolean
          created_at?: string
          distributor_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      distributor_company_return_items: {
        Row: {
          batch_number: string | null
          company_return_id: string
          created_at: string
          expiry_date: string | null
          id: string
          notes: string | null
          product_id: string
          product_name: string
          quantity: number
          reason: string
          source: string | null
          source_return_id: string | null
          total: number | null
          unit: string | null
          unit_cost: number | null
          variant_id: string | null
        }
        Insert: {
          batch_number?: string | null
          company_return_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          product_id: string
          product_name: string
          quantity: number
          reason: string
          source?: string | null
          source_return_id?: string | null
          total?: number | null
          unit?: string | null
          unit_cost?: number | null
          variant_id?: string | null
        }
        Update: {
          batch_number?: string | null
          company_return_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          product_name?: string
          quantity?: number
          reason?: string
          source?: string | null
          source_return_id?: string | null
          total?: number | null
          unit?: string | null
          unit_cost?: number | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distributor_company_return_items_company_return_id_fkey"
            columns: ["company_return_id"]
            isOneToOne: false
            referencedRelation: "distributor_company_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_company_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_company_return_items_source_return_id_fkey"
            columns: ["source_return_id"]
            isOneToOne: false
            referencedRelation: "distributor_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_company_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_company_returns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          credit_note_amount: number | null
          credit_note_date: string | null
          credit_note_number: string | null
          distributor_id: string
          id: string
          notes: string | null
          picked_up_at: string | null
          return_date: string
          return_number: string
          status: string
          submitted_at: string | null
          total_quantity: number | null
          total_value: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_amount?: number | null
          credit_note_date?: string | null
          credit_note_number?: string | null
          distributor_id: string
          id?: string
          notes?: string | null
          picked_up_at?: string | null
          return_date?: string
          return_number: string
          status?: string
          submitted_at?: string | null
          total_quantity?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_amount?: number | null
          credit_note_date?: string | null
          credit_note_number?: string | null
          distributor_id?: string
          id?: string
          notes?: string | null
          picked_up_at?: string | null
          return_date?: string
          return_number?: string
          status?: string
          submitted_at?: string | null
          total_quantity?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_company_returns_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_contacts: {
        Row: {
          address: string | null
          birth_date: string | null
          contact_name: string
          created_at: string | null
          designation: string | null
          distributor_id: string | null
          email: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          phone: string | null
          reports_to: string | null
          role: string | null
          seniority: string | null
          updated_at: string | null
          years_of_experience: number | null
          years_with_distributor: number | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          contact_name: string
          created_at?: string | null
          designation?: string | null
          distributor_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          phone?: string | null
          reports_to?: string | null
          role?: string | null
          seniority?: string | null
          updated_at?: string | null
          years_of_experience?: number | null
          years_with_distributor?: number | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          contact_name?: string
          created_at?: string | null
          designation?: string | null
          distributor_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          phone?: string | null
          reports_to?: string | null
          role?: string | null
          seniority?: string | null
          updated_at?: string | null
          years_of_experience?: number | null
          years_with_distributor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "distributor_contacts_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_contacts_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "distributor_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_credit_limits: {
        Row: {
          credit_days: number
          credit_limit: number
          distributor_id: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          credit_days?: number
          credit_limit?: number
          distributor_id: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          credit_days?: number
          credit_limit?: number
          distributor_id?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distributor_credit_limits_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: true
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_evaluation_tasks: {
        Row: {
          attachment_urls: string[] | null
          completed_date: string | null
          created_at: string
          created_by: string | null
          distributor_id: string
          due_date: string | null
          id: string
          notes: string | null
          owner_user_id: string | null
          status: string
          task_key: string
          task_label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attachment_urls?: string[] | null
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          distributor_id: string
          due_date?: string | null
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          status?: string
          task_key: string
          task_label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attachment_urls?: string[] | null
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          distributor_id?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          status?: string
          task_key?: string
          task_label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distributor_evaluation_tasks_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_ideas: {
        Row: {
          attachment_urls: string[] | null
          category: string
          competitor_insight: string | null
          competitor_name: string | null
          created_at: string
          created_by_user_id: string | null
          description: string
          distributor_id: string
          estimated_value: number | null
          expected_impact: string | null
          id: string
          idea_number: string
          implementation_date: string | null
          implementation_effort: string | null
          implementation_status: string | null
          market_segment: string | null
          points_awarded: number | null
          recognition_notes: string | null
          region: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suggested_packaging: string | null
          suggested_price_range: string | null
          suggested_product: string | null
          target_audience: string | null
          title: string
          updated_at: string
        }
        Insert: {
          attachment_urls?: string[] | null
          category: string
          competitor_insight?: string | null
          competitor_name?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description: string
          distributor_id: string
          estimated_value?: number | null
          expected_impact?: string | null
          id?: string
          idea_number: string
          implementation_date?: string | null
          implementation_effort?: string | null
          implementation_status?: string | null
          market_segment?: string | null
          points_awarded?: number | null
          recognition_notes?: string | null
          region?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_packaging?: string | null
          suggested_price_range?: string | null
          suggested_product?: string | null
          target_audience?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          attachment_urls?: string[] | null
          category?: string
          competitor_insight?: string | null
          competitor_name?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string
          distributor_id?: string
          estimated_value?: number | null
          expected_impact?: string | null
          id?: string
          idea_number?: string
          implementation_date?: string | null
          implementation_effort?: string | null
          implementation_status?: string | null
          market_segment?: string | null
          points_awarded?: number | null
          recognition_notes?: string | null
          region?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_packaging?: string | null
          suggested_price_range?: string | null
          suggested_product?: string | null
          target_audience?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_ideas_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_inventory: {
        Row: {
          batch_number: string | null
          created_at: string
          damaged_quantity: number
          distributor_id: string
          expired_quantity: number
          expiry_date: string | null
          id: string
          last_issued_date: string | null
          last_received_date: string | null
          location: string | null
          manufacturing_date: string | null
          max_stock_level: number | null
          product_id: string | null
          product_name: string
          quantity: number
          reorder_level: number | null
          reserved_quantity: number
          sku: string | null
          total_value: number | null
          unit: string | null
          unit_cost: number | null
          updated_at: string
          variant_id: string | null
          variant_name: string | null
          warehouse_id: string
        }
        Insert: {
          batch_number?: string | null
          created_at?: string
          damaged_quantity?: number
          distributor_id: string
          expired_quantity?: number
          expiry_date?: string | null
          id?: string
          last_issued_date?: string | null
          last_received_date?: string | null
          location?: string | null
          manufacturing_date?: string | null
          max_stock_level?: number | null
          product_id?: string | null
          product_name: string
          quantity?: number
          reorder_level?: number | null
          reserved_quantity?: number
          sku?: string | null
          total_value?: number | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
          variant_id?: string | null
          variant_name?: string | null
          warehouse_id: string
        }
        Update: {
          batch_number?: string | null
          created_at?: string
          damaged_quantity?: number
          distributor_id?: string
          expired_quantity?: number
          expiry_date?: string | null
          id?: string
          last_issued_date?: string | null
          last_received_date?: string | null
          location?: string | null
          manufacturing_date?: string | null
          max_stock_level?: number | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          reorder_level?: number | null
          reserved_quantity?: number
          sku?: string | null
          total_value?: number | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
          variant_id?: string | null
          variant_name?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_inventory_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_inventory_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_inventory_transactions: {
        Row: {
          balance_qty: number | null
          batch_number: string | null
          created_at: string
          created_by: string | null
          distributor_id: string
          expiry_date: string | null
          id: string
          notes: string | null
          product_id: string | null
          product_name: string | null
          reference_id: string | null
          reference_number: string | null
          reference_type: string | null
          running_balance: number | null
          transaction_type: string | null
          unit: string | null
          unit_cost: number | null
          variant_id: string | null
          warehouse_id: string
        }
        Insert: {
          balance_qty?: number | null
          batch_number?: string | null
          created_at?: string
          created_by?: string | null
          distributor_id: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name?: string | null
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          running_balance?: number | null
          transaction_type?: string | null
          unit?: string | null
          unit_cost?: number | null
          variant_id?: string | null
          warehouse_id: string
        }
        Update: {
          balance_qty?: number | null
          batch_number?: string | null
          created_at?: string
          created_by?: string | null
          distributor_id?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name?: string | null
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          running_balance?: number | null
          transaction_type?: string | null
          unit?: string | null
          unit_cost?: number | null
          variant_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_inventory_transactions_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_inventory_transactions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_inventory_transactions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_item_mappings: {
        Row: {
          category_id: string | null
          category_name: string | null
          created_at: string
          id: string
          mapping_id: string
          product_id: string | null
          product_name: string | null
        }
        Insert: {
          category_id?: string | null
          category_name?: string | null
          created_at?: string
          id?: string
          mapping_id: string
          product_id?: string | null
          product_name?: string | null
        }
        Update: {
          category_id?: string | null
          category_name?: string | null
          created_at?: string
          id?: string
          mapping_id?: string
          product_id?: string | null
          product_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distributor_item_mappings_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: false
            referencedRelation: "distributor_retailer_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_locations: {
        Row: {
          address: string | null
          city: string | null
          contact_phone: string | null
          created_at: string | null
          distributor_id: string | null
          id: string
          is_head_office: boolean | null
          location_name: string
          pincode: string | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_phone?: string | null
          created_at?: string | null
          distributor_id?: string | null
          id?: string
          is_head_office?: boolean | null
          location_name: string
          pincode?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_phone?: string | null
          created_at?: string | null
          distributor_id?: string | null
          id?: string
          is_head_office?: boolean | null
          location_name?: string
          pincode?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distributor_locations_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_payments: {
        Row: {
          amount: number
          bank_name: string | null
          cheque_date: string | null
          cheque_number: string | null
          collected_by_user_id: string | null
          created_at: string
          created_by: string | null
          distributor_id: string
          id: string
          notes: string | null
          operational_snapshot_user_id: string | null
          owner_snapshot_user_id: string | null
          payment_date: string
          payment_mode: string
          receipt_number: string | null
          reference_number: string | null
          retailer_id: string
          sales_credit_user_id: string | null
          status: string
          unallocated_amount: number
          updated_at: string
        }
        Insert: {
          amount: number
          bank_name?: string | null
          cheque_date?: string | null
          cheque_number?: string | null
          collected_by_user_id?: string | null
          created_at?: string
          created_by?: string | null
          distributor_id: string
          id?: string
          notes?: string | null
          operational_snapshot_user_id?: string | null
          owner_snapshot_user_id?: string | null
          payment_date?: string
          payment_mode?: string
          receipt_number?: string | null
          reference_number?: string | null
          retailer_id: string
          sales_credit_user_id?: string | null
          status?: string
          unallocated_amount?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_name?: string | null
          cheque_date?: string | null
          cheque_number?: string | null
          collected_by_user_id?: string | null
          created_at?: string
          created_by?: string | null
          distributor_id?: string
          id?: string
          notes?: string | null
          operational_snapshot_user_id?: string | null
          owner_snapshot_user_id?: string | null
          payment_date?: string
          payment_mode?: string
          receipt_number?: string | null
          reference_number?: string | null
          retailer_id?: string
          sales_credit_user_id?: string | null
          status?: string
          unallocated_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_payments_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_payments_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_price_books: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          deactivated_at: string | null
          distributor_id: string
          id: string
          is_active: boolean | null
          price_book_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          deactivated_at?: string | null
          distributor_id: string
          id?: string
          is_active?: boolean | null
          price_book_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          deactivated_at?: string | null
          distributor_id?: string
          id?: string
          is_active?: boolean | null
          price_book_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_price_books_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_price_books_price_book_id_fkey"
            columns: ["price_book_id"]
            isOneToOne: false
            referencedRelation: "price_books"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_retailer_credit_limits: {
        Row: {
          created_at: string
          credit_days: number
          credit_limit: number
          distributor_id: string
          id: string
          is_active: boolean
          retailer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_days?: number
          credit_limit?: number
          distributor_id: string
          id?: string
          is_active?: boolean
          retailer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_days?: number
          credit_limit?: number
          distributor_id?: string
          id?: string
          is_active?: boolean
          retailer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_retailer_credit_limits_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_retailer_credit_limits_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_retailer_feedback: {
        Row: {
          comments: string | null
          created_at: string
          created_by: string | null
          delivery_rating: number | null
          distributor_id: string
          feedback_type: string
          follow_up_completed: boolean
          follow_up_notes: string | null
          follow_up_required: boolean
          id: string
          product_quality_rating: number | null
          rating: number
          retailer_id: string
          service_rating: number | null
          updated_at: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          created_by?: string | null
          delivery_rating?: number | null
          distributor_id: string
          feedback_type?: string
          follow_up_completed?: boolean
          follow_up_notes?: string | null
          follow_up_required?: boolean
          id?: string
          product_quality_rating?: number | null
          rating?: number
          retailer_id: string
          service_rating?: number | null
          updated_at?: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          created_by?: string | null
          delivery_rating?: number | null
          distributor_id?: string
          feedback_type?: string
          follow_up_completed?: boolean
          follow_up_notes?: string | null
          follow_up_required?: boolean
          id?: string
          product_quality_rating?: number | null
          rating?: number
          retailer_id?: string
          service_rating?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_retailer_feedback_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_retailer_feedback_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_retailer_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          credit_amount: number
          debit_amount: number
          description: string | null
          distributor_id: string
          id: string
          notes: string | null
          payment_mode: string | null
          reference_id: string | null
          reference_number: string | null
          retailer_id: string
          running_balance: number | null
          transaction_date: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit_amount?: number
          debit_amount?: number
          description?: string | null
          distributor_id: string
          id?: string
          notes?: string | null
          payment_mode?: string | null
          reference_id?: string | null
          reference_number?: string | null
          retailer_id: string
          running_balance?: number | null
          transaction_date?: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit_amount?: number
          debit_amount?: number
          description?: string | null
          distributor_id?: string
          id?: string
          notes?: string | null
          payment_mode?: string | null
          reference_id?: string | null
          reference_number?: string | null
          retailer_id?: string
          running_balance?: number | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_retailer_ledger_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_retailer_ledger_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_retailer_mappings: {
        Row: {
          created_at: string
          distributor_id: string
          id: string
          mapping_type: string
          retailer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          distributor_id: string
          id?: string
          mapping_type?: string
          retailer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          distributor_id?: string
          id?: string
          mapping_type?: string
          retailer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      distributor_return_items: {
        Row: {
          added_to_stock: boolean | null
          batch_number: string | null
          condition: string
          created_at: string
          id: string
          notes: string | null
          product_id: string
          product_name: string
          quantity: number
          reason: string
          return_id: string
          total: number | null
          unit: string | null
          unit_price: number | null
          variant_id: string | null
        }
        Insert: {
          added_to_stock?: boolean | null
          batch_number?: string | null
          condition?: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          product_name: string
          quantity: number
          reason: string
          return_id: string
          total?: number | null
          unit?: string | null
          unit_price?: number | null
          variant_id?: string | null
        }
        Update: {
          added_to_stock?: boolean | null
          batch_number?: string | null
          condition?: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          product_name?: string
          quantity?: number
          reason?: string
          return_id?: string
          total?: number | null
          unit?: string | null
          unit_price?: number | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distributor_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "distributor_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_returns: {
        Row: {
          created_at: string
          created_by: string | null
          distributor_id: string
          id: string
          notes: string | null
          order_id: string | null
          order_number: string | null
          retailer_id: string
          return_date: string
          return_number: string
          status: string
          total_quantity: number | null
          total_value: number | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          distributor_id: string
          id?: string
          notes?: string | null
          order_id?: string | null
          order_number?: string | null
          retailer_id: string
          return_date?: string
          return_number: string
          status?: string
          total_quantity?: number | null
          total_value?: number | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          distributor_id?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          order_number?: string | null
          retailer_id?: string
          return_date?: string
          return_number?: string
          status?: string
          total_quantity?: number | null
          total_value?: number | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distributor_returns_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_returns_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_secondary_invoice_items: {
        Row: {
          cgst_amount: number
          created_at: string
          hsn_code: string | null
          id: string
          invoice_id: string
          product_name: string
          quantity: number
          rate: number
          sgst_amount: number
          taxable_amount: number
          total_amount: number
          unit: string
        }
        Insert: {
          cgst_amount?: number
          created_at?: string
          hsn_code?: string | null
          id?: string
          invoice_id: string
          product_name: string
          quantity?: number
          rate?: number
          sgst_amount?: number
          taxable_amount?: number
          total_amount?: number
          unit?: string
        }
        Update: {
          cgst_amount?: number
          created_at?: string
          hsn_code?: string | null
          id?: string
          invoice_id?: string
          product_name?: string
          quantity?: number
          rate?: number
          sgst_amount?: number
          taxable_amount?: number
          total_amount?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_secondary_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "distributor_secondary_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_secondary_invoices: {
        Row: {
          amount_paid: number
          balance_due: number
          cgst_amount: number
          created_at: string
          distributor_id: string
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          operational_snapshot_user_id: string | null
          order_id: string | null
          owner_snapshot_user_id: string | null
          payment_status: string
          pdf_url: string | null
          retailer_id: string
          sgst_amount: number
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          cgst_amount?: number
          created_at?: string
          distributor_id: string
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          operational_snapshot_user_id?: string | null
          order_id?: string | null
          owner_snapshot_user_id?: string | null
          payment_status?: string
          pdf_url?: string | null
          retailer_id: string
          sgst_amount?: number
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          cgst_amount?: number
          created_at?: string
          distributor_id?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          operational_snapshot_user_id?: string | null
          order_id?: string | null
          owner_snapshot_user_id?: string | null
          payment_status?: string
          pdf_url?: string | null
          retailer_id?: string
          sgst_amount?: number
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_secondary_invoices_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_secondary_invoices_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_support_requests: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          attachment_urls: string[] | null
          category: string
          created_at: string
          created_by_user_id: string | null
          description: string
          distributor_id: string
          feedback_comment: string | null
          id: string
          priority: string
          reference_id: string | null
          reference_number: string | null
          reference_type: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          satisfaction_rating: number | null
          screenshot_urls: string[] | null
          status: string
          subject: string
          ticket_number: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          attachment_urls?: string[] | null
          category: string
          created_at?: string
          created_by_user_id?: string | null
          description: string
          distributor_id: string
          feedback_comment?: string | null
          id?: string
          priority?: string
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          satisfaction_rating?: number | null
          screenshot_urls?: string[] | null
          status?: string
          subject: string
          ticket_number: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          attachment_urls?: string[] | null
          category?: string
          created_at?: string
          created_by_user_id?: string | null
          description?: string
          distributor_id?: string
          feedback_comment?: string | null
          id?: string
          priority?: string
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          satisfaction_rating?: number | null
          screenshot_urls?: string[] | null
          status?: string
          subject?: string
          ticket_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_support_requests_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_types: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          legacy_mapping: string | null
          level: number
          name: string
          parent_allowed: boolean
          parent_type_code: string | null
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          legacy_mapping?: string | null
          level?: number
          name: string
          parent_allowed?: boolean
          parent_type_code?: string | null
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          legacy_mapping?: string | null
          level?: number
          name?: string
          parent_allowed?: boolean
          parent_type_code?: string | null
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      distributor_users: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auth_user_id: string | null
          created_at: string
          designation: string | null
          distributor_id: string
          email: string
          email_sent_at: string | null
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          password_set_at: string | null
          phone: string | null
          requested_at: string | null
          role: string
          updated_at: string
          user_level: string | null
          user_status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auth_user_id?: string | null
          created_at?: string
          designation?: string | null
          distributor_id: string
          email: string
          email_sent_at?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          password_set_at?: string | null
          phone?: string | null
          requested_at?: string | null
          role?: string
          updated_at?: string
          user_level?: string | null
          user_status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auth_user_id?: string | null
          created_at?: string
          designation?: string | null
          distributor_id?: string
          email?: string
          email_sent_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          password_set_at?: string | null
          phone?: string | null
          requested_at?: string | null
          role?: string
          updated_at?: string
          user_level?: string | null
          user_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_users_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      distributors: {
        Row: {
          about_business: string | null
          account_holder_name: string | null
          address: string | null
          annual_revenue: number | null
          assets_trucks: number | null
          assets_vans: number | null
          bank_account: string | null
          bank_name: string | null
          business_hunger: string | null
          competition_products: string[] | null
          contact_person: string
          coverage_area: string | null
          created_at: string
          credit_limit: number | null
          currency: string
          date_format: string
          distribution_experience_years: number | null
          distribution_level: string | null
          distributor_status: string | null
          drop_reason: string | null
          email: string | null
          established_year: number | null
          evaluation_checklist: Json | null
          gst_number: string | null
          id: string
          ifsc: string | null
          logo_url: string | null
          name: string
          network_retailers_count: number | null
          onboarding_date: string | null
          opportunities: string | null
          other_products: string[] | null
          outstanding_amount: number | null
          owner_id: string | null
          owner_name: string | null
          parent_id: string | null
          parent_type: string | null
          partnership_status: string | null
          phone: string
          products_distributed: string[] | null
          profitability: string | null
          qr_code_url: string | null
          qr_upi: string | null
          region_coverage: string | null
          sales_team_size: number | null
          state: string | null
          status: string
          strength: string | null
          terms_conditions: string | null
          territory_id: string | null
          threats: string | null
          timezone: string
          type_id: string | null
          updated_at: string
          weakness: string | null
          years_of_relationship: number | null
        }
        Insert: {
          about_business?: string | null
          account_holder_name?: string | null
          address?: string | null
          annual_revenue?: number | null
          assets_trucks?: number | null
          assets_vans?: number | null
          bank_account?: string | null
          bank_name?: string | null
          business_hunger?: string | null
          competition_products?: string[] | null
          contact_person: string
          coverage_area?: string | null
          created_at?: string
          credit_limit?: number | null
          currency?: string
          date_format?: string
          distribution_experience_years?: number | null
          distribution_level?: string | null
          distributor_status?: string | null
          drop_reason?: string | null
          email?: string | null
          established_year?: number | null
          evaluation_checklist?: Json | null
          gst_number?: string | null
          id?: string
          ifsc?: string | null
          logo_url?: string | null
          name: string
          network_retailers_count?: number | null
          onboarding_date?: string | null
          opportunities?: string | null
          other_products?: string[] | null
          outstanding_amount?: number | null
          owner_id?: string | null
          owner_name?: string | null
          parent_id?: string | null
          parent_type?: string | null
          partnership_status?: string | null
          phone: string
          products_distributed?: string[] | null
          profitability?: string | null
          qr_code_url?: string | null
          qr_upi?: string | null
          region_coverage?: string | null
          sales_team_size?: number | null
          state?: string | null
          status?: string
          strength?: string | null
          terms_conditions?: string | null
          territory_id?: string | null
          threats?: string | null
          timezone?: string
          type_id?: string | null
          updated_at?: string
          weakness?: string | null
          years_of_relationship?: number | null
        }
        Update: {
          about_business?: string | null
          account_holder_name?: string | null
          address?: string | null
          annual_revenue?: number | null
          assets_trucks?: number | null
          assets_vans?: number | null
          bank_account?: string | null
          bank_name?: string | null
          business_hunger?: string | null
          competition_products?: string[] | null
          contact_person?: string
          coverage_area?: string | null
          created_at?: string
          credit_limit?: number | null
          currency?: string
          date_format?: string
          distribution_experience_years?: number | null
          distribution_level?: string | null
          distributor_status?: string | null
          drop_reason?: string | null
          email?: string | null
          established_year?: number | null
          evaluation_checklist?: Json | null
          gst_number?: string | null
          id?: string
          ifsc?: string | null
          logo_url?: string | null
          name?: string
          network_retailers_count?: number | null
          onboarding_date?: string | null
          opportunities?: string | null
          other_products?: string[] | null
          outstanding_amount?: number | null
          owner_id?: string | null
          owner_name?: string | null
          parent_id?: string | null
          parent_type?: string | null
          partnership_status?: string | null
          phone?: string
          products_distributed?: string[] | null
          profitability?: string | null
          qr_code_url?: string | null
          qr_upi?: string | null
          region_coverage?: string | null
          sales_team_size?: number | null
          state?: string | null
          status?: string
          strength?: string | null
          terms_conditions?: string | null
          territory_id?: string | null
          threats?: string | null
          timezone?: string
          type_id?: string | null
          updated_at?: string
          weakness?: string | null
          years_of_relationship?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "distributors_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributors_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributors_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "distributor_types"
            referencedColumns: ["id"]
          },
        ]
      }
      district_intelligence_cache: {
        Row: {
          ai_summary: string
          bbox: Json | null
          counts: Json
          created_at: string
          district: string
          expires_at: string
          id: string
          state: string
        }
        Insert: {
          ai_summary: string
          bbox?: Json | null
          counts: Json
          created_at?: string
          district: string
          expires_at?: string
          id?: string
          state: string
        }
        Update: {
          ai_summary?: string
          bbox?: Json | null
          counts?: Json
          created_at?: string
          district?: string
          expires_at?: string
          id?: string
          state?: string
        }
        Relationships: []
      }
      education_history: {
        Row: {
          activities: string | null
          created_at: string | null
          degree: string | null
          field_of_study: string | null
          from_date: string | null
          grade: string | null
          id: string
          institution_name: string
          to_date: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activities?: string | null
          created_at?: string | null
          degree?: string | null
          field_of_study?: string | null
          from_date?: string | null
          grade?: string | null
          id?: string
          institution_name: string
          to_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activities?: string | null
          created_at?: string | null
          degree?: string | null
          field_of_study?: string | null
          from_date?: string | null
          grade?: string | null
          id?: string
          institution_name?: string
          to_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      emergency_contacts: {
        Row: {
          address: string | null
          alternate_phone: string | null
          contact_name: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          phone: string | null
          relationship: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          alternate_phone?: string | null
          contact_name: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          phone?: string | null
          relationship?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          alternate_phone?: string | null
          contact_name?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          phone?: string | null
          relationship?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      employee_badges: {
        Row: {
          badge_description: string | null
          badge_icon: string | null
          badge_name: string
          badge_type: string
          created_at: string
          id: string
          issued_at: string
          issued_by: string | null
          user_id: string
        }
        Insert: {
          badge_description?: string | null
          badge_icon?: string | null
          badge_name: string
          badge_type: string
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          user_id: string
        }
        Update: {
          badge_description?: string | null
          badge_icon?: string | null
          badge_name?: string
          badge_type?: string
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      employee_competencies: {
        Row: {
          assessed_at: string | null
          assessed_by: string | null
          competency_id: string
          created_at: string
          current_level: string
          id: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assessed_at?: string | null
          assessed_by?: string | null
          competency_id: string
          created_at?: string
          current_level: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assessed_at?: string | null
          assessed_by?: string | null
          competency_id?: string
          created_at?: string
          current_level?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_competencies_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_connections: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      employee_documents: {
        Row: {
          content_type: string | null
          created_at: string
          doc_type: Database["public"]["Enums"]["employee_doc_type"]
          file_name: string | null
          file_path: string
          id: string
          uploaded_by: string
          user_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          doc_type: Database["public"]["Enums"]["employee_doc_type"]
          file_name?: string | null
          file_path: string
          id?: string
          uploaded_by: string
          user_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          doc_type?: Database["public"]["Enums"]["employee_doc_type"]
          file_name?: string | null
          file_path?: string
          id?: string
          uploaded_by?: string
          user_id?: string
        }
        Relationships: []
      }
      employee_recommendations: {
        Row: {
          created_at: string
          id: string
          recommendation_text: string
          recommender_id: string
          relationship: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          recommendation_text: string
          recommender_id: string
          relationship?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          recommendation_text?: string
          recommender_id?: string
          relationship?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          aadhar_document_url: string | null
          address: string | null
          alternate_email: string | null
          band: number | null
          certifications: Json | null
          created_at: string
          daily_da_allowance: number | null
          date_of_exit: string | null
          date_of_joining: string | null
          district_territory_id: string | null
          education: string | null
          education_background: Json | null
          emergency_contact_number: string | null
          expertise_areas: string[] | null
          hq: string | null
          hq_territory_id: string | null
          manager_id: string | null
          monthly_salary: number | null
          pan_document_url: string | null
          photo_url: string | null
          secondary_manager_id: string | null
          state_territory_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aadhar_document_url?: string | null
          address?: string | null
          alternate_email?: string | null
          band?: number | null
          certifications?: Json | null
          created_at?: string
          daily_da_allowance?: number | null
          date_of_exit?: string | null
          date_of_joining?: string | null
          district_territory_id?: string | null
          education?: string | null
          education_background?: Json | null
          emergency_contact_number?: string | null
          expertise_areas?: string[] | null
          hq?: string | null
          hq_territory_id?: string | null
          manager_id?: string | null
          monthly_salary?: number | null
          pan_document_url?: string | null
          photo_url?: string | null
          secondary_manager_id?: string | null
          state_territory_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aadhar_document_url?: string | null
          address?: string | null
          alternate_email?: string | null
          band?: number | null
          certifications?: Json | null
          created_at?: string
          daily_da_allowance?: number | null
          date_of_exit?: string | null
          date_of_joining?: string | null
          district_territory_id?: string | null
          education?: string | null
          education_background?: Json | null
          emergency_contact_number?: string | null
          expertise_areas?: string[] | null
          hq?: string | null
          hq_territory_id?: string | null
          manager_id?: string | null
          monthly_salary?: number | null
          pan_document_url?: string | null
          photo_url?: string | null
          secondary_manager_id?: string | null
          state_territory_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_district_territory_id_fkey"
            columns: ["district_territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_hq_territory_id_fkey"
            columns: ["hq_territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_state_territory_id_fkey"
            columns: ["state_territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      enabled_units: {
        Row: {
          display_order: number
          enabled: boolean
          is_default: boolean
          is_default_purchase: boolean
          is_default_sales: boolean
          uom_id: string
          updated_at: string
        }
        Insert: {
          display_order?: number
          enabled?: boolean
          is_default?: boolean
          is_default_purchase?: boolean
          is_default_sales?: boolean
          uom_id: string
          updated_at?: string
        }
        Update: {
          display_order?: number
          enabled?: boolean
          is_default?: boolean
          is_default_purchase?: boolean
          is_default_sales?: boolean
          uom_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enabled_units_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: true
            referencedRelation: "uom_master"
            referencedColumns: ["id"]
          },
        ]
      }
      event_stock_audit: {
        Row: {
          created_at: string
          delta_qty: number
          event_id: string
          event_stock_day_id: string
          event_stock_item_id: string
          id: string
          new_sold_qty: number
          note: string | null
          order_id: string | null
          order_item_id: string | null
          prev_sold_qty: number
          product_id: string
          source: string
          user_id: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          delta_qty: number
          event_id: string
          event_stock_day_id: string
          event_stock_item_id: string
          id?: string
          new_sold_qty: number
          note?: string | null
          order_id?: string | null
          order_item_id?: string | null
          prev_sold_qty: number
          product_id: string
          source?: string
          user_id: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          delta_qty?: number
          event_id?: string
          event_stock_day_id?: string
          event_stock_item_id?: string
          id?: string
          new_sold_qty?: number
          note?: string | null
          order_id?: string | null
          order_item_id?: string | null
          prev_sold_qty?: number
          product_id?: string
          source?: string
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_stock_audit_event_stock_item_id_fkey"
            columns: ["event_stock_item_id"]
            isOneToOne: false
            referencedRelation: "event_stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      event_stock_days: {
        Row: {
          created_at: string
          date: string
          day_number: number
          event_id: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          day_number: number
          event_id: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          day_number?: number
          event_id?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_stock_days_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_stock_items: {
        Row: {
          created_at: string
          event_stock_day_id: string
          id: string
          price: number
          product_id: string
          sold_qty: number
          stock_taken: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_stock_day_id: string
          id?: string
          price?: number
          product_id: string
          sold_qty?: number
          stock_taken?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_stock_day_id?: string
          id?: string
          price?: number
          product_id?: string
          sold_qty?: number
          stock_taken?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_stock_items_event_stock_day_id_fkey"
            columns: ["event_stock_day_id"]
            isOneToOne: false
            referencedRelation: "event_stock_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_stock_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      event_team_members: {
        Row: {
          event_id: string
          id: string
          individual_target: number | null
          joined_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          individual_target?: number | null
          joined_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          individual_target?: number | null
          joined_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_team_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_approval_rules: {
        Row: {
          condition_type: string
          condition_value: Json
          created_at: string
          id: string
          is_active: boolean
          priority: number
          rule_name: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          condition_type: string
          condition_value?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: number
          rule_name: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          condition_type?: string
          condition_value?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: number
          rule_name?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_approval_rules_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          limit_amount: number | null
          name: string
          receipt_required: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          limit_amount?: number | null
          name: string
          receipt_required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          limit_amount?: number | null
          name?: string
          receipt_required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      expense_group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "expense_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_groups: {
        Row: {
          created_at: string
          da_amount: number | null
          description: string | null
          fixed_ta_amount: number | null
          id: string
          name: string
          ta_per_km_rate: number | null
          ta_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          da_amount?: number | null
          description?: string | null
          fixed_ta_amount?: number | null
          id?: string
          name: string
          ta_per_km_rate?: number | null
          ta_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          da_amount?: number | null
          description?: string | null
          fixed_ta_amount?: number | null
          id?: string
          name?: string
          ta_per_km_rate?: number | null
          ta_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      expense_master_config: {
        Row: {
          allowed_categories: string[] | null
          created_at: string
          da_amount: number | null
          da_calculation_basis: string | null
          expense_policy_notes: string | null
          fixed_ta_amount: number | null
          id: string
          max_additional_expense_per_day: number | null
          max_additional_expense_per_month: number | null
          require_bill_above_amount: number | null
          ta_per_km_rate: number | null
          ta_type: string
          updated_at: string
        }
        Insert: {
          allowed_categories?: string[] | null
          created_at?: string
          da_amount?: number | null
          da_calculation_basis?: string | null
          expense_policy_notes?: string | null
          fixed_ta_amount?: number | null
          id?: string
          max_additional_expense_per_day?: number | null
          max_additional_expense_per_month?: number | null
          require_bill_above_amount?: number | null
          ta_per_km_rate?: number | null
          ta_type?: string
          updated_at?: string
        }
        Update: {
          allowed_categories?: string[] | null
          created_at?: string
          da_amount?: number | null
          da_calculation_basis?: string | null
          expense_policy_notes?: string | null
          fixed_ta_amount?: number | null
          id?: string
          max_additional_expense_per_day?: number | null
          max_additional_expense_per_month?: number | null
          require_bill_above_amount?: number | null
          ta_per_km_rate?: number | null
          ta_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      external_retailer_list_items: {
        Row: {
          created_at: string
          external_retailer_id: number
          id: string
          list_id: string
          pincode: string | null
        }
        Insert: {
          created_at?: string
          external_retailer_id: number
          id?: string
          list_id: string
          pincode?: string | null
        }
        Update: {
          created_at?: string
          external_retailer_id?: number
          id?: string
          list_id?: string
          pincode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_retailer_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "external_retailer_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      external_retailer_lists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      failed_sync_log: {
        Row: {
          device_id: string | null
          error: string | null
          first_failed_at: string
          id: string
          idempotency_key: string
          last_failed_at: string
          payload: Json
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number
          user_id: string | null
        }
        Insert: {
          device_id?: string | null
          error?: string | null
          first_failed_at?: string
          id?: string
          idempotency_key: string
          last_failed_at?: string
          payload: Json
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          user_id?: string | null
        }
        Update: {
          device_id?: string | null
          error?: string | null
          first_failed_at?: string
          id?: string
          idempotency_key?: string
          last_failed_at?: string
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      feature_flag_audit: {
        Row: {
          changed_at: string
          changed_by: string
          feature_flag_id: string
          id: string
          new_value: boolean
          old_value: boolean
        }
        Insert: {
          changed_at?: string
          changed_by: string
          feature_flag_id: string
          id?: string
          new_value: boolean
          old_value: boolean
        }
        Update: {
          changed_at?: string
          changed_by?: string
          feature_flag_id?: string
          id?: string
          new_value?: boolean
          old_value?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_audit_feature_flag_id_fkey"
            columns: ["feature_flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          category: string
          created_at: string
          description: string | null
          feature_key: string
          feature_name: string
          id: string
          is_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          feature_key: string
          feature_name: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          feature_key?: string
          feature_name?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      feedback_policies: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          module: string
          name: string
          priority: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          module?: string
          name: string
          priority?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          module?: string
          name?: string
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      feedback_policy_rules: {
        Row: {
          action_type: string
          condition_operator: string
          condition_type: string
          condition_value: string
          created_at: string
          id: string
          is_active: boolean
          policy_id: string
          question_set_module: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          action_type?: string
          condition_operator?: string
          condition_type: string
          condition_value?: string
          created_at?: string
          id?: string
          is_active?: boolean
          policy_id: string
          question_set_module?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          action_type?: string
          condition_operator?: string
          condition_type?: string
          condition_value?: string
          created_at?: string
          id?: string
          is_active?: boolean
          policy_id?: string
          question_set_module?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_policy_rules_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "feedback_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_questions: {
        Row: {
          applies_to: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_required: boolean
          module: string
          options: Json | null
          question_text: string
          question_type: string
          retailer_ids: string[] | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          applies_to?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          module?: string
          options?: Json | null
          question_text: string
          question_type?: string
          retailer_ids?: string[] | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          applies_to?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          module?: string
          options?: Json | null
          question_text?: string
          question_type?: string
          retailer_ids?: string[] | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      fy_period_targets: {
        Row: {
          created_at: string | null
          fy_config_id: string
          id: string
          period_name: string
          period_number: number
          period_type: string
          quantity_target: number | null
          revenue_target: number | null
          updated_at: string | null
          visits_target: number | null
        }
        Insert: {
          created_at?: string | null
          fy_config_id: string
          id?: string
          period_name: string
          period_number: number
          period_type: string
          quantity_target?: number | null
          revenue_target?: number | null
          updated_at?: string | null
          visits_target?: number | null
        }
        Update: {
          created_at?: string | null
          fy_config_id?: string
          id?: string
          period_name?: string
          period_number?: number
          period_type?: string
          quantity_target?: number | null
          revenue_target?: number | null
          updated_at?: string | null
          visits_target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fy_period_targets_fy_config_id_fkey"
            columns: ["fy_config_id"]
            isOneToOne: false
            referencedRelation: "fy_target_config"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_target_config: {
        Row: {
          created_at: string | null
          created_by: string | null
          enable_quantity: boolean | null
          enable_retailer_activation: boolean
          enable_revenue: boolean | null
          enable_visits: boolean | null
          enabled_parameters: Json | null
          fy_year: number
          id: string
          is_locked: boolean | null
          plan_status: string
          quantity_unit: string | null
          setup_completed: boolean | null
          target_end_month: number
          target_period_type: string | null
          target_plan_name: string | null
          target_start_month: number
          total_quantity_target: number | null
          total_retailer_activation_target: number | null
          total_revenue_target: number | null
          total_visits_target: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          enable_quantity?: boolean | null
          enable_retailer_activation?: boolean
          enable_revenue?: boolean | null
          enable_visits?: boolean | null
          enabled_parameters?: Json | null
          fy_year: number
          id?: string
          is_locked?: boolean | null
          plan_status?: string
          quantity_unit?: string | null
          setup_completed?: boolean | null
          target_end_month?: number
          target_period_type?: string | null
          target_plan_name?: string | null
          target_start_month?: number
          total_quantity_target?: number | null
          total_retailer_activation_target?: number | null
          total_revenue_target?: number | null
          total_visits_target?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          enable_quantity?: boolean | null
          enable_retailer_activation?: boolean
          enable_revenue?: boolean | null
          enable_visits?: boolean | null
          enabled_parameters?: Json | null
          fy_year?: number
          id?: string
          is_locked?: boolean | null
          plan_status?: string
          quantity_unit?: string | null
          setup_completed?: boolean | null
          target_end_month?: number
          target_period_type?: string | null
          target_plan_name?: string | null
          target_start_month?: number
          total_quantity_target?: number | null
          total_retailer_activation_target?: number | null
          total_revenue_target?: number | null
          total_visits_target?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      gamification_actions: {
        Row: {
          action_name: string
          action_type: string
          base_daily_target: number | null
          consecutive_orders_required: number | null
          created_at: string
          focused_products: string[] | null
          game_id: string
          id: string
          is_enabled: boolean | null
          max_awardable_activities: number | null
          max_daily_awards: number | null
          metadata: Json | null
          min_growth_percentage: number | null
          points: number
          target_type: string | null
          updated_at: string
        }
        Insert: {
          action_name: string
          action_type: string
          base_daily_target?: number | null
          consecutive_orders_required?: number | null
          created_at?: string
          focused_products?: string[] | null
          game_id: string
          id?: string
          is_enabled?: boolean | null
          max_awardable_activities?: number | null
          max_daily_awards?: number | null
          metadata?: Json | null
          min_growth_percentage?: number | null
          points?: number
          target_type?: string | null
          updated_at?: string
        }
        Update: {
          action_name?: string
          action_type?: string
          base_daily_target?: number | null
          consecutive_orders_required?: number | null
          created_at?: string
          focused_products?: string[] | null
          game_id?: string
          id?: string
          is_enabled?: boolean | null
          max_awardable_activities?: number | null
          max_daily_awards?: number | null
          metadata?: Json | null
          min_growth_percentage?: number | null
          points?: number
          target_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamification_actions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "gamification_games"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_daily_tracking: {
        Row: {
          action_id: string
          count: number | null
          created_at: string | null
          id: string
          tracking_date: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_id: string
          count?: number | null
          created_at?: string | null
          id?: string
          tracking_date: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_id?: string
          count?: number | null
          created_at?: string | null
          id?: string
          tracking_date?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamification_daily_tracking_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "gamification_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_games: {
        Row: {
          baseline_target: number | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string
          id: string
          is_active: boolean | null
          is_all_territories: boolean | null
          name: string
          points_to_rupee_conversion: number
          start_date: string
          territories: string[] | null
          updated_at: string
        }
        Insert: {
          baseline_target?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          is_all_territories?: boolean | null
          name: string
          points_to_rupee_conversion?: number
          start_date: string
          territories?: string[] | null
          updated_at?: string
        }
        Update: {
          baseline_target?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          is_all_territories?: boolean | null
          name?: string
          points_to_rupee_conversion?: number
          start_date?: string
          territories?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      gamification_points: {
        Row: {
          action_id: string
          earned_at: string
          game_id: string | null
          id: string
          metadata: Json | null
          points: number
          reference_id: string | null
          reference_type: string | null
          user_id: string | null
        }
        Insert: {
          action_id: string
          earned_at?: string
          game_id?: string | null
          id?: string
          metadata?: Json | null
          points: number
          reference_id?: string | null
          reference_type?: string | null
          user_id?: string | null
        }
        Update: {
          action_id?: string
          earned_at?: string
          game_id?: string | null
          id?: string
          metadata?: Json | null
          points?: number
          reference_id?: string | null
          reference_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gamification_points_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "gamification_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamification_points_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "gamification_games"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_redemptions: {
        Row: {
          created_at: string
          game_id: string | null
          id: string
          points_redeemed: number
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          requested_at: string
          status: string
          updated_at: string
          user_id: string
          voucher_amount: number
          voucher_code: string | null
        }
        Insert: {
          created_at?: string
          game_id?: string | null
          id?: string
          points_redeemed: number
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id: string
          voucher_amount: number
          voucher_code?: string | null
        }
        Update: {
          created_at?: string
          game_id?: string | null
          id?: string
          points_redeemed?: number
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string
          voucher_amount?: number
          voucher_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gamification_redemptions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "gamification_games"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_retailer_sequences: {
        Row: {
          consecutive_orders: number | null
          created_at: string | null
          id: string
          last_order_date: string | null
          retailer_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          consecutive_orders?: number | null
          created_at?: string | null
          id?: string
          last_order_date?: string | null
          retailer_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          consecutive_orders?: number | null
          created_at?: string | null
          id?: string
          last_order_date?: string | null
          retailer_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      geocoding_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          failed_count: number
          geocoded_count: number
          id: string
          processed_records: number
          status: string
          total_records: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          failed_count?: number
          geocoded_count?: number
          id?: string
          processed_records?: number
          status?: string
          total_records?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          failed_count?: number
          geocoded_count?: number
          id?: string
          processed_records?: number
          status?: string
          total_records?: number
          updated_at?: string
        }
        Relationships: []
      }
      global_leave_policy: {
        Row: {
          allow_backdated_leave: boolean
          allow_negative_balance: boolean
          carry_forward_expiry_months: number | null
          created_at: string
          custom_reset_date: string | null
          enable_carry_forward: boolean
          enable_half_day: boolean
          enable_sandwich_rule: boolean
          id: string
          is_enabled: boolean
          max_backdate_days: number
          max_carry_forward_limit: number
          max_continuous_leave_days: number | null
          max_negative_limit: number
          min_notice_period_days: number
          reset_cycle: string
          updated_at: string
        }
        Insert: {
          allow_backdated_leave?: boolean
          allow_negative_balance?: boolean
          carry_forward_expiry_months?: number | null
          created_at?: string
          custom_reset_date?: string | null
          enable_carry_forward?: boolean
          enable_half_day?: boolean
          enable_sandwich_rule?: boolean
          id?: string
          is_enabled?: boolean
          max_backdate_days?: number
          max_carry_forward_limit?: number
          max_continuous_leave_days?: number | null
          max_negative_limit?: number
          min_notice_period_days?: number
          reset_cycle?: string
          updated_at?: string
        }
        Update: {
          allow_backdated_leave?: boolean
          allow_negative_balance?: boolean
          carry_forward_expiry_months?: number | null
          created_at?: string
          custom_reset_date?: string | null
          enable_carry_forward?: boolean
          enable_half_day?: boolean
          enable_sandwich_rule?: boolean
          id?: string
          is_enabled?: boolean
          max_backdate_days?: number
          max_carry_forward_limit?: number
          max_continuous_leave_days?: number | null
          max_negative_limit?: number
          min_notice_period_days?: number
          reset_cycle?: string
          updated_at?: string
        }
        Relationships: []
      }
      goods_receipt_notes: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          distributor_id: string
          grn_number: string
          id: string
          notes: string | null
          order_id: string
          receipt_type: string
          received_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          distributor_id: string
          grn_number: string
          id?: string
          notes?: string | null
          order_id: string
          receipt_type?: string
          received_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          distributor_id?: string
          grn_number?: string
          id?: string
          notes?: string | null
          order_id?: string
          receipt_type?: string
          received_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_notes_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "primary_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_tracking: {
        Row: {
          accuracy: number | null
          created_at: string
          date: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          speed: number | null
          timestamp: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          date?: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          speed?: number | null
          timestamp?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          date?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          speed?: number | null
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      gps_tracking_stops: {
        Row: {
          created_at: string
          date: string
          id: string
          reason: string
          stopped_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          reason: string
          stopped_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          reason?: string
          stopped_at?: string
          user_id?: string
        }
        Relationships: []
      }
      grn_items: {
        Row: {
          batch_number: string | null
          conversion_to_base: number | null
          created_at: string | null
          damaged_quantity: number
          expiry_date: string | null
          grn_id: string
          id: string
          order_item_id: string
          ordered_quantity: number
          product_id: string
          product_name: string
          received_base_qty: number | null
          received_quantity: number
          return_reason: string | null
          returned_base_qty: number | null
          returned_quantity: number
          unit: string
          unit_price: number
          uom_code: string | null
          uom_id: string | null
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          batch_number?: string | null
          conversion_to_base?: number | null
          created_at?: string | null
          damaged_quantity?: number
          expiry_date?: string | null
          grn_id: string
          id?: string
          order_item_id: string
          ordered_quantity?: number
          product_id: string
          product_name: string
          received_base_qty?: number | null
          received_quantity?: number
          return_reason?: string | null
          returned_base_qty?: number | null
          returned_quantity?: number
          unit?: string
          unit_price?: number
          uom_code?: string | null
          uom_id?: string | null
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          batch_number?: string | null
          conversion_to_base?: number | null
          created_at?: string | null
          damaged_quantity?: number
          expiry_date?: string | null
          grn_id?: string
          id?: string
          order_item_id?: string
          ordered_quantity?: number
          product_id?: string
          product_name?: string
          received_base_qty?: number | null
          received_quantity?: number
          return_reason?: string | null
          returned_base_qty?: number | null
          returned_quantity?: number
          unit?: string
          unit_price?: number
          uom_code?: string | null
          uom_id?: string | null
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "primary_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["id"]
          },
        ]
      }
      hierarchy_target_allocations: {
        Row: {
          allocation_method: string | null
          allocation_percentage: number
          created_at: string | null
          effective_from: string
          effective_to: string | null
          hierarchy_target_id: string
          id: string
          is_synced_to_my_target: boolean | null
          level: number
          manager_id: string | null
          notes: string | null
          quantity_target: number
          revenue_target: number
          synced_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allocation_method?: string | null
          allocation_percentage?: number
          created_at?: string | null
          effective_from?: string
          effective_to?: string | null
          hierarchy_target_id: string
          id?: string
          is_synced_to_my_target?: boolean | null
          level?: number
          manager_id?: string | null
          notes?: string | null
          quantity_target?: number
          revenue_target?: number
          synced_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allocation_method?: string | null
          allocation_percentage?: number
          created_at?: string | null
          effective_from?: string
          effective_to?: string | null
          hierarchy_target_id?: string
          id?: string
          is_synced_to_my_target?: boolean | null
          level?: number
          manager_id?: string | null
          notes?: string | null
          quantity_target?: number
          revenue_target?: number
          synced_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hierarchy_target_allocations_hierarchy_target_id_fkey"
            columns: ["hierarchy_target_id"]
            isOneToOne: false
            referencedRelation: "hierarchy_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_target_allocations_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_target_allocations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hierarchy_target_history: {
        Row: {
          affected_users: string[] | null
          change_type: string
          changed_by: string | null
          created_at: string | null
          hierarchy_target_id: string | null
          id: string
          new_target: Json | null
          previous_target: Json | null
          reason: string | null
          user_id: string | null
        }
        Insert: {
          affected_users?: string[] | null
          change_type: string
          changed_by?: string | null
          created_at?: string | null
          hierarchy_target_id?: string | null
          id?: string
          new_target?: Json | null
          previous_target?: Json | null
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          affected_users?: string[] | null
          change_type?: string
          changed_by?: string | null
          created_at?: string | null
          hierarchy_target_id?: string | null
          id?: string
          new_target?: Json | null
          previous_target?: Json | null
          reason?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hierarchy_target_history_hierarchy_target_id_fkey"
            columns: ["hierarchy_target_id"]
            isOneToOne: false
            referencedRelation: "hierarchy_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_target_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hierarchy_targets: {
        Row: {
          allocation_method: string
          created_at: string | null
          created_by: string | null
          fy_year: number
          id: string
          quantity_unit: string | null
          root_user_id: string
          status: string | null
          target_plan_id: string | null
          total_quantity_target: number
          total_revenue_target: number
          updated_at: string | null
        }
        Insert: {
          allocation_method?: string
          created_at?: string | null
          created_by?: string | null
          fy_year: number
          id?: string
          quantity_unit?: string | null
          root_user_id: string
          status?: string | null
          target_plan_id?: string | null
          total_quantity_target?: number
          total_revenue_target?: number
          updated_at?: string | null
        }
        Update: {
          allocation_method?: string
          created_at?: string | null
          created_by?: string | null
          fy_year?: number
          id?: string
          quantity_unit?: string | null
          root_user_id?: string
          status?: string | null
          target_plan_id?: string | null
          total_quantity_target?: number
          total_revenue_target?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hierarchy_targets_root_user_id_fkey"
            columns: ["root_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_targets_target_plan_id_fkey"
            columns: ["target_plan_id"]
            isOneToOne: false
            referencedRelation: "target_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          created_by: string
          date: string
          description: string | null
          holiday_name: string
          id: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by: string
          date: string
          description?: string | null
          holiday_name: string
          id?: string
          updated_at?: string
          year?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string
          description?: string | null
          holiday_name?: string
          id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      inst_accounts: {
        Row: {
          account_name: string
          account_owner: string | null
          account_type: string | null
          annual_revenue: number | null
          billing_address: string | null
          city: string | null
          created_at: string
          credit_limit: number | null
          email: string | null
          employee_count: number | null
          gst_number: string | null
          id: string
          industry: string | null
          is_active: boolean | null
          pan_number: string | null
          parent_account_id: string | null
          payment_terms: number | null
          phone: string | null
          pincode: string | null
          shipping_address: string | null
          state: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          account_name: string
          account_owner?: string | null
          account_type?: string | null
          annual_revenue?: number | null
          billing_address?: string | null
          city?: string | null
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          employee_count?: number | null
          gst_number?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          pan_number?: string | null
          parent_account_id?: string | null
          payment_terms?: number | null
          phone?: string | null
          pincode?: string | null
          shipping_address?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_name?: string
          account_owner?: string | null
          account_type?: string | null
          annual_revenue?: number | null
          billing_address?: string | null
          city?: string | null
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          employee_count?: number | null
          gst_number?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          pan_number?: string | null
          parent_account_id?: string | null
          payment_terms?: number | null
          phone?: string | null
          pincode?: string | null
          shipping_address?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inst_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "inst_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      inst_collections: {
        Row: {
          account_id: string
          amount: number
          bank_name: string | null
          cheque_number: string | null
          collected_by: string | null
          collection_date: string
          collection_number: string
          created_at: string
          id: string
          invoice_id: string
          notes: string | null
          payment_method: string | null
          reference_number: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          amount?: number
          bank_name?: string | null
          cheque_number?: string | null
          collected_by?: string | null
          collection_date?: string
          collection_number: string
          created_at?: string
          id?: string
          invoice_id: string
          notes?: string | null
          payment_method?: string | null
          reference_number?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          bank_name?: string | null
          cheque_number?: string | null
          collected_by?: string | null
          collection_date?: string
          collection_number?: string
          created_at?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_method?: string | null
          reference_number?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inst_collections_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "inst_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inst_collections_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "inst_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      inst_contacts: {
        Row: {
          account_id: string
          created_at: string
          department: string | null
          designation: string | null
          email: string | null
          first_name: string
          id: string
          is_decision_maker: boolean | null
          is_primary_contact: boolean | null
          last_name: string | null
          mobile: string | null
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          department?: string | null
          designation?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_decision_maker?: boolean | null
          is_primary_contact?: boolean | null
          last_name?: string | null
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          department?: string | null
          designation?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_decision_maker?: boolean | null
          is_primary_contact?: boolean | null
          last_name?: string | null
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inst_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "inst_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      inst_invoice_lines: {
        Row: {
          commitment_line_id: string | null
          created_at: string
          description: string | null
          discount_amount: number | null
          id: string
          invoice_id: string
          line_total: number
          product_id: string
          quantity: number
          tax_amount: number | null
          unit_price: number
        }
        Insert: {
          commitment_line_id?: string | null
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          id?: string
          invoice_id: string
          line_total?: number
          product_id: string
          quantity?: number
          tax_amount?: number | null
          unit_price?: number
        }
        Update: {
          commitment_line_id?: string | null
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          id?: string
          invoice_id?: string
          line_total?: number
          product_id?: string
          quantity?: number
          tax_amount?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "inst_invoice_lines_commitment_line_id_fkey"
            columns: ["commitment_line_id"]
            isOneToOne: false
            referencedRelation: "inst_order_commitment_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inst_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "inst_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inst_invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inst_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inst_invoices: {
        Row: {
          account_id: string
          balance_amount: number | null
          created_at: string
          created_by: string
          discount_amount: number | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          order_commitment_id: string | null
          paid_amount: number | null
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          account_id: string
          balance_amount?: number | null
          created_at?: string
          created_by: string
          discount_amount?: number | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          order_commitment_id?: string | null
          paid_amount?: number | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          balance_amount?: number | null
          created_at?: string
          created_by?: string
          discount_amount?: number | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          order_commitment_id?: string | null
          paid_amount?: number | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inst_invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "inst_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inst_invoices_order_commitment_id_fkey"
            columns: ["order_commitment_id"]
            isOneToOne: false
            referencedRelation: "inst_order_commitments"
            referencedColumns: ["id"]
          },
        ]
      }
      inst_leads: {
        Row: {
          address: string | null
          annual_potential_value: number | null
          assigned_to: string | null
          city: string | null
          company_name: string
          converted_account_id: string | null
          created_at: string
          created_by: string
          email: string | null
          id: string
          industry_type: string | null
          lead_name: string
          lead_source: string | null
          lead_status: string | null
          notes: string | null
          phone: string | null
          pincode: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          annual_potential_value?: number | null
          assigned_to?: string | null
          city?: string | null
          company_name: string
          converted_account_id?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          industry_type?: string | null
          lead_name: string
          lead_source?: string | null
          lead_status?: string | null
          notes?: string | null
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          annual_potential_value?: number | null
          assigned_to?: string | null
          city?: string | null
          company_name?: string
          converted_account_id?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          industry_type?: string | null
          lead_name?: string
          lead_source?: string | null
          lead_status?: string | null
          notes?: string | null
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inst_opportunities: {
        Row: {
          account_id: string
          amount: number | null
          closed_date: string | null
          competitors: string | null
          contact_id: string | null
          created_at: string
          description: string | null
          expected_close_date: string | null
          id: string
          lead_source: string | null
          next_step: string | null
          opportunity_name: string
          owner_id: string | null
          probability: number | null
          stage: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          amount?: number | null
          closed_date?: string | null
          competitors?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          expected_close_date?: string | null
          id?: string
          lead_source?: string | null
          next_step?: string | null
          opportunity_name: string
          owner_id?: string | null
          probability?: number | null
          stage?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number | null
          closed_date?: string | null
          competitors?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          expected_close_date?: string | null
          id?: string
          lead_source?: string | null
          next_step?: string | null
          opportunity_name?: string
          owner_id?: string | null
          probability?: number | null
          stage?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inst_opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "inst_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inst_opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "inst_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      inst_order_commitment_lines: {
        Row: {
          actual_delivery_date: string | null
          actual_quantity: number | null
          actual_value: number | null
          created_at: string
          delivered_quantity: number | null
          id: string
          order_commitment_id: string
          planned_delivery_date: string | null
          planned_quantity: number
          planned_value: number | null
          product_id: string
          status: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          actual_delivery_date?: string | null
          actual_quantity?: number | null
          actual_value?: number | null
          created_at?: string
          delivered_quantity?: number | null
          id?: string
          order_commitment_id: string
          planned_delivery_date?: string | null
          planned_quantity?: number
          planned_value?: number | null
          product_id: string
          status?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          actual_delivery_date?: string | null
          actual_quantity?: number | null
          actual_value?: number | null
          created_at?: string
          delivered_quantity?: number | null
          id?: string
          order_commitment_id?: string
          planned_delivery_date?: string | null
          planned_quantity?: number
          planned_value?: number | null
          product_id?: string
          status?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inst_order_commitment_lines_order_commitment_id_fkey"
            columns: ["order_commitment_id"]
            isOneToOne: false
            referencedRelation: "inst_order_commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inst_order_commitment_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inst_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inst_order_commitments: {
        Row: {
          account_id: string
          commitment_date: string
          commitment_number: string
          created_at: string
          created_by: string
          delivery_end_date: string | null
          delivery_start_date: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          quote_id: string | null
          status: string | null
          total_actual_value: number | null
          total_planned_value: number | null
          updated_at: string
        }
        Insert: {
          account_id: string
          commitment_date?: string
          commitment_number: string
          created_at?: string
          created_by: string
          delivery_end_date?: string | null
          delivery_start_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          quote_id?: string | null
          status?: string | null
          total_actual_value?: number | null
          total_planned_value?: number | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          commitment_date?: string
          commitment_number?: string
          created_at?: string
          created_by?: string
          delivery_end_date?: string | null
          delivery_start_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          quote_id?: string | null
          status?: string | null
          total_actual_value?: number | null
          total_planned_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inst_order_commitments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "inst_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inst_order_commitments_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "inst_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inst_order_commitments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "inst_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      inst_price_book_entries: {
        Row: {
          created_at: string
          discount_percentage: number | null
          final_price: number
          id: string
          list_price: number
          max_quantity: number | null
          min_quantity: number | null
          price_book_id: string
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_percentage?: number | null
          final_price?: number
          id?: string
          list_price?: number
          max_quantity?: number | null
          min_quantity?: number | null
          price_book_id: string
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_percentage?: number | null
          final_price?: number
          id?: string
          list_price?: number
          max_quantity?: number | null
          min_quantity?: number | null
          price_book_id?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inst_price_book_entries_price_book_id_fkey"
            columns: ["price_book_id"]
            isOneToOne: false
            referencedRelation: "inst_price_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inst_price_book_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inst_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inst_price_books: {
        Row: {
          account_id: string | null
          created_at: string
          currency: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          is_active: boolean | null
          is_standard: boolean | null
          price_book_name: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          currency?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          is_standard?: boolean | null
          price_book_name: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          currency?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          is_standard?: boolean | null
          price_book_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inst_price_books_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "inst_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      inst_products: {
        Row: {
          base_price: number
          category: string | null
          created_at: string
          description: string | null
          gst_rate: number | null
          hsn_code: string | null
          id: string
          is_active: boolean | null
          min_order_quantity: number | null
          product_code: string
          product_name: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          base_price?: number
          category?: string | null
          created_at?: string
          description?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          is_active?: boolean | null
          min_order_quantity?: number | null
          product_code: string
          product_name: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          base_price?: number
          category?: string | null
          created_at?: string
          description?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          is_active?: boolean | null
          min_order_quantity?: number | null
          product_code?: string
          product_name?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inst_quote_line_items: {
        Row: {
          created_at: string
          description: string | null
          discount_amount: number | null
          discount_percentage: number | null
          id: string
          line_total: number
          product_id: string
          quantity: number
          quote_id: string
          sort_order: number | null
          tax_amount: number | null
          tax_rate: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          id?: string
          line_total?: number
          product_id: string
          quantity?: number
          quote_id: string
          sort_order?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          id?: string
          line_total?: number
          product_id?: string
          quantity?: number
          quote_id?: string
          sort_order?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "inst_quote_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inst_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inst_quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "inst_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      inst_quotes: {
        Row: {
          account_id: string
          approved_by: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          discount_amount: number | null
          id: string
          notes: string | null
          opportunity_id: string | null
          price_book_id: string | null
          quote_date: string
          quote_number: string
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          terms_and_conditions: string | null
          total_amount: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          account_id: string
          approved_by?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          discount_amount?: number | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          price_book_id?: string | null
          quote_date?: string
          quote_number: string
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          terms_and_conditions?: string | null
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          account_id?: string
          approved_by?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          discount_amount?: number | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          price_book_id?: string | null
          quote_date?: string
          quote_number?: string
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          terms_and_conditions?: string | null
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inst_quotes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "inst_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inst_quotes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "inst_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inst_quotes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "inst_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inst_quotes_price_book_id_fkey"
            columns: ["price_book_id"]
            isOneToOne: false
            referencedRelation: "inst_price_books"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          available_qty: number
          batch_no: string
          created_at: string
          distributor_id: string
          expiry_date: string | null
          id: string
          mfg_date: string | null
          product_id: string
          quantity: number
          reserved_qty: number
          supplier_batch_code: string | null
          system_batch_code: string | null
          warehouse_id: string
        }
        Insert: {
          available_qty?: number
          batch_no: string
          created_at?: string
          distributor_id: string
          expiry_date?: string | null
          id?: string
          mfg_date?: string | null
          product_id: string
          quantity?: number
          reserved_qty?: number
          supplier_batch_code?: string | null
          system_batch_code?: string | null
          warehouse_id: string
        }
        Update: {
          available_qty?: number
          batch_no?: string
          created_at?: string
          distributor_id?: string
          expiry_date?: string | null
          id?: string
          mfg_date?: string | null
          product_id?: string
          quantity?: number
          reserved_qty?: number
          supplier_batch_code?: string | null
          system_batch_code?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_valuation_config: {
        Row: {
          id: string
          updated_at: string | null
          updated_by: string | null
          valuation_method: string
        }
        Insert: {
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          valuation_method?: string
        }
        Update: {
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          valuation_method?: string
        }
        Relationships: []
      }
      invoice_display_settings: {
        Row: {
          created_at: string
          display_label: string
          enabled: boolean
          id: string
          setting_category: string
          setting_key: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_label: string
          enabled?: boolean
          id?: string
          setting_category: string
          setting_key: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_label?: string
          enabled?: boolean
          id?: string
          setting_category?: string
          setting_key?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_document_settings: {
        Row: {
          created_at: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          cgst_amount: number | null
          created_at: string | null
          description: string
          gst_rate: number | null
          hsn_sac: string | null
          id: string
          invoice_id: string
          price_per_unit: number | null
          quantity: number | null
          sgst_amount: number | null
          taxable_amount: number | null
          total_amount: number | null
          unit: string | null
        }
        Insert: {
          cgst_amount?: number | null
          created_at?: string | null
          description: string
          gst_rate?: number | null
          hsn_sac?: string | null
          id?: string
          invoice_id: string
          price_per_unit?: number | null
          quantity?: number | null
          sgst_amount?: number | null
          taxable_amount?: number | null
          total_amount?: number | null
          unit?: string | null
        }
        Update: {
          cgst_amount?: number | null
          created_at?: string | null
          description?: string
          gst_rate?: number | null
          hsn_sac?: string | null
          id?: string
          invoice_id?: string
          price_per_unit?: number | null
          quantity?: number | null
          sgst_amount?: number | null
          taxable_amount?: number | null
          total_amount?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_in_words: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          is_edited: boolean | null
          order_id: string | null
          owner_id_snapshot: string | null
          place_of_supply: string | null
          status: string | null
          sub_total: number | null
          terms: string | null
          total_amount: number | null
          total_tax: number | null
          updated_at: string | null
          vehicle_number: string | null
        }
        Insert: {
          amount_in_words?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          is_edited?: boolean | null
          order_id?: string | null
          owner_id_snapshot?: string | null
          place_of_supply?: string | null
          status?: string | null
          sub_total?: number | null
          terms?: string | null
          total_amount?: number | null
          total_tax?: number | null
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Update: {
          amount_in_words?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          is_edited?: boolean | null
          order_id?: string | null
          owner_id_snapshot?: string | null
          place_of_supply?: string | null
          status?: string | null
          sub_total?: number | null
          terms?: string | null
          total_amount?: number | null
          total_tax?: number | null
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      joint_sales_feedback: {
        Row: {
          action_items: string | null
          additional_notes: string | null
          beat_plan_id: string | null
          branding_rating: number | null
          branding_status: string | null
          competition_knowledge: string | null
          competition_presence: string | null
          competition_rating: number | null
          consumer_feedback: string | null
          conversation_highlights: string | null
          created_at: string | null
          distributor_feedback_rating: number | null
          distributor_service: string | null
          feedback_date: string
          fse_user_id: string
          future_growth_rating: number | null
          growth_potential: string | null
          id: string
          joint_sales_impact: string | null
          manager_id: string
          monthly_potential_6months: number | null
          new_products_introduced: string | null
          order_increase_amount: number | null
          placement_feedback: string | null
          pricing_compliance: string | null
          pricing_feedback: string | null
          pricing_feedback_rating: number | null
          product_feedback_rating: number | null
          product_packaging_feedback: string | null
          product_quality_feedback: string | null
          product_sku_range_feedback: string | null
          product_usp_feedback: string | null
          promotion_vs_competition: string | null
          retailer_id: string
          retailer_notes: string | null
          retailing_feedback: string | null
          retailing_rating: number | null
          sales_increase_feedback: string | null
          sales_trend: string | null
          sales_trends_rating: number | null
          sampling_rating: number | null
          sampling_status: string | null
          scheme_awareness: string | null
          schemes_feedback: string | null
          schemes_rating: number | null
          service_feedback: string | null
          shelf_visibility: string | null
          trends_feedback: string | null
          updated_at: string | null
          visit_id: string | null
          willingness_to_grow_range: string | null
        }
        Insert: {
          action_items?: string | null
          additional_notes?: string | null
          beat_plan_id?: string | null
          branding_rating?: number | null
          branding_status?: string | null
          competition_knowledge?: string | null
          competition_presence?: string | null
          competition_rating?: number | null
          consumer_feedback?: string | null
          conversation_highlights?: string | null
          created_at?: string | null
          distributor_feedback_rating?: number | null
          distributor_service?: string | null
          feedback_date?: string
          fse_user_id: string
          future_growth_rating?: number | null
          growth_potential?: string | null
          id?: string
          joint_sales_impact?: string | null
          manager_id: string
          monthly_potential_6months?: number | null
          new_products_introduced?: string | null
          order_increase_amount?: number | null
          placement_feedback?: string | null
          pricing_compliance?: string | null
          pricing_feedback?: string | null
          pricing_feedback_rating?: number | null
          product_feedback_rating?: number | null
          product_packaging_feedback?: string | null
          product_quality_feedback?: string | null
          product_sku_range_feedback?: string | null
          product_usp_feedback?: string | null
          promotion_vs_competition?: string | null
          retailer_id: string
          retailer_notes?: string | null
          retailing_feedback?: string | null
          retailing_rating?: number | null
          sales_increase_feedback?: string | null
          sales_trend?: string | null
          sales_trends_rating?: number | null
          sampling_rating?: number | null
          sampling_status?: string | null
          scheme_awareness?: string | null
          schemes_feedback?: string | null
          schemes_rating?: number | null
          service_feedback?: string | null
          shelf_visibility?: string | null
          trends_feedback?: string | null
          updated_at?: string | null
          visit_id?: string | null
          willingness_to_grow_range?: string | null
        }
        Update: {
          action_items?: string | null
          additional_notes?: string | null
          beat_plan_id?: string | null
          branding_rating?: number | null
          branding_status?: string | null
          competition_knowledge?: string | null
          competition_presence?: string | null
          competition_rating?: number | null
          consumer_feedback?: string | null
          conversation_highlights?: string | null
          created_at?: string | null
          distributor_feedback_rating?: number | null
          distributor_service?: string | null
          feedback_date?: string
          fse_user_id?: string
          future_growth_rating?: number | null
          growth_potential?: string | null
          id?: string
          joint_sales_impact?: string | null
          manager_id?: string
          monthly_potential_6months?: number | null
          new_products_introduced?: string | null
          order_increase_amount?: number | null
          placement_feedback?: string | null
          pricing_compliance?: string | null
          pricing_feedback?: string | null
          pricing_feedback_rating?: number | null
          product_feedback_rating?: number | null
          product_packaging_feedback?: string | null
          product_quality_feedback?: string | null
          product_sku_range_feedback?: string | null
          product_usp_feedback?: string | null
          promotion_vs_competition?: string | null
          retailer_id?: string
          retailer_notes?: string | null
          retailing_feedback?: string | null
          retailing_rating?: number | null
          sales_increase_feedback?: string | null
          sales_trend?: string | null
          sales_trends_rating?: number | null
          sampling_rating?: number | null
          sampling_status?: string | null
          scheme_awareness?: string | null
          schemes_feedback?: string | null
          schemes_rating?: number | null
          service_feedback?: string | null
          shelf_visibility?: string | null
          trends_feedback?: string | null
          updated_at?: string | null
          visit_id?: string | null
          willingness_to_grow_range?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "joint_sales_feedback_beat_plan_id_fkey"
            columns: ["beat_plan_id"]
            isOneToOne: false
            referencedRelation: "beat_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "joint_sales_feedback_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "joint_sales_feedback_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      joint_sales_sessions: {
        Row: {
          beat_id: string | null
          beat_name: string | null
          beat_plan_id: string | null
          created_at: string | null
          fse_user_id: string
          id: string
          manager_id: string
          session_date: string
          session_end_time: string | null
          session_start_time: string | null
          total_feedback_captured: number | null
          total_retailers_visited: number | null
          updated_at: string | null
        }
        Insert: {
          beat_id?: string | null
          beat_name?: string | null
          beat_plan_id?: string | null
          created_at?: string | null
          fse_user_id: string
          id?: string
          manager_id: string
          session_date: string
          session_end_time?: string | null
          session_start_time?: string | null
          total_feedback_captured?: number | null
          total_retailers_visited?: number | null
          updated_at?: string | null
        }
        Update: {
          beat_id?: string | null
          beat_name?: string | null
          beat_plan_id?: string | null
          created_at?: string | null
          fse_user_id?: string
          id?: string
          manager_id?: string
          session_date?: string
          session_end_time?: string | null
          session_start_time?: string | null
          total_feedback_captured?: number | null
          total_retailers_visited?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "joint_sales_sessions_beat_plan_id_fkey"
            columns: ["beat_plan_id"]
            isOneToOne: false
            referencedRelation: "beat_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_snapshots: {
        Row: {
          captured_at: string
          full_name: string | null
          period_end: string
          period_label: string
          period_start: string
          period_type: string
          profile_picture_url: string | null
          rank: number
          total_points: number
          user_id: string
        }
        Insert: {
          captured_at?: string
          full_name?: string | null
          period_end: string
          period_label: string
          period_start: string
          period_type: string
          profile_picture_url?: string | null
          rank: number
          total_points?: number
          user_id: string
        }
        Update: {
          captured_at?: string
          full_name?: string | null
          period_end?: string
          period_label?: string
          period_start?: string
          period_type?: string
          profile_picture_url?: string | null
          rank?: number
          total_points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_accrual_log: {
        Row: {
          accrual_type: string | null
          balance_after: number
          created_at: string | null
          days_credited: number
          days_debited: number | null
          id: string
          leave_type_id: string
          month: number | null
          notes: string | null
          user_id: string
          year: number
        }
        Insert: {
          accrual_type?: string | null
          balance_after: number
          created_at?: string | null
          days_credited?: number
          days_debited?: number | null
          id?: string
          leave_type_id: string
          month?: number | null
          notes?: string | null
          user_id: string
          year: number
        }
        Update: {
          accrual_type?: string | null
          balance_after?: number
          created_at?: string | null
          days_credited?: number
          days_debited?: number | null
          id?: string
          leave_type_id?: string
          month?: number | null
          notes?: string | null
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_accrual_log_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_applications: {
        Row: {
          applied_date: string
          approved_by: string | null
          approved_date: string | null
          attendance_marked: boolean | null
          created_at: string
          current_approval_level: number | null
          days_requested: number | null
          end_date: string
          final_approved_by: string | null
          half_day_period: string | null
          id: string
          is_half_day: boolean | null
          is_lop: boolean | null
          leave_type_id: string
          lop_days: number | null
          proof_document_url: string | null
          reason: string
          rejection_reason: string | null
          sandwich_days_added: number | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_date?: string
          approved_by?: string | null
          approved_date?: string | null
          attendance_marked?: boolean | null
          created_at?: string
          current_approval_level?: number | null
          days_requested?: number | null
          end_date: string
          final_approved_by?: string | null
          half_day_period?: string | null
          id?: string
          is_half_day?: boolean | null
          is_lop?: boolean | null
          leave_type_id: string
          lop_days?: number | null
          proof_document_url?: string | null
          reason: string
          rejection_reason?: string | null
          sandwich_days_added?: number | null
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_date?: string
          approved_by?: string | null
          approved_date?: string | null
          attendance_marked?: boolean | null
          created_at?: string
          current_approval_level?: number | null
          days_requested?: number | null
          end_date?: string
          final_approved_by?: string | null
          half_day_period?: string | null
          id?: string
          is_half_day?: boolean | null
          is_lop?: boolean | null
          leave_type_id?: string
          lop_days?: number | null
          proof_document_url?: string | null
          reason?: string
          rejection_reason?: string | null
          sandwich_days_added?: number | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_applications_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_approval_workflow: {
        Row: {
          approval_level: number
          approver_type: string | null
          approver_user_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          leave_type_id: string | null
          min_days_trigger: number | null
          updated_at: string | null
        }
        Insert: {
          approval_level?: number
          approver_type?: string | null
          approver_user_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          leave_type_id?: string | null
          min_days_trigger?: number | null
          updated_at?: string | null
        }
        Update: {
          approval_level?: number
          approver_type?: string | null
          approver_user_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          leave_type_id?: string | null
          min_days_trigger?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_approval_workflow_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balance: {
        Row: {
          created_at: string
          id: string
          leave_type_id: string
          opening_balance: number
          remaining_balance: number | null
          updated_at: string
          used_balance: number
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          leave_type_id: string
          opening_balance?: number
          remaining_balance?: number | null
          updated_at?: string
          used_balance?: number
          user_id: string
          year?: number
        }
        Update: {
          created_at?: string
          id?: string
          leave_type_id?: string
          opening_balance?: number
          remaining_balance?: number | null
          updated_at?: string
          used_balance?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_leave_balance_leave_type_id"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balance_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_holidays_bridge: {
        Row: {
          created_at: string | null
          holiday_date: string
          id: string
          is_sandwich_day: boolean | null
          leave_application_id: string | null
        }
        Insert: {
          created_at?: string | null
          holiday_date: string
          id?: string
          is_sandwich_day?: boolean | null
          leave_application_id?: string | null
        }
        Update: {
          created_at?: string | null
          holiday_date?: string
          id?: string
          is_sandwich_day?: boolean | null
          leave_application_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_holidays_bridge_leave_application_id_fkey"
            columns: ["leave_application_id"]
            isOneToOne: false
            referencedRelation: "leave_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policy: {
        Row: {
          accrual_type: string
          applicable_from: string | null
          auto_approval_threshold: number | null
          backdated_days_allowed: number | null
          carry_forward_allowed: boolean | null
          created_at: string
          encashment_allowed: boolean | null
          encashment_limit: number | null
          id: string
          is_active: boolean | null
          last_update_effective_date: string | null
          last_update_mode: string | null
          leave_type_id: string
          max_carry_forward: number | null
          max_leaves_per_month: number | null
          min_days_advance_notice: number | null
          monthly_accrual: number | null
          negative_balance_allowed: boolean | null
          probation_applicable: boolean | null
          sandwich_rule_enabled: boolean | null
          updated_at: string
          yearly_entitlement: number
        }
        Insert: {
          accrual_type?: string
          applicable_from?: string | null
          auto_approval_threshold?: number | null
          backdated_days_allowed?: number | null
          carry_forward_allowed?: boolean | null
          created_at?: string
          encashment_allowed?: boolean | null
          encashment_limit?: number | null
          id?: string
          is_active?: boolean | null
          last_update_effective_date?: string | null
          last_update_mode?: string | null
          leave_type_id: string
          max_carry_forward?: number | null
          max_leaves_per_month?: number | null
          min_days_advance_notice?: number | null
          monthly_accrual?: number | null
          negative_balance_allowed?: boolean | null
          probation_applicable?: boolean | null
          sandwich_rule_enabled?: boolean | null
          updated_at?: string
          yearly_entitlement?: number
        }
        Update: {
          accrual_type?: string
          applicable_from?: string | null
          auto_approval_threshold?: number | null
          backdated_days_allowed?: number | null
          carry_forward_allowed?: boolean | null
          created_at?: string
          encashment_allowed?: boolean | null
          encashment_limit?: number | null
          id?: string
          is_active?: boolean | null
          last_update_effective_date?: string | null
          last_update_mode?: string | null
          leave_type_id?: string
          max_carry_forward?: number | null
          max_leaves_per_month?: number | null
          min_days_advance_notice?: number | null
          monthly_accrual?: number | null
          negative_balance_allowed?: boolean | null
          probation_applicable?: boolean | null
          sandwich_rule_enabled?: boolean | null
          updated_at?: string
          yearly_entitlement?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_policy_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: true
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_type_policy_override: {
        Row: {
          allow_negative_balance: boolean | null
          carry_forward_expiry_months: number | null
          created_at: string
          custom_reset_cycle: string | null
          enable_carry_forward: boolean | null
          id: string
          leave_type_id: string
          max_carry_forward_limit: number | null
          max_negative_limit: number | null
          override_enabled: boolean
          updated_at: string
        }
        Insert: {
          allow_negative_balance?: boolean | null
          carry_forward_expiry_months?: number | null
          created_at?: string
          custom_reset_cycle?: string | null
          enable_carry_forward?: boolean | null
          id?: string
          leave_type_id: string
          max_carry_forward_limit?: number | null
          max_negative_limit?: number | null
          override_enabled?: boolean
          updated_at?: string
        }
        Update: {
          allow_negative_balance?: boolean | null
          carry_forward_expiry_months?: number | null
          created_at?: string
          custom_reset_cycle?: string | null
          enable_carry_forward?: boolean | null
          id?: string
          leave_type_id?: string
          max_carry_forward_limit?: number | null
          max_negative_limit?: number | null
          override_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_type_policy_override_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: true
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          allow_half_day: boolean | null
          code: string | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          proof_required: boolean | null
          sort_order: number | null
          yearly_limit: number | null
        }
        Insert: {
          allow_half_day?: boolean | null
          code?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          proof_required?: boolean | null
          sort_order?: number | null
          yearly_limit?: number | null
        }
        Update: {
          allow_half_day?: boolean | null
          code?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          proof_required?: boolean | null
          sort_order?: number | null
          yearly_limit?: number | null
        }
        Relationships: []
      }
      license_config: {
        Row: {
          created_at: string
          field_sales_enabled: boolean | null
          id: string
          institutional_sales_enabled: boolean | null
          license_type: string
          max_users: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          field_sales_enabled?: boolean | null
          id?: string
          institutional_sales_enabled?: boolean | null
          license_type?: string
          max_users?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          field_sales_enabled?: boolean | null
          id?: string
          institutional_sales_enabled?: boolean | null
          license_type?: string
          max_users?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      module_usage_logs: {
        Row: {
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          module_category: string
          module_name: string
          route_path: string
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          module_category?: string
          module_name: string
          route_path: string
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          module_category?: string
          module_name?: string
          route_path?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_event_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_code: string
          id: string
          metadata: Json | null
          processed: boolean
          record_id: string
          source_table: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_code: string
          id?: string
          metadata?: Json | null
          processed?: boolean
          record_id: string
          source_table: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_code?: string
          id?: string
          metadata?: Json | null
          processed?: boolean
          record_id?: string
          source_table?: string
        }
        Relationships: []
      }
      notification_event_types: {
        Row: {
          description: string | null
          event_code: string
          id: string
          is_active: boolean
          label: string
        }
        Insert: {
          description?: string | null
          event_code: string
          id?: string
          is_active?: boolean
          label: string
        }
        Update: {
          description?: string | null
          event_code?: string
          id?: string
          is_active?: boolean
          label?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          template_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          template_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          template_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_rules: {
        Row: {
          created_at: string
          created_by: string | null
          event_code: string
          id: string
          is_active: boolean
          message_template: string
          name: string | null
          notification_channel: string
          receiver_role: string | null
          receiver_type: string
          receiver_user_id: string | null
          retailer_target_ids: string[] | null
          retailer_target_type: string | null
          source_table: string
          title_template: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_code: string
          id?: string
          is_active?: boolean
          message_template?: string
          name?: string | null
          notification_channel?: string
          receiver_role?: string | null
          receiver_type?: string
          receiver_user_id?: string | null
          retailer_target_ids?: string[] | null
          retailer_target_type?: string | null
          source_table: string
          title_template?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_code?: string
          id?: string
          is_active?: boolean
          message_template?: string
          name?: string | null
          notification_channel?: string
          receiver_role?: string | null
          receiver_type?: string
          receiver_user_id?: string | null
          retailer_target_ids?: string[] | null
          retailer_target_type?: string | null
          source_table?: string
          title_template?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          metadata: Json
          related_id: string | null
          related_table: string | null
          retailer_id: string | null
          target_portal: string | null
          title: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json
          related_id?: string | null
          related_table?: string | null
          retailer_id?: string | null
          target_portal?: string | null
          title: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json
          related_id?: string | null
          related_table?: string | null
          retailer_id?: string | null
          target_portal?: string | null
          title?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_tasks: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          requires_attachment: boolean | null
          sort_order: number | null
          task_name: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          requires_attachment?: boolean | null
          sort_order?: number | null
          task_name: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          requires_attachment?: boolean | null
          sort_order?: number | null
          task_name?: string
        }
        Relationships: []
      }
      opening_stock_entries: {
        Row: {
          created_at: string
          created_by: string | null
          distributor_id: string
          entry_date: string
          id: string
          product_id: string
          product_name: string
          quantity: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          distributor_id: string
          entry_date?: string
          id?: string
          product_id: string
          product_name: string
          quantity: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          distributor_id?: string
          entry_date?: string
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "opening_stock_entries_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_activity_log: {
        Row: {
          activity_type: string
          beat_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata_json: Json
          operational_snapshot_user_id: string | null
          owner_snapshot_user_id: string | null
          performed_by_user_id: string | null
          retailer_id: string | null
        }
        Insert: {
          activity_type: string
          beat_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata_json?: Json
          operational_snapshot_user_id?: string | null
          owner_snapshot_user_id?: string | null
          performed_by_user_id?: string | null
          retailer_id?: string | null
        }
        Update: {
          activity_type?: string
          beat_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata_json?: Json
          operational_snapshot_user_id?: string | null
          owner_snapshot_user_id?: string | null
          performed_by_user_id?: string | null
          retailer_id?: string | null
        }
        Relationships: []
      }
      order_cancellation_log: {
        Row: {
          cancelled_at: string
          cancelled_by: string | null
          id: string
          order_id: string
          reason: string | null
          reversal_summary: Json | null
        }
        Insert: {
          cancelled_at?: string
          cancelled_by?: string | null
          id?: string
          order_id: string
          reason?: string | null
          reversal_summary?: Json | null
        }
        Update: {
          cancelled_at?: string
          cancelled_by?: string | null
          id?: string
          order_id?: string
          reason?: string | null
          reversal_summary?: Json | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          backorder_qty: number | null
          category: string
          cgst_amount: number | null
          conversion_to_base: number | null
          created_at: string
          discount_amount: number | null
          hsn_code: string | null
          id: string
          order_id: string
          original_rate: number | null
          product_id: string
          product_name: string
          quantity: number
          rate: number
          sgst_amount: number | null
          total: number
          unit: string
          uom_code: string | null
          uom_id: string | null
          variant_id: string | null
        }
        Insert: {
          backorder_qty?: number | null
          category: string
          cgst_amount?: number | null
          conversion_to_base?: number | null
          created_at?: string
          discount_amount?: number | null
          hsn_code?: string | null
          id?: string
          order_id: string
          original_rate?: number | null
          product_id: string
          product_name: string
          quantity: number
          rate: number
          sgst_amount?: number | null
          total: number
          unit: string
          uom_code?: string | null
          uom_id?: string | null
          variant_id?: string | null
        }
        Update: {
          backorder_qty?: number | null
          category?: string
          cgst_amount?: number | null
          conversion_to_base?: number | null
          created_at?: string
          discount_amount?: number | null
          hsn_code?: string | null
          id?: string
          order_id?: string
          original_rate?: number | null
          product_id?: string
          product_name?: string
          quantity?: number
          rate?: number
          sgst_amount?: number | null
          total?: number
          unit?: string
          uom_code?: string | null
          uom_id?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_fk"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_collected: number | null
          assigned_agent_id: string | null
          assigned_van_id: string | null
          beat_id: string | null
          beat_name_snapshot: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          counter_customer_id: string | null
          created_at: string
          credit_paid_amount: number | null
          credit_pending_amount: number | null
          delivered_at: string | null
          delivery_date: string | null
          delivery_notes: string | null
          delivery_payment_method: string | null
          delivery_proof_url: string | null
          delivery_status: string | null
          discount_amount: number | null
          dispatched_at: string | null
          distributor_id: string | null
          distributor_name: string | null
          event_id: string | null
          id: string
          idempotency_key: string
          invoice_generated_at: string | null
          invoice_number: string | null
          is_backorder: boolean | null
          is_credit_order: boolean | null
          order_date: string | null
          order_source: string | null
          owner_id_snapshot: string | null
          packing_list_id: string | null
          parent_order_id: string | null
          payment_method: string | null
          payment_proof_url: string | null
          payment_status: string | null
          picked_at: string | null
          previous_pending_cleared: number | null
          retailer_id: string | null
          retailer_name: string
          sales_channel: string
          short_items: Json | null
          status: string
          subtotal: number
          territory_id: string | null
          total_amount: number
          updated_at: string
          upi_last_four_code: string | null
          user_id: string
          visit_id: string | null
        }
        Insert: {
          amount_collected?: number | null
          assigned_agent_id?: string | null
          assigned_van_id?: string | null
          beat_id?: string | null
          beat_name_snapshot?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          counter_customer_id?: string | null
          created_at?: string
          credit_paid_amount?: number | null
          credit_pending_amount?: number | null
          delivered_at?: string | null
          delivery_date?: string | null
          delivery_notes?: string | null
          delivery_payment_method?: string | null
          delivery_proof_url?: string | null
          delivery_status?: string | null
          discount_amount?: number | null
          dispatched_at?: string | null
          distributor_id?: string | null
          distributor_name?: string | null
          event_id?: string | null
          id?: string
          idempotency_key: string
          invoice_generated_at?: string | null
          invoice_number?: string | null
          is_backorder?: boolean | null
          is_credit_order?: boolean | null
          order_date?: string | null
          order_source?: string | null
          owner_id_snapshot?: string | null
          packing_list_id?: string | null
          parent_order_id?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          payment_status?: string | null
          picked_at?: string | null
          previous_pending_cleared?: number | null
          retailer_id?: string | null
          retailer_name: string
          sales_channel?: string
          short_items?: Json | null
          status?: string
          subtotal: number
          territory_id?: string | null
          total_amount: number
          updated_at?: string
          upi_last_four_code?: string | null
          user_id: string
          visit_id?: string | null
        }
        Update: {
          amount_collected?: number | null
          assigned_agent_id?: string | null
          assigned_van_id?: string | null
          beat_id?: string | null
          beat_name_snapshot?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          counter_customer_id?: string | null
          created_at?: string
          credit_paid_amount?: number | null
          credit_pending_amount?: number | null
          delivered_at?: string | null
          delivery_date?: string | null
          delivery_notes?: string | null
          delivery_payment_method?: string | null
          delivery_proof_url?: string | null
          delivery_status?: string | null
          discount_amount?: number | null
          dispatched_at?: string | null
          distributor_id?: string | null
          distributor_name?: string | null
          event_id?: string | null
          id?: string
          idempotency_key?: string
          invoice_generated_at?: string | null
          invoice_number?: string | null
          is_backorder?: boolean | null
          is_credit_order?: boolean | null
          order_date?: string | null
          order_source?: string | null
          owner_id_snapshot?: string | null
          packing_list_id?: string | null
          parent_order_id?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          payment_status?: string | null
          picked_at?: string | null
          previous_pending_cleared?: number | null
          retailer_id?: string | null
          retailer_name?: string
          sales_channel?: string
          short_items?: Json | null
          status?: string
          subtotal?: number
          territory_id?: string | null
          total_amount?: number
          updated_at?: string
          upi_last_four_code?: string | null
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_counter_customer_id_fkey"
            columns: ["counter_customer_id"]
            isOneToOne: false
            referencedRelation: "counter_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_list_assignments: {
        Row: {
          agent_id: string | null
          beat_ids: string[] | null
          completed_at: string | null
          created_at: string
          dispatched_at: string | null
          id: string
          order_count: number
          packing_list_id: string
          status: string
          territory_ids: string[] | null
          total_load_qty: number
          total_load_value: number
          updated_at: string
          van_id: string | null
        }
        Insert: {
          agent_id?: string | null
          beat_ids?: string[] | null
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          id?: string
          order_count?: number
          packing_list_id: string
          status?: string
          territory_ids?: string[] | null
          total_load_qty?: number
          total_load_value?: number
          updated_at?: string
          van_id?: string | null
        }
        Update: {
          agent_id?: string | null
          beat_ids?: string[] | null
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          id?: string
          order_count?: number
          packing_list_id?: string
          status?: string
          territory_ids?: string[] | null
          total_load_qty?: number
          total_load_value?: number
          updated_at?: string
          van_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_list_assignments_packing_list_id_fkey"
            columns: ["packing_list_id"]
            isOneToOne: false
            referencedRelation: "packing_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_list_item_batches: {
        Row: {
          allocated_qty: number
          batch_id: string
          batch_number: string | null
          created_at: string
          expiry_date: string | null
          id: string
          packed_at: string | null
          packed_by: string | null
          packed_qty: number
          packing_list_item_id: string
          picked_qty: number
        }
        Insert: {
          allocated_qty?: number
          batch_id: string
          batch_number?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          packed_at?: string | null
          packed_by?: string | null
          packed_qty?: number
          packing_list_item_id: string
          picked_qty?: number
        }
        Update: {
          allocated_qty?: number
          batch_id?: string
          batch_number?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          packed_at?: string | null
          packed_by?: string | null
          packed_qty?: number
          packing_list_item_id?: string
          picked_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "packing_list_item_batches_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_list_item_batches_packing_list_item_id_fkey"
            columns: ["packing_list_item_id"]
            isOneToOne: false
            referencedRelation: "packing_list_items"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_list_item_sources: {
        Row: {
          allocated_qty: number
          backorder_qty: number
          created_at: string
          id: string
          order_id: string | null
          order_item_id: string | null
          packing_list_item_id: string
          product_id: string | null
        }
        Insert: {
          allocated_qty?: number
          backorder_qty?: number
          created_at?: string
          id?: string
          order_id?: string | null
          order_item_id?: string | null
          packing_list_item_id: string
          product_id?: string | null
        }
        Update: {
          allocated_qty?: number
          backorder_qty?: number
          created_at?: string
          id?: string
          order_id?: string | null
          order_item_id?: string | null
          packing_list_item_id?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_list_item_sources_packing_list_item_id_fkey"
            columns: ["packing_list_item_id"]
            isOneToOne: false
            referencedRelation: "packing_list_items"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_list_items: {
        Row: {
          approved_qty: number | null
          base_qty: number | null
          batch_number: string | null
          conversion_to_base: number | null
          created_at: string
          expiry_date: string | null
          id: string
          ordered_qty: number
          packing_list_id: string | null
          picked_qty: number
          product_id: string
          product_name: string
          short_qty: number
          unit: string | null
          uom_code: string | null
          uom_id: string | null
          updated_at: string
        }
        Insert: {
          approved_qty?: number | null
          base_qty?: number | null
          batch_number?: string | null
          conversion_to_base?: number | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          ordered_qty?: number
          packing_list_id?: string | null
          picked_qty?: number
          product_id: string
          product_name: string
          short_qty?: number
          unit?: string | null
          uom_code?: string | null
          uom_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_qty?: number | null
          base_qty?: number | null
          batch_number?: string | null
          conversion_to_base?: number | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          ordered_qty?: number
          packing_list_id?: string | null
          picked_qty?: number
          product_id?: string
          product_name?: string
          short_qty?: number
          unit?: string | null
          uom_code?: string | null
          uom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_list_items_packing_list_id_fkey"
            columns: ["packing_list_id"]
            isOneToOne: false
            referencedRelation: "packing_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_list_items_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_list_orders: {
        Row: {
          created_at: string | null
          id: string
          order_id: string
          packing_list_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          packing_list_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string
          packing_list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_list_orders_packing_list_id_fkey"
            columns: ["packing_list_id"]
            isOneToOne: false
            referencedRelation: "packing_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_lists: {
        Row: {
          created_at: string | null
          created_by: string | null
          delivery_date: string
          distributor_id: string | null
          id: string
          notes: string | null
          order_type: string
          packing_list_number: string
          route_id: string | null
          status: string
          total_items: number
          total_value: number | null
          updated_at: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          delivery_date: string
          distributor_id?: string | null
          id?: string
          notes?: string | null
          order_type?: string
          packing_list_number?: string
          route_id?: string | null
          status?: string
          total_items?: number
          total_value?: number | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          delivery_date?: string
          distributor_id?: string | null
          id?: string
          notes?: string | null
          order_type?: string
          packing_list_number?: string
          route_id?: string | null
          status?: string
          total_items?: number
          total_value?: number | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_lists_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_lists_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
          ip_address: string | null
          user_agent: string | null
          was_successful: boolean
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          was_successful?: boolean
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          was_successful?: boolean
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          method: string
          phone_number: string | null
          token: string
          used: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          method?: string
          phone_number?: string | null
          token: string
          used?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          method?: string
          phone_number?: string | null
          token?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      payment_allocations: {
        Row: {
          allocated_amount: number
          allocation_type: string
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          allocated_amount: number
          allocation_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          allocated_amount?: number
          allocation_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "distributor_secondary_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "distributor_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_comments: {
        Row: {
          created_at: string | null
          hr_comment: string | null
          hr_id: string | null
          hr_rating: number | null
          id: string
          manager_comment: string | null
          manager_id: string | null
          manager_rating: number | null
          period_end: string
          period_start: string
          period_type: string
          self_comment: string | null
          self_rating: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          hr_comment?: string | null
          hr_id?: string | null
          hr_rating?: number | null
          id?: string
          manager_comment?: string | null
          manager_id?: string | null
          manager_rating?: number | null
          period_end: string
          period_start: string
          period_type: string
          self_comment?: string | null
          self_rating?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          hr_comment?: string | null
          hr_id?: string | null
          hr_rating?: number | null
          id?: string
          manager_comment?: string | null
          manager_id?: string | null
          manager_rating?: number | null
          period_end?: string
          period_start?: string
          period_type?: string
          self_comment?: string | null
          self_rating?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      performance_module_config: {
        Row: {
          active_module: string
          created_at: string | null
          enabled_periods: string[] | null
          id: string
          rating_thresholds: Json | null
          updated_at: string | null
        }
        Insert: {
          active_module?: string
          created_at?: string | null
          enabled_periods?: string[] | null
          id?: string
          rating_thresholds?: Json | null
          updated_at?: string | null
        }
        Update: {
          active_module?: string
          created_at?: string | null
          enabled_periods?: string[] | null
          id?: string
          rating_thresholds?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      permanent_deletion_log: {
        Row: {
          created_at: string
          deleted_from_bin_at: string
          deleted_from_bin_by: string
          id: string
          module_name: string
          original_deleted_at: string
          original_deleted_by: string
          original_id: string
          original_table: string
          record_data: Json
          record_name: string | null
        }
        Insert: {
          created_at?: string
          deleted_from_bin_at?: string
          deleted_from_bin_by: string
          id?: string
          module_name: string
          original_deleted_at: string
          original_deleted_by: string
          original_id: string
          original_table: string
          record_data: Json
          record_name?: string | null
        }
        Update: {
          created_at?: string
          deleted_from_bin_at?: string
          deleted_from_bin_by?: string
          id?: string
          module_name?: string
          original_deleted_at?: string
          original_deleted_by?: string
          original_id?: string
          original_table?: string
          record_data?: Json
          record_name?: string | null
        }
        Relationships: []
      }
      permission_set_group_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_modify_all: boolean
          can_read: boolean
          can_view_all: boolean
          created_at: string
          group_id: string
          id: string
          object_name: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_modify_all?: boolean
          can_read?: boolean
          can_view_all?: boolean
          created_at?: string
          group_id: string
          id?: string
          object_name: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_modify_all?: boolean
          can_read?: boolean
          can_view_all?: boolean
          created_at?: string
          group_id?: string
          id?: string
          object_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_set_group_permissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "permission_set_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_set_group_users: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_set_group_users_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "permission_set_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_set_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      petty_cash_funds: {
        Row: {
          allocated_amount: number
          balance: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          status: string
          updated_at: string
          user_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          allocated_amount?: number
          balance?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          allocated_amount?: number
          balance?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_funds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_funds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      petty_cash_limits: {
        Row: {
          created_at: string
          fund_id: string
          id: string
          max_per_day: number | null
          max_per_transaction: number | null
          require_bill_above: number | null
        }
        Insert: {
          created_at?: string
          fund_id: string
          id?: string
          max_per_day?: number | null
          max_per_transaction?: number | null
          require_bill_above?: number | null
        }
        Update: {
          created_at?: string
          fund_id?: string
          id?: string
          max_per_day?: number | null
          max_per_transaction?: number | null
          require_bill_above?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_limits_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: true
            referencedRelation: "petty_cash_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      petty_cash_transactions: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          bill_url: string | null
          category: string
          created_at: string
          description: string | null
          fund_id: string
          id: string
          rejection_reason: string | null
          status: string
          transaction_date: string
          user_id: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bill_url?: string | null
          category?: string
          created_at?: string
          description?: string | null
          fund_id: string
          id?: string
          rejection_reason?: string | null
          status?: string
          transaction_date?: string
          user_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bill_url?: string | null
          category?: string
          created_at?: string
          description?: string | null
          fund_id?: string
          id?: string
          rejection_reason?: string | null
          status?: string
          transaction_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_transactions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "petty_cash_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pincode_master: {
        Row: {
          created_at: string | null
          district: string | null
          id: string
          is_custom_area: boolean
          latitude: number | null
          longitude: number | null
          officename: string
          pincode: string
          statename: string | null
          taluka: string | null
          territory_po: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          district?: string | null
          id?: string
          is_custom_area?: boolean
          latitude?: number | null
          longitude?: number | null
          officename: string
          pincode: string
          statename?: string | null
          taluka?: string | null
          territory_po?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          district?: string | null
          id?: string
          is_custom_area?: boolean
          latitude?: number | null
          longitude?: number | null
          officename?: string
          pincode?: string
          statename?: string | null
          taluka?: string | null
          territory_po?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pincode_top_retailers: {
        Row: {
          address: string | null
          fetched_at: string
          hours_fetched_at: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          open_now: boolean | null
          opening_hours: Json | null
          pincode: string
          place_id: string | null
          rank: number
          rating: number | null
          score: number | null
          source: string
          user_ratings_total: number | null
        }
        Insert: {
          address?: string | null
          fetched_at?: string
          hours_fetched_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          open_now?: boolean | null
          opening_hours?: Json | null
          pincode: string
          place_id?: string | null
          rank: number
          rating?: number | null
          score?: number | null
          source?: string
          user_ratings_total?: number | null
        }
        Update: {
          address?: string | null
          fetched_at?: string
          hours_fetched_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          open_now?: boolean | null
          opening_hours?: Json | null
          pincode?: string
          place_id?: string | null
          rank?: number
          rating?: number | null
          score?: number | null
          source?: string
          user_ratings_total?: number | null
        }
        Relationships: []
      }
      plan_enabled_metrics: {
        Row: {
          created_at: string | null
          fy_config_id: string
          id: string
          metric_id: string
          total_target: number | null
          unit_override: string | null
        }
        Insert: {
          created_at?: string | null
          fy_config_id: string
          id?: string
          metric_id: string
          total_target?: number | null
          unit_override?: string | null
        }
        Update: {
          created_at?: string | null
          fy_config_id?: string
          id?: string
          metric_id?: string
          total_target?: number | null
          unit_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_enabled_metrics_fy_config_id_fkey"
            columns: ["fy_config_id"]
            isOneToOne: false
            referencedRelation: "fy_target_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_enabled_metrics_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "target_metric_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_ai_insights: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          insight_type: string
          project_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          insight_type: string
          project_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          insight_type?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_ai_insights_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_ideas: {
        Row: {
          ai_evaluation: Json | null
          created_at: string
          description: string | null
          id: string
          priority: string | null
          project_id: string
          status: string
          submitted_by: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_evaluation?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string | null
          project_id: string
          status?: string
          submitted_by: string
          title: string
          updated_at?: string
        }
        Update: {
          ai_evaluation?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string | null
          project_id?: string
          status?: string
          submitted_by?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_ideas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_ideas_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_knowledge_documents: {
        Row: {
          created_at: string
          description: string | null
          document_name: string
          file_name: string | null
          file_url: string | null
          id: string
          project_id: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          document_name: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          project_id: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          description?: string | null
          document_name?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          project_id?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_knowledge_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_knowledge_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_milestones: {
        Row: {
          color: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean | null
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_members: {
        Row: {
          id: string
          joined_at: string
          project_id: string
          role: Database["public"]["Enums"]["pm_member_role"]
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          project_id: string
          role?: Database["public"]["Enums"]["pm_member_role"]
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          project_id?: string
          role?: Database["public"]["Enums"]["pm_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_resources: {
        Row: {
          budget_allocated: number | null
          cost_rate: number | null
          created_at: string
          deployment_type: string
          id: string
          project_id: string
          release_date: string | null
          role: string
          selling_rate: number | null
          start_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_allocated?: number | null
          cost_rate?: number | null
          created_at?: string
          deployment_type?: string
          id?: string
          project_id: string
          release_date?: string | null
          role?: string
          selling_rate?: number | null
          start_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_allocated?: number | null
          cost_rate?: number | null
          created_at?: string
          deployment_type?: string
          id?: string
          project_id?: string
          release_date?: string | null
          role?: string
          selling_rate?: number | null
          start_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_resources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_project_resources_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_projects: {
        Row: {
          budget: number | null
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          estimated_hours: number | null
          id: string
          is_template: boolean | null
          logged_hours: number | null
          name: string
          owner_id: string | null
          priority: Database["public"]["Enums"]["pm_priority"]
          source_template_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["pm_project_status"]
          template_name: string | null
          updated_at: string
        }
        Insert: {
          budget?: number | null
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_template?: boolean | null
          logged_hours?: number | null
          name: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["pm_priority"]
          source_template_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["pm_project_status"]
          template_name?: string | null
          updated_at?: string
        }
        Update: {
          budget?: number | null
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_template?: boolean | null
          logged_hours?: number | null
          name?: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["pm_priority"]
          source_template_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["pm_project_status"]
          template_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_projects_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "pm_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_risks: {
        Row: {
          ai_generated: boolean | null
          created_at: string
          description: string | null
          id: string
          impact: string | null
          mitigation_plan: string | null
          owner_id: string | null
          probability: string | null
          project_id: string
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          impact?: string | null
          mitigation_plan?: string | null
          owner_id?: string | null
          probability?: string | null
          project_id: string
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          impact?: string | null
          mitigation_plan?: string | null
          owner_id?: string | null
          probability?: string | null
          project_id?: string
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_risks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_risks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_sections: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          position: number
          project_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_sprints: {
        Row: {
          created_at: string
          end_date: string | null
          goal: string | null
          id: string
          name: string
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["pm_sprint_status"]
          updated_at: string
          velocity: number | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          goal?: string | null
          id?: string
          name: string
          project_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["pm_sprint_status"]
          updated_at?: string
          velocity?: number | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          goal?: string | null
          id?: string
          name?: string
          project_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["pm_sprint_status"]
          updated_at?: string
          velocity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_support_requests: {
        Row: {
          ai_suggestion: string | null
          created_at: string
          description: string | null
          id: string
          priority: string | null
          project_id: string
          requested_by: string
          resolution_notes: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_suggestion?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string | null
          project_id: string
          requested_by: string
          resolution_notes?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          ai_suggestion?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string | null
          project_id?: string
          requested_by?: string
          resolution_notes?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_support_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_support_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          note: string | null
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          note?: string | null
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          note?: string | null
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_task_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_collaborators: {
        Row: {
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_task_collaborators_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_task_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_task_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_dependencies: {
        Row: {
          created_at: string
          dependency_type: string | null
          depends_on_task_id: string
          id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          dependency_type?: string | null
          depends_on_task_id: string
          id?: string
          task_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: string | null
          depends_on_task_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_templates: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          estimated_hours: number | null
          id: string
          priority: Database["public"]["Enums"]["pm_priority"]
          project_template_id: string | null
          sort_order: number | null
          tags: string[] | null
          title: string
          type: Database["public"]["Enums"]["pm_task_type"]
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          estimated_hours?: number | null
          id?: string
          priority?: Database["public"]["Enums"]["pm_priority"]
          project_template_id?: string | null
          sort_order?: number | null
          tags?: string[] | null
          title: string
          type?: Database["public"]["Enums"]["pm_task_type"]
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          estimated_hours?: number | null
          id?: string
          priority?: Database["public"]["Enums"]["pm_priority"]
          project_template_id?: string | null
          sort_order?: number | null
          tags?: string[] | null
          title?: string
          type?: Database["public"]["Enums"]["pm_task_type"]
        }
        Relationships: [
          {
            foreignKeyName: "pm_task_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_task_templates_project_template_id_fkey"
            columns: ["project_template_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_tasks: {
        Row: {
          assignee_id: string | null
          block_reason: string | null
          collaborator_id: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          is_blocked: boolean | null
          logged_hours: number | null
          milestone_id: string | null
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["pm_priority"]
          project_id: string
          reporter_id: string | null
          section_id: string | null
          sort_order: number | null
          sprint_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["pm_task_status"]
          story_points: number | null
          tags: string[] | null
          title: string
          type: Database["public"]["Enums"]["pm_task_type"]
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          block_reason?: string | null
          collaborator_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_blocked?: boolean | null
          logged_hours?: number | null
          milestone_id?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["pm_priority"]
          project_id: string
          reporter_id?: string | null
          section_id?: string | null
          sort_order?: number | null
          sprint_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["pm_task_status"]
          story_points?: number | null
          tags?: string[] | null
          title: string
          type?: Database["public"]["Enums"]["pm_task_type"]
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          block_reason?: string | null
          collaborator_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_blocked?: boolean | null
          logged_hours?: number | null
          milestone_id?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["pm_priority"]
          project_id?: string
          reporter_id?: string | null
          section_id?: string | null
          sort_order?: number | null
          sprint_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["pm_task_status"]
          story_points?: number | null
          tags?: string[] | null
          title?: string
          type?: Database["public"]["Enums"]["pm_task_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "pm_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "pm_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "pm_sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_template_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          note: string | null
          task_id: string
          template_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          note?: string | null
          task_id: string
          template_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          note?: string | null
          task_id?: string
          template_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_template_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_template_attachments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pm_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_template_dependencies: {
        Row: {
          created_at: string
          dependency_type: string
          depends_on_task_id: string
          id: string
          task_id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id: string
          id?: string
          task_id: string
          template_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id?: string
          id?: string
          task_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_template_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "pm_template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_template_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_template_dependencies_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pm_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_template_sections: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
          template_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          template_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pm_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_template_tasks: {
        Row: {
          created_at: string
          description: string | null
          duration_days: number
          estimated_hours: number | null
          id: string
          parent_task_id: string | null
          priority: string
          section_id: string | null
          sort_order: number
          tags: string[] | null
          template_id: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_days?: number
          estimated_hours?: number | null
          id?: string
          parent_task_id?: string | null
          priority?: string
          section_id?: string | null
          sort_order?: number
          tags?: string[] | null
          template_id: string
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_days?: number
          estimated_hours?: number | null
          id?: string
          parent_task_id?: string | null
          priority?: string
          section_id?: string | null
          sort_order?: number
          tags?: string[] | null
          template_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_template_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "pm_template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_template_tasks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "pm_template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pm_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_templates: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pm_time_logs: {
        Row: {
          allocation: string
          created_at: string
          date: string
          description: string | null
          hours: number
          id: string
          project_id: string
          task_id: string
          user_id: string
          work_type: string | null
        }
        Insert: {
          allocation?: string
          created_at?: string
          date?: string
          description?: string | null
          hours: number
          id?: string
          project_id: string
          task_id: string
          user_id: string
          work_type?: string | null
        }
        Update: {
          allocation?: string
          created_at?: string
          date?: string
          description?: string | null
          hours?: number
          id?: string
          project_id?: string
          task_id?: string
          user_id?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_time_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_time_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_time_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_customers: {
        Row: {
          area: string | null
          city: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          area?: string | null
          city?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          area?: string | null
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      price_book_entries: {
        Row: {
          created_at: string
          discount_percent: number | null
          final_price: number
          id: string
          is_active: boolean | null
          list_price: number
          min_quantity: number | null
          price_book_id: string
          product_id: string
          uom: string | null
          uom_id: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          discount_percent?: number | null
          final_price?: number
          id?: string
          is_active?: boolean | null
          list_price?: number
          min_quantity?: number | null
          price_book_id: string
          product_id: string
          uom?: string | null
          uom_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          discount_percent?: number | null
          final_price?: number
          id?: string
          is_active?: boolean | null
          list_price?: number
          min_quantity?: number | null
          price_book_id?: string
          product_id?: string
          uom?: string | null
          uom_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_book_entries_price_book_id_fkey"
            columns: ["price_book_id"]
            isOneToOne: false
            referencedRelation: "price_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_book_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_book_entries_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_book_entries_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_books: {
        Row: {
          apply_to_all_territories: boolean | null
          cloned_from: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          description: string | null
          distributor_category: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          is_active: boolean | null
          is_standard: boolean | null
          name: string
          price_book_type: string
          target_type: string | null
          territory_id: string | null
          updated_at: string
        }
        Insert: {
          apply_to_all_territories?: boolean | null
          cloned_from?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          distributor_category?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          is_standard?: boolean | null
          name: string
          price_book_type?: string
          target_type?: string | null
          territory_id?: string | null
          updated_at?: string
        }
        Update: {
          apply_to_all_territories?: boolean | null
          cloned_from?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          distributor_category?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          is_standard?: boolean | null
          name?: string
          price_book_type?: string
          target_type?: string | null
          territory_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_books_cloned_from_fkey"
            columns: ["cloned_from"]
            isOneToOne: false
            referencedRelation: "price_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_books_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      primary_invoices: {
        Row: {
          created_at: string | null
          discount_amount: number
          distributor_id: string
          due_date: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          order_id: string
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          discount_amount?: number
          distributor_id: string
          due_date?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          order_id: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          discount_amount?: number
          distributor_id?: string
          due_date?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          order_id?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "primary_invoices_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primary_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "primary_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      primary_order_items: {
        Row: {
          approved_qty: number | null
          backorder_qty: number | null
          base_qty: number | null
          batch_number: string | null
          conversion_to_base: number | null
          created_at: string
          damaged_quantity: number | null
          discount_percent: number | null
          expiry_date: string | null
          id: string
          line_total: number
          order_id: string
          ordered_qty: number | null
          product_id: string
          product_name: string
          quantity: number
          received_quantity: number | null
          rejected_qty: number | null
          sku: string | null
          tax_percent: number | null
          unit: string
          unit_price: number
          uom_code: string | null
          uom_id: string | null
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          approved_qty?: number | null
          backorder_qty?: number | null
          base_qty?: number | null
          batch_number?: string | null
          conversion_to_base?: number | null
          created_at?: string
          damaged_quantity?: number | null
          discount_percent?: number | null
          expiry_date?: string | null
          id?: string
          line_total?: number
          order_id: string
          ordered_qty?: number | null
          product_id: string
          product_name: string
          quantity?: number
          received_quantity?: number | null
          rejected_qty?: number | null
          sku?: string | null
          tax_percent?: number | null
          unit?: string
          unit_price?: number
          uom_code?: string | null
          uom_id?: string | null
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          approved_qty?: number | null
          backorder_qty?: number | null
          base_qty?: number | null
          batch_number?: string | null
          conversion_to_base?: number | null
          created_at?: string
          damaged_quantity?: number | null
          discount_percent?: number | null
          expiry_date?: string | null
          id?: string
          line_total?: number
          order_id?: string
          ordered_qty?: number | null
          product_id?: string
          product_name?: string
          quantity?: number
          received_quantity?: number | null
          rejected_qty?: number | null
          sku?: string | null
          tax_percent?: number | null
          unit?: string
          unit_price?: number
          uom_code?: string | null
          uom_id?: string | null
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "primary_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "primary_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primary_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primary_order_items_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primary_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      primary_order_schemes: {
        Row: {
          applied_at: string | null
          discount_amount: number | null
          free_product_name: string | null
          free_quantity: number | null
          id: string
          order_id: string
          scheme_id: string
          scheme_name: string
          scheme_type: string
        }
        Insert: {
          applied_at?: string | null
          discount_amount?: number | null
          free_product_name?: string | null
          free_quantity?: number | null
          id?: string
          order_id: string
          scheme_id: string
          scheme_name: string
          scheme_type: string
        }
        Update: {
          applied_at?: string | null
          discount_amount?: number | null
          free_product_name?: string | null
          free_quantity?: number | null
          id?: string
          order_id?: string
          scheme_id?: string
          scheme_name?: string
          scheme_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "primary_order_schemes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "primary_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primary_order_schemes_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "product_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      primary_order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "primary_order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "primary_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      primary_orders: {
        Row: {
          actual_delivery_date: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by_user_id: string | null
          discount_amount: number
          dispatch_reference: string | null
          dispatched_at: string | null
          distributor_id: string
          expected_delivery_date: string | null
          id: string
          is_backorder: boolean | null
          notes: string | null
          order_date: string
          order_number: string
          packing_list_id: string | null
          parent_order_id: string | null
          payment_status: string
          payment_terms: string | null
          shipping_address: string | null
          source_distributor_id: string
          status: string
          subtotal: number
          target_distributor_id: string | null
          tax_amount: number
          total_amount: number
          transporter_name: string | null
          updated_at: string
          vehicle_number: string | null
        }
        Insert: {
          actual_delivery_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by_user_id?: string | null
          discount_amount?: number
          dispatch_reference?: string | null
          dispatched_at?: string | null
          distributor_id: string
          expected_delivery_date?: string | null
          id?: string
          is_backorder?: boolean | null
          notes?: string | null
          order_date?: string
          order_number: string
          packing_list_id?: string | null
          parent_order_id?: string | null
          payment_status?: string
          payment_terms?: string | null
          shipping_address?: string | null
          source_distributor_id: string
          status?: string
          subtotal?: number
          target_distributor_id?: string | null
          tax_amount?: number
          total_amount?: number
          transporter_name?: string | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Update: {
          actual_delivery_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by_user_id?: string | null
          discount_amount?: number
          dispatch_reference?: string | null
          dispatched_at?: string | null
          distributor_id?: string
          expected_delivery_date?: string | null
          id?: string
          is_backorder?: boolean | null
          notes?: string | null
          order_date?: string
          order_number?: string
          packing_list_id?: string | null
          parent_order_id?: string | null
          payment_status?: string
          payment_terms?: string | null
          shipping_address?: string | null
          source_distributor_id?: string
          status?: string
          subtotal?: number
          target_distributor_id?: string | null
          tax_amount?: number
          total_amount?: number
          transporter_name?: string | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "primary_orders_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primary_orders_packing_list_id_fkey"
            columns: ["packing_list_id"]
            isOneToOne: false
            referencedRelation: "packing_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primary_orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "primary_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primary_orders_source_distributor_id_fkey"
            columns: ["source_distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primary_orders_target_distributor_id_fkey"
            columns: ["target_distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      primary_return_items: {
        Row: {
          batch_number: string | null
          condition: string | null
          created_at: string | null
          id: string
          product_id: string
          product_name: string
          quantity: number
          return_note_id: string
          return_reason: string
          unit: string
          unit_price: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          batch_number?: string | null
          condition?: string | null
          created_at?: string | null
          id?: string
          product_id: string
          product_name: string
          quantity?: number
          return_note_id: string
          return_reason: string
          unit?: string
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          batch_number?: string | null
          condition?: string | null
          created_at?: string | null
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          return_note_id?: string
          return_reason?: string
          unit?: string
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "primary_return_items_return_note_id_fkey"
            columns: ["return_note_id"]
            isOneToOne: false
            referencedRelation: "primary_return_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      primary_return_notes: {
        Row: {
          created_at: string | null
          distributor_id: string
          grn_id: string | null
          id: string
          notes: string | null
          order_id: string | null
          return_date: string
          return_number: string
          status: string
          total_return_value: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          distributor_id: string
          grn_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          return_date?: string
          return_number: string
          status?: string
          total_return_value?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          distributor_id?: string
          grn_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          return_date?: string
          return_number?: string
          status?: string
          total_return_value?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "primary_return_notes_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primary_return_notes_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primary_return_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "primary_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      primary_shipments: {
        Row: {
          actual_delivery_date: string | null
          created_at: string | null
          dispatch_date: string | null
          dispatch_warehouse: string | null
          distributor_id: string
          driver_name: string | null
          driver_phone: string | null
          expected_delivery_date: string | null
          id: string
          invoice_id: string | null
          lr_number: string | null
          notes: string | null
          order_id: string
          shipment_number: string
          status: string
          tracking_url: string | null
          transporter_name: string | null
          updated_at: string | null
          vehicle_number: string | null
        }
        Insert: {
          actual_delivery_date?: string | null
          created_at?: string | null
          dispatch_date?: string | null
          dispatch_warehouse?: string | null
          distributor_id: string
          driver_name?: string | null
          driver_phone?: string | null
          expected_delivery_date?: string | null
          id?: string
          invoice_id?: string | null
          lr_number?: string | null
          notes?: string | null
          order_id: string
          shipment_number: string
          status?: string
          tracking_url?: string | null
          transporter_name?: string | null
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Update: {
          actual_delivery_date?: string | null
          created_at?: string | null
          dispatch_date?: string | null
          dispatch_warehouse?: string | null
          distributor_id?: string
          driver_name?: string | null
          driver_phone?: string | null
          expected_delivery_date?: string | null
          id?: string
          invoice_id?: string | null
          lr_number?: string | null
          notes?: string | null
          order_id?: string
          shipment_number?: string
          status?: string
          tracking_url?: string | null
          transporter_name?: string | null
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "primary_shipments_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primary_shipments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "primary_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primary_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "primary_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_price_list: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default_price: boolean
          notes: string | null
          product_id: string
          rate: number
          uom_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default_price?: boolean
          notes?: string | null
          product_id: string
          rate: number
          uom_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default_price?: boolean
          notes?: string | null
          product_id?: string
          rate?: number
          uom_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_price_list_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_price_list_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["id"]
          },
        ]
      }
      product_schemes: {
        Row: {
          ai_suggestion_id: string | null
          applicability_type: string | null
          bundle_discount_amount: number | null
          bundle_discount_percentage: number | null
          bundle_product_ids: string[] | null
          buy_quantity: number | null
          buy_quantity_unit: string | null
          category_id: string | null
          condition_quantity: number | null
          created_at: string
          current_usage_count: number | null
          description: string | null
          discount_amount: number | null
          discount_percentage: number | null
          discount_unit: string | null
          discount_value_type: string | null
          end_date: string | null
          exclusion_group: string | null
          free_product_id: string | null
          free_quantity: number | null
          free_quantity_unit: string | null
          id: string
          is_active: boolean | null
          is_first_order_only: boolean | null
          max_discount_per_unit: number | null
          max_usage_count: number | null
          min_order_value: number | null
          name: string
          per_product_discounts: Json | null
          priority: number | null
          product_id: string | null
          quantity_condition_type: string | null
          scheme_type: string
          show_in_portal: boolean | null
          source: string | null
          start_date: string | null
          target_product_ids: string[] | null
          tier_data: Json | null
          updated_at: string
          validity_days: number | null
          variant_id: string | null
        }
        Insert: {
          ai_suggestion_id?: string | null
          applicability_type?: string | null
          bundle_discount_amount?: number | null
          bundle_discount_percentage?: number | null
          bundle_product_ids?: string[] | null
          buy_quantity?: number | null
          buy_quantity_unit?: string | null
          category_id?: string | null
          condition_quantity?: number | null
          created_at?: string
          current_usage_count?: number | null
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          discount_unit?: string | null
          discount_value_type?: string | null
          end_date?: string | null
          exclusion_group?: string | null
          free_product_id?: string | null
          free_quantity?: number | null
          free_quantity_unit?: string | null
          id?: string
          is_active?: boolean | null
          is_first_order_only?: boolean | null
          max_discount_per_unit?: number | null
          max_usage_count?: number | null
          min_order_value?: number | null
          name: string
          per_product_discounts?: Json | null
          priority?: number | null
          product_id?: string | null
          quantity_condition_type?: string | null
          scheme_type?: string
          show_in_portal?: boolean | null
          source?: string | null
          start_date?: string | null
          target_product_ids?: string[] | null
          tier_data?: Json | null
          updated_at?: string
          validity_days?: number | null
          variant_id?: string | null
        }
        Update: {
          ai_suggestion_id?: string | null
          applicability_type?: string | null
          bundle_discount_amount?: number | null
          bundle_discount_percentage?: number | null
          bundle_product_ids?: string[] | null
          buy_quantity?: number | null
          buy_quantity_unit?: string | null
          category_id?: string | null
          condition_quantity?: number | null
          created_at?: string
          current_usage_count?: number | null
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          discount_unit?: string | null
          discount_value_type?: string | null
          end_date?: string | null
          exclusion_group?: string | null
          free_product_id?: string | null
          free_quantity?: number | null
          free_quantity_unit?: string | null
          id?: string
          is_active?: boolean | null
          is_first_order_only?: boolean | null
          max_discount_per_unit?: number | null
          max_usage_count?: number | null
          min_order_value?: number | null
          name?: string
          per_product_discounts?: Json | null
          priority?: number | null
          product_id?: string | null
          quantity_condition_type?: string | null
          scheme_type?: string
          show_in_portal?: boolean | null
          source?: string | null
          start_date?: string | null
          target_product_ids?: string[] | null
          tier_data?: Json | null
          updated_at?: string
          validity_days?: number | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_schemes_ai_suggestion_id_fkey"
            columns: ["ai_suggestion_id"]
            isOneToOne: false
            referencedRelation: "ai_scheme_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_schemes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_schemes_free_product_id_fkey"
            columns: ["free_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_schemes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_schemes_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_uom_mapping: {
        Row: {
          conversion_to_base: number
          created_at: string
          id: string
          is_active: boolean
          is_base: boolean
          is_default_purchase: boolean
          is_default_sales: boolean
          is_price_basis: boolean
          product_id: string
          uom_id: string
          updated_at: string
        }
        Insert: {
          conversion_to_base: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_base?: boolean
          is_default_purchase?: boolean
          is_default_sales?: boolean
          is_price_basis?: boolean
          product_id: string
          uom_id: string
          updated_at?: string
        }
        Update: {
          conversion_to_base?: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_base?: boolean
          is_default_purchase?: boolean
          is_default_sales?: boolean
          is_price_basis?: boolean
          product_id?: string
          uom_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_uom_mapping_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_uom_mapping_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          barcode_image_url: string | null
          created_at: string
          discount_amount: number | null
          discount_percentage: number | null
          focused_due_date: string | null
          focused_recurring_config: Json | null
          focused_target_quantity: number | null
          focused_territories: string[] | null
          focused_type: string | null
          hsn_code: string | null
          id: string
          is_active: boolean | null
          is_focused_product: boolean | null
          price: number
          product_id: string
          qr_code: string | null
          sku: string
          stock_quantity: number
          updated_at: string
          variant_name: string
        }
        Insert: {
          barcode?: string | null
          barcode_image_url?: string | null
          created_at?: string
          discount_amount?: number | null
          discount_percentage?: number | null
          focused_due_date?: string | null
          focused_recurring_config?: Json | null
          focused_target_quantity?: number | null
          focused_territories?: string[] | null
          focused_type?: string | null
          hsn_code?: string | null
          id?: string
          is_active?: boolean | null
          is_focused_product?: boolean | null
          price?: number
          product_id: string
          qr_code?: string | null
          sku: string
          stock_quantity?: number
          updated_at?: string
          variant_name: string
        }
        Update: {
          barcode?: string | null
          barcode_image_url?: string | null
          created_at?: string
          discount_amount?: number | null
          discount_percentage?: number | null
          focused_due_date?: string | null
          focused_recurring_config?: Json | null
          focused_target_quantity?: number | null
          focused_territories?: string[] | null
          focused_type?: string | null
          hsn_code?: string | null
          id?: string
          is_active?: boolean | null
          is_focused_product?: boolean | null
          price?: number
          product_id?: string
          qr_code?: string | null
          sku?: string
          stock_quantity?: number
          updated_at?: string
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          barcode_image_url: string | null
          base_unit_category: string | null
          brand: string | null
          category_id: string | null
          closing_stock: number | null
          conversion_factor: number | null
          created_at: string
          default_purchase_uom_id: string | null
          default_sales_uom_id: string | null
          description: string | null
          focused_due_date: string | null
          focused_recurring_config: Json | null
          focused_target_quantity: number | null
          focused_territories: string[] | null
          focused_type: string | null
          gst_percentage: number | null
          hsn_code: string | null
          id: string
          is_active: boolean | null
          is_focused_product: boolean | null
          name: string
          net_volume_ml: number | null
          net_weight_g: number | null
          opening_stock: number | null
          price_basis_uom_id: string | null
          product_number: string | null
          qr_code: string | null
          rate: number
          reorder_level: number | null
          sku: string
          sku_image_url: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          barcode_image_url?: string | null
          base_unit_category?: string | null
          brand?: string | null
          category_id?: string | null
          closing_stock?: number | null
          conversion_factor?: number | null
          created_at?: string
          default_purchase_uom_id?: string | null
          default_sales_uom_id?: string | null
          description?: string | null
          focused_due_date?: string | null
          focused_recurring_config?: Json | null
          focused_target_quantity?: number | null
          focused_territories?: string[] | null
          focused_type?: string | null
          gst_percentage?: number | null
          hsn_code?: string | null
          id?: string
          is_active?: boolean | null
          is_focused_product?: boolean | null
          name: string
          net_volume_ml?: number | null
          net_weight_g?: number | null
          opening_stock?: number | null
          price_basis_uom_id?: string | null
          product_number?: string | null
          qr_code?: string | null
          rate?: number
          reorder_level?: number | null
          sku: string
          sku_image_url?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          barcode_image_url?: string | null
          base_unit_category?: string | null
          brand?: string | null
          category_id?: string | null
          closing_stock?: number | null
          conversion_factor?: number | null
          created_at?: string
          default_purchase_uom_id?: string | null
          default_sales_uom_id?: string | null
          description?: string | null
          focused_due_date?: string | null
          focused_recurring_config?: Json | null
          focused_target_quantity?: number | null
          focused_territories?: string[] | null
          focused_type?: string | null
          gst_percentage?: number | null
          hsn_code?: string | null
          id?: string
          is_active?: boolean | null
          is_focused_product?: boolean | null
          name?: string
          net_volume_ml?: number | null
          net_weight_g?: number | null
          opening_stock?: number | null
          price_basis_uom_id?: string | null
          product_number?: string | null
          qr_code?: string | null
          rate?: number
          reorder_level?: number | null
          sku?: string
          sku_image_url?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_default_purchase_uom_id_fkey"
            columns: ["default_purchase_uom_id"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_default_sales_uom_id_fkey"
            columns: ["default_sales_uom_id"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_price_basis_uom_id_fkey"
            columns: ["price_basis_uom_id"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_attachments: {
        Row: {
          attached_by: string
          created_at: string
          description: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attached_by: string
          created_at?: string
          description?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attached_by?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_object_permissions: {
        Row: {
          can_create: boolean | null
          can_delete: boolean | null
          can_edit: boolean | null
          can_modify_all: boolean | null
          can_read: boolean | null
          can_view_all: boolean | null
          created_at: string | null
          id: string
          object_name: string
          parent_module: string | null
          permission_type: string
          profile_id: string | null
        }
        Insert: {
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_modify_all?: boolean | null
          can_read?: boolean | null
          can_view_all?: boolean | null
          created_at?: string | null
          id?: string
          object_name: string
          parent_module?: string | null
          permission_type?: string
          profile_id?: string | null
        }
        Update: {
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_modify_all?: boolean | null
          can_read?: boolean | null
          can_view_all?: boolean | null
          created_at?: string | null
          id?: string
          object_name?: string
          parent_module?: string | null
          permission_type?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_object_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "security_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          anniversary_date: string | null
          aspirations: string | null
          created_at: string
          current_address: string | null
          date_of_birth: string | null
          designation: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          facebook_url: string | null
          full_name: string
          hint_answer: string | null
          hint_question: string | null
          id: string
          instagram_url: string | null
          interests: string[] | null
          invitation_token: string | null
          is_active: boolean
          learning_goals: string[] | null
          linkedin_url: string | null
          must_change_password: boolean | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          permanent_address: string | null
          phone_number: string | null
          preferred_language: string | null
          profile_picture_url: string | null
          recovery_email: string | null
          role_id: string | null
          territories_covered: string[] | null
          twitter_url: string | null
          updated_at: string
          user_status: Database["public"]["Enums"]["user_status"] | null
          username: string
          work_location: string | null
        }
        Insert: {
          anniversary_date?: string | null
          aspirations?: string | null
          created_at?: string
          current_address?: string | null
          date_of_birth?: string | null
          designation?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          facebook_url?: string | null
          full_name: string
          hint_answer?: string | null
          hint_question?: string | null
          id: string
          instagram_url?: string | null
          interests?: string[] | null
          invitation_token?: string | null
          is_active?: boolean
          learning_goals?: string[] | null
          linkedin_url?: string | null
          must_change_password?: boolean | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          permanent_address?: string | null
          phone_number?: string | null
          preferred_language?: string | null
          profile_picture_url?: string | null
          recovery_email?: string | null
          role_id?: string | null
          territories_covered?: string[] | null
          twitter_url?: string | null
          updated_at?: string
          user_status?: Database["public"]["Enums"]["user_status"] | null
          username: string
          work_location?: string | null
        }
        Update: {
          anniversary_date?: string | null
          aspirations?: string | null
          created_at?: string
          current_address?: string | null
          date_of_birth?: string | null
          designation?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          facebook_url?: string | null
          full_name?: string
          hint_answer?: string | null
          hint_question?: string | null
          id?: string
          instagram_url?: string | null
          interests?: string[] | null
          invitation_token?: string | null
          is_active?: boolean
          learning_goals?: string[] | null
          linkedin_url?: string | null
          must_change_password?: boolean | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          permanent_address?: string | null
          phone_number?: string | null
          preferred_language?: string | null
          profile_picture_url?: string | null
          recovery_email?: string | null
          role_id?: string | null
          territories_covered?: string[] | null
          twitter_url?: string | null
          updated_at?: string
          user_status?: Database["public"]["Enums"]["user_status"] | null
          username?: string
          work_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "role_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_content_execution_log: {
        Row: {
          created_at: string
          error_message: string | null
          execution_time: string
          id: string
          metadata: Json | null
          post_id: string | null
          status: string
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          execution_time?: string
          id?: string
          metadata?: Json | null
          post_id?: string | null
          status: string
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          execution_time?: string
          id?: string
          metadata?: Json | null
          post_id?: string | null
          status?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_content_execution_log_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_content_execution_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "push_content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      push_content_posts: {
        Row: {
          content: string
          generated_data: Json | null
          id: string
          is_published: boolean | null
          posted_at: string | null
          subscription_id: string | null
          template_id: string
          user_id: string
        }
        Insert: {
          content: string
          generated_data?: Json | null
          id?: string
          is_published?: boolean | null
          posted_at?: string | null
          subscription_id?: string | null
          template_id: string
          user_id: string
        }
        Update: {
          content?: string
          generated_data?: Json | null
          id?: string
          is_published?: boolean | null
          posted_at?: string | null
          subscription_id?: string | null
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_content_posts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_push_content_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_content_posts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "push_content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      push_content_templates: {
        Row: {
          content_structure: Json
          created_at: string | null
          created_by: string | null
          default_schedule_time: string | null
          description: string | null
          id: string
          is_active: boolean | null
          template_name: string
          template_type: string
          updated_at: string | null
        }
        Insert: {
          content_structure: Json
          created_at?: string | null
          created_by?: string | null
          default_schedule_time?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          template_name: string
          template_type: string
          updated_at?: string | null
        }
        Update: {
          content_structure?: Json
          created_at?: string | null
          created_by?: string | null
          default_schedule_time?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          template_name?: string
          template_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      recommendation_feedback: {
        Row: {
          created_at: string | null
          feedback_note: string | null
          feedback_type: string
          id: string
          recommendation_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          feedback_note?: string | null
          feedback_type: string
          id?: string
          recommendation_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          feedback_note?: string | null
          feedback_type?: string
          id?: string
          recommendation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_feedback_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          entity_id: string | null
          entity_name: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          reasoning: string | null
          recommendation_data: Json
          recommendation_type: string
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reasoning?: string | null
          recommendation_data: Json
          recommendation_type: string
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reasoning?: string | null
          recommendation_data?: Json
          recommendation_type?: string
          user_id?: string
        }
        Relationships: []
      }
      recycle_bin: {
        Row: {
          created_at: string
          deleted_at: string
          deleted_by: string
          id: string
          module_name: string
          original_id: string
          original_table: string
          record_data: Json
          record_name: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string
          deleted_by: string
          id?: string
          module_name: string
          original_id: string
          original_table: string
          record_data: Json
          record_name?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string
          deleted_by?: string
          id?: string
          module_name?: string
          original_id?: string
          original_table?: string
          record_data?: Json
          record_name?: string | null
        }
        Relationships: []
      }
      recycle_bin_config: {
        Row: {
          auto_delete_days: number | null
          created_at: string
          id: string
          is_enabled: boolean | null
          require_confirmation: boolean | null
          show_deletion_log_to_users: boolean | null
          updated_at: string
        }
        Insert: {
          auto_delete_days?: number | null
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          require_confirmation?: boolean | null
          show_deletion_log_to_users?: boolean | null
          updated_at?: string
        }
        Update: {
          auto_delete_days?: number | null
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          require_confirmation?: boolean | null
          show_deletion_log_to_users?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      regularization_policy: {
        Row: {
          adjust_leave_balance: boolean
          allow_checkin_edit: boolean
          allow_checkout_edit: boolean
          allow_previous_month: boolean
          allow_status_edit: boolean
          approval_mode: string
          created_at: string
          daily_limit: number
          id: string
          is_enabled: boolean
          max_backdate_days: number
          monthly_limit: number | null
          reason_mandatory: boolean
          recalculate_hours: boolean
          restrict_after_payroll_lock: boolean
          update_attendance_on_approval: boolean
          updated_at: string
        }
        Insert: {
          adjust_leave_balance?: boolean
          allow_checkin_edit?: boolean
          allow_checkout_edit?: boolean
          allow_previous_month?: boolean
          allow_status_edit?: boolean
          approval_mode?: string
          created_at?: string
          daily_limit?: number
          id?: string
          is_enabled?: boolean
          max_backdate_days?: number
          monthly_limit?: number | null
          reason_mandatory?: boolean
          recalculate_hours?: boolean
          restrict_after_payroll_lock?: boolean
          update_attendance_on_approval?: boolean
          updated_at?: string
        }
        Update: {
          adjust_leave_balance?: boolean
          allow_checkin_edit?: boolean
          allow_checkout_edit?: boolean
          allow_previous_month?: boolean
          allow_status_edit?: boolean
          approval_mode?: string
          created_at?: string
          daily_limit?: number
          id?: string
          is_enabled?: boolean
          max_backdate_days?: number
          monthly_limit?: number | null
          reason_mandatory?: boolean
          recalculate_hours?: boolean
          restrict_after_payroll_lock?: boolean
          update_attendance_on_approval?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      regularization_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attendance_date: string
          created_at: string
          current_check_in_time: string | null
          current_check_out_time: string | null
          id: string
          reason: string
          rejection_reason: string | null
          requested_check_in_time: string | null
          requested_check_out_time: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_date: string
          created_at?: string
          current_check_in_time?: string | null
          current_check_out_time?: string | null
          id?: string
          reason: string
          rejection_reason?: string | null
          requested_check_in_time?: string | null
          requested_check_out_time?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_date?: string
          created_at?: string
          current_check_in_time?: string | null
          current_check_out_time?: string | null
          id?: string
          reason?: string
          rejection_reason?: string | null
          requested_check_in_time?: string | null
          requested_check_out_time?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      retailer_audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          retailer_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          retailer_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          retailer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retailer_audit_log_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_beat_assignments: {
        Row: {
          assigned_by: string | null
          assigned_from: string
          assigned_to: string | null
          beat_id: string
          beat_name: string | null
          created_at: string
          id: string
          is_current: boolean
          removed_by: string | null
          retailer_id: string
          transfer_reason: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_by?: string | null
          assigned_from?: string
          assigned_to?: string | null
          beat_id: string
          beat_name?: string | null
          created_at?: string
          id?: string
          is_current?: boolean
          removed_by?: string | null
          retailer_id: string
          transfer_reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_by?: string | null
          assigned_from?: string
          assigned_to?: string | null
          beat_id?: string
          beat_name?: string | null
          created_at?: string
          id?: string
          is_current?: boolean
          removed_by?: string | null
          retailer_id?: string
          transfer_reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      retailer_beat_transfer_history: {
        Row: {
          created_at: string
          from_beat_id: string
          from_beat_name: string
          id: string
          retailer_id: string
          retailer_name: string
          to_beat_id: string
          to_beat_name: string
          transferred_at: string
          transferred_by: string
        }
        Insert: {
          created_at?: string
          from_beat_id: string
          from_beat_name: string
          id?: string
          retailer_id: string
          retailer_name: string
          to_beat_id: string
          to_beat_name: string
          transferred_at?: string
          transferred_by: string
        }
        Update: {
          created_at?: string
          from_beat_id?: string
          from_beat_name?: string
          id?: string
          retailer_id?: string
          retailer_name?: string
          to_beat_id?: string
          to_beat_name?: string
          transferred_at?: string
          transferred_by?: string
        }
        Relationships: []
      }
      retailer_change_requests: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          created_at: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          reason: string | null
          requested_at: string
          requested_by: string | null
          requested_by_name: string | null
          retailer_id: string
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          requested_at?: string
          requested_by?: string | null
          requested_by_name?: string | null
          retailer_id: string
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          requested_at?: string
          requested_by?: string | null
          requested_by_name?: string | null
          retailer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retailer_change_requests_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_creation_points: {
        Row: {
          activity: string
          awarded_at: string
          id: string
          points: number
          retailer_id: string
          reversal_reason: string | null
          reversed: boolean
          reversed_at: string | null
          user_id: string
        }
        Insert: {
          activity: string
          awarded_at?: string
          id?: string
          points: number
          retailer_id: string
          reversal_reason?: string | null
          reversed?: boolean
          reversed_at?: string | null
          user_id: string
        }
        Update: {
          activity?: string
          awarded_at?: string
          id?: string
          points?: number
          retailer_id?: string
          reversal_reason?: string | null
          reversed?: boolean
          reversed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retailer_creation_points_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_credit_scores: {
        Row: {
          avg_dso: number | null
          avg_growth_rate: number | null
          avg_order_frequency: number | null
          calculated_at: string | null
          created_at: string | null
          credit_limit: number
          growth_rate_score: number | null
          id: string
          last_month_revenue: number | null
          order_frequency_score: number | null
          repayment_dso_score: number | null
          retailer_id: string
          score: number
          score_type: string
          updated_at: string | null
        }
        Insert: {
          avg_dso?: number | null
          avg_growth_rate?: number | null
          avg_order_frequency?: number | null
          calculated_at?: string | null
          created_at?: string | null
          credit_limit?: number
          growth_rate_score?: number | null
          id?: string
          last_month_revenue?: number | null
          order_frequency_score?: number | null
          repayment_dso_score?: number | null
          retailer_id: string
          score: number
          score_type?: string
          updated_at?: string | null
        }
        Update: {
          avg_dso?: number | null
          avg_growth_rate?: number | null
          avg_order_frequency?: number | null
          calculated_at?: string | null
          created_at?: string | null
          credit_limit?: number
          growth_rate_score?: number | null
          id?: string
          last_month_revenue?: number | null
          order_frequency_score?: number | null
          repayment_dso_score?: number | null
          retailer_id?: string
          score?: number
          score_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_credit_scores_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: true
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_external_db: {
        Row: {
          address: string | null
          category: string | null
          city: string
          company_name: string
          converted_retailer_id: string | null
          email: string | null
          id: number
          is_converted: boolean
          latitude: number | null
          longitude: number | null
          match_breakdown: Json | null
          match_score: number | null
          mobile: string | null
          pincode: string | null
          source: string | null
          state: string
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          city: string
          company_name: string
          converted_retailer_id?: string | null
          email?: string | null
          id?: never
          is_converted?: boolean
          latitude?: number | null
          longitude?: number | null
          match_breakdown?: Json | null
          match_score?: number | null
          mobile?: string | null
          pincode?: string | null
          source?: string | null
          state: string
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          city?: string
          company_name?: string
          converted_retailer_id?: string | null
          email?: string | null
          id?: never
          is_converted?: boolean
          latitude?: number | null
          longitude?: number | null
          match_breakdown?: Json | null
          match_score?: number | null
          mobile?: string | null
          pincode?: string | null
          source?: string | null
          state?: string
          website?: string | null
        }
        Relationships: []
      }
      retailer_external_unsorted: {
        Row: {
          address: string | null
          address_confidence: string | null
          category: string | null
          city: string
          company_name: string
          converted_retailer_id: string | null
          district: string | null
          email: string | null
          id: number
          is_converted: boolean
          latitude: number | null
          longitude: number | null
          match_breakdown: Json | null
          match_score: number | null
          mobile: string | null
          pincode: string | null
          state: string
          village: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          address_confidence?: string | null
          category?: string | null
          city: string
          company_name: string
          converted_retailer_id?: string | null
          district?: string | null
          email?: string | null
          id?: number
          is_converted?: boolean
          latitude?: number | null
          longitude?: number | null
          match_breakdown?: Json | null
          match_score?: number | null
          mobile?: string | null
          pincode?: string | null
          state: string
          village?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          address_confidence?: string | null
          category?: string | null
          city?: string
          company_name?: string
          converted_retailer_id?: string | null
          district?: string | null
          email?: string | null
          id?: number
          is_converted?: boolean
          latitude?: number | null
          longitude?: number | null
          match_breakdown?: Json | null
          match_score?: number | null
          mobile?: string | null
          pincode?: string | null
          state?: string
          village?: string | null
          website?: string | null
        }
        Relationships: []
      }
      retailer_feedback: {
        Row: {
          comments: string | null
          consumer_satisfaction: number | null
          created_at: string
          feedback_date: string | null
          feedback_type: string
          id: string
          product_packaging: number | null
          product_placement: number | null
          product_quality: number | null
          product_sku_range: number | null
          rating: number | null
          retailer_id: string
          score: number | null
          summary_notes: string | null
          updated_at: string
          user_id: string
          visit_id: string | null
        }
        Insert: {
          comments?: string | null
          consumer_satisfaction?: number | null
          created_at?: string
          feedback_date?: string | null
          feedback_type: string
          id?: string
          product_packaging?: number | null
          product_placement?: number | null
          product_quality?: number | null
          product_sku_range?: number | null
          rating?: number | null
          retailer_id: string
          score?: number | null
          summary_notes?: string | null
          updated_at?: string
          user_id: string
          visit_id?: string | null
        }
        Update: {
          comments?: string | null
          consumer_satisfaction?: number | null
          created_at?: string
          feedback_date?: string | null
          feedback_type?: string
          id?: string
          product_packaging?: number | null
          product_placement?: number | null
          product_quality?: number | null
          product_sku_range?: number | null
          rating?: number | null
          retailer_id?: string
          score?: number | null
          summary_notes?: string | null
          updated_at?: string
          user_id?: string
          visit_id?: string | null
        }
        Relationships: []
      }
      retailer_gift_redemptions: {
        Row: {
          created_at: string | null
          delivery_address: string | null
          fulfillment_notes: string | null
          gift_id: string | null
          id: string
          points_redeemed: number
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          requested_at: string | null
          retailer_id: string
          status: string | null
          subscription_id: string | null
          updated_at: string | null
          voucher_code: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_address?: string | null
          fulfillment_notes?: string | null
          gift_id?: string | null
          id?: string
          points_redeemed: number
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          retailer_id: string
          status?: string | null
          subscription_id?: string | null
          updated_at?: string | null
          voucher_code?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_address?: string | null
          fulfillment_notes?: string | null
          gift_id?: string | null
          id?: string
          points_redeemed?: number
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          retailer_id?: string
          status?: string | null
          subscription_id?: string | null
          updated_at?: string | null
          voucher_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_gift_redemptions_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "retailer_loyalty_gifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailer_gift_redemptions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "retailer_gift_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_gift_subscriptions: {
        Row: {
          achieved_at: string | null
          cancelled_at: string | null
          created_at: string | null
          gift_id: string | null
          id: string
          notes: string | null
          points_at_subscription: number | null
          progress_points: number | null
          retailer_id: string
          status: string | null
          subscribed_at: string | null
          target_date: string | null
          updated_at: string | null
        }
        Insert: {
          achieved_at?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          gift_id?: string | null
          id?: string
          notes?: string | null
          points_at_subscription?: number | null
          progress_points?: number | null
          retailer_id: string
          status?: string | null
          subscribed_at?: string | null
          target_date?: string | null
          updated_at?: string | null
        }
        Update: {
          achieved_at?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          gift_id?: string | null
          id?: string
          notes?: string | null
          points_at_subscription?: number | null
          progress_points?: number | null
          retailer_id?: string
          status?: string | null
          subscribed_at?: string | null
          target_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_gift_subscriptions_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "retailer_loyalty_gifts"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_loyalty_actions: {
        Row: {
          action_name: string
          action_type: string
          created_at: string | null
          id: string
          is_enabled: boolean | null
          metadata: Json | null
          points: number
          program_id: string
          target_config: Json | null
          updated_at: string | null
        }
        Insert: {
          action_name: string
          action_type: string
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          metadata?: Json | null
          points?: number
          program_id: string
          target_config?: Json | null
          updated_at?: string | null
        }
        Update: {
          action_name?: string
          action_type?: string
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          metadata?: Json | null
          points?: number
          program_id?: string
          target_config?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_loyalty_actions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "retailer_loyalty_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_loyalty_feedback: {
        Row: {
          action_id: string
          created_at: string
          feedback_date: string
          feedback_type: string
          fse_user_id: string
          id: string
        }
        Insert: {
          action_id: string
          created_at?: string
          feedback_date?: string
          feedback_type: string
          fse_user_id: string
          id?: string
        }
        Update: {
          action_id?: string
          created_at?: string
          feedback_date?: string
          feedback_type?: string
          fse_user_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retailer_loyalty_feedback_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "retailer_loyalty_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_loyalty_gifts: {
        Row: {
          cash_equivalent: number | null
          created_at: string | null
          description: string | null
          eligibility_criteria: Json | null
          gift_name: string
          gift_type: string
          id: string
          image_url: string | null
          is_active: boolean | null
          is_limited_stock: boolean | null
          minimum_monthly_orders: number | null
          minimum_order_value: number | null
          plan_id: string | null
          points_required: number
          sort_order: number | null
          stock_quantity: number | null
          target_description: string | null
          target_duration_months: number | null
          updated_at: string | null
        }
        Insert: {
          cash_equivalent?: number | null
          created_at?: string | null
          description?: string | null
          eligibility_criteria?: Json | null
          gift_name: string
          gift_type: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_limited_stock?: boolean | null
          minimum_monthly_orders?: number | null
          minimum_order_value?: number | null
          plan_id?: string | null
          points_required: number
          sort_order?: number | null
          stock_quantity?: number | null
          target_description?: string | null
          target_duration_months?: number | null
          updated_at?: string | null
        }
        Update: {
          cash_equivalent?: number | null
          created_at?: string | null
          description?: string | null
          eligibility_criteria?: Json | null
          gift_name?: string
          gift_type?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_limited_stock?: boolean | null
          minimum_monthly_orders?: number | null
          minimum_order_value?: number | null
          plan_id?: string | null
          points_required?: number
          sort_order?: number | null
          stock_quantity?: number | null
          target_description?: string | null
          target_duration_months?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_loyalty_gifts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "retailer_loyalty_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_loyalty_parameters: {
        Row: {
          award_period: string | null
          consecutive_required: number | null
          created_at: string | null
          description: string | null
          focused_categories: string[] | null
          focused_products: string[] | null
          frequency_days: number | null
          growth_percentage: number | null
          id: string
          is_enabled: boolean | null
          max_awards_per_period: number | null
          max_value: number | null
          metadata: Json | null
          min_value: number | null
          parameter_name: string
          parameter_type: string
          plan_id: string | null
          points: number
          qualifying_criteria: string | null
          target_value: number | null
          tier_config: Json | null
          updated_at: string | null
        }
        Insert: {
          award_period?: string | null
          consecutive_required?: number | null
          created_at?: string | null
          description?: string | null
          focused_categories?: string[] | null
          focused_products?: string[] | null
          frequency_days?: number | null
          growth_percentage?: number | null
          id?: string
          is_enabled?: boolean | null
          max_awards_per_period?: number | null
          max_value?: number | null
          metadata?: Json | null
          min_value?: number | null
          parameter_name: string
          parameter_type: string
          plan_id?: string | null
          points: number
          qualifying_criteria?: string | null
          target_value?: number | null
          tier_config?: Json | null
          updated_at?: string | null
        }
        Update: {
          award_period?: string | null
          consecutive_required?: number | null
          created_at?: string | null
          description?: string | null
          focused_categories?: string[] | null
          focused_products?: string[] | null
          frequency_days?: number | null
          growth_percentage?: number | null
          id?: string
          is_enabled?: boolean | null
          max_awards_per_period?: number | null
          max_value?: number | null
          metadata?: Json | null
          min_value?: number | null
          parameter_name?: string
          parameter_type?: string
          plan_id?: string | null
          points?: number
          qualifying_criteria?: string | null
          target_value?: number | null
          tier_config?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_loyalty_parameters_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "retailer_loyalty_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_loyalty_plans: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string
          id: string
          is_active: boolean | null
          is_all_territories: boolean | null
          plan_name: string
          points_to_rupee_conversion: number | null
          start_date: string
          territories: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          is_all_territories?: boolean | null
          plan_name: string
          points_to_rupee_conversion?: number | null
          start_date: string
          territories?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          is_all_territories?: boolean | null
          plan_name?: string
          points_to_rupee_conversion?: number | null
          start_date?: string
          territories?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      retailer_loyalty_points: {
        Row: {
          action_id: string
          awarded_by_user_id: string | null
          description: string | null
          earned_at: string | null
          id: string
          metadata: Json | null
          parameter_id: string | null
          points: number
          program_id: string
          reference_id: string | null
          reference_type: string | null
          retailer_id: string
          visit_id: string | null
        }
        Insert: {
          action_id: string
          awarded_by_user_id?: string | null
          description?: string | null
          earned_at?: string | null
          id?: string
          metadata?: Json | null
          parameter_id?: string | null
          points?: number
          program_id: string
          reference_id?: string | null
          reference_type?: string | null
          retailer_id: string
          visit_id?: string | null
        }
        Update: {
          action_id?: string
          awarded_by_user_id?: string | null
          description?: string | null
          earned_at?: string | null
          id?: string
          metadata?: Json | null
          parameter_id?: string | null
          points?: number
          program_id?: string
          reference_id?: string | null
          reference_type?: string | null
          retailer_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_loyalty_points_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "retailer_loyalty_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailer_loyalty_points_parameter_id_fkey"
            columns: ["parameter_id"]
            isOneToOne: false
            referencedRelation: "retailer_loyalty_parameters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailer_loyalty_points_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "retailer_loyalty_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailer_loyalty_points_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_loyalty_programs: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string
          id: string
          is_active: boolean | null
          is_all_territories: boolean | null
          points_to_rupee_conversion: number
          program_name: string
          start_date: string
          territories: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          is_all_territories?: boolean | null
          points_to_rupee_conversion?: number
          program_name: string
          start_date: string
          territories?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          is_all_territories?: boolean | null
          points_to_rupee_conversion?: number
          program_name?: string
          start_date?: string
          territories?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_loyalty_programs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_loyalty_redemptions: {
        Row: {
          created_at: string | null
          id: string
          points_redeemed: number
          processed_at: string | null
          processed_by: string | null
          program_id: string
          rejection_reason: string | null
          requested_at: string | null
          requested_by_user_id: string | null
          retailer_id: string
          status: string
          updated_at: string | null
          voucher_amount: number
          voucher_code: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          points_redeemed?: number
          processed_at?: string | null
          processed_by?: string | null
          program_id: string
          rejection_reason?: string | null
          requested_at?: string | null
          requested_by_user_id?: string | null
          retailer_id: string
          status?: string
          updated_at?: string | null
          voucher_amount?: number
          voucher_code?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          points_redeemed?: number
          processed_at?: string | null
          processed_by?: string | null
          program_id?: string
          rejection_reason?: string | null
          requested_at?: string | null
          requested_by_user_id?: string | null
          retailer_id?: string
          status?: string
          updated_at?: string | null
          voucher_amount?: number
          voucher_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_loyalty_redemptions_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailer_loyalty_redemptions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "retailer_loyalty_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailer_loyalty_redemptions_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_loyalty_reward_redemptions: {
        Row: {
          created_at: string | null
          delivery_address: string | null
          delivery_notes: string | null
          id: string
          points_redeemed: number
          processed_at: string | null
          processed_by: string | null
          program_id: string
          requested_at: string | null
          retailer_id: string
          reward_id: string
          status: string | null
          tracking_info: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_address?: string | null
          delivery_notes?: string | null
          id?: string
          points_redeemed: number
          processed_at?: string | null
          processed_by?: string | null
          program_id: string
          requested_at?: string | null
          retailer_id: string
          reward_id: string
          status?: string | null
          tracking_info?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_address?: string | null
          delivery_notes?: string | null
          id?: string
          points_redeemed?: number
          processed_at?: string | null
          processed_by?: string | null
          program_id?: string
          requested_at?: string | null
          retailer_id?: string
          reward_id?: string
          status?: string | null
          tracking_info?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_loyalty_reward_redemptions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "retailer_loyalty_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailer_loyalty_reward_redemptions_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailer_loyalty_reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "retailer_loyalty_rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_loyalty_rewards: {
        Row: {
          cash_value: number | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          points_required: number
          program_id: string
          reward_name: string
          reward_type: string
          stock_quantity: number | null
          updated_at: string | null
        }
        Insert: {
          cash_value?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          points_required: number
          program_id: string
          reward_name: string
          reward_type: string
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Update: {
          cash_value?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          points_required?: number
          program_id?: string
          reward_name?: string
          reward_type?: string
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_loyalty_rewards_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "retailer_loyalty_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_loyalty_tracking: {
        Row: {
          consecutive_order_count: number | null
          created_at: string | null
          id: string
          last_order_date: string | null
          last_points_earned_date: string | null
          new_products_tried: string[] | null
          retailer_id: string
          total_orders_count: number | null
          updated_at: string | null
        }
        Insert: {
          consecutive_order_count?: number | null
          created_at?: string | null
          id?: string
          last_order_date?: string | null
          last_points_earned_date?: string | null
          new_products_tried?: string[] | null
          retailer_id: string
          total_orders_count?: number | null
          updated_at?: string | null
        }
        Update: {
          consecutive_order_count?: number | null
          created_at?: string | null
          id?: string
          last_order_date?: string | null
          last_points_earned_date?: string | null
          new_products_tried?: string[] | null
          retailer_id?: string
          total_orders_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_loyalty_tracking_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: true
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_owner_history: {
        Row: {
          beat_id: string | null
          changed_at: string
          changed_by: string
          created_at: string
          id: string
          new_user_id: string
          new_user_name: string | null
          old_user_id: string
          old_user_name: string | null
          reason: string | null
          retailer_id: string
          retailer_name: string | null
        }
        Insert: {
          beat_id?: string | null
          changed_at?: string
          changed_by: string
          created_at?: string
          id?: string
          new_user_id: string
          new_user_name?: string | null
          old_user_id: string
          old_user_name?: string | null
          reason?: string | null
          retailer_id: string
          retailer_name?: string | null
        }
        Update: {
          beat_id?: string | null
          changed_at?: string
          changed_by?: string
          created_at?: string
          id?: string
          new_user_id?: string
          new_user_name?: string | null
          old_user_id?: string
          old_user_name?: string | null
          reason?: string | null
          retailer_id?: string
          retailer_name?: string | null
        }
        Relationships: []
      }
      retailer_payment_collections: {
        Row: {
          amount: number
          collected_at: string
          collected_by_user_id: string
          created_at: string
          id: string
          notes: string | null
          payment_method: string | null
          payment_proof_url: string | null
          retailer_id: string
          revenue_owner_id: string | null
          upi_last_four: string | null
        }
        Insert: {
          amount: number
          collected_at?: string
          collected_by_user_id: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          retailer_id: string
          revenue_owner_id?: string | null
          upi_last_four?: string | null
        }
        Update: {
          amount?: number
          collected_at?: string
          collected_by_user_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          retailer_id?: string
          revenue_owner_id?: string | null
          upi_last_four?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_payment_collections_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_pending_audit: {
        Row: {
          actor_user_id: string | null
          after_amount: number | null
          before_amount: number | null
          created_at: string
          delta: number
          id: string
          order_id: string | null
          reason: string | null
          retailer_id: string
        }
        Insert: {
          actor_user_id?: string | null
          after_amount?: number | null
          before_amount?: number | null
          created_at?: string
          delta: number
          id?: string
          order_id?: string | null
          reason?: string | null
          retailer_id: string
        }
        Update: {
          actor_user_id?: string | null
          after_amount?: number | null
          before_amount?: number | null
          created_at?: string
          delta?: number
          id?: string
          order_id?: string | null
          reason?: string | null
          retailer_id?: string
        }
        Relationships: []
      }
      retailer_shared_access: {
        Row: {
          access_template_id: string | null
          can_collect_payment: boolean
          can_take_orders: boolean
          can_update_feedback: boolean
          can_view: boolean
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          retailer_id: string
          shared_by_user_id: string
          shared_to_user_id: string
          source: string
          source_id: string | null
        }
        Insert: {
          access_template_id?: string | null
          can_collect_payment?: boolean
          can_take_orders?: boolean
          can_update_feedback?: boolean
          can_view?: boolean
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          retailer_id: string
          shared_by_user_id: string
          shared_to_user_id: string
          source?: string
          source_id?: string | null
        }
        Update: {
          access_template_id?: string | null
          can_collect_payment?: boolean
          can_take_orders?: boolean
          can_update_feedback?: boolean
          can_view?: boolean
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          retailer_id?: string
          shared_by_user_id?: string
          shared_to_user_id?: string
          source?: string
          source_id?: string | null
        }
        Relationships: []
      }
      retailer_verification_audit: {
        Row: {
          action: string
          created_at: string
          id: string
          method: string
          notes: string | null
          performed_by: string | null
          performed_by_name: string | null
          retailer_id: string
          verified_items: Json
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          method: string
          notes?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          retailer_id: string
          verified_items?: Json
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          retailer_id?: string
          verified_items?: Json
        }
        Relationships: [
          {
            foreignKeyName: "retailer_verification_audit_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_visit_logs: {
        Row: {
          action_type: string | null
          created_at: string
          distance_meters: number | null
          end_time: string | null
          id: string
          is_phone_order: boolean | null
          location_feedback_notes: string | null
          location_feedback_reason: string | null
          location_status: string | null
          retailer_id: string
          start_latitude: number | null
          start_longitude: number | null
          start_time: string
          time_spent_seconds: number | null
          updated_at: string
          user_id: string
          visit_date: string
          visit_id: string | null
        }
        Insert: {
          action_type?: string | null
          created_at?: string
          distance_meters?: number | null
          end_time?: string | null
          id?: string
          is_phone_order?: boolean | null
          location_feedback_notes?: string | null
          location_feedback_reason?: string | null
          location_status?: string | null
          retailer_id: string
          start_latitude?: number | null
          start_longitude?: number | null
          start_time: string
          time_spent_seconds?: number | null
          updated_at?: string
          user_id: string
          visit_date: string
          visit_id?: string | null
        }
        Update: {
          action_type?: string | null
          created_at?: string
          distance_meters?: number | null
          end_time?: string | null
          id?: string
          is_phone_order?: boolean | null
          location_feedback_notes?: string | null
          location_feedback_reason?: string | null
          location_status?: string | null
          retailer_id?: string
          start_latitude?: number | null
          start_longitude?: number | null
          start_time?: string
          time_spent_seconds?: number | null
          updated_at?: string
          user_id?: string
          visit_date?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_visit_logs_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      retailers: {
        Row: {
          account_holder_name: string | null
          address: string
          alternate_phone: string | null
          avg_monthly_orders_3m: number | null
          avg_order_per_visit_3m: number | null
          bank_account: string | null
          bank_name: string | null
          beat_id: string
          beat_name: string | null
          category: string | null
          competitors: string[] | null
          contact_name: string | null
          contact_title: string | null
          created_at: string
          created_by: string | null
          distributor_id: string | null
          duplicate_of: string | null
          duplicate_risk_score: number
          entity_type: string
          first_order_placed: boolean
          first_visit_completed: boolean
          gst_number: string | null
          id: string
          ifsc: string | null
          last_order_date: string | null
          last_order_value: number | null
          last_visit_date: string | null
          latitude: number | null
          location_tag: string | null
          logo_url: string | null
          longitude: number | null
          manual_credit_score: number | null
          name: string
          notes: string | null
          order_value: number | null
          owner_id: string | null
          owner_name: string | null
          parent_name: string | null
          parent_type: string | null
          pending_amount: number | null
          phone: string | null
          photo_url: string | null
          portal_enabled: boolean | null
          portal_pin: string | null
          potential: string | null
          priority: string | null
          productive_visits_3m: number | null
          qr_upi: string | null
          quality_last_calculated_at: string | null
          quality_status: string
          retail_type: string | null
          retailer_confirmed: boolean
          shop_front_visible: boolean
          state: string | null
          status: string | null
          terms_conditions: string | null
          territory_id: string | null
          total_visits_3m: number | null
          unverified_order_count: number
          updated_at: string
          user_id: string
          verification_address: boolean | null
          verification_contact: boolean | null
          verification_method: string | null
          verification_notes: string | null
          verification_score: number
          verification_status: string | null
          verification_territory: boolean | null
          verified: boolean
          verified_at: string | null
          verified_by: string | null
          verified_by_name: string | null
          whatsapp_verified: boolean
        }
        Insert: {
          account_holder_name?: string | null
          address: string
          alternate_phone?: string | null
          avg_monthly_orders_3m?: number | null
          avg_order_per_visit_3m?: number | null
          bank_account?: string | null
          bank_name?: string | null
          beat_id: string
          beat_name?: string | null
          category?: string | null
          competitors?: string[] | null
          contact_name?: string | null
          contact_title?: string | null
          created_at?: string
          created_by?: string | null
          distributor_id?: string | null
          duplicate_of?: string | null
          duplicate_risk_score?: number
          entity_type?: string
          first_order_placed?: boolean
          first_visit_completed?: boolean
          gst_number?: string | null
          id?: string
          ifsc?: string | null
          last_order_date?: string | null
          last_order_value?: number | null
          last_visit_date?: string | null
          latitude?: number | null
          location_tag?: string | null
          logo_url?: string | null
          longitude?: number | null
          manual_credit_score?: number | null
          name: string
          notes?: string | null
          order_value?: number | null
          owner_id?: string | null
          owner_name?: string | null
          parent_name?: string | null
          parent_type?: string | null
          pending_amount?: number | null
          phone?: string | null
          photo_url?: string | null
          portal_enabled?: boolean | null
          portal_pin?: string | null
          potential?: string | null
          priority?: string | null
          productive_visits_3m?: number | null
          qr_upi?: string | null
          quality_last_calculated_at?: string | null
          quality_status?: string
          retail_type?: string | null
          retailer_confirmed?: boolean
          shop_front_visible?: boolean
          state?: string | null
          status?: string | null
          terms_conditions?: string | null
          territory_id?: string | null
          total_visits_3m?: number | null
          unverified_order_count?: number
          updated_at?: string
          user_id: string
          verification_address?: boolean | null
          verification_contact?: boolean | null
          verification_method?: string | null
          verification_notes?: string | null
          verification_score?: number
          verification_status?: string | null
          verification_territory?: boolean | null
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          verified_by_name?: string | null
          whatsapp_verified?: boolean
        }
        Update: {
          account_holder_name?: string | null
          address?: string
          alternate_phone?: string | null
          avg_monthly_orders_3m?: number | null
          avg_order_per_visit_3m?: number | null
          bank_account?: string | null
          bank_name?: string | null
          beat_id?: string
          beat_name?: string | null
          category?: string | null
          competitors?: string[] | null
          contact_name?: string | null
          contact_title?: string | null
          created_at?: string
          created_by?: string | null
          distributor_id?: string | null
          duplicate_of?: string | null
          duplicate_risk_score?: number
          entity_type?: string
          first_order_placed?: boolean
          first_visit_completed?: boolean
          gst_number?: string | null
          id?: string
          ifsc?: string | null
          last_order_date?: string | null
          last_order_value?: number | null
          last_visit_date?: string | null
          latitude?: number | null
          location_tag?: string | null
          logo_url?: string | null
          longitude?: number | null
          manual_credit_score?: number | null
          name?: string
          notes?: string | null
          order_value?: number | null
          owner_id?: string | null
          owner_name?: string | null
          parent_name?: string | null
          parent_type?: string | null
          pending_amount?: number | null
          phone?: string | null
          photo_url?: string | null
          portal_enabled?: boolean | null
          portal_pin?: string | null
          potential?: string | null
          priority?: string | null
          productive_visits_3m?: number | null
          qr_upi?: string | null
          quality_last_calculated_at?: string | null
          quality_status?: string
          retail_type?: string | null
          retailer_confirmed?: boolean
          shop_front_visible?: boolean
          state?: string | null
          status?: string | null
          terms_conditions?: string | null
          territory_id?: string | null
          total_visits_3m?: number | null
          unverified_order_count?: number
          updated_at?: string
          user_id?: string
          verification_address?: boolean | null
          verification_contact?: boolean | null
          verification_method?: string | null
          verification_notes?: string | null
          verification_score?: number
          verification_status?: string | null
          verification_territory?: boolean | null
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          verified_by_name?: string | null
          whatsapp_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "retailers_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailers_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailers_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      role_definitions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          required_competencies: Json | null
          responsibilities: string[] | null
          role_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          required_competencies?: Json | null
          responsibilities?: string[] | null
          role_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          required_competencies?: Json | null
          responsibilities?: string[] | null
          role_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_targets: {
        Row: {
          created_at: string | null
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          kpi_id: string | null
          monthly_target: number
          quarterly_target: number
          role_name: string
          territory_id: string | null
          updated_at: string | null
          yearly_target: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          kpi_id?: string | null
          monthly_target?: number
          quarterly_target?: number
          role_name: string
          territory_id?: string | null
          updated_at?: string | null
          yearly_target?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          kpi_id?: string | null
          monthly_target?: number
          quarterly_target?: number
          role_name?: string
          territory_id?: string | null
          updated_at?: string | null
          yearly_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_targets_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "target_kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_targets_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      route_execution_history: {
        Row: {
          action_type: string
          assigned_user_id: string | null
          beat_id: string | null
          created_at: string
          executed_by_user_id: string | null
          id: string
          remarks: string | null
          retailer_id: string | null
          route_date: string
        }
        Insert: {
          action_type: string
          assigned_user_id?: string | null
          beat_id?: string | null
          created_at?: string
          executed_by_user_id?: string | null
          id?: string
          remarks?: string | null
          retailer_id?: string | null
          route_date?: string
        }
        Update: {
          action_type?: string
          assigned_user_id?: string | null
          beat_id?: string | null
          created_at?: string
          executed_by_user_id?: string | null
          id?: string
          remarks?: string | null
          retailer_id?: string | null
          route_date?: string
        }
        Relationships: []
      }
      saved_reports: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          id: string
          parameters: Json | null
          query: string
          title: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          parameters?: Json | null
          query: string
          title: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          parameters?: Json | null
          query?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_reports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_announcements: {
        Row: {
          announcement_type: string
          created_at: string
          fire_day: string
          fire_time: string
          id: string
          is_active: boolean
          last_fired_at: string | null
          updated_at: string
        }
        Insert: {
          announcement_type: string
          created_at?: string
          fire_day: string
          fire_time: string
          id?: string
          is_active?: boolean
          last_fired_at?: string | null
          updated_at?: string
        }
        Update: {
          announcement_type?: string
          created_at?: string
          fire_day?: string
          fire_time?: string
          id?: string
          is_active?: boolean
          last_fired_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scheme_applicability: {
        Row: {
          applicability_level: string
          created_at: string | null
          entity_id: string | null
          entity_name: string | null
          id: string
          include_children: boolean | null
          scheme_id: string
        }
        Insert: {
          applicability_level: string
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          id?: string
          include_children?: boolean | null
          scheme_id: string
        }
        Update: {
          applicability_level?: string
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          id?: string
          include_children?: boolean | null
          scheme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheme_applicability_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "product_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      scheme_policy_config: {
        Row: {
          description: string | null
          id: string
          is_active: boolean | null
          policy_name: string
          policy_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          is_active?: boolean | null
          policy_name: string
          policy_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          is_active?: boolean | null
          policy_name?: string
          policy_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      security_profiles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_system: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sensitive_data_access_log: {
        Row: {
          accessed_at: string
          action: string
          id: string
          ip_address: string | null
          record_id: string | null
          table_name: string
          user_id: string
        }
        Insert: {
          accessed_at?: string
          action: string
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name: string
          user_id: string
        }
        Update: {
          accessed_at?: string
          action?: string
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name?: string
          user_id?: string
        }
        Relationships: []
      }
      sms_config: {
        Row: {
          account_sid: string | null
          auth_token: string | null
          created_at: string | null
          from_number: string | null
          id: string
          is_active: boolean | null
          provider: string
          updated_at: string | null
          whatsapp_number: string | null
        }
        Insert: {
          account_sid?: string | null
          auth_token?: string | null
          created_at?: string | null
          from_number?: string | null
          id?: string
          is_active?: boolean | null
          provider?: string
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          account_sid?: string | null
          auth_token?: string | null
          created_at?: string | null
          from_number?: string | null
          id?: string
          is_active?: boolean | null
          provider?: string
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      social_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          post_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          post_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          post_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_likes: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_attachments: {
        Row: {
          created_at: string
          file_name: string | null
          file_type: string | null
          file_url: string
          id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url: string
          id?: string
          post_id: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string
          id?: string
          post_id?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          content: string
          created_at: string | null
          id: string
          image_url: string | null
          is_automated: boolean | null
          post_metadata: Json | null
          scheduled_time: string | null
          template_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_automated?: boolean | null
          post_metadata?: Json | null
          scheduled_time?: string | null
          template_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_automated?: boolean | null
          post_metadata?: Json | null
          scheduled_time?: string | null
          template_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "push_content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      social_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: []
      }
      stock: {
        Row: {
          created_at: string
          id: string
          product_id: string
          product_name: string
          retailer_id: string
          stock_quantity: number
          updated_at: string
          user_id: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          product_name: string
          retailer_id: string
          stock_quantity?: number
          updated_at?: string
          user_id: string
          visit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          product_name?: string
          retailer_id?: string
          stock_quantity?: number
          updated_at?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: []
      }
      stock_cycle_data: {
        Row: {
          created_at: string
          id: string
          ordered_quantity: number | null
          product_id: string
          product_name: string
          retailer_id: string
          stock_quantity: number | null
          updated_at: string
          user_id: string
          visit_date: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ordered_quantity?: number | null
          product_id: string
          product_name: string
          retailer_id: string
          stock_quantity?: number | null
          updated_at?: string
          user_id: string
          visit_date: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ordered_quantity?: number | null
          product_id?: string
          product_name?: string
          retailer_id?: string
          stock_quantity?: number | null
          updated_at?: string
          user_id?: string
          visit_date?: string
          visit_id?: string | null
        }
        Relationships: []
      }
      stockist_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          stockist_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          stockist_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          stockist_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stockist_attachments_stockist_id_fkey"
            columns: ["stockist_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      stockist_contacts: {
        Row: {
          address: string | null
          contact_name: string
          created_at: string | null
          designation: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          phone: string | null
          reports_to: string | null
          stockist_id: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          contact_name: string
          created_at?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          phone?: string | null
          reports_to?: string | null
          stockist_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          contact_name?: string
          created_at?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          phone?: string | null
          reports_to?: string | null
          stockist_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stockist_contacts_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "stockist_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stockist_contacts_stockist_id_fkey"
            columns: ["stockist_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      stockist_locations: {
        Row: {
          address: string | null
          city: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          is_head_office: boolean | null
          location_name: string
          pincode: string | null
          state: string | null
          stockist_id: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          is_head_office?: boolean | null
          location_name: string
          pincode?: string | null
          state?: string | null
          stockist_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          is_head_office?: boolean | null
          location_name?: string
          pincode?: string | null
          state?: string | null
          stockist_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stockist_locations_stockist_id_fkey"
            columns: ["stockist_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          created_at: string
          created_date: string
          description: string | null
          id: string
          resolution_notes: string | null
          resolved_by: string | null
          resolved_date: string | null
          status: string
          subject: string
          support_category: string
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_date?: string
          description?: string | null
          id?: string
          resolution_notes?: string | null
          resolved_by?: string | null
          resolved_date?: string | null
          status?: string
          subject: string
          support_category: string
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_date?: string
          description?: string | null
          id?: string
          resolution_notes?: string | null
          resolved_by?: string | null
          resolved_date?: string | null
          status?: string
          subject?: string
          support_category?: string
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_audit_log: {
        Row: {
          created_at: string
          device_id: string | null
          error: string | null
          id: string
          idempotency_key: string | null
          order_id: string | null
          payload: Json | null
          reconciliation: Json | null
          retry_count: number | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          order_id?: string | null
          payload?: Json | null
          reconciliation?: Json | null
          retry_count?: number | null
          status: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          order_id?: string | null
          payload?: Json | null
          reconciliation?: Json | null
          retry_count?: number | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      target_actual_logs: {
        Row: {
          created_at: string | null
          daily_actual: number | null
          id: string
          kpi_id: string | null
          log_date: string
          reference_id: string | null
          reference_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_actual?: number | null
          id?: string
          kpi_id?: string | null
          log_date?: string
          reference_id?: string | null
          reference_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_actual?: number | null
          id?: string
          kpi_id?: string | null
          log_date?: string
          reference_id?: string | null
          reference_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "target_actual_logs_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "target_kpi_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      target_breakdowns: {
        Row: {
          created_at: string | null
          fy_config_id: string
          id: string
          month_number: number | null
          parameter_id: string
          parameter_name: string
          parameter_type: string
          quantity_target: number | null
          revenue_target: number | null
          updated_at: string | null
          user_id: string
          visits_target: number | null
        }
        Insert: {
          created_at?: string | null
          fy_config_id: string
          id?: string
          month_number?: number | null
          parameter_id: string
          parameter_name: string
          parameter_type: string
          quantity_target?: number | null
          revenue_target?: number | null
          updated_at?: string | null
          user_id: string
          visits_target?: number | null
        }
        Update: {
          created_at?: string | null
          fy_config_id?: string
          id?: string
          month_number?: number | null
          parameter_id?: string
          parameter_name?: string
          parameter_type?: string
          quantity_target?: number | null
          revenue_target?: number | null
          updated_at?: string | null
          user_id?: string
          visits_target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "target_breakdowns_fy_config_id_fkey"
            columns: ["fy_config_id"]
            isOneToOne: false
            referencedRelation: "fy_target_config"
            referencedColumns: ["id"]
          },
        ]
      }
      target_kpi_definitions: {
        Row: {
          calculation_method: string
          created_at: string | null
          data_source: string
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          kpi_key: string
          kpi_name: string
          unit: string | null
          weightage: number | null
        }
        Insert: {
          calculation_method: string
          created_at?: string | null
          data_source: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          kpi_key: string
          kpi_name: string
          unit?: string | null
          weightage?: number | null
        }
        Update: {
          calculation_method?: string
          created_at?: string | null
          data_source?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          kpi_key?: string
          kpi_name?: string
          unit?: string | null
          weightage?: number | null
        }
        Relationships: []
      }
      target_metric_definitions: {
        Row: {
          color: string | null
          created_at: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_system: boolean | null
          name: string
          unit: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          unit?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          unit?: string | null
        }
        Relationships: []
      }
      target_parameter_definitions: {
        Row: {
          created_at: string
          data_source_filter: Json | null
          data_source_id_column: string | null
          data_source_name_column: string | null
          data_source_table: string | null
          display_order: number
          icon: string
          id: string
          is_system: boolean
          name: string
          parameter_key: string
        }
        Insert: {
          created_at?: string
          data_source_filter?: Json | null
          data_source_id_column?: string | null
          data_source_name_column?: string | null
          data_source_table?: string | null
          display_order?: number
          icon?: string
          id?: string
          is_system?: boolean
          name: string
          parameter_key: string
        }
        Update: {
          created_at?: string
          data_source_filter?: Json | null
          data_source_id_column?: string | null
          data_source_name_column?: string | null
          data_source_table?: string | null
          display_order?: number
          icon?: string
          id?: string
          is_system?: boolean
          name?: string
          parameter_key?: string
        }
        Relationships: []
      }
      target_plans: {
        Row: {
          created_at: string | null
          created_by: string | null
          fy_year: number
          id: string
          is_locked: boolean | null
          name: string
          policy_id: string
          status: string | null
          target_end_month: number | null
          target_start_month: number | null
          total_secondary_value: number | null
          total_target_value: number | null
          total_visits_target: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          fy_year: number
          id?: string
          is_locked?: boolean | null
          name: string
          policy_id: string
          status?: string | null
          target_end_month?: number | null
          target_start_month?: number | null
          total_secondary_value?: number | null
          total_target_value?: number | null
          total_visits_target?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          fy_year?: number
          id?: string
          is_locked?: boolean | null
          name?: string
          policy_id?: string
          status?: string | null
          target_end_month?: number | null
          target_start_month?: number | null
          total_secondary_value?: number | null
          total_target_value?: number | null
          total_visits_target?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "target_plans_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "target_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      target_policies: {
        Row: {
          created_at: string | null
          created_by: string | null
          enabled_parameters: Json | null
          id: string
          is_active: boolean | null
          name: string
          period_type: string | null
          quantity_unit: string | null
          target_type_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          enabled_parameters?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          period_type?: string | null
          quantity_unit?: string | null
          target_type_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          enabled_parameters?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          period_type?: string | null
          quantity_unit?: string | null
          target_type_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "target_policies_target_type_id_fkey"
            columns: ["target_type_id"]
            isOneToOne: false
            referencedRelation: "target_types"
            referencedColumns: ["id"]
          },
        ]
      }
      target_setup_master: {
        Row: {
          annual_quantity_target: number
          annual_revenue_target: number
          band: number
          created_at: string
          created_by: string | null
          id: string
          state_territory_id: string | null
          territory_id: string | null
          unit_of_measure: string
          updated_at: string
        }
        Insert: {
          annual_quantity_target?: number
          annual_revenue_target?: number
          band: number
          created_at?: string
          created_by?: string | null
          id?: string
          state_territory_id?: string | null
          territory_id?: string | null
          unit_of_measure?: string
          updated_at?: string
        }
        Update: {
          annual_quantity_target?: number
          annual_revenue_target?: number
          band?: number
          created_at?: string
          created_by?: string | null
          id?: string
          state_territory_id?: string | null
          territory_id?: string | null
          unit_of_measure?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "target_setup_master_state_territory_id_fkey"
            columns: ["state_territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "target_setup_master_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      target_types: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          metric: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          metric: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          metric?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tax_components: {
        Row: {
          component_type: string
          created_at: string
          id: string
          is_enabled: boolean
          percentage: number
          tax_master_id: string
          updated_at: string
        }
        Insert: {
          component_type: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          percentage?: number
          tax_master_id: string
          updated_at?: string
        }
        Update: {
          component_type?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          percentage?: number
          tax_master_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_components_tax_master_id_fkey"
            columns: ["tax_master_id"]
            isOneToOne: false
            referencedRelation: "tax_masters"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_masters: {
        Row: {
          apply_to_primary_orders: boolean
          apply_to_secondary_orders: boolean
          cloned_from_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          is_active: boolean
          name: string
          tax_type: string
          updated_at: string
          version: number
        }
        Insert: {
          apply_to_primary_orders?: boolean
          apply_to_secondary_orders?: boolean
          cloned_from_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name: string
          tax_type?: string
          updated_at?: string
          version?: number
        }
        Update: {
          apply_to_primary_orders?: boolean
          apply_to_secondary_orders?: boolean
          cloned_from_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tax_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_masters_cloned_from_id_fkey"
            columns: ["cloned_from_id"]
            isOneToOne: false
            referencedRelation: "tax_masters"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_product_map: {
        Row: {
          created_at: string
          id: string
          is_applicable: boolean
          product_variant_id: string
          tax_master_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_applicable?: boolean
          product_variant_id: string
          tax_master_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_applicable?: boolean
          product_variant_id?: string
          tax_master_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_product_map_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_product_map_tax_master_id_fkey"
            columns: ["tax_master_id"]
            isOneToOne: false
            referencedRelation: "tax_masters"
            referencedColumns: ["id"]
          },
        ]
      }
      team_expense_config: {
        Row: {
          created_at: string
          da_amount: number | null
          fixed_ta_amount: number | null
          id: string
          manager_id: string
          ta_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          da_amount?: number | null
          fixed_ta_amount?: number | null
          id?: string
          manager_id: string
          ta_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          da_amount?: number | null
          fixed_ta_amount?: number | null
          id?: string
          manager_id?: string
          ta_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      territories: {
        Row: {
          assigned_distributor_ids: Json | null
          assigned_user_id: string | null
          assigned_user_ids: Json | null
          child_territories_count: number | null
          competitor_ids: string[] | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          last_updated_by: string | null
          name: string
          owner_id: string | null
          parent_id: string | null
          pincode_ranges: string[] | null
          place_id: string | null
          population: number | null
          region: string
          retailer_count: number | null
          target_market_size: number | null
          territory_po_list: string[] | null
          territory_type: string | null
          updated_at: string
          zone: string | null
        }
        Insert: {
          assigned_distributor_ids?: Json | null
          assigned_user_id?: string | null
          assigned_user_ids?: Json | null
          child_territories_count?: number | null
          competitor_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          owner_id?: string | null
          parent_id?: string | null
          pincode_ranges?: string[] | null
          place_id?: string | null
          population?: number | null
          region: string
          retailer_count?: number | null
          target_market_size?: number | null
          territory_po_list?: string[] | null
          territory_type?: string | null
          updated_at?: string
          zone?: string | null
        }
        Update: {
          assigned_distributor_ids?: Json | null
          assigned_user_id?: string | null
          assigned_user_ids?: Json | null
          child_territories_count?: number | null
          competitor_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          owner_id?: string | null
          parent_id?: string | null
          pincode_ranges?: string[] | null
          place_id?: string | null
          population?: number | null
          region?: string
          retailer_count?: number | null
          target_market_size?: number | null
          territory_po_list?: string[] | null
          territory_type?: string | null
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "territories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      territory_assignment_history: {
        Row: {
          assigned_from: string
          assigned_to: string | null
          assigned_user_id: string
          created_at: string
          id: string
          territory_id: string
          updated_at: string
        }
        Insert: {
          assigned_from: string
          assigned_to?: string | null
          assigned_user_id: string
          created_at?: string
          id?: string
          territory_id: string
          updated_at?: string
        }
        Update: {
          assigned_from?: string
          assigned_to?: string | null
          assigned_user_id?: string
          created_at?: string
          id?: string
          territory_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "territory_assignment_history_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      unhandled_queries: {
        Row: {
          category: string | null
          created_at: string | null
          created_date: string
          id: string
          message: string
          phone: string
          retailer_id: string | null
          retailer_name: string | null
          status: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_date?: string
          id?: string
          message: string
          phone: string
          retailer_id?: string | null
          retailer_name?: string | null
          status?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_date?: string
          id?: string
          message?: string
          phone?: string
          retailer_id?: string | null
          retailer_name?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unhandled_queries_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      uom_category: {
        Row: {
          code: string
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          is_system: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          is_system?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          is_system?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      uom_master: {
        Row: {
          category: string
          category_id: string | null
          code: string
          created_at: string
          id: string
          is_base: boolean
          is_system: boolean
          name: string
        }
        Insert: {
          category: string
          category_id?: string | null
          code: string
          created_at?: string
          id?: string
          is_base?: boolean
          is_system?: boolean
          name: string
        }
        Update: {
          category?: string
          category_id?: string | null
          code?: string
          created_at?: string
          id?: string
          is_base?: boolean
          is_system?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "uom_master_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "uom_category"
            referencedColumns: ["id"]
          },
        ]
      }
      user_approvals: {
        Row: {
          approval_level: number
          approved_at: string | null
          approver_id: string | null
          comments: string | null
          created_at: string
          id: string
          status: Database["public"]["Enums"]["approval_status"] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approval_level: number
          approved_at?: string | null
          approver_id?: string | null
          comments?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["approval_status"] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approval_level?: number
          approved_at?: string | null
          approver_id?: string | null
          comments?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["approval_status"] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_autonomy_settings: {
        Row: {
          auto_beat_planning: boolean | null
          auto_daily_summary: boolean | null
          auto_escalation: boolean | null
          auto_order_prefill: boolean | null
          auto_payment_reminders: boolean | null
          created_at: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_beat_planning?: boolean | null
          auto_daily_summary?: boolean | null
          auto_escalation?: boolean | null
          auto_order_prefill?: boolean | null
          auto_payment_reminders?: boolean | null
          created_at?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_beat_planning?: boolean | null
          auto_daily_summary?: boolean | null
          auto_escalation?: boolean | null
          auto_order_prefill?: boolean | null
          auto_payment_reminders?: boolean | null
          created_at?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_business_plan_distributors: {
        Row: {
          business_plan_id: string
          created_at: string
          distributor_id: string
          distributor_name: string
          id: string
          quantity_target: number | null
          revenue_target: number | null
        }
        Insert: {
          business_plan_id: string
          created_at?: string
          distributor_id: string
          distributor_name: string
          id?: string
          quantity_target?: number | null
          revenue_target?: number | null
        }
        Update: {
          business_plan_id?: string
          created_at?: string
          distributor_id?: string
          distributor_name?: string
          id?: string
          quantity_target?: number | null
          revenue_target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_business_plan_distributors_business_plan_id_fkey"
            columns: ["business_plan_id"]
            isOneToOne: false
            referencedRelation: "user_business_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_business_plan_distributors_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      user_business_plan_month_products: {
        Row: {
          business_plan_id: string
          created_at: string
          id: string
          month_name: string
          month_number: number
          percentage: number | null
          product_id: string
          product_name: string
          quantity_target: number | null
          revenue_target: number | null
          updated_at: string
        }
        Insert: {
          business_plan_id: string
          created_at?: string
          id?: string
          month_name: string
          month_number: number
          percentage?: number | null
          product_id: string
          product_name: string
          quantity_target?: number | null
          revenue_target?: number | null
          updated_at?: string
        }
        Update: {
          business_plan_id?: string
          created_at?: string
          id?: string
          month_name?: string
          month_number?: number
          percentage?: number | null
          product_id?: string
          product_name?: string
          quantity_target?: number | null
          revenue_target?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_business_plan_month_products_business_plan_id_fkey"
            columns: ["business_plan_id"]
            isOneToOne: false
            referencedRelation: "user_business_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_business_plan_month_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_business_plan_months: {
        Row: {
          business_plan_id: string
          created_at: string
          id: string
          month_name: string
          month_number: number
          quantity_target: number | null
          revenue_target: number | null
          updated_at: string
          working_days: number | null
        }
        Insert: {
          business_plan_id: string
          created_at?: string
          id?: string
          month_name: string
          month_number: number
          quantity_target?: number | null
          revenue_target?: number | null
          updated_at?: string
          working_days?: number | null
        }
        Update: {
          business_plan_id?: string
          created_at?: string
          id?: string
          month_name?: string
          month_number?: number
          quantity_target?: number | null
          revenue_target?: number | null
          updated_at?: string
          working_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_business_plan_months_business_plan_id_fkey"
            columns: ["business_plan_id"]
            isOneToOne: false
            referencedRelation: "user_business_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_business_plan_products: {
        Row: {
          business_plan_id: string
          created_at: string
          id: string
          product_id: string
          product_name: string
          quantity_target: number | null
          revenue_target: number | null
        }
        Insert: {
          business_plan_id: string
          created_at?: string
          id?: string
          product_id: string
          product_name: string
          quantity_target?: number | null
          revenue_target?: number | null
        }
        Update: {
          business_plan_id?: string
          created_at?: string
          id?: string
          product_id?: string
          product_name?: string
          quantity_target?: number | null
          revenue_target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_business_plan_products_business_plan_id_fkey"
            columns: ["business_plan_id"]
            isOneToOne: false
            referencedRelation: "user_business_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_business_plan_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_business_plan_retailers: {
        Row: {
          business_plan_id: string
          created_at: string
          growth_percent: number | null
          id: string
          last_year_revenue: number | null
          quantity_target: number | null
          retailer_id: string
          retailer_name: string
          target_revenue: number | null
        }
        Insert: {
          business_plan_id: string
          created_at?: string
          growth_percent?: number | null
          id?: string
          last_year_revenue?: number | null
          quantity_target?: number | null
          retailer_id: string
          retailer_name: string
          target_revenue?: number | null
        }
        Update: {
          business_plan_id?: string
          created_at?: string
          growth_percent?: number | null
          id?: string
          last_year_revenue?: number | null
          quantity_target?: number | null
          retailer_id?: string
          retailer_name?: string
          target_revenue?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_business_plan_retailers_business_plan_id_fkey"
            columns: ["business_plan_id"]
            isOneToOne: false
            referencedRelation: "user_business_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_business_plan_retailers_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_business_plan_territories: {
        Row: {
          business_plan_id: string
          created_at: string
          id: string
          quantity_target: number | null
          revenue_target: number | null
          territory_id: string
          territory_name: string
          updated_at: string
        }
        Insert: {
          business_plan_id: string
          created_at?: string
          id?: string
          quantity_target?: number | null
          revenue_target?: number | null
          territory_id: string
          territory_name: string
          updated_at?: string
        }
        Update: {
          business_plan_id?: string
          created_at?: string
          id?: string
          quantity_target?: number | null
          revenue_target?: number | null
          territory_id?: string
          territory_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_business_plan_territories_business_plan_id_fkey"
            columns: ["business_plan_id"]
            isOneToOne: false
            referencedRelation: "user_business_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_business_plan_territories_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_business_plan_territory_beats: {
        Row: {
          beat_id: string
          beat_name: string
          business_plan_id: string
          created_at: string
          id: string
          percentage: number | null
          quantity_target: number | null
          revenue_target: number | null
          territory_id: string
        }
        Insert: {
          beat_id: string
          beat_name: string
          business_plan_id: string
          created_at?: string
          id?: string
          percentage?: number | null
          quantity_target?: number | null
          revenue_target?: number | null
          territory_id: string
        }
        Update: {
          beat_id?: string
          beat_name?: string
          business_plan_id?: string
          created_at?: string
          id?: string
          percentage?: number | null
          quantity_target?: number | null
          revenue_target?: number | null
          territory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_business_plan_territory_beats_business_plan_id_fkey"
            columns: ["business_plan_id"]
            isOneToOne: false
            referencedRelation: "user_business_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_business_plan_territory_beats_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_business_plans: {
        Row: {
          created_at: string
          has_no_target: boolean
          hierarchy_allocation_id: string | null
          id: string
          manager_own_quantity_target: number | null
          manager_own_revenue_target: number | null
          notes: string | null
          personal_quantity_target: number | null
          personal_revenue_target: number | null
          personal_visits_target: number | null
          quantity_target: number | null
          quantity_unit: string | null
          revenue_target: number | null
          source: string | null
          target_strategy: string
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          has_no_target?: boolean
          hierarchy_allocation_id?: string | null
          id?: string
          manager_own_quantity_target?: number | null
          manager_own_revenue_target?: number | null
          notes?: string | null
          personal_quantity_target?: number | null
          personal_revenue_target?: number | null
          personal_visits_target?: number | null
          quantity_target?: number | null
          quantity_unit?: string | null
          revenue_target?: number | null
          source?: string | null
          target_strategy?: string
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          has_no_target?: boolean
          hierarchy_allocation_id?: string | null
          id?: string
          manager_own_quantity_target?: number | null
          manager_own_revenue_target?: number | null
          notes?: string | null
          personal_quantity_target?: number | null
          personal_revenue_target?: number | null
          personal_visits_target?: number | null
          quantity_target?: number | null
          quantity_unit?: string | null
          revenue_target?: number | null
          source?: string | null
          target_strategy?: string
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_business_plans_hierarchy_allocation_id_fkey"
            columns: ["hierarchy_allocation_id"]
            isOneToOne: false
            referencedRelation: "hierarchy_target_allocations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_competency_monthly_scores: {
        Row: {
          calculated_at: string | null
          competency_template_id: string
          created_at: string | null
          id: string
          month_year: string
          previous_month_score: number | null
          raw_metrics: Json | null
          score: number
          trend: string | null
          user_id: string
        }
        Insert: {
          calculated_at?: string | null
          competency_template_id: string
          created_at?: string | null
          id?: string
          month_year: string
          previous_month_score?: number | null
          raw_metrics?: Json | null
          score: number
          trend?: string | null
          user_id: string
        }
        Update: {
          calculated_at?: string | null
          competency_template_id?: string
          created_at?: string | null
          id?: string
          month_year?: string
          previous_month_score?: number | null
          raw_metrics?: Json | null
          score?: number
          trend?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_competency_monthly_scores_competency_template_id_fkey"
            columns: ["competency_template_id"]
            isOneToOne: false
            referencedRelation: "competency_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_context: {
        Row: {
          last_entity: Json | null
          last_intent: string | null
          last_order_id: string | null
          phone: string
          updated_at: string | null
        }
        Insert: {
          last_entity?: Json | null
          last_intent?: string | null
          last_order_id?: string | null
          phone: string
          updated_at?: string | null
        }
        Update: {
          last_entity?: Json | null
          last_intent?: string | null
          last_order_id?: string | null
          phone?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_context_last_order_id_fkey"
            columns: ["last_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_data_usage: {
        Row: {
          bytes_downloaded: number | null
          bytes_uploaded: number | null
          id: string
          recorded_at: string | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          bytes_downloaded?: number | null
          bytes_uploaded?: number | null
          id?: string
          recorded_at?: string | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          bytes_downloaded?: number | null
          bytes_uploaded?: number | null
          id?: string
          recorded_at?: string | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_data_usage_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "user_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_delegations: {
        Row: {
          beat_ids: string[]
          created_at: string
          created_by: string | null
          delegation_scope: string
          effective_from: string
          effective_to: string
          from_user_id: string
          id: string
          notes: string | null
          retailer_ids: string[]
          status: string
          to_user_id: string
        }
        Insert: {
          beat_ids?: string[]
          created_at?: string
          created_by?: string | null
          delegation_scope: string
          effective_from: string
          effective_to: string
          from_user_id: string
          id?: string
          notes?: string | null
          retailer_ids?: string[]
          status?: string
          to_user_id: string
        }
        Update: {
          beat_ids?: string[]
          created_at?: string
          created_by?: string | null
          delegation_scope?: string
          effective_from?: string
          effective_to?: string
          from_user_id?: string
          id?: string
          notes?: string | null
          retailer_ids?: string[]
          status?: string
          to_user_id?: string
        }
        Relationships: []
      }
      user_expense_config: {
        Row: {
          created_at: string
          da_amount: number | null
          fixed_ta_amount: number | null
          id: string
          ta_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          da_amount?: number | null
          fixed_ta_amount?: number | null
          id?: string
          ta_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          da_amount?: number | null
          fixed_ta_amount?: number | null
          id?: string
          ta_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          full_name: string
          id: string
          invitation_token: string
          manager_id: string | null
          phone_number: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          full_name: string
          id?: string
          invitation_token: string
          manager_id?: string | null
          phone_number?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          full_name?: string
          id?: string
          invitation_token?: string
          manager_id?: string | null
          phone_number?: string | null
          status?: string | null
        }
        Relationships: []
      }
      user_leave_policy: {
        Row: {
          created_at: string
          custom_entitlement: number | null
          effective_from: string
          effective_to: string | null
          id: string
          leave_type_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_entitlement?: number | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          leave_type_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_entitlement?: number | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          leave_type_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_leave_policy_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      user_monthly_scorecards: {
        Row: {
          ai_action_plan: Json | null
          ai_improvement_areas: Json | null
          ai_strengths: Json | null
          ai_summary: string | null
          created_at: string | null
          id: string
          is_published: boolean | null
          manager_id: string | null
          month_year: string
          overall_score: number
          performance_band: string | null
          published_at: string | null
          rank_in_team: number | null
          role_type: string
          total_team_members: number | null
          updated_at: string | null
          user_id: string
          weighted_score: number | null
        }
        Insert: {
          ai_action_plan?: Json | null
          ai_improvement_areas?: Json | null
          ai_strengths?: Json | null
          ai_summary?: string | null
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          manager_id?: string | null
          month_year: string
          overall_score: number
          performance_band?: string | null
          published_at?: string | null
          rank_in_team?: number | null
          role_type: string
          total_team_members?: number | null
          updated_at?: string | null
          user_id: string
          weighted_score?: number | null
        }
        Update: {
          ai_action_plan?: Json | null
          ai_improvement_areas?: Json | null
          ai_strengths?: Json | null
          ai_summary?: string | null
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          manager_id?: string | null
          month_year?: string
          overall_score?: number
          performance_band?: string | null
          published_at?: string | null
          rank_in_team?: number | null
          role_type?: string
          total_team_members?: number | null
          updated_at?: string | null
          user_id?: string
          weighted_score?: number | null
        }
        Relationships: []
      }
      user_object_permissions: {
        Row: {
          can_create: boolean | null
          can_delete: boolean | null
          can_edit: boolean | null
          can_modify_all: boolean | null
          can_read: boolean | null
          can_view_all: boolean | null
          created_at: string | null
          id: string
          object_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_modify_all?: boolean | null
          can_read?: boolean | null
          can_view_all?: boolean | null
          created_at?: string | null
          id?: string
          object_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_modify_all?: boolean | null
          can_read?: boolean | null
          can_view_all?: boolean | null
          created_at?: string | null
          id?: string
          object_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_onboarding_progress: {
        Row: {
          attachment_url: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          is_completed: boolean | null
          notes: string | null
          task_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attachment_url?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          task_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attachment_url?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          task_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_onboarding_progress_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "onboarding_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_page_views: {
        Row: {
          duration_seconds: number | null
          id: string
          module_name: string
          page_path: string
          session_id: string | null
          user_id: string
          visited_at: string | null
        }
        Insert: {
          duration_seconds?: number | null
          id?: string
          module_name: string
          page_path: string
          session_id?: string | null
          user_id: string
          visited_at?: string | null
        }
        Update: {
          duration_seconds?: number | null
          id?: string
          module_name?: string
          page_path?: string
          session_id?: string | null
          user_id?: string
          visited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_page_views_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "user_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_performance_scores: {
        Row: {
          calculated_at: string | null
          id: string
          kpi_scores: Json | null
          performance_rating: string | null
          period_end: string
          period_start: string
          period_type: string
          user_id: string
          weighted_average_score: number | null
        }
        Insert: {
          calculated_at?: string | null
          id?: string
          kpi_scores?: Json | null
          performance_rating?: string | null
          period_end: string
          period_start: string
          period_type: string
          user_id: string
          weighted_average_score?: number | null
        }
        Update: {
          calculated_at?: string | null
          id?: string
          kpi_scores?: Json | null
          performance_rating?: string | null
          period_end?: string
          period_start?: string
          period_type?: string
          user_id?: string
          weighted_average_score?: number | null
        }
        Relationships: []
      }
      user_period_allocations: {
        Row: {
          business_plan_id: string
          created_at: string | null
          id: string
          period_number: number
          period_type: string
          quantity_target: number | null
          revenue_target: number | null
          source: string | null
          updated_at: string | null
          visits_target: number | null
        }
        Insert: {
          business_plan_id: string
          created_at?: string | null
          id?: string
          period_number: number
          period_type: string
          quantity_target?: number | null
          revenue_target?: number | null
          source?: string | null
          updated_at?: string | null
          visits_target?: number | null
        }
        Update: {
          business_plan_id?: string
          created_at?: string | null
          id?: string
          period_number?: number
          period_type?: string
          quantity_target?: number | null
          revenue_target?: number | null
          source?: string | null
          updated_at?: string | null
          visits_target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_period_allocations_business_plan_id_fkey"
            columns: ["business_plan_id"]
            isOneToOne: false
            referencedRelation: "user_business_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_period_targets: {
        Row: {
          achievement_percent: number | null
          actual_value: number | null
          created_at: string | null
          id: string
          kpi_id: string | null
          last_calculated_at: string | null
          period_end: string
          period_start: string
          period_type: string
          status: string | null
          target_value: number
          user_id: string
        }
        Insert: {
          achievement_percent?: number | null
          actual_value?: number | null
          created_at?: string | null
          id?: string
          kpi_id?: string | null
          last_calculated_at?: string | null
          period_end: string
          period_start: string
          period_type: string
          status?: string | null
          target_value?: number
          user_id: string
        }
        Update: {
          achievement_percent?: number | null
          actual_value?: number | null
          created_at?: string | null
          id?: string
          kpi_id?: string | null
          last_calculated_at?: string | null
          period_end?: string
          period_start?: string
          period_type?: string
          status?: string | null
          target_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_period_targets_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "target_kpi_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          assigned_at: string | null
          id: string
          profile_id: string | null
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          id?: string
          profile_id?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          id?: string
          profile_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "security_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_content_subscriptions: {
        Row: {
          created_at: string | null
          custom_settings: Json | null
          id: string
          is_active: boolean | null
          schedule_time: string
          template_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          custom_settings?: Json | null
          id?: string
          is_active?: boolean | null
          schedule_time: string
          template_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          custom_settings?: Json | null
          id?: string
          is_active?: boolean | null
          schedule_time?: string
          template_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_push_content_subscriptions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "push_content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          login_at: string | null
          logout_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          login_at?: string | null
          logout_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          login_at?: string | null
          logout_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      van_beat_assignments: {
        Row: {
          assigned_date: string
          beat_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          updated_at: string
          van_id: string
        }
        Insert: {
          assigned_date?: string
          beat_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          van_id: string
        }
        Update: {
          assigned_date?: string
          beat_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          van_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "van_beat_assignments_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      van_closing_stock: {
        Row: {
          closing_date: string
          closing_inventory_qty: number
          computed_at: string
          created_at: string
          id: string
          total_inward_qty: number
          total_returned_qty: number
          total_sold_qty: number
          van_id: string
        }
        Insert: {
          closing_date?: string
          closing_inventory_qty?: number
          computed_at?: string
          created_at?: string
          id?: string
          total_inward_qty?: number
          total_returned_qty?: number
          total_sold_qty?: number
          van_id: string
        }
        Update: {
          closing_date?: string
          closing_inventory_qty?: number
          computed_at?: string
          created_at?: string
          id?: string
          total_inward_qty?: number
          total_returned_qty?: number
          total_sold_qty?: number
          van_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "van_closing_stock_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      van_closing_stock_items: {
        Row: {
          closing_qty: number
          closing_stock_id: string
          created_at: string
          id: string
          morning_qty: number
          product_id: string
          returned_qty: number
          sold_qty: number
          variant_id: string | null
        }
        Insert: {
          closing_qty?: number
          closing_stock_id: string
          created_at?: string
          id?: string
          morning_qty?: number
          product_id: string
          returned_qty?: number
          sold_qty?: number
          variant_id?: string | null
        }
        Update: {
          closing_qty?: number
          closing_stock_id?: string
          created_at?: string
          id?: string
          morning_qty?: number
          product_id?: string
          returned_qty?: number
          sold_qty?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "van_closing_stock_items_closing_stock_id_fkey"
            columns: ["closing_stock_id"]
            isOneToOne: false
            referencedRelation: "van_closing_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_closing_stock_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_closing_stock_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      van_inward_grn: {
        Row: {
          beat_id: string | null
          created_at: string
          documents_verified: boolean | null
          grn_date: string
          grn_number: string
          id: string
          updated_at: string
          user_id: string
          van_distance_km: number | null
          van_id: string
          verified_at: string | null
          verified_by: string | null
          verified_by_name: string | null
        }
        Insert: {
          beat_id?: string | null
          created_at?: string
          documents_verified?: boolean | null
          grn_date?: string
          grn_number: string
          id?: string
          updated_at?: string
          user_id: string
          van_distance_km?: number | null
          van_id: string
          verified_at?: string | null
          verified_by?: string | null
          verified_by_name?: string | null
        }
        Update: {
          beat_id?: string | null
          created_at?: string
          documents_verified?: boolean | null
          grn_date?: string
          grn_number?: string
          id?: string
          updated_at?: string
          user_id?: string
          van_distance_km?: number | null
          van_id?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "van_inward_grn_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      van_inward_grn_items: {
        Row: {
          ai_confidence_percent: number | null
          ai_scanned: boolean | null
          created_at: string
          grn_id: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          ai_confidence_percent?: number | null
          ai_scanned?: boolean | null
          created_at?: string
          grn_id: string
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          ai_confidence_percent?: number | null
          ai_scanned?: boolean | null
          created_at?: string
          grn_id?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "van_inward_grn_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "van_inward_grn"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_inward_grn_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_inward_grn_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      van_live_inventory: {
        Row: {
          created_at: string
          current_stock: number
          date: string
          id: string
          last_updated_at: string
          morning_stock: number
          pending_quantity: number
          product_id: string
          returned_quantity: number
          sold_quantity: number
          van_id: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          current_stock?: number
          date?: string
          id?: string
          last_updated_at?: string
          morning_stock?: number
          pending_quantity?: number
          product_id: string
          returned_quantity?: number
          sold_quantity?: number
          van_id: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          current_stock?: number
          date?: string
          id?: string
          last_updated_at?: string
          morning_stock?: number
          pending_quantity?: number
          product_id?: string
          returned_quantity?: number
          sold_quantity?: number
          van_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "van_live_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_live_inventory_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_live_inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      van_order_fulfillment: {
        Row: {
          created_at: string
          fulfilled_quantity: number
          fulfillment_date: string
          id: string
          order_id: string
          order_item_id: string
          pending_quantity: number
          product_id: string
          requested_quantity: number
          updated_at: string
          van_id: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          fulfilled_quantity?: number
          fulfillment_date?: string
          id?: string
          order_id: string
          order_item_id: string
          pending_quantity?: number
          product_id: string
          requested_quantity: number
          updated_at?: string
          van_id: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          fulfilled_quantity?: number
          fulfillment_date?: string
          id?: string
          order_id?: string
          order_item_id?: string
          pending_quantity?: number
          product_id?: string
          requested_quantity?: number
          updated_at?: string
          van_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "van_order_fulfillment_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_order_fulfillment_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_order_fulfillment_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_order_fulfillment_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_order_fulfillment_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      van_return_grn: {
        Row: {
          created_at: string
          id: string
          is_verified: boolean | null
          notes: string | null
          retailer_id: string
          return_date: string
          return_grn_number: string
          updated_at: string
          user_id: string
          van_id: string
          verified_at: string | null
          verified_by: string | null
          verified_by_name: string | null
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_verified?: boolean | null
          notes?: string | null
          retailer_id: string
          return_date?: string
          return_grn_number: string
          updated_at?: string
          user_id: string
          van_id: string
          verified_at?: string | null
          verified_by?: string | null
          verified_by_name?: string | null
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_verified?: boolean | null
          notes?: string | null
          retailer_id?: string
          return_date?: string
          return_grn_number?: string
          updated_at?: string
          user_id?: string
          van_id?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_by_name?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "van_return_grn_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_return_grn_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_return_grn_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      van_return_grn_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          return_grn_id: string
          return_quantity: number
          return_reason: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          return_grn_id: string
          return_quantity?: number
          return_reason?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          return_grn_id?: string
          return_quantity?: number
          return_reason?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "van_return_grn_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_return_grn_items_return_grn_id_fkey"
            columns: ["return_grn_id"]
            isOneToOne: false
            referencedRelation: "van_return_grn"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_return_grn_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      van_sales_settings: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      van_stock: {
        Row: {
          beat_id: string | null
          created_at: string
          end_km: number | null
          end_of_day_stock: Json
          id: string
          start_km: number | null
          start_of_day_stock: Json
          status: string
          stock_date: string
          total_km: number | null
          total_ordered_qty: Json
          updated_at: string
          user_id: string
          van_id: string
        }
        Insert: {
          beat_id?: string | null
          created_at?: string
          end_km?: number | null
          end_of_day_stock?: Json
          id?: string
          start_km?: number | null
          start_of_day_stock?: Json
          status?: string
          stock_date?: string
          total_km?: number | null
          total_ordered_qty?: Json
          updated_at?: string
          user_id: string
          van_id: string
        }
        Update: {
          beat_id?: string | null
          created_at?: string
          end_km?: number | null
          end_of_day_stock?: Json
          id?: string
          start_km?: number | null
          start_of_day_stock?: Json
          status?: string
          stock_date?: string
          total_km?: number | null
          total_ordered_qty?: Json
          updated_at?: string
          user_id?: string
          van_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "van_stock_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      van_stock_adjustments: {
        Row: {
          adjustment_type: string
          created_at: string
          created_by: string
          id: string
          product_id: string
          product_name: string
          quantity: number
          reason: string | null
          van_stock_id: string
        }
        Insert: {
          adjustment_type: string
          created_at?: string
          created_by: string
          id?: string
          product_id: string
          product_name: string
          quantity: number
          reason?: string | null
          van_stock_id: string
        }
        Update: {
          adjustment_type?: string
          created_at?: string
          created_by?: string
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          reason?: string | null
          van_stock_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "van_stock_adjustments_van_stock_id_fkey"
            columns: ["van_stock_id"]
            isOneToOne: false
            referencedRelation: "van_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      van_stock_items: {
        Row: {
          created_at: string
          id: string
          left_qty: number
          ordered_qty: number
          product_id: string
          product_name: string
          returned_qty: number
          start_qty: number
          unit: string | null
          updated_at: string
          van_stock_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          left_qty?: number
          ordered_qty?: number
          product_id: string
          product_name: string
          returned_qty?: number
          start_qty?: number
          unit?: string | null
          updated_at?: string
          van_stock_id: string
        }
        Update: {
          created_at?: string
          id?: string
          left_qty?: number
          ordered_qty?: number
          product_id?: string
          product_name?: string
          returned_qty?: number
          start_qty?: number
          unit?: string | null
          updated_at?: string
          van_stock_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "van_stock_items_van_stock_id_fkey"
            columns: ["van_stock_id"]
            isOneToOne: false
            referencedRelation: "van_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      van_stock_opening_edits: {
        Row: {
          created_at: string
          difference: number
          edit_source: string | null
          edited_qty: number
          id: string
          previous_qty: number
          product_id: string
          product_name: string
          unit: string | null
          updated_at: string
          user_id: string
          van_stock_id: string
        }
        Insert: {
          created_at?: string
          difference?: number
          edit_source?: string | null
          edited_qty?: number
          id?: string
          previous_qty?: number
          product_id: string
          product_name: string
          unit?: string | null
          updated_at?: string
          user_id: string
          van_stock_id: string
        }
        Update: {
          created_at?: string
          difference?: number
          edit_source?: string | null
          edited_qty?: number
          id?: string
          previous_qty?: number
          product_id?: string
          product_name?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
          van_stock_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "van_stock_opening_edits_van_stock_id_fkey"
            columns: ["van_stock_id"]
            isOneToOne: false
            referencedRelation: "van_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      vans: {
        Row: {
          assigned_user_id: string | null
          created_at: string
          created_by: string | null
          driver_address: string | null
          driver_id_proof_url: string | null
          driver_name: string | null
          driver_phone: string | null
          id: string
          insurance_expiry_date: string | null
          insurance_url: string | null
          is_active: boolean
          make_model: string
          pollution_cert_url: string | null
          pollution_expiry_date: string | null
          purchase_date: string | null
          rc_book_url: string | null
          rc_expiry_date: string | null
          registration_number: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          created_at?: string
          created_by?: string | null
          driver_address?: string | null
          driver_id_proof_url?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          insurance_expiry_date?: string | null
          insurance_url?: string | null
          is_active?: boolean
          make_model: string
          pollution_cert_url?: string | null
          pollution_expiry_date?: string | null
          purchase_date?: string | null
          rc_book_url?: string | null
          rc_expiry_date?: string | null
          registration_number: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          created_at?: string
          created_by?: string | null
          driver_address?: string | null
          driver_id_proof_url?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          insurance_expiry_date?: string | null
          insurance_url?: string | null
          is_active?: boolean
          make_model?: string
          pollution_cert_url?: string | null
          pollution_expiry_date?: string | null
          purchase_date?: string | null
          rc_book_url?: string | null
          rc_expiry_date?: string | null
          registration_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          about_business: string | null
          annual_revenue: number | null
          assets_trucks: number | null
          assets_vans: number | null
          business_hunger: string | null
          city: string | null
          competitors: string[] | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          coverage_area: string | null
          created_at: string
          created_by: string
          established_year: number | null
          id: string
          is_approved: boolean
          name: string
          other_products: string[] | null
          products_distributed: string[] | null
          profitability: string | null
          region_pincodes: string[]
          sales_team_size: number | null
          skills: string[]
          state: string | null
          stockist_status: string | null
          updated_at: string
        }
        Insert: {
          about_business?: string | null
          annual_revenue?: number | null
          assets_trucks?: number | null
          assets_vans?: number | null
          business_hunger?: string | null
          city?: string | null
          competitors?: string[] | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          coverage_area?: string | null
          created_at?: string
          created_by: string
          established_year?: number | null
          id?: string
          is_approved?: boolean
          name: string
          other_products?: string[] | null
          products_distributed?: string[] | null
          profitability?: string | null
          region_pincodes?: string[]
          sales_team_size?: number | null
          skills?: string[]
          state?: string | null
          stockist_status?: string | null
          updated_at?: string
        }
        Update: {
          about_business?: string | null
          annual_revenue?: number | null
          assets_trucks?: number | null
          assets_vans?: number | null
          business_hunger?: string | null
          city?: string | null
          competitors?: string[] | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          coverage_area?: string | null
          created_at?: string
          created_by?: string
          established_year?: number | null
          id?: string
          is_approved?: boolean
          name?: string
          other_products?: string[] | null
          products_distributed?: string[] | null
          profitability?: string | null
          region_pincodes?: string[]
          sales_team_size?: number | null
          skills?: string[]
          state?: string | null
          stockist_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      visit_ai_insights: {
        Row: {
          created_at: string | null
          id: string
          insights: Json
          retailer_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          insights: Json
          retailer_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          insights?: Json
          retailer_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_ai_insights_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          check_in_address: string | null
          check_in_location: Json | null
          check_in_photo_url: string | null
          check_in_time: string | null
          check_out_address: string | null
          check_out_location: Json | null
          check_out_photo_url: string | null
          check_out_time: string | null
          completion_source: string | null
          created_at: string
          feedback: Json | null
          id: string
          location_match_in: boolean | null
          location_match_out: boolean | null
          no_order_reason: string | null
          planned_date: string
          retailer_id: string | null
          skip_check_in_reason: string | null
          skip_check_in_time: string | null
          status: string
          updated_at: string
          user_id: string
          visit_type: string | null
        }
        Insert: {
          check_in_address?: string | null
          check_in_location?: Json | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_out_address?: string | null
          check_out_location?: Json | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          completion_source?: string | null
          created_at?: string
          feedback?: Json | null
          id?: string
          location_match_in?: boolean | null
          location_match_out?: boolean | null
          no_order_reason?: string | null
          planned_date: string
          retailer_id?: string | null
          skip_check_in_reason?: string | null
          skip_check_in_time?: string | null
          status?: string
          updated_at?: string
          user_id: string
          visit_type?: string | null
        }
        Update: {
          check_in_address?: string | null
          check_in_location?: Json | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_out_address?: string | null
          check_out_location?: Json | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          completion_source?: string | null
          created_at?: string
          feedback?: Json | null
          id?: string
          location_match_in?: boolean | null
          location_match_out?: boolean | null
          no_order_reason?: string | null
          planned_date?: string
          retailer_id?: string | null
          skip_check_in_reason?: string | null
          skip_check_in_time?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          visit_type?: string | null
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          code: string | null
          created_at: string | null
          distributor_id: string
          id: string
          is_default: boolean | null
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          distributor_id: string
          id?: string
          is_default?: boolean | null
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          distributor_id?: string
          id?: string
          is_default?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      week_off_config: {
        Row: {
          alternate_pattern: string | null
          created_at: string
          day_of_week: number
          id: string
          is_off: boolean
          updated_at: string
        }
        Insert: {
          alternate_pattern?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          is_off?: boolean
          updated_at?: string
        }
        Update: {
          alternate_pattern?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          is_off?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_config: {
        Row: {
          business_name: string | null
          business_phone_number: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          business_name?: string | null
          business_phone_number: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          business_name?: string | null
          business_phone_number?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      whatsapp_phone_name_cache: {
        Row: {
          name: string
          phone_key: string
          retailer_id: string
          updated_at: string
        }
        Insert: {
          name: string
          phone_key: string
          retailer_id: string
          updated_at?: string
        }
        Update: {
          name?: string
          phone_key?: string
          retailer_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_sessions: {
        Row: {
          beat_id: string | null
          conversation_history: Json | null
          created_at: string | null
          id: string
          last_active_at: string | null
          owner_id: string | null
          pending_items: Json | null
          phone_number: string
          retailer_id: string | null
          retailer_name: string | null
          state: string
          territory_id: string | null
        }
        Insert: {
          beat_id?: string | null
          conversation_history?: Json | null
          created_at?: string | null
          id?: string
          last_active_at?: string | null
          owner_id?: string | null
          pending_items?: Json | null
          phone_number: string
          retailer_id?: string | null
          retailer_name?: string | null
          state?: string
          territory_id?: string | null
        }
        Update: {
          beat_id?: string | null
          conversation_history?: Json | null
          created_at?: string | null
          id?: string
          last_active_at?: string | null
          owner_id?: string | null
          pending_items?: Json | null
          phone_number?: string
          retailer_id?: string | null
          retailer_name?: string | null
          state?: string
          territory_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sessions_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      work_experiences: {
        Row: {
          company_name: string
          created_at: string | null
          description: string | null
          designation: string | null
          from_date: string | null
          id: string
          is_current: boolean | null
          location: string | null
          to_date: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_name: string
          created_at?: string | null
          description?: string | null
          designation?: string | null
          from_date?: string | null
          id?: string
          is_current?: boolean | null
          location?: string | null
          to_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_name?: string
          created_at?: string | null
          description?: string | null
          designation?: string | null
          from_date?: string | null
          id?: string
          is_current?: boolean | null
          location?: string | null
          to_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      workflow_steps: {
        Row: {
          approver_role: string | null
          approver_type: string
          created_at: string
          hierarchy_level: number | null
          id: string
          specific_user_id: string | null
          step_number: number
          workflow_id: string
        }
        Insert: {
          approver_role?: string | null
          approver_type?: string
          created_at?: string
          hierarchy_level?: number | null
          id?: string
          specific_user_id?: string | null
          step_number?: number
          workflow_id: string
        }
        Update: {
          approver_role?: string | null
          approver_type?: string
          created_at?: string
          hierarchy_level?: number | null
          id?: string
          specific_user_id?: string | null
          step_number?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      working_days_config: {
        Row: {
          created_at: string
          holidays: number | null
          id: string
          month: number
          total_days: number
          updated_at: string
          week_offs: number
          working_days: number
          year: number
        }
        Insert: {
          created_at?: string
          holidays?: number | null
          id?: string
          month: number
          total_days: number
          updated_at?: string
          week_offs?: number
          working_days: number
          year: number
        }
        Update: {
          created_at?: string
          holidays?: number | null
          id?: string
          month?: number
          total_days?: number
          updated_at?: string
          week_offs?: number
          working_days?: number
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      orders_total_amount: {
        Row: {
          total_amount: number | null
        }
        Insert: {
          total_amount?: number | null
        }
        Update: {
          total_amount?: number | null
        }
        Relationships: []
      }
      productive_summary_daywise: {
        Row: {
          planned_date: string | null
          productive_visits: number | null
          productivity_percentage: number | null
          total_visits: number | null
          unproductive_visits: number | null
        }
        Relationships: []
      }
      productive_summary_week: {
        Row: {
          planned_date: string | null
          productive_visits: number | null
          productivity_percentage: number | null
          total_visits: number | null
          unproductive_visits: number | null
        }
        Relationships: []
      }
      productive_view: {
        Row: {
          full_name: string | null
          productive_visits: number | null
          productivity_percentage: number | null
          total_visits: number | null
        }
        Relationships: []
      }
      retailer_loyalty_balance: {
        Row: {
          retailer_id: string | null
          total_points: number | null
          total_transactions: number | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_loyalty_points_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _safe_uuid: { Args: { p: string }; Returns: string }
      admin_deactivate_all_products: { Args: never; Returns: Json }
      allocate_inventory_batches: {
        Args: {
          p_distributor_id: string
          p_product_id: string
          p_required_qty: number
          p_strategy?: string
          p_warehouse_id?: string
        }
        Returns: Json
      }
      allocate_payment_fifo: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      allocate_payment_manual: {
        Args: { p_allocations: Json; p_payment_id: string }
        Returns: undefined
      }
      apply_event_stock_for_order: {
        Args: {
          p_items: Json
          p_order_date: string
          p_order_id: string
          p_visit_id: string
        }
        Returns: Json
      }
      assign_retailer_to_beat: {
        Args: { p_beat_id: string; p_reason?: string; p_retailer_id: string }
        Returns: Json
      }
      award_retailer_points: {
        Args: { p_activity: string; p_points: number; p_retailer_id: string }
        Returns: undefined
      }
      calculate_beat_adherence: {
        Args: { p_end: string; p_start: string; p_user_id: string }
        Returns: number
      }
      calculate_leave_days: {
        Args: {
          p_end_date: string
          p_is_half_day?: boolean
          p_leave_type_id: string
          p_start_date: string
        }
        Returns: {
          sandwich_days: number
          total_days: number
        }[]
      }
      calculate_new_retailers: {
        Args: { p_end: string; p_start: string; p_user_id: string }
        Returns: number
      }
      calculate_productive_visits: {
        Args: { p_end: string; p_start: string; p_user_id: string }
        Returns: number
      }
      calculate_retailer_quality_score: {
        Args: { p_retailer_id: string }
        Returns: number
      }
      calculate_revenue_contribution: {
        Args: { p_end: string; p_start: string; p_user_id: string }
        Returns: number
      }
      calculate_user_kpi_actual: {
        Args: {
          p_end: string
          p_kpi_key: string
          p_start: string
          p_user_id: string
        }
        Returns: number
      }
      calculate_visit_completion_rate: {
        Args: { p_end: string; p_start: string; p_user_id: string }
        Returns: number
      }
      can_access_invitation: {
        Args: { _invitation_token: string }
        Returns: boolean
      }
      can_access_object: {
        Args: {
          object_name_param: string
          permission_type: string
          user_id_param: string
        }
        Returns: boolean
      }
      can_access_packing_list: {
        Args: { _packing_list_id: string }
        Returns: boolean
      }
      can_delete_beat: { Args: { p_beat_id: string }; Returns: Json }
      can_place_order_for_retailer: {
        Args: { p_retailer_id: string }
        Returns: Json
      }
      can_view_distributor: {
        Args: { _distributor_id: string }
        Returns: boolean
      }
      can_view_employee: { Args: { _target_user_id: string }; Returns: boolean }
      can_view_profile: { Args: { _target_user_id: string }; Returns: boolean }
      cancel_order_atomic: {
        Args: { p_cancelled_by: string; p_order_id: string; p_reason: string }
        Returns: Json
      }
      cancel_packing_list_reservations: {
        Args: { p_packing_list_id: string }
        Returns: Json
      }
      check_duplicate_competitor: {
        Args: { competitor_name_param: string }
        Returns: {
          competitor_id: string
          competitor_image_url: string
          competitor_name: string
          is_duplicate: boolean
          product_details: string
        }[]
      }
      check_opening_stock_exists: {
        Args: {
          p_distributor_id: string
          p_product_id: string
          p_warehouse_id?: string
        }
        Returns: boolean
      }
      cleanup_expired_coverage: { Args: never; Returns: undefined }
      cleanup_expired_insights: { Args: never; Returns: undefined }
      cleanup_expired_recommendations: { Args: never; Returns: undefined }
      cleanup_expired_reset_tokens: { Args: never; Returns: undefined }
      cleanup_old_execution_logs: { Args: never; Returns: undefined }
      create_approval_request: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_requester_id: string
        }
        Returns: string
      }
      create_approval_workflow: {
        Args: { user_id_param: string }
        Returns: undefined
      }
      create_packing_list_atomic: {
        Args: {
          p_batch_allocations?: Json
          p_delivery_date: string
          p_distributor_id: string
          p_items: Json
          p_order_ids: string[]
          p_order_type?: string
          p_sources?: Json
          p_strategy?: string
          p_total_value?: number
          p_warehouse_id?: string
        }
        Returns: Json
      }
      create_user_delegation: {
        Args: {
          p_beat_ids: string[]
          p_effective_from: string
          p_effective_to: string
          p_notes?: string
          p_retailer_ids: string[]
          p_scope: string
          p_to_user: string
        }
        Returns: string
      }
      deactivate_beat: { Args: { p_beat_id: string }; Returns: Json }
      delete_beat_permanent: { Args: { p_beat_id: string }; Returns: Json }
      delete_packing_list_atomic: {
        Args: { p_packing_list_id: string }
        Returns: Json
      }
      detect_retailer_duplicates: {
        Args: {
          p_address: string
          p_gst: string
          p_lat: number
          p_lng: number
          p_name: string
          p_phone: string
          p_retailer_id: string
        }
        Returns: number
      }
      dispatch_batch_stock: {
        Args: {
          p_batch_id: string
          p_distributor_id: string
          p_packing_list_id: string
          p_product_id: string
          p_qty: number
        }
        Returns: undefined
      }
      dispatch_packing_list_atomic: {
        Args: { p_packing_list_id: string }
        Returns: Json
      }
      emit_notification_event: {
        Args: {
          p_actor_user_id: string
          p_event_code: string
          p_metadata?: Json
          p_record_id: string
          p_source_table: string
        }
        Returns: undefined
      }
      execute_stock_action: {
        Args: {
          p_action: string
          p_batch_no?: string
          p_created_by?: string
          p_distributor_id: string
          p_expiry_date?: string
          p_mfg_date?: string
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_reference_id?: string
          p_reference_number?: string
          p_supplier_batch_code?: string
          p_warehouse_id?: string
        }
        Returns: Json
      }
      execute_stock_action_numeric: {
        Args: {
          p_action: string
          p_batch_no?: string
          p_created_by?: string
          p_distributor_id: string
          p_expiry_date?: string
          p_mfg_date?: string
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_reference_id?: string
          p_reference_number?: string
          p_supplier_batch_code?: string
          p_warehouse_id?: string
        }
        Returns: Json
      }
      expire_user_delegations: { Args: never; Returns: undefined }
      generate_grn_number: { Args: never; Returns: string }
      generate_invoice_number: { Args: never; Returns: string }
      generate_primary_invoice_number: { Args: never; Returns: string }
      generate_return_number: { Args: never; Returns: string }
      generate_shipment_number: { Args: never; Returns: string }
      generate_system_batch_code: {
        Args: { p_date?: string; p_product_id: string; p_warehouse_id: string }
        Returns: string
      }
      get_activity_logging_summary: { Args: { p_days: number }; Returns: Json }
      get_all_subordinates: {
        Args: { manager_user_id: string }
        Returns: {
          full_name: string
          level: number
          subordinate_user_id: string
        }[]
      }
      get_auth_user_id_by_email: {
        Args: { lookup_email: string }
        Returns: string
      }
      get_authenticated_email: { Args: never; Returns: string }
      get_basic_profiles_for_admin: {
        Args: never
        Returns: {
          created_at: string
          full_name: string
          id: string
          username: string
        }[]
      }
      get_collection_workspace: {
        Args: { p_filter?: string }
        Returns: {
          access_type: string
          oldest_invoice_date: string
          open_invoice_count: number
          outstanding: number
          retailer_id: string
          retailer_name: string
        }[]
      }
      get_database_metrics: { Args: never; Returns: Json }
      get_direct_reports: {
        Args: { manager_user_id: string }
        Returns: {
          full_name: string
          profile_picture_url: string
          subordinate_user_id: string
        }[]
      }
      get_distinct_districts: {
        Args: { p_state: string }
        Returns: {
          district: string
        }[]
      }
      get_distinct_pincodes: {
        Args: { p_district: string; p_state: string }
        Returns: {
          pincode: string
        }[]
      }
      get_distinct_states: {
        Args: never
        Returns: {
          statename: string
        }[]
      }
      get_distributor_id_for_auth_user: { Args: never; Returns: string }
      get_employee_basic_info: {
        Args: { employee_user_id: string }
        Returns: {
          full_name: string
          hq: string
          user_id: string
        }[]
      }
      get_enabled_units: {
        Args: { p_category?: string }
        Returns: {
          category: string
          code: string
          display_order: number
          is_default: boolean
          name: string
          uom_id: string
        }[]
      }
      get_estimated_memory_usage: { Args: never; Returns: Json }
      get_leave_date_constraints: {
        Args: { p_leave_type_id: string; p_user_id: string }
        Returns: Json
      }
      get_limited_profiles_for_admin: {
        Args: never
        Returns: {
          created_at: string
          full_name: string
          id: string
          profile_picture_url: string
          user_status: Database["public"]["Enums"]["user_status"]
          username: string
        }[]
      }
      get_my_operations_today: {
        Args: { p_date?: string }
        Returns: {
          access_type: string
          beat_id: string
          pending_collection: number
          retailer_id: string
          retailer_name: string
        }[]
      }
      get_org_beat_names: {
        Args: { p_distributor_id?: string }
        Returns: {
          beat_name: string
          full_name: string
          user_id: string
          username: string
        }[]
      }
      get_password_reset_stats: {
        Args: never
        Returns: {
          email: string
          failed_attempts: number
          is_locked: boolean
          last_attempt: string
          total_attempts: number
        }[]
      }
      get_product_revenue_performance: {
        Args: { end_date?: string; start_date?: string; user_full_name: string }
        Returns: {
          full_name: string
          product_name: string
          quantity_sold: number
          revenue: number
          unit: string
        }[]
      }
      get_product_units: {
        Args: { p_product_id: string }
        Returns: {
          category: string
          code: string
          conversion_to_base: number
          is_active: boolean
          is_base: boolean
          is_default_purchase: boolean
          is_default_sales: boolean
          is_price_basis: boolean
          mapping_id: string
          name: string
          uom_id: string
        }[]
      }
      get_productivity_summary:
        | {
            Args: { user_full_name: string }
            Returns: {
              full_name: string
              planned_date: string
              productive_visits: number
              productivity_percentage: number
              total_visits: number
              unproductive_visits: number
            }[]
          }
        | {
            Args: {
              end_date?: string
              start_date?: string
              user_full_name: string
            }
            Returns: {
              full_name: string
              planned_date: string
              productive_visits: number
              productivity_percentage: number
              total_visits: number
              unproductive_visits: number
            }[]
          }
      get_profiles_for_selector: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_public_vendors: {
        Args: never
        Returns: {
          city: string
          created_at: string
          id: string
          is_approved: boolean
          name: string
          region_pincodes: string[]
          skills: string[]
          state: string
        }[]
      }
      get_reporting_chain: {
        Args: { p_user_id: string }
        Returns: {
          full_name: string
          level: number
          manager_id: string
        }[]
      }
      get_retailer_ext_cities: {
        Args: { selected_state: string }
        Returns: {
          city: string
        }[]
      }
      get_retailer_ext_states: {
        Args: never
        Returns: {
          state: string
        }[]
      }
      get_retailer_unsorted_cities: {
        Args: { p_district: string; p_state: string }
        Returns: {
          city: string
          count: number
        }[]
      }
      get_retailer_unsorted_districts: {
        Args: { p_state: string }
        Returns: {
          count: number
          district: string
        }[]
      }
      get_retailer_unsorted_states: {
        Args: never
        Returns: {
          count: number
          state: string
        }[]
      }
      get_state_analytics: {
        Args: never
        Returns: {
          converted_retailers: number
          state_name: string
          total_districts: number
          total_pincodes: number
          total_retailers: number
        }[]
      }
      get_subordinate_users: {
        Args: { user_id_param: string }
        Returns: {
          subordinate_user_id: string
        }[]
      }
      get_suspicious_access_attempts: {
        Args: never
        Returns: {
          action: string
          attempt_count: number
          first_attempt: string
          last_attempt: string
          table_name: string
          user_id: string
        }[]
      }
      get_territory_sales_summary: {
        Args: {
          end_date_param?: string
          start_date_param?: string
          territory_id_param: string
        }
        Returns: {
          total_orders: number
          total_retailers: number
          total_sales: number
        }[]
      }
      get_type_supports_primary: { Args: { p_code: string }; Returns: boolean }
      get_unit_usage_count: {
        Args: { p_uom_id: string }
        Returns: {
          mappings_using: number
          products_using: number
        }[]
      }
      get_unsorted_state_analytics: {
        Args: never
        Returns: {
          converted_retailers: number
          state_name: string
          total_districts: number
          total_pincodes: number
          total_retailers: number
        }[]
      }
      get_uom_categories: {
        Args: never
        Returns: {
          code: string
          description: string
          enabled: boolean
          id: string
          is_system: boolean
          name: string
          sort_order: number
        }[]
      }
      get_user_profile_card: { Args: { p_user_id: string }; Returns: Json }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_type: { Args: { p_user_id: string }; Returns: string }
      get_vendor_contact_info: {
        Args: { vendor_id: string }
        Returns: {
          city: string
          competitors: string[]
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          created_by: string
          id: string
          is_approved: boolean
          name: string
          region_pincodes: string[]
          skills: string[]
          state: string
          updated_at: string
        }[]
      }
      get_vendors_public_info: {
        Args: never
        Returns: {
          city: string
          created_at: string
          id: string
          is_approved: boolean
          name: string
          region_pincodes: string[]
          skills: string[]
          state: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_hint_answer: { Args: { answer: string }; Returns: string }
      initialize_leave_policy_balances: {
        Args: { p_policy_id: string }
        Returns: undefined
      }
      is_account_locked: { Args: { user_email: string }; Returns: boolean }
      is_admin_or_manager: { Args: never; Returns: boolean }
      is_approver_for_request: {
        Args: { request_id: string; user_id: string }
        Returns: boolean
      }
      is_coordinator: { Args: { p_uid: string }; Returns: boolean }
      is_manager: { Args: { user_id_param: string }; Returns: boolean }
      is_requester_for_request: {
        Args: { request_id: string; user_id: string }
        Returns: boolean
      }
      is_system_admin: { Args: { _user_id: string }; Returns: boolean }
      list_team_members: {
        Args: never
        Returns: {
          full_name: string
          hq: string
          manager_id: string
          profile_picture_url: string
          user_id: string
          username: string
        }[]
      }
      log_sensitive_access: {
        Args: { p_action: string; p_record_id: string; p_table_name: string }
        Returns: undefined
      }
      nextval_text: { Args: { seq_name: string }; Returns: string }
      owns_completed_invitation: {
        Args: { _email: string; _user_id: string }
        Returns: boolean
      }
      partial_ownership_transfer: {
        Args: {
          p_caller?: string
          p_dry_run?: boolean
          p_from: string
          p_payload: Json
          p_to: string
        }
        Returns: Json
      }
      pm_is_project_member: { Args: { project_uuid: string }; Returns: boolean }
      preview_inventory_allocation: {
        Args: {
          p_distributor_id: string
          p_product_id: string
          p_required_qty: number
          p_strategy?: string
          p_warehouse_id?: string
        }
        Returns: Json
      }
      process_approval_step: {
        Args: {
          p_action: string
          p_approval_request_id: string
          p_approver_id: string
          p_reason?: string
        }
        Returns: Json
      }
      process_monthly_leave_accrual: { Args: never; Returns: undefined }
      process_year_end_carry_forward: { Args: never; Returns: undefined }
      push_retailer_notification: {
        Args: { p_actor_user_id: string; p_metadata?: Json; p_rule_id: string }
        Returns: number
      }
      reactivate_beat: { Args: { p_beat_id: string }; Returns: Json }
      record_route_execution: {
        Args: {
          p_action: string
          p_beat_id?: string
          p_remarks?: string
          p_retailer_id: string
          p_route_date?: string
        }
        Returns: string
      }
      refresh_daily_admin_summary: {
        Args: { p_date: string }
        Returns: undefined
      }
      refresh_user_monthly_summary: {
        Args: { p_month: number; p_user_id: string; p_year: number }
        Returns: undefined
      }
      release_all_packing_list_reservations: {
        Args: { p_packing_list_id: string }
        Returns: Json
      }
      release_batch_reservation: {
        Args: { p_batch_id: string; p_qty: number }
        Returns: undefined
      }
      release_shortfall_on_packed: {
        Args: { p_packing_list_id: string }
        Returns: Json
      }
      resolve_effective_leave_policy: {
        Args: { p_leave_type_id: string; p_user_id: string }
        Returns: Json
      }
      reverse_retailer_points: {
        Args: { p_reason: string; p_retailer_id: string }
        Returns: undefined
      }
      revoke_retailer_access: {
        Args: { p_share_id: string }
        Returns: undefined
      }
      run_load_test: { Args: never; Returns: undefined }
      search_products_for_order: {
        Args: { p_category?: string; p_limit?: number; p_query: string }
        Returns: {
          category_name: string
          closing_stock: number
          id: string
          is_active: boolean
          is_focused_product: boolean
          name: string
          rate: number
          sku: string
          unit: string
          variants: Json
        }[]
      }
      send_broadcast_notification: {
        Args: {
          p_actor_user_id: string
          p_distributor_target_ids?: string[]
          p_distributor_target_type?: string
          p_field_sales_target_ids?: string[]
          p_field_sales_target_type?: string
          p_message: string
          p_portals?: string[]
          p_target_ids?: string[]
          p_target_type?: string
          p_title: string
        }
        Returns: number
      }
      send_notification: {
        Args: {
          message_param: string
          related_id_param?: string
          related_table_param?: string
          title_param: string
          type_param?: string
          user_id_param: string
        }
        Returns: string
      }
      share_retailer_access: {
        Args: {
          p_can_collect_payment?: boolean
          p_can_take_orders?: boolean
          p_can_update_feedback?: boolean
          p_can_view?: boolean
          p_effective_from?: string
          p_effective_to?: string
          p_retailer_id: string
          p_to_user: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_order_with_items: {
        Args: { p_items: Json; p_order: Json }
        Returns: Json
      }
      sync_order_with_items_v2: { Args: { p_payload: Json }; Returns: Json }
      to_base_qty: {
        Args: { p_product_id: string; p_qty: number; p_uom_code: string }
        Returns: number
      }
      transfer_beat_complete: {
        Args: {
          p_beat_id: string
          p_effective_date?: string
          p_new_owner_id: string
          p_reason?: string
          p_transferred_by: string
        }
        Returns: Json
      }
      transfer_retailer_beat: {
        Args: {
          p_new_beat_id: string
          p_reason?: string
          p_retailer_id: string
        }
        Returns: Json
      }
      transfer_user_data_partial: {
        Args: {
          p_dry_run?: boolean
          p_from: string
          p_payload: Json
          p_to: string
        }
        Returns: Json
      }
      unlock_password_reset: { Args: { user_email: string }; Returns: boolean }
      update_picking_atomic: {
        Args: { p_batch_row_id: string; p_picked_qty: number }
        Returns: Json
      }
      update_security_info: {
        Args: { new_hint_answer: string; new_hint_question: string }
        Returns: boolean
      }
      update_security_info_secure: {
        Args: {
          new_hint_answer: string
          new_hint_question: string
          new_phone_number?: string
          new_recovery_email?: string
        }
        Returns: boolean
      }
      update_sensitive_profile_fields: {
        Args: {
          new_hint_answer?: string
          new_hint_question?: string
          new_phone_number?: string
          new_recovery_email?: string
        }
        Returns: boolean
      }
      user_has_action_permission: {
        Args: { _action: string; _perm: string; _user_id: string }
        Returns: boolean
      }
      user_has_beat_access: {
        Args: { _beat_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_operational_access: {
        Args: { _perm: string; _retailer: string; _user: string }
        Returns: boolean
      }
      user_has_permission: {
        Args: { _object: string; _perm: string; _user_id: string }
        Returns: boolean
      }
      user_owns_retailer: {
        Args: { _retailer: string; _user: string }
        Returns: boolean
      }
      validate_invitation_token: {
        Args: { _token: string }
        Returns: {
          email: string
          expires_at: string
          full_name: string
          id: string
          manager_id: string
          phone_number: string
        }[]
      }
      validate_leave_request: {
        Args: {
          p_end_date: string
          p_is_half_day?: boolean
          p_leave_type_id: string
          p_start_date: string
          p_user_id: string
        }
        Returns: Json
      }
      verify_hint_answer: {
        Args: { submitted_answer: string; user_email: string }
        Returns: boolean
      }
      verify_hint_answer_secure: {
        Args: { submitted_answer: string; user_email: string }
        Returns: boolean
      }
      verify_hint_answer_with_rate_limit: {
        Args: {
          submitted_answer: string
          user_agent_str?: string
          user_email: string
          user_ip?: string
        }
        Returns: {
          attempts_remaining: number
          is_locked: boolean
          is_valid: boolean
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      approval_status: "pending" | "approved" | "rejected"
      branding_status:
        | "submitted"
        | "manager_approved"
        | "manager_rejected"
        | "assigned"
        | "in_progress"
        | "executed"
        | "verified"
      employee_doc_type: "address_proof" | "id_proof" | "other"
      pm_member_role:
        | "owner"
        | "manager"
        | "developer"
        | "designer"
        | "tester"
        | "viewer"
      pm_priority: "critical" | "high" | "medium" | "low"
      pm_project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      pm_sprint_status: "planning" | "active" | "completed" | "cancelled"
      pm_task_status:
        | "backlog"
        | "todo"
        | "in_progress"
        | "in_review"
        | "done"
        | "cancelled"
        | "overdue"
      pm_task_type: "epic" | "story" | "task" | "bug" | "idea" | "milestone"
      user_status:
        | "pending_completion"
        | "pending_approval"
        | "approved"
        | "rejected"
        | "active"
        | "inactive"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      approval_status: ["pending", "approved", "rejected"],
      branding_status: [
        "submitted",
        "manager_approved",
        "manager_rejected",
        "assigned",
        "in_progress",
        "executed",
        "verified",
      ],
      employee_doc_type: ["address_proof", "id_proof", "other"],
      pm_member_role: [
        "owner",
        "manager",
        "developer",
        "designer",
        "tester",
        "viewer",
      ],
      pm_priority: ["critical", "high", "medium", "low"],
      pm_project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      pm_sprint_status: ["planning", "active", "completed", "cancelled"],
      pm_task_status: [
        "backlog",
        "todo",
        "in_progress",
        "in_review",
        "done",
        "cancelled",
        "overdue",
      ],
      pm_task_type: ["epic", "story", "task", "bug", "idea", "milestone"],
      user_status: [
        "pending_completion",
        "pending_approval",
        "approved",
        "rejected",
        "active",
        "inactive",
      ],
    },
  },
} as const
