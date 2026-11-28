import { BadRequestError } from "@/server/auth/errors";
import { validateAccountNumber, validateAmount, validateAccountType, validateAccountStatus } from "./accountValidator";
import type { AccountType, AccountStatus, CustomerStatus, KycStatus, KycDocumentType } from "@/types";

export interface CreateAccountPayload {
  owner: string;
  name?: string;
  phone?: string;
  type: AccountType;
  openingBalance: number;
  minBalance: number;
  dailyLimit: number;
  maxTransaction: number;
}

export function validateCreateAccountPayload(body: unknown): CreateAccountPayload {
  if (!body || typeof body !== "object") {
    throw new BadRequestError("Invalid request body. Expected JSON object.");
  }

  const { owner, name, phone, type, openingBalance, minBalance, dailyLimit, maxTransaction } =
    body as Record<string, unknown>;

  if (typeof owner !== "string" || !owner.includes("@")) {
    throw new BadRequestError("Valid customer owner email is required.");
  }

  const validOpening = openingBalance !== undefined ? validateAmount(openingBalance || 0) : 0;
  const validMin = minBalance !== undefined ? Math.max(0, Number(minBalance)) : 0;
  const validDaily = dailyLimit !== undefined ? validateAmount(dailyLimit) : 2000000;
  const validMax = maxTransaction !== undefined ? validateAmount(maxTransaction) : 1000000;

  return {
    owner: owner.trim().toLowerCase(),
    name: typeof name === "string" && name.trim().length >= 2 ? name.trim() : undefined,
    phone: typeof phone === "string" && phone.trim().length >= 6 ? phone.trim() : undefined,
    type: validateAccountType(type),
    openingBalance: validOpening,
    minBalance: validMin,
    dailyLimit: validDaily,
    maxTransaction: validMax,
  };
}

export function validateAccountStatusPayload(body: unknown): { status: AccountStatus; reason: string } {
  if (!body || typeof body !== "object") {
    throw new BadRequestError("Invalid request body. Expected JSON object.");
  }

  const { status, reason } = body as Record<string, unknown>;
  const validStatus = validateAccountStatus(status);

  if (typeof reason !== "string" || reason.trim().length < 3) {
    throw new BadRequestError("A reason for modifying account status is required (at least 3 characters).");
  }

  return {
    status: validStatus,
    reason: reason.trim().slice(0, 300),
  };
}

export function validateAccountLimitsPayload(body: unknown): {
  dailyLimit?: number;
  maxTransaction?: number;
  minBalance?: number;
} {
  if (!body || typeof body !== "object") {
    throw new BadRequestError("Invalid request body. Expected JSON object.");
  }

  const { dailyLimit, maxTransaction, minBalance } = body as Record<string, unknown>;

  return {
    dailyLimit: dailyLimit !== undefined ? validateAmount(dailyLimit) : undefined,
    maxTransaction: maxTransaction !== undefined ? validateAmount(maxTransaction) : undefined,
    minBalance: minBalance !== undefined ? Math.max(0, Number(minBalance)) : undefined,
  };
}

export function validateCustomerStatusPayload(body: unknown): {
  status: CustomerStatus;
  reason: string;
} {
  if (!body || typeof body !== "object") {
    throw new BadRequestError("Invalid request body. Expected JSON object.");
  }

  const { status, reason } = body as Record<string, unknown>;
  const validStatuses: CustomerStatus[] = ["ACTIVE", "DEACTIVATED", "BLOCKED"];
  const normStatus = String(status || "").toUpperCase() as CustomerStatus;

  if (!validStatuses.includes(normStatus)) {
    throw new BadRequestError(`Invalid customer status. Allowed: ${validStatuses.join(", ")}`);
  }

  if (typeof reason !== "string" || reason.trim().length < 3) {
    throw new BadRequestError("A reason for changing customer status is required (at least 3 characters).");
  }

  return {
    status: normStatus,
    reason: reason.trim().slice(0, 300),
  };
}

