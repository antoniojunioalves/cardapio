import { zodResolver } from '@hookform/resolvers/zod'
import {
  mascararCepDigitado,
  mascararTelefoneDigitado,
  normalizarTelefone,
  type PedidoCriado,
} from '@repo/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm, useWatch, type FieldErrors, type Resolver } from 'react-hook-form'

import { TextField } from '@/components/TextField'
import type { LinhaDoCarrinho, ResumoDoCarrinho } from '@/features/cart/cart'
import type { CardapioPublico } from '@/features/menu/types'
import { novoUuid } from '@/utils/id'
import { formatarPreco } from '@/utils/money'

import { useEnviarPedido, useIdentificacao } from '../api'
import {
  OBSERVACAO_DO_PEDIDO_MAXIMA,
  VALORES_INICIAIS,
  criarSchemaDoCheckout,
  descreverFalhaNoEnvio,
  impedimentosDoPedido,
  montarPedido,
  modalidadesDisponiveis,
  taxaDeEntrega,
  type DadosDoCheckout,
  type Modalidade,
  type ValoresDoCheckout,
} from '../checkout'
import { OrderSummary } from './OrderSummary'

interface CheckoutFormProps {
  slug: string
  cardapio: CardapioPublico
  linhas: readonly LinhaDoCarrinho[]
  resumo: ResumoDoCarrinho
  /** O pedido foi aceito pelo servidor. */
  aoEnviado: (pedido: PedidoCriado) => void
}

const NOME_DA_MODALIDADE: Record<Modalidade, string> = {
  DELIVERY: 'Entrega',
  PICKUP: 'Retirada no local',
}

const opcao =
  'flex cursor-pointer items-center gap-stack rounded-control border border-border px-3 py-3 has-[:checked]:border-primary has-[:checked]:bg-brand-50'
const legenda = 'text-heading mb-stack text-content'

/** A mensagem de erro de um campo, se houver. */
const erroDe = (erros: FieldErrors<ValoresDoCheckout>, campo: keyof ValoresDoCheckout) =>
  erros[campo]?.message

