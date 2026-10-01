import type { Comando } from './args.js'
import {
  listarEstabelecimentos,
  reativarEstabelecimento,
  reenviarConfirmacaoPelaPlataforma,
  suspenderEstabelecimento,
  trocarPlano,
  type EstabelecimentoListado,
  type Operador,
} from './service.js'

/** Executa um comando já interpretado e devolve o texto a mostrar a quem o rodou. */

const STATUS: Record<EstabelecimentoListado['status'], string> = {
  ACTIVE: 'ativo',
  SUSPENDED: 'suspenso',
  PENDING: 'aguardando e-mail',
}

const dia = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' })

export function formatarLista(lista: readonly EstabelecimentoListado[]): string {
  if (lista.length === 0) return 'Nenhum estabelecimento.'

  const linhas = [
    ['ENDEREÇO', 'NOME', 'STATUS', 'PLANO', 'DONO', 'USUÁRIOS', 'CRIADO EM'],
    ...lista.map((e) => [
      e.slug,
      e.nome,
      STATUS[e.status],
      e.plano ?? '—',
      e.dono ? `${e.dono}${e.emailConfirmado ? '' : ' (não confirmado)'}` : '—',
      String(e.usuariosAtivos),
      dia.format(e.criadoEm),
    ]),
  ]
  const larguras = linhas[0]?.map((_, coluna) =>
    Math.max(...linhas.map((linha) => linha[coluna]?.length ?? 0)),
  )
  const tabela = linhas.map((linha) =>
    linha
      .map((celula, coluna) => celula.padEnd(larguras?.[coluna] ?? 0))
      .join('  ')
      .trimEnd(),
  )
  const total =
    lista.length === 1 ? '1 estabelecimento.' : `${String(lista.length)} estabelecimentos.`
  return [...tabela, '', total].join('\n')
}

export async function executar(comando: Comando, operador: Operador): Promise<string> {
  switch (comando.acao) {
    case 'listar':
      return formatarLista(await listarEstabelecimentos({ status: comando.status }))

    case 'suspender': {
      const { sessoesEncerradas } = await suspenderEstabelecimento(comando.slug, {
        ...operador,
        motivo: comando.motivo,
      })
      return (
        `"${comando.slug}" suspenso: o cardápio saiu do ar e ninguém entra no painel. ` +
        `Sessões encerradas: ${String(sessoesEncerradas)}.`
      )
    }

    case 'reativar': {
      const { status } = await reativarEstabelecimento(comando.slug, operador)
      return status === 'ACTIVE'
        ? `"${comando.slug}" reativado: o cardápio voltou ao ar.`
        : `"${comando.slug}" reativado, mas o cardápio continua fora do ar: ` +
            'o dono ainda não confirmou o e-mail.'
    }

    case 'plano': {
      const { de, para } = await trocarPlano(comando.slug, comando.plano, operador)
      return `"${comando.slug}" passou do plano ${de ?? '(nenhum)'} para o ${para}.`
    }

    case 'reenviar-confirmacao': {
      const { email } = await reenviarConfirmacaoPelaPlataforma(comando.slug, operador)
      return `Link de confirmação enviado para ${email}.`
    }
  }
}
