import { AccessDenied } from './session';

// Public, fixed references only. Never include provider data or exception text.
export const recoveryReferences = ['account-request', 'callback-request', 'callback-cookies', 'callback-transaction', 'provider-exchange', 'provider-response', 'provider-identity', 'session-activation', 'session-load', 'account-bootstrap'] as const;
export type RecoveryReference = typeof recoveryReferences[number];
export class IdentityRecoveryFailure extends AccessDenied {
  constructor(readonly reference: RecoveryReference) { super(); }
}
export function recoveryNotice(reference: RecoveryReference): string {
  if (!recoveryReferences.includes(reference)) return '';
  return `<p>Support reference: <code>${reference}</code>. Share this reference, not the address bar or sign-in details.</p>`;
}
