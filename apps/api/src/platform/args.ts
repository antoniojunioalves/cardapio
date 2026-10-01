import { parseArgs } from 'node:util'

import type { StatusDoEstabelecimento } from './repository.js'

/**
 * A linha de comando da plataforma, sem banco: transforma o que foi digitado
 * num comando, ou diz o que está errado.
 */

export const USO = `Uso: pnpm plataforma <ação>

  listar [--status ativo|suspenso|pendente]
      Os estabelecimentos, com status, plano e dono.

  suspender <endereço> --motivo "<por quê>"
      Tira o cardápio do ar e encerra as sessões abertas.

  reativar <endereço>
      Desfaz a suspensão.

  plano <endereço> <CÓDIGO>
      Troca o plano, por exemplo: plano lanchonete-do-ze PREMIUM

  reenviar-confirmacao <endereço>
      Manda um link novo de confirmação ao dono.

Em toda ação que altera algo, --operador "<nome>" diz quem está agindo;
sem ele, vale o usuário do sistema.`

const STATUS: Record<string, StatusDoEstabelecimento> = {
  ativo: 'ACTIVE',
  suspenso: 'SUSPENDED',
  pendente: 'PENDING',
}

export type Comando =
  | { acao: 'listar'; status?: StatusDoEstabelecimento }
  | { acao: 'suspender'; slug: string; motivo: string }
  | { acao: 'reativar'; slug: string }
  | { acao: 'plano'; slug: string; plano: string }
  | { acao: 'reenviar-confirmacao'; slug: string }

export type Interpretacao =
  { ok: true; comando: Comando; operador: string | null } | { ok: false; erro: string }

const erro = (mensagem: string): Interpretacao => ({ ok: false, erro: mensagem })

export function interpretar(argumentos: readonly string[]): Interpretacao {
  let lido
  try {
    lido = parseArgs({
      args: [...argumentos],
      allowPositionals: true,
      options: {
        motivo: { type: 'string' },
        status: { type: 'string' },
        operador: { type: 'string' },
      },
    })
  } catch (falha) {
    return erro(falha instanceof Error ? falha.message : 'Não entendi o comando.')
  }

  const [acao, slug, terceiro, ...sobra] = lido.positionals
  const operador = lido.values.operador?.trim() ?? null
  const ok = (comando: Comando): Interpretacao => ({
    ok: true,
    comando,
    operador: operador ?? null,
  })

  if (!acao) return erro('Diga a ação.')
  if (operador === '') return erro('--operador não pode ficar vazio.')

  if (acao === 'listar') {
    if (slug) return erro('"listar" não recebe endereço.')
    const nome = lido.values.status
    if (nome === undefined) return ok({ acao })
    const status = STATUS[nome.toLowerCase()]
    return status ? ok({ acao, status }) : erro('--status aceita ativo, suspenso ou pendente.')
  }

  if (!slug) return erro(`"${acao}" precisa do endereço do estabelecimento.`)

  switch (acao) {
    case 'suspender': {
      const motivo = lido.values.motivo?.trim()
      if (terceiro) return erro('Sobrou um argumento. O motivo vai em --motivo "<por quê>".')
      // O motivo é o que explica a suspensão a quem ler a auditoria depois.
      return motivo ? ok({ acao, slug, motivo }) : erro('Suspender exige --motivo "<por quê>".')
    }
    case 'reativar':
    case 'reenviar-confirmacao':
      return terceiro ? erro('Sobrou um argumento.') : ok({ acao, slug })
    case 'plano':
      if (!terceiro) return erro('Diga o código do plano, por exemplo PREMIUM.')
      return sobra.length > 0 ? erro('Sobrou um argumento.') : ok({ acao, slug, plano: terceiro })
    default:
      return erro(`Não conheço a ação "${acao}".`)
  }
}
