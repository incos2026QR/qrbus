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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          balance: number
          birthdate: string | null
          category: Database["public"]["Enums"]["fare_category"] | null
          ci_back_url: string | null
          ci_front_url: string | null
          ci_number: string | null
          created_at: string
          driver_code: string | null
          email: string | null
          extra_doc_url: string | null
          first_name: string | null
          id: string
          license_url: string | null
          maternal_surname: string | null
          paternal_surname: string | null
          phone: string | null
          qr_adulto_url: string | null
          qr_general_url: string | null
          qr_primaria_url: string | null
          qr_secundaria_url: string | null
          role: Database["public"]["Enums"]["app_role"]
          selfie_url: string | null
          status: Database["public"]["Enums"]["user_status"]
        }
        Insert: {
          balance?: number
          birthdate?: string | null
          category?: Database["public"]["Enums"]["fare_category"] | null
          ci_back_url?: string | null
          ci_front_url?: string | null
          ci_number?: string | null
          created_at?: string
          driver_code?: string | null
          email?: string | null
          extra_doc_url?: string | null
          first_name?: string | null
          id: string
          license_url?: string | null
          maternal_surname?: string | null
          paternal_surname?: string | null
          phone?: string | null
          qr_adulto_url?: string | null
          qr_general_url?: string | null
          qr_primaria_url?: string | null
          qr_secundaria_url?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          selfie_url?: string | null
          status?: Database["public"]["Enums"]["user_status"]
        }
        Update: {
          balance?: number
          birthdate?: string | null
          category?: Database["public"]["Enums"]["fare_category"] | null
          ci_back_url?: string | null
          ci_front_url?: string | null
          ci_number?: string | null
          created_at?: string
          driver_code?: string | null
          email?: string | null
          extra_doc_url?: string | null
          first_name?: string | null
          id?: string
          license_url?: string | null
          maternal_surname?: string | null
          paternal_surname?: string | null
          phone?: string | null
          qr_adulto_url?: string | null
          qr_general_url?: string | null
          qr_primaria_url?: string | null
          qr_secundaria_url?: string | null
          role?: Database["public"]["Enums"]["app_role"]
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
      withdrawals: {
        Row: {
          amount: number
          created_at: string
          destination: string
          driver_id: string
          id: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          destination: string
          driver_id: string
          id?: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          destination?: string
          driver_id?: string
          id?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fare_for_category: {
        Args: { _c: Database["public"]["Enums"]["fare_category"] }
        Returns: number
      }
      find_driver_by_code: {
        Args: { _code: string }
        Returns: {
          driver_code: string
          first_name: string
          id: string
          paternal_surname: string
          qr_adulto_url: string
          qr_general_url: string
          qr_primaria_url: string
          qr_secundaria_url: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_email_by_phone: { Args: { _phone: string }; Returns: string }
      pay_fare: {
        Args: { _driver_code: string; _tickets: number }
        Returns: {
          base_amount: number
          category: Database["public"]["Enums"]["fare_category"]
          extra_amount: number
          new_balance: number
          total: number
          verification_code: string
        }[]
      }
      topup_wallet: {
        Args: { _amount: number; _method?: string }
        Returns: number
      }
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
      app_role: ["admin", "supervisor", "passenger", "driver"],
      fare_category: [
        "general",
        "primaria",
        "secundaria",
        "adulto_mayor",
        "discapacidad",
      ],
      user_status: ["pending", "active", "rejected", "suspended"],
    },
  },
} as const
