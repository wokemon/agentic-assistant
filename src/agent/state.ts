export interface AgentState {
  malformedCount: number;

  verificationEvidence: boolean;

  repositoryInspected: boolean;

  consecutiveDiscoveryActions: number;

  searchesSinceRead: number;

  discoveryStormWarned: boolean;
}

export function createInitialAgentState(): AgentState {
  return {
    malformedCount: 0,

    verificationEvidence: false,

    repositoryInspected: false,

    consecutiveDiscoveryActions: 0,

    searchesSinceRead: 0,

    discoveryStormWarned: false,
  };
}