export function CheckoutForm({ slug, cardapio, linhas, resumo, aoEnviado }: CheckoutFormProps) {
  const { delivery, paymentMethods, establishment } = cardapio
  const modalidades = modalidadesDisponiveis(delivery)
  const identificacao = useIdentificacao(slug)
  const envio = useEnviarPedido(slug)
  const queryClient = useQueryClient()

  // Uma chave por tentativa de pedido: reenviar o mesmo pedido (rede que caiu,
  // duplo clique) usa a mesma, e o servidor devolve o que já criou. Quando o
  // pedido é recusado e o cliente muda alguma coisa, a próxima tentativa é
  // outra, com chave nova.
  const [chave, setChave] = useState(novoUuid)

  // O schema depende do total e dos endereços identificados, que mudam com o
  // preenchimento. O resolver lê sempre o do render mais recente.
  const schemaAtual = useRef<ReturnType<typeof criarSchemaDoCheckout> | null>(null)

  const form = useForm<ValoresDoCheckout, unknown, DadosDoCheckout>({
    resolver: (valores, contexto, opcoes) => {
      if (!schemaAtual.current) throw new Error('schema do checkout ainda não montado')
      // O schema aceita também `null` em cada campo (rádio sem nada marcado); os
      // valores do formulário, só texto, cabem nele. O TypeScript não prova isso
      // para as opções do resolver, daí a conversão.
      const resolver = zodResolver(schemaAtual.current) as unknown as Resolver<
        ValoresDoCheckout,
        unknown,
        DadosDoCheckout
      >
      return resolver(valores, contexto, opcoes)
    },
    defaultValues: {
      ...VALORES_INICIAIS,
      // Com uma modalidade só não há o que escolher.
      fulfillment: modalidades.length === 1 ? (modalidades[0] ?? '') : '',
      city: establishment.address?.city ?? '',
    },
  })
  const { register, control, formState, setValue } = form
  const erros = formState.errors

  const [telefone, fulfillment, savedAddressId, deliveryRegionId, paymentMethodId] = useWatch({
    control,
    name: ['phone', 'fulfillment', 'savedAddressId', 'deliveryRegionId', 'paymentMethodId'],
  })

  // A resposta vale só para o telefone que está no campo: se a pessoa trocar
  // o número, os endereços do número anterior somem da tela.
  const telefoneAtual = normalizarTelefone(telefone)
  const cliente =
    identificacao.isSuccess && identificacao.variables === telefoneAtual
      ? identificacao.data.cliente
      : null
  const enderecosSalvos = cliente?.enderecos ?? []

  const entrega = fulfillment === 'DELIVERY'
  const retirada = fulfillment === 'PICKUP'
  const taxa = taxaDeEntrega(delivery, fulfillment, deliveryRegionId)
  const total = resumo.subtotalEmCentavos + (taxa ?? 0)
  const formaEscolhida = paymentMethods.find((f) => f.id === paymentMethodId)
  const usandoEnderecoSalvo = entrega && savedAddressId !== '' && cliente !== null
  const impedimentos = impedimentosDoPedido(cardapio, linhas, resumo)

  const schema = criarSchemaDoCheckout({
    cardapio,
    enderecosSalvos: enderecosSalvos.map((e) => e.id),
    totalEmCentavos: total,
  })
  useEffect(() => {
    schemaAtual.current = schema
  })

  function buscarCliente() {
    if (!telefoneAtual || identificacao.variables === telefoneAtual) return
    identificacao.mutate(telefoneAtual, {
      onSuccess: (resposta) => {
        // O endereço mais recente já vem escolhido; a pessoa confere e troca.
        const recente = resposta.cliente?.enderecos[0]
        if (recente && normalizarTelefone(form.getValues('phone')) === telefoneAtual) {
          setValue('savedAddressId', recente.id)
        }
      },
    })
  }

  function enviar(dados: DadosDoCheckout) {
    envio.mutate(
      montarPedido(
        dados,
        linhas.map((l) => l.item),
        total,
        chave,
      ),
      {
        onSuccess: aoEnviado,
        onError: (erro) => {
          if (descreverFalhaNoEnvio(erro).cardapioMudou) {
            setChave(novoUuid())
            // O cardápio de agora mostra o que mudou: esgotado, preço, região.
            void queryClient.invalidateQueries({ queryKey: ['cardapio-publico', slug] })
          }
        },
      },
    )
  }

  const falha = envio.isError ? descreverFalhaNoEnvio(envio.error) : null

  return (
    <form
      noValidate
      onSubmit={(evento) => void form.handleSubmit(enviar)(evento)}
      className="flex flex-col gap-section-y"
    >
      <fieldset className="flex flex-col gap-stack rounded-card bg-surface p-card shadow-card">
        <legend className="sr-only">Seus dados</legend>
        <h2 className="text-heading text-content">Seus dados</h2>

        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <TextField
              rotulo="Telefone (WhatsApp)"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 98765-4321"
              dica="Se você já pediu aqui, encontramos seus endereços."
              erro={erroDe(erros, 'phone')}
              ref={field.ref}
              name={field.name}
              value={field.value}
              onChange={(e) => {
                const mascarado = mascararTelefoneDigitado(e.target.value)
                field.onChange(mascarado)
                if (normalizarTelefone(mascarado) !== identificacao.variables) {
                  setValue('savedAddressId', '')
                }
              }}
              onBlur={() => {
                field.onBlur()
                buscarCliente()
              }}
            />
          )}
        />

        {identificacao.isPending && (
          <p role="status" className="text-caption text-content-muted">
            Procurando seus dados…
          </p>
        )}
        {cliente && (
          <p role="status" className="text-body text-content">
            Olá, {cliente.primeiroNome}! Que bom te ver de novo.
          </p>
        )}
        {identificacao.isError && identificacao.variables === telefoneAtual && (
          <p className="text-caption text-content-muted">
            Não conseguimos buscar seus dados agora. Preencha abaixo, por favor.
          </p>
        )}

        <TextField
          rotulo="Nome"
          autoComplete="name"
          erro={erroDe(erros, 'name')}
          {...register('name')}
        />
      </fieldset>

      {modalidades.length > 0 && (
        <fieldset className="flex flex-col gap-2 rounded-card bg-surface p-card shadow-card">
          <legend className={legenda}>Como você quer receber?</legend>
          {modalidades.map((m) => (
            <label key={m} className={opcao}>
              <input
                type="radio"
                value={m}
                className="size-5 accent-primary"
                {...register('fulfillment')}
              />
              <span className="text-body flex-1 text-content">{NOME_DA_MODALIDADE[m]}</span>
              {m === 'PICKUP' && establishment.address && (
                <span className="text-caption text-content-muted">
                  {establishment.address.street}
                  {establishment.address.number ? `, ${establishment.address.number}` : ''}
                </span>
              )}
            </label>
          ))}
          {erroDe(erros, 'fulfillment') && (
            <p className="text-caption text-danger">{erroDe(erros, 'fulfillment')}</p>
          )}
        </fieldset>
      )}

      {entrega && (
        <fieldset className="flex flex-col gap-stack rounded-card bg-surface p-card shadow-card">
          <legend className="sr-only">Endereço de entrega</legend>
          <h2 className="text-heading text-content">Endereço de entrega</h2>

          {enderecosSalvos.length > 0 && (
            <div role="radiogroup" aria-label="Seus endereços" className="flex flex-col gap-2">
              {enderecosSalvos.map((endereco) => (
                <label key={endereco.id} className={opcao}>
                  <input
                    type="radio"
                    value={endereco.id}
                    className="size-5 accent-primary"
                    {...register('savedAddressId')}
                  />
                  <span className="text-body text-content">{endereco.resumo}</span>
                </label>
              ))}
              <label className={opcao}>
                <input
                  type="radio"
                  value=""
                  className="size-5 accent-primary"
                  {...register('savedAddressId')}
                />
                <span className="text-body text-content">Outro endereço</span>
              </label>
              {erroDe(erros, 'savedAddressId') && (
                <p className="text-caption text-danger">{erroDe(erros, 'savedAddressId')}</p>
              )}
            </div>
          )}

          {!usandoEnderecoSalvo && (
            <div className="grid grid-cols-3 gap-stack">
              {/*
               * O CEP vem primeiro: quando a consulta aos Correios existir
               * (ROADMAP), é ele que vai preencher rua, bairro e cidade.
               */}
              <Controller
                control={control}
                name="postalCode"
                render={({ field }) => (
                  <TextField
                    className="col-span-3 sm:col-span-1"
                    rotulo="CEP"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    placeholder="00000-000"
                    erro={erroDe(erros, 'postalCode')}
                    ref={field.ref}
                    name={field.name}
                    value={field.value}
                    onChange={(e) => {
                      field.onChange(mascararCepDigitado(e.target.value))
                    }}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <div className="hidden sm:col-span-2 sm:block" />
              <TextField
                className="col-span-2"
                rotulo="Rua"
                autoComplete="address-line1"
                erro={erroDe(erros, 'street')}
                {...register('street')}
              />
              <TextField rotulo="Número" erro={erroDe(erros, 'number')} {...register('number')} />
              <TextField
                className="col-span-3"
                rotulo="Complemento (opcional)"
                autoComplete="address-line2"
                erro={erroDe(erros, 'complement')}
                {...register('complement')}
              />
              <TextField
                className="col-span-3 sm:col-span-2"
                rotulo="Bairro"
                erro={erroDe(erros, 'neighborhood')}
                {...register('neighborhood')}
              />
              <TextField
                className="col-span-3 sm:col-span-1"
                rotulo="Cidade"
                autoComplete="address-level2"
                erro={erroDe(erros, 'city')}
                {...register('city')}
              />
              <TextField
                className="col-span-3"
                rotulo="Ponto de referência (opcional)"
                erro={erroDe(erros, 'reference')}
                {...register('reference')}
              />
            </div>
          )}

          {delivery.feeMode === 'BY_REGION' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="regiao" className="text-body font-semibold text-content">
                Região de entrega
              </label>
              <select
                id="regiao"
                aria-invalid={erroDe(erros, 'deliveryRegionId') ? true : undefined}
                className="text-body rounded-control border border-border bg-surface px-3 py-2"
                {...register('deliveryRegionId')}
              >
                <option value="">Escolha a região</option>
                {delivery.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.feeInCents === 0 ? 'grátis' : formatarPreco(r.feeInCents)}
                  </option>
                ))}
              </select>
              {erroDe(erros, 'deliveryRegionId') && (
                <p className="text-caption text-danger">{erroDe(erros, 'deliveryRegionId')}</p>
              )}
            </div>
          )}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2 rounded-card bg-surface p-card shadow-card">
        <legend className={legenda}>Pagamento na entrega</legend>
        {paymentMethods.map((forma) => (
          <label key={forma.id} className={opcao}>
            <input
              type="radio"
              value={forma.id}
              className="size-5 accent-primary"
              {...register('paymentMethodId')}
            />
            <span className="text-body text-content">{forma.name}</span>
          </label>
        ))}
        {erroDe(erros, 'paymentMethodId') && (
          <p className="text-caption text-danger">{erroDe(erros, 'paymentMethodId')}</p>
        )}

        {formaEscolhida?.kind === 'CASH' && (
          <TextField
            className="mt-2"
            rotulo="Troco para quanto? (opcional)"
            inputMode="decimal"
            placeholder="50,00"
            dica="Deixe em branco se não precisar de troco."
            erro={erroDe(erros, 'changeFor')}
            {...register('changeFor')}
          />
        )}
      </fieldset>

      <div className="flex flex-col gap-1 rounded-card bg-surface p-card shadow-card">
        <label htmlFor="observacao-do-pedido" className="text-heading text-content">
          Observações (opcional)
        </label>
        <textarea
          id="observacao-do-pedido"
          rows={2}
          maxLength={OBSERVACAO_DO_PEDIDO_MAXIMA}
          placeholder="Ex.: interfone quebrado, chamar no portão"
          className="text-body w-full rounded-control border border-border bg-surface px-3 py-2"
          {...register('notes')}
        />
      </div>

      <div className="rounded-card bg-surface p-card shadow-card">
        <OrderSummary
          linhas={linhas}
          subtotalEmCentavos={resumo.subtotalEmCentavos}
          taxaEmCentavos={taxa}
          retirada={retirada}
        />
      </div>

      {impedimentos.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 rounded-control bg-accent-50 p-3">
          {impedimentos.map((texto) => (
            <li key={texto} className="text-caption text-accent-800">
              {texto}
            </li>
          ))}
        </ul>
      )}

      {falha && (
        <div role="alert" className="flex flex-col gap-1 rounded-control bg-accent-50 p-3">
          <p className="text-body font-semibold text-accent-800">O pedido não foi enviado</p>
          <ul className="flex flex-col gap-1">
            {falha.mensagens.map((texto) => (
              <li key={texto} className="text-caption text-accent-800">
                {texto}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={impedimentos.length > 0 || envio.isPending}
        aria-label={envio.isPending ? 'Enviando o pedido' : `Fazer pedido, ${formatarPreco(total)}`}
        className="text-body flex items-center justify-between rounded-control bg-primary px-4 py-3 font-semibold text-primary-content hover:bg-primary-hover disabled:bg-neutral-300 disabled:text-neutral-600"
      >
        <span>{envio.isPending ? 'Enviando…' : 'Fazer pedido'}</span>
        <span>{formatarPreco(total)}</span>
      </button>
    </form>
  )
}
