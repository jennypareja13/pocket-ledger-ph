export function decideEmptyLedgerScreen(input: {
  authStatus: string;
  online: boolean;
  initialDone: boolean;
  initialPullOkFlag: boolean;
  syncError?: string | undefined;
  running?: boolean | undefined;
  attempted?: boolean | undefined;
}): "spinner" | "retry" | "onboarding" {
  if (input.authStatus === "guest" || input.initialDone || input.initialPullOkFlag)
    return "onboarding";
  if (input.running) return "spinner";
  if (!input.online || input.syncError || input.attempted) return "retry";
  return "spinner";
}