export function validateKycSubmitPayload(body: unknown): {
  documentType: KycDocumentType;
  documentNumber: string;
} {
  if (!body || typeof body !== "object") {
    throw new BadRequestError("Invalid request body. Expected JSON object.");
  }

  const { documentType, documentNumber } = body as Record<string, unknown>;
  const validTypes: KycDocumentType[] = ["NATIONAL_ID", "PASSPORT", "DRIVING_LICENSE"];
  const normType = String(documentType || "").toUpperCase() as KycDocumentType;

  if (!validTypes.includes(normType)) {
    throw new BadRequestError(`Invalid document type. Allowed: ${validTypes.join(", ")}`);
  }

  if (typeof documentNumber !== "string" || documentNumber.trim().length < 4) {
    throw new BadRequestError("Valid document number is required (at least 4 characters).");
  }

  return {
    documentType: normType,
    documentNumber: documentNumber.trim().slice(0, 50),
  };
}

export function validateKycReviewPayload(body: unknown): {
  action: "VERIFY" | "REJECT";
  rejectionReason?: string;
} {
  if (!body || typeof body !== "object") {
    throw new BadRequestError("Invalid request body. Expected JSON object.");
  }

  const { action, rejectionReason } = body as Record<string, unknown>;
  const normAction = String(action || "").toUpperCase();

  if (normAction !== "VERIFY" && normAction !== "REJECT") {
    throw new BadRequestError("Action must be VERIFY or REJECT.");
  }

  let cleanReason: string | undefined = undefined;
  if (normAction === "REJECT") {
    if (typeof rejectionReason !== "string" || rejectionReason.trim().length < 3) {
      throw new BadRequestError("Rejection reason is required when rejecting KYC documents.");
    }
    cleanReason = rejectionReason.trim().slice(0, 300);
  }

  return {
    action: normAction as "VERIFY" | "REJECT",
    rejectionReason: cleanReason,
  };
}

export function validateFlagTransactionPayload(body: unknown): {
  reason: string;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
} {
  if (!body || typeof body !== "object") {
    throw new BadRequestError("Invalid request body. Expected JSON object.");
  }

  const { reason, riskLevel } = body as Record<string, unknown>;
  if (typeof reason !== "string" || reason.trim().length < 3) {
    throw new BadRequestError("Reason for flagging transaction is required.");
  }

  const validRisks = ["LOW", "MEDIUM", "HIGH"];
  const normRisk = riskLevel ? (String(riskLevel).toUpperCase() as "LOW" | "MEDIUM" | "HIGH") : "MEDIUM";

  return {
    reason: reason.trim().slice(0, 300),
    riskLevel: validRisks.includes(normRisk) ? normRisk : "MEDIUM",
  };
}

export function validateReviewFlaggedPayload(body: unknown): {
  action: "CLEAR" | "ESCALATE" | "REVERSE";
  notes?: string;
  reversalReason?: string;
} {
  if (!body || typeof body !== "object") {
    throw new BadRequestError("Invalid request body. Expected JSON object.");
  }

  const { action, notes, reversalReason } = body as Record<string, unknown>;
  const normAction = String(action || "").toUpperCase();

  if (normAction !== "CLEAR" && normAction !== "ESCALATE" && normAction !== "REVERSE") {
    throw new BadRequestError("Action must be CLEAR, ESCALATE, or REVERSE.");
  }

  let cleanRevReason: string | undefined = undefined;
  if (normAction === "REVERSE") {
    if (typeof reversalReason !== "string" || reversalReason.trim().length < 3) {
      throw new BadRequestError("Reversal reason is required when reversing a transaction.");
    }
    cleanRevReason = reversalReason.trim().slice(0, 300);
  }

  return {
    action: normAction as "CLEAR" | "ESCALATE" | "REVERSE",
    notes: typeof notes === "string" ? notes.trim().slice(0, 500) : undefined,
    reversalReason: cleanRevReason,
  };
}
