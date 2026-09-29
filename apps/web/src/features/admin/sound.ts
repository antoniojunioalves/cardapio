/**
 * O alerta sonoro de pedido novo, com Web Audio — sem arquivo de áudio.
 *
 * O navegador só deixa tocar som depois de um gesto da pessoa na página. Por
 * isso o alerta é ligado por um botão: é esse toque que cria o `AudioContext`.
 */
export interface Alerta {
  tocar: () => void
}

export function criarAlerta(): Alerta | null {
  const Contexto = window.AudioContext as typeof AudioContext | undefined
  if (!Contexto) return null
  const contexto = new Contexto()

  return {
    tocar: () => {
      // Dois bipes curtos, agudos o bastante para atravessar o barulho da cozinha.
      for (const inicio of [0, 0.25]) {
        const oscilador = contexto.createOscillator()
        const volume = contexto.createGain()
        oscilador.frequency.value = 880
        volume.gain.setValueAtTime(0.25, contexto.currentTime + inicio)
        volume.gain.exponentialRampToValueAtTime(0.001, contexto.currentTime + inicio + 0.2)
        oscilador.connect(volume).connect(contexto.destination)
        oscilador.start(contexto.currentTime + inicio)
        oscilador.stop(contexto.currentTime + inicio + 0.2)
      }
    },
  }
}
