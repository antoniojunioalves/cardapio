#!/bin/bash
#
# Duas roles, com poderes deliberadamente diferentes.
#
# Por que não uma só: no PostgreSQL, o DONO de uma tabela pode desligar o
# Row-Level Security dela com dois comandos —
#
#     ALTER TABLE x NO FORCE ROW LEVEL SECURITY;
#     ALTER TABLE x DISABLE ROW LEVEL SECURITY;
#
# (comprovado em teste). Se a aplicação conectasse como dona das tabelas, uma
# injeção de SQL bem colocada desligaria o isolamento entre tenants inteiro.
# O `FORCE ROW LEVEL SECURITY` sujeita o dono às policies nas CONSULTAS, mas
# não o impede de remover as policies.
#
# Daí a separação:
#
#   migrator — dono do schema e das tabelas, roda as migrations, tem DDL.
#              Usado só pelo comando de migration, nunca pela API em execução.
#   app      — apenas SELECT/INSERT/UPDATE/DELETE. Não é dona de nada, então
#              não tem como alterar nem desligar policy alguma.
#
# Nenhuma das duas tem SUPERUSER ou BYPASSRLS: qualquer um dos dois atributos
# faria o PostgreSQL ignorar todas as policies em silêncio.
#
# Roda apenas na primeira inicialização, com o diretório de dados vazio.
# Para recriar depois de alterar este script: `pnpm db:reset`.

set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE ROLE "${MIGRATOR_DB_USER}"
	  WITH LOGIN PASSWORD '${MIGRATOR_DB_PASSWORD}'
	       NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;

	CREATE ROLE "${APP_DB_USER}"
	  WITH LOGIN PASSWORD '${APP_DB_PASSWORD}'
	       NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
EOSQL

echo "Roles criadas: '${MIGRATOR_DB_USER}' (DDL) e '${APP_DB_USER}' (somente DML)."
