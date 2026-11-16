export interface ParsedZealyUrl {
  url: string;
  projectSlug: string;
  projectName: string;
}

export interface NormalizedQuest {
  questId: string;
  projectSlug: string;
  projectName: string;
  questName: string;
  questUrl: string;
  reward: string | null;
  detectedAt: Date | null;
}

export interface ScanResult {
  quests: NormalizedQuest[];
  newQuests: NormalizedQuest[];
  questsFound: number;
  newQuestsFound: number;
  status: "completed" | "suspicious" | "failed";
  errorMessage?: string;
}

export interface ProjectWithStats {
  id: string;
  url: string;
  projectSlug: string;
  projectName: string;
  isActive: boolean;
  scanIntervalMinutes: number;
  notifyOnInitialScan: boolean;
  lastCheckedAt: Date | null;
  questCount: number;
  lastScanAt: Date | null;
}

export type ScanStatus = "PENDING" | "COMPLETED" | "FAILED" | "SUSPICIOUS";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED";