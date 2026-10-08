import { zodResolver } from '@hookform/resolvers/zod'
import { mascararCepDigitado, mascararTelefoneDigitado } from '@repo/shared'
import { Controller, useForm } from 'react-hook-form'

import { SelectField } from '@/components/SelectField'
import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { ApiError, errosPorCampo } from '@/services/api'

import {
  formularioSchema,
  fusosParaEscolher,
  paraFormulario,
  UFS,
  useEnviarImagem,
  useRemoverImagem,
  useSalvarConfiguracoes,
  type Configuracoes,
  type DadosDoFormulario,
  type ValoresDoFormulario,
} from '../settings'
import { reconferir } from '../form-fields'
import { AvisoDeSomenteLeitura, Marcavel, RodapeDeSalvar, Secao } from './form-parts'
import { ImageField } from './ImageField'

type Campo = keyof ValoresDoFormulario

interface SettingsFormProps {
  slug: string
  configuracoes: Configuracoes
  /** Sem `settings:update`, a pessoa vê tudo e não altera nada — a não ser pausar, se puder. */
  podeEditar: boolean
  /**
   * Pausar e retomar o recebimento de pedidos é do dia a dia, e tem a
   * permissão dele (`orders:pause`). Quem altera as configurações também pausa.
   */
  podePausar: boolean
}

/**
 * O formulário das configurações do estabelecimento. Um "Salvar" só, que grava
 * tudo de uma vez — a API altera o nome, o fuso e o resto na mesma transação.
 * As imagens ficam fora dele: são gravadas ao escolher o arquivo.
 */
