ALTER TABLE "users" DROP CONSTRAINT "users_tenant_email";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_minusculo" CHECK ("users"."email" = lower("users"."email"));--> statement-breakpoint
CREATE POLICY "login_por_email" ON "users" AS PERMISSIVE FOR SELECT TO public USING ("users"."email" = nullif(current_setting('app.login_email', true), ''));