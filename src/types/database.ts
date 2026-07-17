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
      budget_targets: {
        Row: {
          cost_category_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          location_id: string
          notes: string | null
          target_type: string
          target_value: number
          updated_at: string
        }
        Insert: {
          cost_category_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          location_id: string
          notes?: string | null
          target_type: string
          target_value: number
          updated_at?: string
        }
        Update: {
          cost_category_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          target_type?: string
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_targets_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_targets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_categories: {
        Row: {
          active: boolean
          category_group: string
          code: string
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_group?: string
          code: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_group?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_menu_item_sales: {
        Row: {
          business_date: string
          created_at: string
          discounts: number
          external_id: string | null
          gross_sales: number | null
          id: string
          import_job_id: string | null
          legacy_id: number | null
          location_id: string
          menu_item_id: string
          net_sales: number
          quantity_sold: number
          raw_payload: Json
          recipe_version_id: string | null
          source: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          business_date: string
          created_at?: string
          discounts?: number
          external_id?: string | null
          gross_sales?: number | null
          id?: string
          import_job_id?: string | null
          legacy_id?: number | null
          location_id: string
          menu_item_id: string
          net_sales?: number
          quantity_sold?: number
          raw_payload?: Json
          recipe_version_id?: string | null
          source?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          business_date?: string
          created_at?: string
          discounts?: number
          external_id?: string | null
          gross_sales?: number | null
          id?: string
          import_job_id?: string | null
          legacy_id?: number | null
          location_id?: string
          menu_item_id?: string
          net_sales?: number
          quantity_sold?: number
          raw_payload?: Json
          recipe_version_id?: string | null
          source?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_menu_item_sales_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_menu_item_sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_menu_item_sales_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_menu_item_sales_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          auth_user_id: string | null
          created_at: string
          display_name: string
          email: string | null
          external_id: string | null
          first_name: string | null
          hired_on: string | null
          id: string
          last_name: string | null
          metadata: Json
          organization_id: string
          phone: string | null
          terminated_on: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          hired_on?: string | null
          id?: string
          last_name?: string | null
          metadata?: Json
          organization_id: string
          phone?: string | null
          terminated_on?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          hired_on?: string | null
          id?: string
          last_name?: string | null
          metadata?: Json
          organization_id?: string
          phone?: string | null
          terminated_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          errors: Json
          failed_rows: number
          file_name: string | null
          id: string
          import_type: string
          location_id: string
          metadata: Json
          source: string
          started_at: string | null
          status: string
          successful_rows: number
          total_rows: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          errors?: Json
          failed_rows?: number
          file_name?: string | null
          id?: string
          import_type: string
          location_id: string
          metadata?: Json
          source?: string
          started_at?: string | null
          status?: string
          successful_rows?: number
          total_rows?: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          errors?: Json
          failed_rows?: number
          file_name?: string | null
          id?: string
          import_type?: string
          location_id?: string
          metadata?: Json
          source?: string
          started_at?: string | null
          status?: string
          successful_rows?: number
          total_rows?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          config: Json
          created_at: string
          external_account_id: string | null
          id: string
          integration_type: string
          last_error: string | null
          last_synced_at: string | null
          location_id: string | null
          organization_id: string
          provider: string
          secret_reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          external_account_id?: string | null
          id?: string
          integration_type: string
          last_error?: string | null
          last_synced_at?: string | null
          location_id?: string | null
          organization_id: string
          provider: string
          secret_reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          external_account_id?: string | null
          id?: string
          integration_type?: string
          last_error?: string | null
          last_synced_at?: string | null
          location_id?: string | null
          organization_id?: string
          provider?: string
          secret_reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_lines: {
        Row: {
          created_at: string
          id: string
          inventory_count_id: string
          item_id: string
          legacy_id: number | null
          notes: string | null
          quantity_on_hand: number
          unit_cost: number | null
          unit_label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_count_id: string
          item_id: string
          legacy_id?: number | null
          notes?: string | null
          quantity_on_hand?: number
          unit_cost?: number | null
          unit_label?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_count_id?: string
          item_id?: string
          legacy_id?: number | null
          notes?: string | null
          quantity_on_hand?: number
          unit_cost?: number | null
          unit_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_lines_inventory_count_id_fkey"
            columns: ["inventory_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          business_date: string
          counted_at: string
          created_at: string
          created_by: string | null
          external_id: string | null
          id: string
          location_id: string
          notes: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          business_date?: string
          counted_at?: string
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          location_id: string
          notes?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_date?: string
          counted_at?: string
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_documents: {
        Row: {
          checksum: string | null
          created_at: string
          extraction_payload: Json
          extraction_status: string
          file_size_bytes: number | null
          id: string
          invoice_id: string
          mime_type: string | null
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          extraction_payload?: Json
          extraction_status?: string
          file_size_bytes?: number | null
          id?: string
          invoice_id: string
          mime_type?: string | null
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          checksum?: string | null
          created_at?: string
          extraction_payload?: Json
          extraction_status?: string
          file_size_bytes?: number | null
          id?: string
          invoice_id?: string
          mime_type?: string | null
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "latest_item_costs"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          cost_category_id: string | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          item_id: string | null
          line_total: number | null
          metadata: Json
          quantity: number
          unit_label: string
          unit_price: number
          updated_at: string
          vendor_sku: string | null
        }
        Insert: {
          cost_category_id?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          item_id?: string | null
          line_total?: number | null
          metadata?: Json
          quantity?: number
          unit_label?: string
          unit_price?: number
          updated_at?: string
          vendor_sku?: string | null
        }
        Update: {
          cost_category_id?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          item_id?: string | null
          line_total?: number | null
          metadata?: Json
          quantity?: number
          unit_label?: string
          unit_price?: number
          updated_at?: string
          vendor_sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "latest_item_costs"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          discount_amount: number
          due_date: string | null
          external_id: string | null
          id: string
          import_job_id: string | null
          invoice_date: string
          invoice_number: string | null
          legacy_id: number | null
          location_id: string
          notes: string | null
          raw_payload: Json
          shipping_amount: number
          source: string
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          discount_amount?: number
          due_date?: string | null
          external_id?: string | null
          id?: string
          import_job_id?: string | null
          invoice_date: string
          invoice_number?: string | null
          legacy_id?: number | null
          location_id: string
          notes?: string | null
          raw_payload?: Json
          shipping_amount?: number
          source?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          discount_amount?: number
          due_date?: string | null
          external_id?: string | null
          id?: string
          import_job_id?: string | null
          invoice_date?: string
          invoice_number?: string | null
          legacy_id?: number | null
          location_id?: string
          notes?: string | null
          raw_payload?: Json
          shipping_amount?: number
          source?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      item_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          item_id: string
          source: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          item_id: string
          source?: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          item_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_aliases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_unit_conversions: {
        Row: {
          base_unit_quantity: number
          created_at: string
          id: string
          item_id: string
          unit_label: string
          updated_at: string
        }
        Insert: {
          base_unit_quantity: number
          created_at?: string
          id?: string
          item_id: string
          unit_label: string
          updated_at?: string
        }
        Update: {
          base_unit_quantity?: number
          created_at?: string
          id?: string
          item_id?: string
          unit_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_unit_conversions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          active: boolean
          archived_at: string | null
          barcode: string | null
          base_unit_label: string
          cost_category_id: string | null
          created_at: string
          id: string
          metadata: Json
          name: string
          organization_id: string
          reorder_point: number | null
          sku: string | null
          track_inventory: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          barcode?: string | null
          base_unit_label?: string
          cost_category_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          organization_id: string
          reorder_point?: number | null
          sku?: string | null
          track_inventory?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          barcode?: string | null
          base_unit_label?: string
          cost_category_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string
          reorder_point?: number | null
          sku?: string | null
          track_inventory?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_roles: {
        Row: {
          active: boolean
          created_at: string
          default_hourly_rate: number | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_hourly_rate?: number | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_hourly_rate?: number | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_shifts: {
        Row: {
          business_date: string
          clock_in: string | null
          clock_out: string | null
          created_at: string
          employee_id: string
          external_id: string | null
          hourly_rate: number
          hours_worked: number
          id: string
          import_job_id: string | null
          job_role_id: string | null
          labor_cost: number | null
          legacy_id: number | null
          location_id: string
          notes: string | null
          source: string
          updated_at: string
        }
        Insert: {
          business_date: string
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          employee_id: string
          external_id?: string | null
          hourly_rate: number
          hours_worked: number
          id?: string
          import_job_id?: string | null
          job_role_id?: string | null
          labor_cost?: number | null
          legacy_id?: number | null
          location_id: string
          notes?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          business_date?: string
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          employee_id?: string
          external_id?: string | null
          hourly_rate?: number
          hours_worked?: number
          id?: string
          import_job_id?: string | null
          job_role_id?: string | null
          labor_cost?: number | null
          legacy_id?: number | null
          location_id?: string
          notes?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "labor_shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_shifts_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_shifts_job_role_id_fkey"
            columns: ["job_role_id"]
            isOneToOne: false
            referencedRelation: "job_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          address: Json
          archived_at: string | null
          created_at: string
          currency_code: string
          id: string
          name: string
          organization_id: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: Json
          archived_at?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          name: string
          organization_id: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: Json
          archived_at?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean
          archived_at: string | null
          created_at: string
          current_price: number
          external_id: string | null
          id: string
          legacy_id: number | null
          location_id: string
          menu_category: string | null
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          created_at?: string
          current_price?: number
          external_id?: string | null
          id?: string
          legacy_id?: number | null
          location_id: string
          menu_category?: string | null
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          created_at?: string
          current_price?: number
          external_id?: string | null
          id?: string
          legacy_id?: number | null
          location_id?: string
          menu_category?: string | null
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          archived_at: string | null
          billing_status: string
          created_at: string
          created_by: string
          id: string
          name: string
          plan: string
          slug: string
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          billing_status?: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          plan?: string
          slug: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          billing_status?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          plan?: string
          slug?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          id: string
          item_id: string
          notes: string | null
          quantity: number
          recipe_version_id: string
          unit_label: string
          updated_at: string
          waste_percentage: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          quantity: number
          recipe_version_id: string
          unit_label?: string
          updated_at?: string
          waste_percentage?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: number
          recipe_version_id?: string
          unit_label?: string
          updated_at?: string
          waste_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_versions: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          menu_item_id: string
          notes: string | null
          updated_at: string
          version_number: number
          yield_quantity: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          menu_item_id: string
          notes?: string | null
          updated_at?: string
          version_number?: number
          yield_quantity?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          menu_item_id?: string
          notes?: string | null
          updated_at?: string
          version_number?: number
          yield_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_versions_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_entries: {
        Row: {
          business_date: string
          comps: number
          created_at: string
          created_by: string | null
          discounts: number
          external_id: string | null
          gross_sales: number
          id: string
          import_job_id: string | null
          location_id: string
          net_sales: number
          raw_payload: Json
          refunds: number
          source: string
          tax_collected: number
          tips: number
          transaction_count: number | null
          updated_at: string
        }
        Insert: {
          business_date: string
          comps?: number
          created_at?: string
          created_by?: string | null
          discounts?: number
          external_id?: string | null
          gross_sales?: number
          id?: string
          import_job_id?: string | null
          location_id: string
          net_sales?: number
          raw_payload?: Json
          refunds?: number
          source?: string
          tax_collected?: number
          tips?: number
          transaction_count?: number | null
          updated_at?: string
        }
        Update: {
          business_date?: string
          comps?: number
          created_at?: string
          created_by?: string | null
          discounts?: number
          external_id?: string | null
          gross_sales?: number
          id?: string
          import_job_id?: string | null
          location_id?: string
          net_sales?: number
          raw_payload?: Json
          refunds?: number
          source?: string
          tax_collected?: number
          tips?: number
          transaction_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_entries_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_entries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_items: {
        Row: {
          active: boolean
          base_units_per_purchase_unit: number
          created_at: string
          id: string
          item_id: string
          last_unit_price: number | null
          purchase_unit_label: string
          updated_at: string
          vendor_id: string
          vendor_sku: string | null
        }
        Insert: {
          active?: boolean
          base_units_per_purchase_unit?: number
          created_at?: string
          id?: string
          item_id: string
          last_unit_price?: number | null
          purchase_unit_label?: string
          updated_at?: string
          vendor_id: string
          vendor_sku?: string | null
        }
        Update: {
          active?: boolean
          base_units_per_purchase_unit?: number
          created_at?: string
          id?: string
          item_id?: string
          last_unit_price?: number | null
          purchase_unit_label?: string
          updated_at?: string
          vendor_id?: string
          vendor_sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          account_number: string | null
          active: boolean
          archived_at: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          metadata: Json
          name: string
          organization_id: string
          payment_terms_days: number | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          active?: boolean
          archived_at?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json
          name: string
          organization_id: string
          payment_terms_days?: number | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          active?: boolean
          archived_at?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string
          payment_terms_days?: number | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      daily_pnl: {
        Row: {
          business_date: string | null
          food_cost: number | null
          gross_sales: number | null
          inventory_cost: number | null
          labor_cost: number | null
          location_id: string | null
          net_sales: number | null
          operating_margin_percentage: number | null
          operating_profit: number | null
          other_cost: number | null
          total_cost: number | null
        }
        Relationships: []
      }
      latest_item_costs: {
        Row: {
          invoice_date: string | null
          invoice_id: string | null
          invoice_line_item_id: string | null
          item_id: string | null
          line_total: number | null
          location_id: string | null
          quantity: number | null
          unit_label: string | null
          unit_price: number | null
          vendor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_performance: {
        Row: {
          first_sale_date: string | null
          gross_sales: number | null
          latest_sale_date: string | null
          location_id: string | null
          menu_item_id: string | null
          name: string | null
          net_sales: number | null
          units_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_menu_item_sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_menu_item_sales_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_organization_with_location: {
        Args: {
          location_currency?: string
          location_name?: string
          location_timezone?: string
          organization_name: string
        }
        Returns: {
          location_id: string
          organization_id: string
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
    Enums: {},
  },
} as const
