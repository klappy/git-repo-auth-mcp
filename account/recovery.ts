import { AccessDenied } from './session';

// Public, fixed references only. Never include provider data or exception text.
export const consumeRecoveryReferences = ['callback-browser', 'callback-pending-missing', 'callback-pending-open', 'callback-nonce', 'callback-binding', 'callback-restart', 'callback-pending-version', 'callback-expired', 'callback-not-started', 'callback-state-mismatch', 'callback-generation', 'callback-continuation-cookie', 'callback-continuation-unavailable', 'callback-continuation-unexpected'] as const;
export type ConsumeRecoveryReference = typeof consumeRecoveryReferences[number];
export function isConsumeRecoveryReference(value: unknown): value is ConsumeRecoveryReference { return typeof value === 'string' && (consumeRecoveryReferences as readonly string[]).includes(value); }
export const recoveryReferences = ['account-request', 'callback-request', 'callback-cookies', 'callback-state', 'callback-code', 'callback-transaction', 'callback-adapter', 'provider-validation', 'provider-exchange', 'provider-response', 'provider-identity', 'session-activation', 'session-load', 'account-bootstrap', ...consumeRecoveryReferences] as const;
export type RecoveryReference = typeof recoveryReferences[number];
export class IdentityRecoveryFailure extends AccessDenied {
  constructor(readonly reference: RecoveryReference) { super(); }
}
export function recoveryNotice(reference: RecoveryReference): string {
  if (!recoveryReferences.includes(reference)) return '';
  return `<p>Support reference: <code>${reference}</code>. Share this reference, not the address bar or sign-in details.</p>`;
}
