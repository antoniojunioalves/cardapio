import { hash, verify } from '@node-rs/argon2'

/**
 * Parâmetros do argon2id, explícitos em vez de implícitos.
 *
 * São os mínimos recomendados pela OWASP: 19 MiB de memória, 2 iterações,
 * paralelismo 1. Deixá-los escritos aqui é o que permite revisá-los quando o
 * hardware barato ficar mais rápido — um default invisível nunca é revisitado.
 *
 * O resultado do argon2 já carrega algoritmo, parâmetros e salt na própria
 * string, então aumentar o custo no futuro não exige migração: senhas antigas
 * continuam sendo verificadas com os parâmetros com que foram criadas.
 *
 * A variante **argon2id** não aparece aqui porque é o padrão da biblioteca —
 * o enum dela é `const enum`, incompatível com `verbatimModuleSyntax`. Depender
 * de um padrão implícito seria frágil, então há um teste que verifica o prefixo
 * `$argon2id$` do hash produzido. Se uma atualização mudar esse padrão, o teste
 * quebra em vez de degradarmos em silêncio para argon2i.
 */
const OPCOES = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

export async function hashPassword(senha: string): Promise<string> {
  return hash(senha, OPCOES)
}

export async function verifyPassword(hashArmazenado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha)
  } catch {
    // Hash malformado no banco não deve derrubar o login — é uma credencial
    // inválida como outra qualquer, e o motivo aparece no log de auditoria.
    return false
  }
}

/**
 * Consome o mesmo tempo de uma verificação real, sem ter o que verificar.
 *
 * Usado quando o e-mail não existe. Sem isso, responder na hora para e-mail
 * inexistente e demorar ~15 ms para e-mail existente transforma o login num
 * oráculo de quais endereços estão cadastrados — que é informação pessoal e o
 * primeiro passo de um ataque dirigido.
 */
let hashFalso: Promise<string> | undefined

export async function wastePasswordTime(): Promise<void> {
  hashFalso ??= hash('nenhuma-senha-real-corresponde-a-este-hash', OPCOES)
  await verify(await hashFalso, 'tentativa-que-nunca-confere')
}
