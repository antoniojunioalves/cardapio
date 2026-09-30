import { LegalDocument } from '@/features/legal/components/LegalDocument'
import { POLITICA_DE_PRIVACIDADE, TERMOS_DE_USO } from '@/features/legal/textos'

/** Os termos de uso, em `/termos`. */
export function TermsPage() {
  return <LegalDocument documento={TERMOS_DE_USO} />
}

/** A política de privacidade, em `/privacidade`. */
export function PrivacyPage() {
  return <LegalDocument documento={POLITICA_DE_PRIVACIDADE} />
}
