CREATE TYPE "public"."delivery_fee_mode" AS ENUM('FIXED', 'BY_REGION');--> statement-breakpoint
CREATE TYPE "public"."payment_method_kind" AS ENUM('CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'MEAL_VOUCHER', 'OTHER');--> statement-breakpoint
CREATE TABLE "delivery_regions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"fee_in_cents" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_regions_nome_unico" UNIQUE("tenant_id","name"),
	CONSTRAINT "delivery_regions_taxa_nao_negativa" CHECK ("delivery_regions"."fee_in_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "delivery_regions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "delivery_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"delivery_enabled" boolean DEFAULT true NOT NULL,
	"pickup_enabled" boolean DEFAULT false NOT NULL,
	"fee_mode" "delivery_fee_mode" DEFAULT 'FIXED' NOT NULL,
	"fixed_fee_in_cents" integer DEFAULT 0 NOT NULL,
	"estimated_min_minutes" integer,
	"estimated_max_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_settings_tenantId_unique" UNIQUE("tenant_id"),
	CONSTRAINT "delivery_settings_taxa_nao_negativa" CHECK ("delivery_settings"."fixed_fee_in_cents" >= 0),
	CONSTRAINT "delivery_settings_estimativa_coerente" CHECK ("delivery_settings"."estimated_min_minutes" is null or "delivery_settings"."estimated_max_minutes" is null
          or "delivery_settings"."estimated_min_minutes" <= "delivery_settings"."estimated_max_minutes")
);
--> statement-breakpoint
ALTER TABLE "delivery_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(60) NOT NULL,
	"kind" "payment_method_kind" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tenant_payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_payment_methods_unico" UNIQUE("tenant_id","payment_method_id")
);
--> statement-breakpoint
ALTER TABLE "tenant_payment_methods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_hours_sem_duplicata" UNIQUE("tenant_id","day_of_week","opens_at"),
	CONSTRAINT "business_hours_dia_valido" CHECK ("business_hours"."day_of_week" between 0 and 6),
	CONSTRAINT "business_hours_intervalo_nao_vazio" CHECK ("business_hours"."closes_at" <> "business_hours"."opens_at")
);
--> statement-breakpoint
ALTER TABLE "business_hours" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"description" text,
	"logo_url" varchar(512),
	"cover_url" varchar(512),
	"whatsapp_phone" varchar(20),
	"contact_phone" varchar(20),
	"contact_email" varchar(254),
	"address_street" varchar(160),
	"address_number" varchar(20),
	"address_complement" varchar(80),
	"address_neighborhood" varchar(80),
	"address_city" varchar(80),
	"address_state" varchar(2),
	"address_postal_code" varchar(9),
	"prep_time_min_minutes" integer,
	"prep_time_max_minutes" integer,
	"minimum_order_in_cents" integer DEFAULT 0 NOT NULL,
	"is_accepting_orders" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_settings_tenantId_unique" UNIQUE("tenant_id"),
	CONSTRAINT "tenant_settings_minimum_order_nao_negativo" CHECK ("tenant_settings"."minimum_order_in_cents" >= 0),
	CONSTRAINT "tenant_settings_prep_time_coerente" CHECK ("tenant_settings"."prep_time_min_minutes" is null or "tenant_settings"."prep_time_max_minutes" is null
          or "tenant_settings"."prep_time_min_minutes" <= "tenant_settings"."prep_time_max_minutes")
);
--> statement-breakpoint
ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "delivery_regions" ADD CONSTRAINT "delivery_regions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD CONSTRAINT "delivery_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_payment_methods" ADD CONSTRAINT "tenant_payment_methods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_payment_methods" ADD CONSTRAINT "tenant_payment_methods_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_regions_tenant_idx" ON "delivery_regions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_payment_methods_tenant_idx" ON "tenant_payment_methods" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "business_hours_tenant_idx" ON "business_hours" USING btree ("tenant_id","day_of_week");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "delivery_regions" AS PERMISSIVE FOR ALL TO public USING ("delivery_regions"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("delivery_regions"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "delivery_settings" AS PERMISSIVE FOR ALL TO public USING ("delivery_settings"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("delivery_settings"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_payment_methods" AS PERMISSIVE FOR ALL TO public USING ("tenant_payment_methods"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_payment_methods"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "business_hours" AS PERMISSIVE FOR ALL TO public USING ("business_hours"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("business_hours"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_settings" AS PERMISSIVE FOR ALL TO public USING ("tenant_settings"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_settings"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);