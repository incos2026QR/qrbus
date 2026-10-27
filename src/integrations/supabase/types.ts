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
      admins_supervisors: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          paternal_surname: string | null
          phone: string | null
          role: Database["public"]["Enums"]["staff_role"]
          status: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id: string
          paternal_surname?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          status?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          paternal_surname?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          status?: string
        }
        Relationships: []
      }
      bancos: {
        Row: {
          codigo: string
          created_at: string | null
          id: string
          nombre: string
        }
        Insert: {
          codigo: string
          created_at?: string | null
          id?: string
          nombre: string
        }
        Update: {
          codigo?: string
          created_at?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      drivers: {
        Row: {
          balance: number
          bank_account: string | null
          bank_name: string | null
          birthdate: string | null
          ci_back_url: string | null
          ci_front_url: string | null
          ci_number: string | null
          created_at: string
          driver_code: string | null
          email: string | null
          first_name: string | null
          id: string
          license_url: string | null
          maternal_surname: string | null
          paternal_surname: string | null
          phone: string | null
          rejection_reason: string | null
          resubmission_count: number
          selfie_url: string | null
          status: Database["public"]["Enums"]["user_status"]
          transport_line: string | null
          union_doc_url: string | null
        }
        Insert: {
          balance?: number
          bank_account?: string | null
          bank_name?: string | null
          birthdate?: string | null
          ci_back_url?: string | null
          ci_front_url?: string | null
          ci_number?: string | null
          created_at?: string
          driver_code?: string | null
          email?: string | null
          first_name?: string | null
          id: string
          license_url?: string | null
          maternal_surname?: string | null
          paternal_surname?: string | null
          phone?: string | null
          rejection_reason?: string | null
          resubmission_count?: number
          selfie_url?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          transport_line?: string | null
          union_doc_url?: string | null
        }
        Update: {
          balance?: number
          bank_account?: string | null
          bank_name?: string | null
          birthdate?: string | null
          ci_back_url?: string | null
          ci_front_url?: string | null
          ci_number?: string | null
          created_at?: string
          driver_code?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          license_url?: string | null
          maternal_surname?: string | null
          paternal_surname?: string | null
          phone?: string | null
          rejection_reason?: string | null
          resubmission_count?: number
          selfie_url?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          transport_line?: string | null
          union_doc_url?: string | null
        }
        Relationships: []
      }
      lineas_transporte: {
        Row: {
          activa: boolean | null
          codigo: string
          created_at: string | null
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean | null
          codigo: string
          created_at?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean | null
          codigo?: string
          created_at?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      passengers: {
        Row: {
          balance: number
          bank_account: string | null
          bank_name: string | null
          birthdate: string | null
          ci_back_url: string | null
          ci_front_url: string | null
          ci_number: string | null
          created_at: string
          email: string | null
          extra_doc_url: string | null
          fare_category: Database["public"]["Enums"]["fare_category"]
          first_name: string | null
          id: string
          maternal_surname: string | null
          paternal_surname: string | null
          phone: string | null
          rejection_reason: string | null
          resubmission_count: number
          selfie_url: string | null
          status: Database["public"]["Enums"]["user_status"]
        }
        Insert: {
          balance?: number
          bank_account?: string | null
          bank_name?: string | null
          birthdate?: string | null
          ci_back_url?: string | null
          ci_front_url?: string | null
          ci_number?: string | null
          created_at?: string
          email?: string | null
          extra_doc_url?: string | null
          fare_category?: Database["public"]["Enums"]["fare_category"]
          first_name?: string | null
          id: string
          maternal_surname?: string | null
          paternal_surname?: string | null
          phone?: string | null
          rejection_reason?: string | null
          resubmission_count?: number
          selfie_url?: string | null
          status?: Database["public"]["Enums"]["user_status"]
        }
        Update: {
          balance?: number
          bank_account?: string | null
          bank_name?: string | null
          birthdate?: string | null
          ci_back_url?: string | null
          ci_front_url?: string | null
          ci_number?: string | null
          created_at?: string
          email?: string | null
          extra_doc_url?: string | null
          fare_category?: Database["public"]["Enums"]["fare_category"]
          first_name?: string | null
          id?: string
          maternal_surname?: string | null
          paternal_surname?: string | null
          phone?: string | null
          rejection_reason?: string | null
          resubmission_count?: number
          selfie_url?: string | null
          status?: Database["public"]["Enums"]["user_status"]
        }
        Relationships: []
      }
      reports: {
        Row: {
          admin_notes: string | null
          category: string
          created_at: string
          description: string
          driver_code: string | null
          id: string
          reported_user_id: string | null
          reporter_id: string
          resolver_id: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          validation_code: string | null
        }
        Insert: {
          admin_notes?: string | null
          category: string
          created_at?: string
          description: string
          driver_code?: string | null
          id?: string
          reported_user_id?: string | null
          reporter_id: string
          resolver_id?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          validation_code?: string | null
        }
        Update: {
          admin_notes?: string | null
          category?: string
          created_at?: string
          description?: string
          driver_code?: string | null
          id?: string
          reported_user_id?: string | null
          reporter_id?: string
          resolver_id?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          validation_code?: string | null
        }
        Relationships: []
      }
      tarifas: {
        Row: {
          created_at: string
          id: string
          nombre: string
          precio: number
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          precio: number
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          precio?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["fare_category"]
          created_at: string
          driver_id: string
          id: string
          latitude: number | null
          longitude: number | null
          passenger_id: string
          tickets: number
          verification_code: string
        }
        Insert: {
          amount: number
          category: Database["public"]["Enums"]["fare_category"]
          created_at?: string
          driver_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          passenger_id: string
          tickets?: number
          verification_code: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["fare_category"]
          created_at?: string
          driver_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          passenger_id?: string
          tickets?: number
          verification_code?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_topup_requests: {
        Row: {
          amount: number
          bank_account: string
          bank_balance_after: number | null
          created_at: string
          error_message: string | null
          id: string
          status: string
          updated_at: string
          user_id: string
          wallet_balance_after: number | null
        }
        Insert: {
          amount: number
          bank_account: string
          bank_balance_after?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id: string
          wallet_balance_after?: number | null
        }
        Update: {
          amount?: number
          bank_account?: string
          bank_balance_after?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
          wallet_balance_after?: number | null
        }
        Relationships: []
      }
      wallet_topups: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_withdrawal_requests: {
        Row: {
          amount: number
          bank_account: string
          bank_balance_after: number | null
          created_at: string
          driver_id: string
          error_message: string | null
          id: string
          status: string
          updated_at: string
          wallet_balance_after: number | null
        }
        Insert: {
          amount: number
          bank_account: string
          bank_balance_after?: number | null
          created_at?: string
          driver_id: string
          error_message?: string | null
          id: string
          status?: string
          updated_at?: string
          wallet_balance_after?: number | null
        }
        Update: {
          amount?: number
          bank_account?: string
          bank_balance_after?: number | null
          created_at?: string
          driver_id?: string
          error_message?: string | null
          id?: string
          status?: string
          updated_at?: string
          wallet_balance_after?: number | null
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          amount: number
          created_at: string
          destination: string
          driver_id: string
          id: string
          request_id: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          destination: string
          driver_id: string
          id?: string
          request_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          destination?: string
          driver_id?: string
          id?: string
          request_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "wallet_withdrawal_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles: {
        Row: {
          balance: number | null
          bank_account: string | null
          bank_name: string | null
          birthdate: string | null
          category: Database["public"]["Enums"]["fare_category"] | null
          ci_back_url: string | null
          ci_front_url: string | null
          ci_number: string | null
          created_at: string | null
          driver_code: string | null
          email: string | null
          extra_doc_url: string | null
          first_name: string | null
          id: string | null
          license_url: string | null
          maternal_surname: string | null
          paternal_surname: string | null
          phone: string | null
          qr_adulto_url: string | null
          qr_general_url: string | null
          qr_primaria_url: string | null
          qr_secundaria_url: string | null
          rejection_reason: string | null
          resubmission_count: number | null
          role: Database["public"]["Enums"]["app_role"] | null
          selfie_url: string | null
          status: Database["public"]["Enums"]["user_status"] | null
          transport_line: string | null
          union_doc_url: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      complete_bank_withdrawal: {
        Args: { _request_id: string }
        Returns: number
      }
      fare_for_category: {
        Args: { _c: Database["public"]["Enums"]["fare_category"] }
        Returns: number
      }
      finalize_bank_topup: { Args: { _request_id: string }; Returns: number }
      find_driver_by_code: {
        Args: { _code: string }
        Returns: {
          bank_account: string
          driver_code: string
          first_name: string
          id: string
          paternal_surname: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _uid: string }; Returns: boolean }
      lookup_email_by_phone: { Args: { _phone: string }; Returns: string }
      mark_bank_withdrawal_credited: {
        Args: { _bank_balance_after: number; _request_id: string }
        Returns: undefined
      }
      mark_bank_withdrawal_reconciliation: {
        Args: { _error_message: string; _request_id: string }
        Returns: undefined
      }
      new_driver_code: { Args: never; Returns: string }
      pay_fare: {
        Args: {
          _driver_code: string
          _lat?: number
          _lng?: number
          _tickets: number
        }
        Returns: {
          base_amount: number
          category: Database["public"]["Enums"]["fare_category"]
          extra_amount: number
          new_balance: number
          total: number
          verification_code: string
        }[]
      }
      pay_fare_group: {
        Args: {
          _companions?: Database["public"]["Enums"]["fare_category"][]
          _driver_code: string
          _lat?: number
          _lng?: number
        }
        Returns: {
          base_amount: number
          category: Database["public"]["Enums"]["fare_category"]
          extra_amount: number
          new_balance: number
          tickets: number
          total: number
          verification_code: string
        }[]
      }
      refund_bank_withdrawal: {
        Args: { _error_message: string; _request_id: string }
        Returns: number
      }
      reserve_bank_withdrawal: {
        Args: { _amount: number; _driver_id: string; _request_id: string }
        Returns: {
          bank_account: string
          wallet_balance: number
        }[]
      }
      safe_profile_date: { Args: { _value: string }; Returns: string }
      topup_wallet: { Args: { _amount: number }; Returns: Json }
      withdraw_earnings: {
        Args: { _amount: number; _destination: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "passenger" | "driver"
      fare_category:
        | "general"
        | "primaria"
        | "secundaria"
        | "adulto_mayor"
        | "discapacidad"
      staff_role: "admin" | "supervisor"
      user_status: "pending" | "active" | "rejected" | "suspended"
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
    Enums: {
      app_role: ["admin", "supervisor", "passenger", "driver"],
      fare_category: [
        "general",
        "primaria",
        "secundaria",
        "adulto_mayor",
        "discapacidad",
      ],
      staff_role: ["admin", "supervisor"],
      user_status: ["pending", "active", "rejected", "suspended"],
    },
  },
} as const
