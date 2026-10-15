-- O e-mail, a senha e o nome foram para a conta (`accounts`, migration
-- anterior). O vínculo fica com o que a pessoa é em cada estabelecimento.
--
-- A policy do login antigo sai primeiro: ela lia `users.email`, e o banco não
-- deixa apagar uma coluna de que uma policy depende. Quem procura pelo e-mail
-- agora é `conta_por_email`, em `accounts`.

DROP POLICY "login_por_email" ON "users" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_minusculo";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email_verified_at";
