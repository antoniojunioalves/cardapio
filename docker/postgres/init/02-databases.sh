#!/bin/bash
#
# Bancos da aplicação.
#
# O banco de desenvolvimento é criado pelo entrypoint da imagem, com dono
# `postgres`; aqui a propriedade passa para o migrator, que é quem precisa
# criar schemas e tabelas.
#
# O banco de testes é separado para que a suíte possa criar e apagar tabelas
# sem tocar nos dados de desenvolvimento. Os testes precisam de um PostgreSQL
# de verdade: as policies de Row-Level Security só podem ser comprovadas pelo
# próprio banco, e um mock provaria apenas que concorda com quem o escreveu.

set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	ALTER DATABASE "${POSTGRES_DB}" OWNER TO "${MIGRATOR_DB_USER}";
	CREATE DATABASE "${POSTGRES_DB}_test" OWNER "${MIGRATOR_DB_USER}";
EOSQL

echo "Bancos prontos: '${POSTGRES_DB}' e '${POSTGRES_DB}_test' (dono: ${MIGRATOR_DB_USER})."
