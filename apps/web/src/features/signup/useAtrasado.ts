import { useEffect, useState } from 'react'

/**
 * O valor, só depois de ele parar de mudar por `ms` milissegundos. É o que
 * impede a consulta de disponibilidade de disparar a cada tecla.
 */
export function useAtrasado<T>(valor: T, ms: number): T {
  const [atrasado, setAtrasado] = useState(valor)

  useEffect(() => {
    const espera = setTimeout(() => {
      setAtrasado(valor)
    }, ms)
    return () => {
      clearTimeout(espera)
    }
  }, [valor, ms])

  return atrasado
}
