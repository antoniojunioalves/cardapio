#!/bin/bash
#
# Privilégios, aplicados igualmente ao banco de desenvolvimento e ao de testes.
#
# O ponto central está no ALTER DEFAULT PRIVILEGES: sem ele, cada tabela nova
# criada por uma migration nasceria inacessível à aplicação, e alguém teria que
# lembrar de escrever um GRANT em toda migration. Esquecer esse GRANT daria um
# erro barulhento e fácil de corrigir — mas a tentação seguinte seria conceder
# privilégio demais "para resolver logo", e é aí que a separação entre as duas
# roles se perderia na prática.
#
# A role da aplicação recebe apenas DML. Nada de CREATE, nada de ALTER: sem
# poder alterar tabela, ela não tem como desligar nenhuma policy de RLS.

set -euo pipefail

for database in "$POSTGRES_DB" "${POSTGRES_DB}_test"; do
	psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$database" <<-EOSQL
		GRANT CONNECT ON DATABASE "${database}" TO "${APP_DB_USER}";
		GRANT CREATE, USAGE ON SCHEMA public TO "${MIGRATOR_DB_USER}";
		GRANT USAGE ON SCHEMA public TO "${APP_DB_USER}";

		ALTER DEFAULT PRIVILEGES FOR ROLE "${MIGRATOR_DB_USER}" IN SCHEMA public
		  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_DB_USER}";

		ALTER DEFAULT PRIVILEGES FOR ROLE "${MIGRATOR_DB_USER}" IN SCHEMA public
		  GRANT USAGE, SELECT ON SEQUENCES TO "${APP_DB_USER}";
	EOSQL
done

echo "Privilégios aplicados: '${MIGRATOR_DB_USER}' com DDL, '${APP_DB_USER}' somente com DML."
