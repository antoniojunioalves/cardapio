CREATE TYPE "public"."product_type" AS ENUM('SIMPLE', 'COMBO');--> statement-breakpoint
CREATE TABLE "combo_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"combo_product_id" uuid NOT NULL,
	"item_product_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "combo_items_unico" UNIQUE("combo_product_id","item_product_id"),
	CONSTRAINT "combo_items_quantidade_positiva" CHECK ("combo_items"."quantity" >= 1),
	CONSTRAINT "combo_items_nao_contem_a_si" CHECK ("combo_items"."combo_product_id" <> "combo_items"."item_product_id")
);
--> statement-breakpoint
ALTER TABLE "combo_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "option_groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"min_selections" integer DEFAULT 0 NOT NULL,
	"max_selections" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "option_groups_tenant_id_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "option_groups_minimo_nao_negativo" CHECK ("option_groups"."min_selections" >= 0),
	CONSTRAINT "option_groups_maximo_positivo" CHECK ("option_groups"."max_selections" >= 1),
	CONSTRAINT "option_groups_minimo_ate_maximo" CHECK ("option_groups"."min_selections" <= "option_groups"."max_selections")
);
--> statement-breakpoint
ALTER TABLE "option_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "options" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"price_delta_in_cents" integer DEFAULT 0 NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "options_tenant_id_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "options_acrescimo_nao_negativo" CHECK ("options"."price_delta_in_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "options" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product_option_groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_option_groups_unico" UNIQUE("product_id","group_id")
);
--> statement-breakpoint
ALTER TABLE "product_option_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "type" "product_type" DEFAULT 'SIMPLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_combo_mesmo_tenant" FOREIGN KEY ("tenant_id","combo_product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_item_mesmo_tenant" FOREIGN KEY ("tenant_id","item_product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "options" ADD CONSTRAINT "options_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "options" ADD CONSTRAINT "options_grupo_mesmo_tenant" FOREIGN KEY ("tenant_id","group_id") REFERENCES "public"."option_groups"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option_groups" ADD CONSTRAINT "product_option_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option_groups" ADD CONSTRAINT "product_option_groups_produto_mesmo_tenant" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option_groups" ADD CONSTRAINT "product_option_groups_grupo_mesmo_tenant" FOREIGN KEY ("tenant_id","group_id") REFERENCES "public"."option_groups"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "combo_items_item_idx" ON "combo_items" USING btree ("item_product_id");--> statement-breakpoint
CREATE INDEX "options_grupo_idx" ON "options" USING btree ("group_id","sort_order");--> statement-breakpoint
CREATE INDEX "product_option_groups_grupo_idx" ON "product_option_groups" USING btree ("group_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "combo_items" AS PERMISSIVE FOR ALL TO public USING ("combo_items"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("combo_items"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "option_groups" AS PERMISSIVE FOR ALL TO public USING ("option_groups"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("option_groups"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "options" AS PERMISSIVE FOR ALL TO public USING ("options"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("options"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "product_option_groups" AS PERMISSIVE FOR ALL TO public USING ("product_option_groups"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("product_option_groups"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);