export interface MergeState {
  status: "open" | "merged" | "closed";
  openedBaseOid: string;
  currentBaseOid: string;
  currentHeadOid: string;
}

export function pullRequestMergeability(state: MergeState): { mergeable: boolean; reason: "ready" | "closed" | "base-moved" | "no-changes" } {
  if (state.status !== "open") return { mergeable: false, reason: "closed" };
  if (state.currentBaseOid !== state.openedBaseOid) return { mergeable: false, reason: "base-moved" };
  if (state.currentHeadOid === state.currentBaseOid) return { mergeable: false, reason: "no-changes" };
  return { mergeable: true, reason: "ready" };
}
