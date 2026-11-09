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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_runs: {
        Row: {
          confidence: number | null
          created_at: string
          error: string | null
          fiscal_document_id: string | null
          id: string
          latency_ms: number | null
          merchant_id: string
          model: string
          used_fallback: boolean
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          error?: string | null
          fiscal_document_id?: string | null
          id?: string
          latency_ms?: number | null
          merchant_id: string
          model: string
          used_fallback?: boolean
        }
        Update: {
          confidence?: number | null
          created_at?: string
          error?: string | null
          fiscal_document_id?: string | null
          id?: string
          latency_ms?: number | null
          merchant_id?: string
          model?: string
          used_fallback?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_fiscal_document_id_fkey"
            columns: ["fiscal_document_id"]
            isOneToOne: false
            referencedRelation: "fiscal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_documents: {
        Row: {
          ai_mapped: boolean
          amount: number | null
          confidence: number | null
          created_at: string
          currency: string | null
          explanation_en: string | null
          explanation_hr: string | null
          fira_request: Json | null
          fira_response: Json | null
          id: string
          invoice_type: string | null
          kind: string
          line_items: Json
          merchant_id: string
          original_document_id: string | null
          paypal_event_id: string | null
          resource_id: string | null
          skip_reason: string | null
          source_context: Json | null
          status: string
          validation_errors: Json
          warnings: Json
        }
        Insert: {
          ai_mapped?: boolean
          amount?: number | null
          confidence?: number | null
          created_at?: string
          currency?: string | null
          explanation_en?: string | null
          explanation_hr?: string | null
          fira_request?: Json | null
          fira_response?: Json | null
          id?: string
          invoice_type?: string | null
          kind: string
          line_items?: Json
          merchant_id: string
          original_document_id?: string | null
          paypal_event_id?: string | null
          resource_id?: string | null
          skip_reason?: string | null
          source_context?: Json | null
          status: string
          validation_errors?: Json
          warnings?: Json
        }
        Update: {
          ai_mapped?: boolean
          amount?: number | null
          confidence?: number | null
          created_at?: string
          currency?: string | null
          explanation_en?: string | null
          explanation_hr?: string | null
          fira_request?: Json | null
          fira_response?: Json | null
          id?: string
          invoice_type?: string | null
          kind?: string
          line_items?: Json
          merchant_id?: string
          original_document_id?: string | null
          paypal_event_id?: string | null
          resource_id?: string | null
          skip_reason?: string | null
          source_context?: Json | null
          status?: string
          validation_errors?: Json
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_documents_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_documents_original_document_id_fkey"
            columns: ["original_document_id"]
            isOneToOne: false
            referencedRelation: "fiscal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_documents_paypal_event_id_fkey"
            columns: ["paypal_event_id"]
            isOneToOne: false
            referencedRelation: "paypal_events"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_credentials: {
        Row: {
          fira_api_key: string | null
          fira_domain: string | null
          merchant_id: string
          paypal_client_id: string | null
          paypal_secret: string | null
          updated_at: string
        }
        Insert: {
          fira_api_key?: string | null
          fira_domain?: string | null
          merchant_id: string
          paypal_client_id?: string | null
          paypal_secret?: string | null
          updated_at?: string
        }
        Update: {
          fira_api_key?: string | null
          fira_domain?: string | null
          merchant_id?: string
          paypal_client_id?: string | null
          paypal_secret?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_credentials_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          business_name: string
          created_at: string
          default_vat_rate: number
          demo_mode: boolean
          fira_connected_at: string | null
          fira_domain: string | null
          fira_key_last4: string | null
          fira_payment_type: string
          id: string
          in_vat_system: boolean
          oib: string | null
          paypal_client_id_last4: string | null
          paypal_connected_at: string | null
          paypal_plan_id: string | null
          paypal_product_id: string | null
          paypal_webhook_id: string | null
          paypal_webhook_url: string | null
          user_id: string
        }
        Insert: {
          business_name?: string
          created_at?: string
          default_vat_rate?: number
          demo_mode?: boolean
          fira_connected_at?: string | null
          fira_domain?: string | null
          fira_key_last4?: string | null
          fira_payment_type?: string
          id?: string
          in_vat_system?: boolean
          oib?: string | null
          paypal_client_id_last4?: string | null
          paypal_connected_at?: string | null
          paypal_plan_id?: string | null
          paypal_product_id?: string | null
          paypal_webhook_id?: string | null
          paypal_webhook_url?: string | null
          user_id: string
        }
        Update: {
          business_name?: string
          created_at?: string
          default_vat_rate?: number
          demo_mode?: boolean
          fira_connected_at?: string | null
          fira_domain?: string | null
          fira_key_last4?: string | null
          fira_payment_type?: string
          id?: string
          in_vat_system?: boolean
          oib?: string | null
          paypal_client_id_last4?: string | null
          paypal_connected_at?: string | null
          paypal_plan_id?: string | null
          paypal_product_id?: string | null
          paypal_webhook_id?: string | null
          paypal_webhook_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      paypal_events: {
        Row: {
          amount: number | null
          currency: string | null
          event_type: string
          id: string
          merchant_id: string
          paypal_event_id: string
          raw: Json | null
          received_at: string
          resource_id: string | null
          route: string | null
          simulated: boolean
          verified: boolean
        }
        Insert: {
          amount?: number | null
          currency?: string | null
          event_type: string
          id?: string
          merchant_id: string
          paypal_event_id: string
          raw?: Json | null
          received_at?: string
          resource_id?: string | null
          route?: string | null
          simulated?: boolean
          verified?: boolean
        }
        Update: {
          amount?: number | null
          currency?: string | null
          event_type?: string
          id?: string
          merchant_id?: string
          paypal_event_id?: string
          raw?: Json | null
          received_at?: string
          resource_id?: string | null
          route?: string | null
          simulated?: boolean
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "paypal_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_nonces: {
        Row: {
          created_at: string
          event_type: string
          expires_at: string
          id: string
          merchant_id: string
          paypal_event_id: string | null
          used_at: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          expires_at?: string
          id?: string
          merchant_id: string
          paypal_event_id?: string | null
          used_at?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          expires_at?: string
          id?: string
          merchant_id?: string
          paypal_event_id?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "simulation_nonces_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
