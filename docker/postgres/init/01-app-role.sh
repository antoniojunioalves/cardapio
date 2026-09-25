#!/bin/bash
#
# Cria a role que a aplicação usa para conectar.
#
# O ponto decisivo está nos atributos NOSUPERUSER e NOBYPASSRLS: no PostgreSQL,
# superusuários e roles com BYPASSRLS ignoram silenciosamente TODA policy de
# Row-Level Security. Se a aplicação conectasse como `postgres`, o isolamento
# entre tenants que vamos construir na Fase 3 existiria no papel e não teria
# efeito nenhum em tempo de execução — o pior tipo de falha de segurança,
# porque parece que está funcionando.
#
# Esta role também será dona das tabelas, e as policies usarão
# FORCE ROW LEVEL SECURITY, que sujeita até o dono da tabela às regras.
#
# Roda apenas na primeira inicialização, com o diretório de dados vazio.

set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE ROLE "${APP_DB_USER}"
	  WITH LOGIN
	       PASSWORD '${APP_DB_PASSWORD}'
	       NOSUPERUSER
	       NOBYPASSRLS
	       NOCREATEDB
	       NOCREATEROLE
	       NOINHERIT;

	GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO "${APP_DB_USER}";
	GRANT USAGE, CREATE ON SCHEMA public TO "${APP_DB_USER}";
EOSQL

echo "Role de aplicação '${APP_DB_USER}' criada (NOSUPERUSER, NOBYPASSRLS)."
