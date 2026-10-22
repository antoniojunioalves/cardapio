-- Quando a senha da conta foi trocada pela última vez ("Minha conta", Fase 25b).
-- O token de acesso emitido antes disso deixa de valer na hora. Nula para quem
-- nunca trocou: nenhum token é recusado por ela.

ALTER TABLE "accounts" ADD COLUMN "password_changed_at" timestamp with time zone;