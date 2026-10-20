export const ROLES = ["OWNER", "BANTAY"] as const;
export type Role = (typeof ROLES)[number];

export const PAYMENT_METHODS = ["CASH", "GCASH", "UTANG"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Marks a sale for the owner's "Needs review" list (spec 6). */
export const SALE_FLAGS = ["NEGATIVE_STOCK", "OVER_CREDIT_LIMIT", "PRICE_CHANGED", "CUSTOM_ITEM", "CLOCK_ADJUSTED"] as const;
export type SaleFlag = (typeof SALE_FLAGS)[number];

export const MOVEMENT_REASONS = ["SALE", "RESTOCK", "COUNT", "SPOILAGE", "EXPIRED", "VOID"] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

export const UTANG_KINDS = ["CHARGE", "PAYMENT", "ADJUSTMENT", "VOID"] as const;
export type UtangKind = (typeof UTANG_KINDS)[number];
