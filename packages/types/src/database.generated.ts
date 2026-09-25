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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      catalog_items: {
        Row: {
          access: string
          art_hitbox: Json | null
          art_url: string | null
          blurhash: string | null
          created_at: string
          display_name: string
          id: string
          price: number | null
          sort_order: number
          status: string
          tags: Json
          updated_at: string
        }
        Insert: {
          access?: string
          art_hitbox?: Json | null
          art_url?: string | null
          blurhash?: string | null
          created_at?: string
          display_name: string
          id: string
          price?: number | null
          sort_order?: number
          status?: string
          tags: Json
          updated_at?: string
        }
        Update: {
          access?: string
          art_hitbox?: Json | null
          art_url?: string | null
          blurhash?: string | null
          created_at?: string
          display_name?: string
          id?: string
          price?: number | null
          sort_order?: number
          status?: string
          tags?: Json
          updated_at?: string
        }
        Relationships: []
      }
      catalog_meta: {
        Row: {
          id: number
          version: number
        }
        Insert: {
          id?: number
          version?: number
        }
        Update: {
          id?: number
          version?: number
        }
        Relationships: []
      }
      dance_genres: {
        Row: {
          created_at: string
          id: string
          legacy_id: string | null
          name: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          legacy_id?: string | null
          name: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          legacy_id?: string | null
          name?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      dance_media_jobs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          locked_at: string | null
          next_run_at: string
          owner_id: string
          post_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          locked_at?: string | null
          next_run_at?: string
          owner_id: string
          post_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          locked_at?: string | null
          next_run_at?: string
          owner_id?: string
          post_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dance_media_jobs_post_owner_fk"
            columns: ["post_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "dance_posts"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      dance_move_genres: {
        Row: {
          dance_move_id: string
          genre_id: string
        }
        Insert: {
          dance_move_id: string
          genre_id: string
        }
        Update: {
          dance_move_id?: string
          genre_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dance_move_genres_dance_move_id_fkey"
            columns: ["dance_move_id"]
            isOneToOne: false
            referencedRelation: "dance_moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dance_move_genres_genre_id_fkey"
            columns: ["genre_id"]
            isOneToOne: false
            referencedRelation: "dance_genres"
            referencedColumns: ["id"]
          },
        ]
      }
      dance_moves: {
        Row: {
          bpm: number | null
          created_at: string
          dancer_tip_image_url: string | null
          dancer_tip_video_url: string | null
          description: string | null
          film_yourself_video_url: string | null
          id: string
          legacy_id: string | null
          level: number
          main_video_url: string | null
          music_id: string | null
          presentation_video_url: string | null
          pro_dancer_image_url: string | null
          pro_dancer_video_url: string | null
          sort_order: number
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          bpm?: number | null
          created_at?: string
          dancer_tip_image_url?: string | null
          dancer_tip_video_url?: string | null
          description?: string | null
          film_yourself_video_url?: string | null
          id?: string
          legacy_id?: string | null
          level?: number
          main_video_url?: string | null
          music_id?: string | null
          presentation_video_url?: string | null
          pro_dancer_image_url?: string | null
          pro_dancer_video_url?: string | null
          sort_order?: number
          status?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          bpm?: number | null
          created_at?: string
          dancer_tip_image_url?: string | null
          dancer_tip_video_url?: string | null
          description?: string | null
          film_yourself_video_url?: string | null
          id?: string
          legacy_id?: string | null
          level?: number
          main_video_url?: string | null
          music_id?: string | null
          presentation_video_url?: string | null
          pro_dancer_image_url?: string | null
          pro_dancer_video_url?: string | null
          sort_order?: number
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dance_moves_music_id_fkey"
            columns: ["music_id"]
            isOneToOne: false
            referencedRelation: "music_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      dance_posts: {
        Row: {
          audio_offset_ms: number | null
          blurhash: string | null
          created_at: string
          dance_move_id: string
          id: string
          merged_video_path: string | null
          music_id: string | null
          owner_id: string
          score: number | null
          status: string
          thumbnail_path: string | null
          updated_at: string
          video_length_s: number | null
          video_path: string | null
        }
        Insert: {
          audio_offset_ms?: number | null
          blurhash?: string | null
          created_at?: string
          dance_move_id: string
          id?: string
          merged_video_path?: string | null
          music_id?: string | null
          owner_id: string
          score?: number | null
          status?: string
          thumbnail_path?: string | null
          updated_at?: string
          video_length_s?: number | null
          video_path?: string | null
        }
        Update: {
          audio_offset_ms?: number | null
          blurhash?: string | null
          created_at?: string
          dance_move_id?: string
          id?: string
          merged_video_path?: string | null
          music_id?: string | null
          owner_id?: string
          score?: number | null
          status?: string
          thumbnail_path?: string | null
          updated_at?: string
          video_length_s?: number | null
          video_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dance_posts_dance_move_id_fkey"
            columns: ["dance_move_id"]
            isOneToOne: false
            referencedRelation: "dance_moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dance_posts_music_id_fkey"
            columns: ["music_id"]
            isOneToOne: false
            referencedRelation: "music_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      dance_scan_events: {
        Row: {
          attempt: number
          created_at: string
          dance_move_id: string | null
          error: string | null
          event: string
          id: string
          is_external_score: boolean | null
          is_first_time: boolean | null
          owner_id: string
          post_id: string
          raw_score: number | null
          scan_duration_ms: number | null
          scan_id: string
          scan_server_index: number | null
          scan_server_url: string | null
          server_attempts: Json | null
          total_scan_ms: number | null
          updated_score: number | null
        }
        Insert: {
          attempt: number
          created_at?: string
          dance_move_id?: string | null
          error?: string | null
          event: string
          id?: string
          is_external_score?: boolean | null
          is_first_time?: boolean | null
          owner_id: string
          post_id: string
          raw_score?: number | null
          scan_duration_ms?: number | null
          scan_id: string
          scan_server_index?: number | null
          scan_server_url?: string | null
          server_attempts?: Json | null
          total_scan_ms?: number | null
          updated_score?: number | null
        }
        Update: {
          attempt?: number
          created_at?: string
          dance_move_id?: string | null
          error?: string | null
          event?: string
          id?: string
          is_external_score?: boolean | null
          is_first_time?: boolean | null
          owner_id?: string
          post_id?: string
          raw_score?: number | null
          scan_duration_ms?: number | null
          scan_id?: string
          scan_server_index?: number | null
          scan_server_url?: string | null
          server_attempts?: Json | null
          total_scan_ms?: number | null
          updated_score?: number | null
        }
        Relationships: []
      }
      dance_scans: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          is_external_score: boolean
          locked_at: string | null
          next_run_at: string
          original_score: number | null
          owner_id: string
          post_id: string
          status: string
          updated_at: string
          updated_score: number | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          is_external_score?: boolean
          locked_at?: string | null
          next_run_at?: string
          original_score?: number | null
          owner_id: string
          post_id: string
          status?: string
          updated_at?: string
          updated_score?: number | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          is_external_score?: boolean
          locked_at?: string | null
          next_run_at?: string
          original_score?: number | null
          owner_id?: string
          post_id?: string
          status?: string
          updated_at?: string
          updated_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dance_scans_post_owner_fk"
            columns: ["post_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "dance_posts"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      music_tracks: {
        Row: {
          artist: string | null
          audio_url: string
          created_at: string
          delay_before_avatar_dance: number | null
          id: string
          legacy_id: string | null
          sort_order: number
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          artist?: string | null
          audio_url: string
          created_at?: string
          delay_before_avatar_dance?: number | null
          id?: string
          legacy_id?: string | null
          sort_order?: number
          status?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          artist?: string | null
          audio_url?: string
          created_at?: string
          delay_before_avatar_dance?: number | null
          id?: string
          legacy_id?: string | null
          sort_order?: number
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          username: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          username?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          username?: string
        }
        Relationships: []
      }
      room_visits: {
        Row: {
          id: number
          room_id: string
          room_owner_id: string
          visited_at: string
          visitor_id: string
        }
        Insert: {
          id?: never
          room_id: string
          room_owner_id: string
          visited_at?: string
          visitor_id: string
        }
        Update: {
          id?: never
          room_id?: string
          room_owner_id?: string
          visited_at?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_visits_room_fk"
            columns: ["room_id", "room_owner_id"]
            isOneToOne: false
            referencedRelation: "studio_rooms"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      studio_rooms: {
        Row: {
          created_at: string
          id: string
          map: Json
          owner_id: string
          template_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          map?: Json
          owner_id: string
          template_id: string
          updated_at?: string
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          map?: Json
          owner_id?: string
          template_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "studio_rooms_owner_profile_fk"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_items: {
        Row: {
          acquired_at: string
          item_id: string
          owner_id: string
          source: string
        }
        Insert: {
          acquired_at?: string
          item_id: string
          owner_id: string
          source?: string
        }
        Update: {
          acquired_at?: string
          item_id?: string
          owner_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_wallets: {
        Row: {
          glow: number
          owner_id: string
          starter_granted: boolean
          updated_at: string
        }
        Insert: {
          glow?: number
          owner_id: string
          starter_granted?: boolean
          updated_at?: string
        }
        Update: {
          glow?: number
          owner_id?: string
          starter_granted?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      count_room_visitors: { Args: { p_room_id: string }; Returns: number }
      list_expired_anonymous_dance_posts: {
        Args: { p_limit: number; p_older_than: string }
        Returns: {
          id: string
          owner_id: string
        }[]
      }
      purchase_item: {
        Args: { p_item: string; p_owner: string }
        Returns: {
          out_acquired_at: string
          out_glow: number
          out_status: string
        }[]
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
