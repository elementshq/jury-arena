export const DatasetSourceKind = {
  Template: "template",
  Upload: "upload",
} as const;

export type DatasetSourceKind =
  (typeof DatasetSourceKind)[keyof typeof DatasetSourceKind];

export const DatasetTemplateKey = {
  Basic20Jmtbench: "basic20-jmtbench",
  Basic20JmtbenchEn: "basic20-jmtbench-en",
} as const;

export type DatasetTemplateKey =
  (typeof DatasetTemplateKey)[keyof typeof DatasetTemplateKey];

export const DatasetTemplates = [
  { key: DatasetTemplateKey.Basic20JmtbenchEn, label: "English", lang: "en" },
  { key: DatasetTemplateKey.Basic20Jmtbench, label: "Japanese", lang: "ja" },
] as const satisfies readonly {
  key: DatasetTemplateKey;
  label: string;
  lang: string;
}[];
