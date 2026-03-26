export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          period_start_day: number
          period_start_month: number
          used_web: boolean
          used_android: boolean
          used_ios: boolean
          platforms_used: string[]
          subscription_status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          period_start_day?: number
          period_start_month?: number
          used_web?: boolean
          used_android?: boolean
          used_ios?: boolean
          platforms_used?: string[]
          subscription_status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          period_start_day?: number
          period_start_month?: number
          used_web?: boolean
          used_android?: boolean
          used_ios?: boolean
          platforms_used?: string[]
          subscription_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      inflows: {
        Row: {
          id: string
          user_id: string
          name_ar: string
          name_en: string
          amount: number
          type: 'fixed' | 'variable'
          date: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name_ar: string
          name_en: string
          amount: number
          type: 'fixed' | 'variable'
          date: string
          created_at?: string
        }
        Update: {
          name_ar?: string
          name_en?: string
          amount?: number
          type?: 'fixed' | 'variable'
          date?: string
        }
        Relationships: []
      }
      outflows: {
        Row: {
          id: string
          user_id: string
          name_ar: string
          name_en: string
          amount: number
          status: 'paid' | 'pending'
          date: string
          obligation_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name_ar: string
          name_en: string
          amount: number
          status?: 'paid' | 'pending'
          date: string
          obligation_id?: string | null
          created_at?: string
        }
        Update: {
          name_ar?: string
          name_en?: string
          amount?: number
          status?: 'paid' | 'pending'
          date?: string
          obligation_id?: string | null
        }
        Relationships: []
      }
      obligations: {
        Row: {
          id: string
          user_id: string
          name_ar: string
          name_en: string
          /** إجمالي الالتزام */
          amount: number
          /** المبلغ المسدَّد (جزئياً أو كاملاً) */
          paid_amount: number
          due_date: string
          date: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name_ar: string
          name_en: string
          amount: number
          paid_amount?: number
          due_date: string
          date: string
          created_at?: string
        }
        Update: {
          name_ar?: string
          name_en?: string
          amount?: number
          paid_amount?: number
          due_date?: string
          date?: string
          /** مخطط قاعدة البيانات قبل 002 فقط */
          status?: 'paid' | 'pending'
        }
        Relationships: []
      }
      savings_goals: {
        Row: {
          id: string
          user_id: string
          name_ar: string
          name_en: string
          target_amount: number
          current_amount: number
          /** تاريخ بداية الهدف */
          start_date: string
          /** تاريخ الإغلاق / الاستهداف */
          target_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name_ar: string
          name_en: string
          target_amount: number
          current_amount?: number
          start_date?: string
          target_date?: string | null
          created_at?: string
        }
        Update: {
          name_ar?: string
          name_en?: string
          target_amount?: number
          current_amount?: number
          start_date?: string
          target_date?: string | null
        }
        Relationships: []
      }
      savings_transactions: {
        Row: {
          id: string
          user_id: string
          goal_id: string
          type: 'deposit' | 'withdrawal'
          amount: number
          date: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          goal_id: string
          type: 'deposit' | 'withdrawal'
          amount: number
          date: string
          created_at?: string
        }
        Update: {
          type?: 'deposit' | 'withdrawal'
          amount?: number
          date?: string
        }
        Relationships: []
      }
      investment_wallet_transactions: {
        Row: {
          id: string
          user_id: string
          type: 'deposit' | 'withdrawal' | 'deal_open' | 'deal_close'
          amount: number
          date: string
          investment_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'deposit' | 'withdrawal' | 'deal_open' | 'deal_close'
          amount: number
          date: string
          investment_id?: string | null
          created_at?: string
        }
        Update: {
          type?: 'deposit' | 'withdrawal' | 'deal_open' | 'deal_close'
          amount?: number
          date?: string
          investment_id?: string | null
        }
        Relationships: []
      }
      investments: {
        Row: {
          id: string
          user_id: string
          name_ar: string
          name_en: string
          type: 'stocks' | 'partnership' | 'freelance' | 'other'
          entry_amount: number
          entry_date: string
          status: 'open' | 'closed'
          exit_amount: number | null
          exit_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name_ar: string
          name_en: string
          type: 'stocks' | 'partnership' | 'freelance' | 'other'
          entry_amount: number
          entry_date: string
          status?: 'open' | 'closed'
          exit_amount?: number | null
          exit_date?: string | null
          created_at?: string
        }
        Update: {
          name_ar?: string
          name_en?: string
          type?: 'stocks' | 'partnership' | 'freelance' | 'other'
          entry_amount?: number
          entry_date?: string
          status?: 'open' | 'closed'
          exit_amount?: number | null
          exit_date?: string | null
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          id: string
          user_id: string
          email: string
          message: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          email: string
          message: string
          created_at?: string
        }
        Update: {
          email?: string
          message?: string
        }
        Relationships: []
      }
      app_error_logs: {
        Row: {
          id: string
          message: string
          details: Json | null
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          message: string
          details?: Json | null
          user_id?: string | null
          created_at?: string
        }
        Update: {
          message?: string
          details?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// Convenience type aliases
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Inflow = Database['public']['Tables']['inflows']['Row']
export type Outflow = Database['public']['Tables']['outflows']['Row']
export type Obligation = Database['public']['Tables']['obligations']['Row']
export type SavingsGoal = Database['public']['Tables']['savings_goals']['Row']
export type SavingsTransaction = Database['public']['Tables']['savings_transactions']['Row']
export type Investment = Database['public']['Tables']['investments']['Row']
export type InvestmentWalletTransaction = Database['public']['Tables']['investment_wallet_transactions']['Row']
export type SupportMessage = Database['public']['Tables']['support_messages']['Row']
