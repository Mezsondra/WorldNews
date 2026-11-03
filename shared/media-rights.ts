export interface MediaRights {
  status: "pending" | "cleared" | "restricted" | "blocked";
  basis: "unconfirmed" | "owned" | "permission" | "license" | "public-domain";
  holder: string;
  evidence: string;
  evidenceUrl?: string;
  licenseUrl?: string;
  expiresAt?: string;
  allowedUses: ("private-preview" | "public-video")[];
  commercialUse: boolean;
  adaptations: boolean;
  credit: string;
  changes: string;
  restrictions: string;
  shareAlikePlan: string;
  contextChecked: boolean;
  reviewedBy: string;
  reviewedAt: string;
  fingerprint: string;
}
