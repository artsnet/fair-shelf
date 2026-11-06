import type { SimulationResult } from "./simulate.js";

/** A plain-text table of a simulation: one row per item, most shown first, plus a summary header. */
export function formatSimulation(result: SimulationResult<unknown>): string {
  const rows = [...result.items].sort((a, b) => b.shown - a.shown || a.id.localeCompare(b.id));
  const idWidth = Math.max(4, ...rows.map((row) => row.id.length));
  const lines = [
    `${result.days} days × ${result.audiences} audience(s): ${result.picks} picks over ${result.summary.itemCount} items`,
    `shown per item: min ${result.summary.min}, max ${result.summary.max}, mean ${result.summary.mean.toFixed(2)}, gini ${result.summary.gini.toFixed(3)}, never shown ${result.summary.neverShown}`,
    `relaxation: none ${result.summary.relaxation[0]}, cooldown ignored ${result.summary.relaxation[1]}, lane ignored ${result.summary.relaxation[2]}, role ignored ${result.summary.relaxation[3]}`,
    "",
    `${"item".padEnd(idWidth)}  shown  share   maxGap  roles`,
  ];
  for (const row of rows) {
    const roles = Object.entries(row.byRole).sort(([a], [b]) => a.localeCompare(b)).map(([role, count]) => `${role}:${count}`).join(" ");
    lines.push(`${row.id.padEnd(idWidth)}  ${String(row.shown).padStart(5)}  ${(row.share * 100).toFixed(1).padStart(5)}%  ${String(row.maxGap).padStart(6)}  ${roles}`);
  }
  return `${lines.join("\n")}\n`;
}
