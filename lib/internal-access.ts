export const INTERNAL_ACCESS_EMAILS = [
  'mrepsiloned@gmail.com',
  'stocksnack88@gmail.com',
] as const

export function hasInternalAccess(email: string | null | undefined): boolean {
  return INTERNAL_ACCESS_EMAILS.includes(email as (typeof INTERNAL_ACCESS_EMAILS)[number])
}
