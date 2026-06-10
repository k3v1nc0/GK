export const PASSWORD_POLICY = {
  minimumLength: 15,
  maximumAcceptedLength: 1024,
  supportedMaximumLengthAtLeast: 64,
  allowsSpaces: true,
  requiresCompositionRules: false,
  requiresPeriodicRotation: false,
  requiresBlocklist: true
} as const;

export type PasswordBlocklistCheck = (candidate: string) => boolean;

export interface PasswordPolicyResult {
  readonly allowed: boolean;
  readonly issueCodes: readonly string[];
}

export interface OneTimeTokenState {
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly consumedAt?: string | null;
}

export interface GameRegistrationResult {
  readonly normalizedEmail: string;
  readonly status: "pending_verification";
  readonly emailVerificationRequired: true;
}

export const GENERIC_AUTH_RESPONSE = {
  accepted: "If the submitted details can be used, the next step will be sent or started.",
  rejected: "The submitted details could not be processed."
} as const;

export function normalizeEmailForAuth(email: string): string {
  return email.trim().toLowerCase();
}

export function validatePasswordPolicy(
  candidate: string,
  isBlocked: PasswordBlocklistCheck = () => false
): PasswordPolicyResult {
  const issueCodes: string[] = [];
  const length = [...candidate].length;

  if (length < PASSWORD_POLICY.minimumLength) {
    issueCodes.push("password_too_short");
  }

  if (length > PASSWORD_POLICY.maximumAcceptedLength) {
    issueCodes.push("password_too_long");
  }

  if (isBlocked(candidate)) {
    issueCodes.push("password_blocked");
  }

  return {
    allowed: issueCodes.length === 0,
    issueCodes
  };
}

export function createPendingGameRegistration(email: string): GameRegistrationResult {
  return {
    normalizedEmail: normalizeEmailForAuth(email),
    status: "pending_verification",
    emailVerificationRequired: true
  };
}

export function canConsumeOneTimeToken(token: OneTimeTokenState, now: Date = new Date()): boolean {
  if (token.consumedAt) {
    return false;
  }

  return Date.parse(token.expiresAt) > now.getTime();
}