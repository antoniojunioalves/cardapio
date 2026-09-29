/**
 * Regras e contratos usados pela API e pela web.
 *
 * Só entra aqui o que os dois lados precisam validar igual. Regra que só um
 * lado aplica fica nele — a máscara do endereço, por exemplo, é do servidor.
 */
export * from './customer.js'
export * from './phone.js'
export * from './postal-code.js'
