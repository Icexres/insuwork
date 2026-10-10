// Auto-release crank (T-26, OQ-8). Will call sdk.crankAutoReleaseIx once a milestone's window
// (max(due_ts, submitted_ts) + claim window, E-31) has closed; the program enforces the rule.
export {};
