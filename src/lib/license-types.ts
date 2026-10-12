export type LicenseNotice = { title: string; text: string; attributions?: { name: string; license: string }[] };

export type LicenseEntry = {
  name: string;
  version?: string;
  license: string;
  source?: string;
  noticeUrl: string;
};

export type LicenseCatalog = { packages: LicenseEntry[]; native: LicenseEntry[] };
