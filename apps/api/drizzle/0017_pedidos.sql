CREATE TYPE "public"."fulfillment_type" AS ENUM('DELIVERY', 'PICKUP');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "order_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_item_options" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"group_name" varchar(80) NOT NULL,
	"option_name" varchar(80) NOT NULL,
	"price_delta_in_cents" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_item_options_acrescimo" CHECK ("order_item_options"."price_delta_in_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_item_options" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" varchar(120) NOT NULL,
	"product_type" "product_type" NOT NULL,
	"unit_price_in_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"total_in_cents" integer NOT NULL,
	"notes" varchar(140),
	"combo_components" jsonb,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_tenant_id_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "order_items_quantidade" CHECK ("order_items"."quantity" between 1 and 50),
	CONSTRAINT "order_items_total_coerente" CHECK ("order_items"."unit_price_in_cents" >= 0
          and "order_items"."total_in_cents" = "order_items"."unit_price_in_cents" * "order_items"."quantity")
);
--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "order_status" DEFAULT 'RECEIVED' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"customer_name" varchar(120) NOT NULL,
	"customer_phone" varchar(13) NOT NULL,
	"fulfillment" "fulfillment_type" NOT NULL,
	"address_postal_code" varchar(8),
	"address_street" varchar(120),
	"address_number" varchar(20),
	"address_complement" varchar(80),
	"address_neighborhood" varchar(80),
	"address_city" varchar(80),
	"address_reference" varchar(120),
	"delivery_region_name" varchar(80),
	"payment_method_code" varchar(40) NOT NULL,
	"payment_method_name" varchar(80) NOT NULL,
	"payment_method_kind" "payment_method_kind" NOT NULL,
	"change_for_in_cents" integer,
	"notes" text,
	"subtotal_in_cents" integer NOT NULL,
	"delivery_fee_in_cents" integer NOT NULL,
	"total_in_cents" integer NOT NULL,
	"cancellation_reason" varchar(280),
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_numero_unico" UNIQUE("tenant_id","number"),
	CONSTRAINT "orders_idempotencia_unica" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "orders_tenant_id_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "orders_numero_positivo" CHECK ("orders"."number" >= 1),
	CONSTRAINT "orders_valores_coerentes" CHECK ("orders"."subtotal_in_cents" >= 0 and "orders"."delivery_fee_in_cents" >= 0
          and "orders"."total_in_cents" = "orders"."subtotal_in_cents" + "orders"."delivery_fee_in_cents"),
	CONSTRAINT "orders_entrega_tem_endereco" CHECK ("orders"."fulfillment" <> 'DELIVERY' or ("orders"."address_street" is not null
          and "orders"."address_number" is not null and "orders"."address_neighborhood" is not null)),
	CONSTRAINT "orders_troco_cobre_o_total" CHECK ("orders"."change_for_in_cents" is null or "orders"."change_for_in_cents" >= "orders"."total_in_cents"),
	CONSTRAINT "orders_cancelado_tem_motivo" CHECK ("orders"."status" <> 'CANCELLED' or "orders"."cancellation_reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_counters" ADD CONSTRAINT "order_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_item_mesmo_tenant" FOREIGN KEY ("tenant_id","order_item_id") REFERENCES "public"."order_items"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_pedido_mesmo_tenant" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cliente_mesmo_tenant" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_item_options_item_idx" ON "order_item_options" USING btree ("order_item_id","sort_order");--> statement-breakpoint
CREATE INDEX "order_items_pedido_idx" ON "order_items" USING btree ("order_id","sort_order");--> statement-breakpoint
CREATE INDEX "orders_recentes_idx" ON "orders" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "order_counters" AS PERMISSIVE FOR ALL TO public USING ("order_counters"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("order_counters"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "order_item_options" AS PERMISSIVE FOR ALL TO public USING ("order_item_options"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("order_item_options"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "order_items" AS PERMISSIVE FOR ALL TO public USING ("order_items"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("order_items"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "orders" AS PERMISSIVE FOR ALL TO public USING ("orders"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("orders"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);