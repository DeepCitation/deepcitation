import path from "node:path";

export interface CorpusSource {
  id: string;
  title: string;
  filename: string;
  retrievalText: string;
  description: string;
}

export const CORPUS_SOURCES: CorpusSource[] = [
  {
    id: "northstar-q1",
    title: "Northstar Robotics Q1 Brief",
    filename: "northstar-robotics-q1-brief.pdf",
    description: "Revenue, backlog, and expansion guidance for Northstar Robotics.",
    retrievalText:
      "Northstar Robotics Q1 Brief. Warehouse automation revenue grew 42 percent year over year in 2025. Enterprise backlog reached 18 million dollars by the end of March. Management expects international expansion to begin in Q3 2025.",
  },
  {
    id: "solena-pilot",
    title: "Solena Energy Battery Safety Pilot",
    filename: "solena-battery-safety-pilot.pdf",
    description: "Results from the battery safety separator pilot.",
    retrievalText:
      "Solena Energy Battery Safety Pilot. The team reduced pack failures by 63 percent after switching to ceramic separators. Thermal runaway incidents dropped from 11 cases to 4 cases during the pilot. The pilot covered 1200 battery packs across two manufacturing lines.",
  },
  {
    id: "aster-onboarding",
    title: "Aster Health Onboarding Study",
    filename: "aster-health-onboarding-study.pdf",
    description: "Operational impact of guided setup on onboarding and activation.",
    retrievalText:
      "Aster Health Onboarding Study. Average onboarding time fell from 14 days to 6 days after guided setup launched. Activation improved from 58 percent to 81 percent. The operations team credits a four step checklist and weekly office hours.",
  },
];

export function getCorpusFilePath(filename: string): string {
  return path.join(process.cwd(), "corpus", filename);
}