export function SettingsForm({ slug, configuracoes, podeEditar, podePausar }: SettingsFormProps) {
  const salvar = useSalvarConfiguracoes(slug)
  const envioDoLogo = useEnviarImagem(slug, 'logo')
  const remocaoDoLogo = useRemoverImagem(slug, 'logo')
  const envioDaCapa = useEnviarImagem(slug, 'cover')
  const remocaoDaCapa = useRemoverImagem(slug, 'cover')
  const form = useForm<ValoresDoFormulario, unknown, DadosDoFormulario>({
    resolver: zodResolver(formularioSchema),
    defaultValues: paraFormulario(configuracoes),
    mode: 'onTouched',
  })
  const { register, control, formState, handleSubmit, reset, setError, trigger } = form
  const erros = formState.errors

  function aoEnviar(dados: DadosDoFormulario) {
    // Quem só pausa envia só isso: o resto do formulário não é dele.
    salvar.mutate(podeEditar ? dados : { isAcceptingOrders: dados.isAcceptingOrders }, {
      onSuccess: (salvas) => {
        // Os campos passam a mostrar o que foi gravado, e o formulário deixa de estar "alterado".
        reset(paraFormulario(salvas))
      },
      onError: (erro) => {
        // As regras da tela são as da API; isto só acontece se as duas divergirem.
        const porCampo = erro instanceof ApiError ? errosPorCampo(erro.details) : {}
        for (const [campo, mensagem] of Object.entries(porCampo)) {
          if (campo in formularioSchema.shape) setError(campo as Campo, { message: mensagem })
        }
      },
    })
  }

  const cardapio = `${window.location.host}/${slug}`

  return (
    <div className="flex flex-col gap-section-y">
      {!podeEditar &&
        (podePausar ? (
          <AvisoDeSomenteLeitura texto="O seu perfil permite só pausar e retomar o recebimento de pedidos." />
        ) : (
          <AvisoDeSomenteLeitura />
        ))}

      <Secao titulo="Imagens">
        <div className="grid grid-cols-1 gap-stack sm:grid-cols-[12rem_1fr]">
          <ImageField
            envio={envioDoLogo}
            remocao={remocaoDoLogo}
            rotulo="Logo"
            dica="Quadrado fica melhor."
            url={configuracoes.logoUrl}
            podeEditar={podeEditar}
            moldura="size-32"
          />
          <ImageField
            envio={envioDaCapa}
            remocao={remocaoDaCapa}
            rotulo="Capa"
            dica="Aparece no topo do cardápio. Uma foto larga fica melhor."
            url={configuracoes.coverUrl}
            podeEditar={podeEditar}
            moldura="h-32 w-full"
          />
        </div>
        <p className="text-caption text-content-muted">
          JPEG, PNG ou WebP, até 15 MB. A foto é reduzida e guardada sem a localização de onde foi
          tirada.
        </p>
      </Secao>

      <form
        noValidate
        onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
        className="flex flex-col gap-section-y"
      >
        {/* `disabled` no fieldset desliga todos os campos de uma vez para quem só pode ver. */}
        <fieldset disabled={!podeEditar} className="flex min-w-0 flex-col gap-section-y">
          <Secao titulo="Estabelecimento">
            <TextField
              rotulo="Nome"
              autoComplete="organization"
              erro={erros.name?.message}
              {...register('name')}
            />
            <TextAreaField
              rotulo="Descrição"
              dica="Uma ou duas frases, que aparecem abaixo do nome no cardápio."
              erro={erros.description?.message}
              {...register('description')}
            />
            <div className="flex flex-col gap-1">
              <p className="text-body font-semibold text-content">Endereço do cardápio</p>
              <p className="text-body text-content-muted">
                <a
                  href={`/${slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-primary hover:underline"
                >
                  {cardapio}
                </a>
              </p>
              <p className="text-caption text-content-muted">
                É o link que você divulga. Ele não muda, para os que já foram compartilhados
                continuarem valendo.
              </p>
            </div>
            <SelectField
              rotulo="Fuso horário"
              dica="É por ele que o cardápio sabe se está aberto agora."
              erro={erros.timezone?.message}
              {...register('timezone')}
            >
              {fusosParaEscolher(configuracoes.timezone).map((fuso) => (
                <option key={fuso.valor} value={fuso.valor}>
                  {fuso.rotulo}
                </option>
              ))}
            </SelectField>
          </Secao>

          <Secao titulo="Contato">
            <Controller
              control={control}
              name="whatsappPhone"
              render={({ field }) => (
                <TextField
                  rotulo="WhatsApp"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="(11) 98765-4321"
                  dica="É para este número que o cliente envia o pedido."
                  erro={erros.whatsappPhone?.message}
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(evento) => {
                    field.onChange(mascararTelefoneDigitado(evento.target.value))
                  }}
                />
              )}
            />
            <div className="grid grid-cols-1 gap-stack sm:grid-cols-2">
              <Controller
                control={control}
                name="contactPhone"
                render={({ field }) => (
                  <TextField
                    rotulo="Telefone de contato"
                    type="tel"
                    inputMode="numeric"
                    placeholder="(11) 3333-4444"
                    dica="Opcional. Aparece nas informações do cardápio."
                    erro={erros.contactPhone?.message}
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(evento) => {
                      field.onChange(mascararTelefoneDigitado(evento.target.value))
                    }}
                  />
                )}
              />
              <TextField
                rotulo="E-mail de contato"
                type="email"
                autoComplete="email"
                dica="Opcional."
                erro={erros.contactEmail?.message}
                {...register('contactEmail')}
              />
            </div>
          </Secao>

          <Secao titulo="Endereço">
            <div className="grid grid-cols-1 gap-stack sm:grid-cols-[10rem_1fr]">
              <Controller
                control={control}
                name="addressPostalCode"
                render={({ field }) => (
                  <TextField
                    rotulo="CEP"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    placeholder="01310-100"
                    erro={erros.addressPostalCode?.message}
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(evento) => {
                      field.onChange(mascararCepDigitado(evento.target.value))
                    }}
                  />
                )}
              />
              <TextField
                rotulo="Rua"
                autoComplete="address-line1"
                erro={erros.addressStreet?.message}
                {...register('addressStreet')}
              />
            </div>
            <div className="grid grid-cols-1 gap-stack sm:grid-cols-[10rem_1fr]">
              <TextField
                rotulo="Número"
                erro={erros.addressNumber?.message}
                {...register('addressNumber')}
              />
              <TextField
                rotulo="Complemento"
                erro={erros.addressComplement?.message}
                {...register('addressComplement')}
              />
            </div>
            <TextField
              rotulo="Bairro"
              erro={erros.addressNeighborhood?.message}
              {...register('addressNeighborhood')}
            />
            <div className="grid grid-cols-1 gap-stack sm:grid-cols-[1fr_10rem]">
              <TextField
                rotulo="Cidade"
                autoComplete="address-level2"
                erro={erros.addressCity?.message}
                {...register('addressCity')}
              />
              <SelectField
                rotulo="Estado"
                autoComplete="address-level1"
                erro={erros.addressState?.message}
                {...register('addressState')}
              >
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </SelectField>
            </div>
          </Secao>
        </fieldset>

        {/* Fora do `fieldset` de cima: o "Recebendo pedidos" tem a permissão dele. */}
        <Secao titulo="Pedidos">
          <Marcavel
            type="checkbox"
            titulo="Recebendo pedidos"
            descricao="Desmarque para pausar o cardápio sem mexer no horário de funcionamento."
            disabled={!podePausar}
            {...register('isAcceptingOrders')}
          />
          <fieldset disabled={!podeEditar} className="flex min-w-0 flex-col gap-stack">
            <TextField
              rotulo="Pedido mínimo (R$)"
              inputMode="decimal"
              placeholder="0,00"
              dica="Em branco ou zero: sem pedido mínimo."
              erro={erros.minimumOrderInCents?.message}
              {...register('minimumOrderInCents')}
            />
            <div className="grid grid-cols-1 gap-stack sm:grid-cols-2">
              <TextField
                rotulo="Tempo de preparo mínimo (min)"
                inputMode="numeric"
                erro={erros.prepTimeMinMinutes?.message}
                {...register('prepTimeMinMinutes', {
                  onChange: reconferir({ formState, trigger }, 'prepTimeMaxMinutes'),
                })}
              />
              <TextField
                rotulo="Tempo de preparo máximo (min)"
                inputMode="numeric"
                erro={erros.prepTimeMaxMinutes?.message}
                {...register('prepTimeMaxMinutes')}
              />
            </div>
          </fieldset>
        </Secao>

        {(podeEditar || podePausar) && (
          <RodapeDeSalvar
            envio={salvar}
            alterado={formState.isDirty}
            sucesso="Configurações salvas."
          />
        )}
      </form>
    </div>
  )
}
