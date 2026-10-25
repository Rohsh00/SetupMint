import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HELP_CONTENT, HelpKey, IHelpEntry } from '../packages/shared/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsDir = path.resolve(__dirname, '../docs');
const glossaryPath = path.join(docsDir, 'GLOSSARY.md');

function generateMarkdown(): string {
  const lines: string[] = [];
  lines.push('# TradeVault Complete Financial & Trading Glossary');
  lines.push('');
  lines.push('> Authoritative, auto-generated documentation of all 42 domain concepts, metrics,');
  lines.push('> simulation rules, and execution formulas used across TradeVault.');
  lines.push('> Generated directly from `@tradevault/shared/help-content`.');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Group by domain prefix
  const groups: Record<string, { label: string; keys: HelpKey[] }> = {
    'analytics.whatIf': { label: '1. What-If Stop/Target Simulation', keys: [] },
    'metric': { label: '2. Trading Metrics & Statistical Performance', keys: [] },
    'trade': { label: '3. Trade Execution, Lifecycle & Fees', keys: [] },
    'account': { label: '4. Accounts, Ledger & Balance Reconciliation', keys: [] },
    'import': { label: '5. Broker & CSV Import Mechanics', keys: [] },
    'settings': { label: '6. Security, Provider Circuit Breakers & Risk Settings', keys: [] },
    'instrument': { label: '7. Instruments & Tick Specifications', keys: [] },
    'strategy': { label: '8. Playbook Strategy Edge Verification', keys: [] },
    'journal': { label: '9. Psychology & Discipline Review', keys: [] },
    'dashboard': { label: '10. Dashboard & Review Queue', keys: [] },
  };

  const allKeys = Object.keys(HELP_CONTENT) as HelpKey[];
  for (const key of allKeys) {
    let matched = false;
    for (const prefix of Object.keys(groups)) {
      if (key.startsWith(prefix)) {
        groups[prefix].keys.push(key);
        matched = true;
        break;
      }
    }
    if (!matched) {
      if (!groups['other']) groups['other'] = { label: 'Other Concepts', keys: [] };
      groups['other'].keys.push(key);
    }
  }

  // Table of Contents
  lines.push('## Table of Contents');
  for (const group of Object.values(groups)) {
    if (group.keys.length === 0) continue;
    lines.push(`- [${group.label}](#${group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')})`);
    for (const key of group.keys) {
      const entry = HELP_CONTENT[key];
      lines.push(`  - [${entry.title}](#${entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')})`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Sections
  for (const group of Object.values(groups)) {
    if (group.keys.length === 0) continue;
    lines.push(`## ${group.label}`);
    lines.push('');

    for (const key of group.keys) {
      const entry = HELP_CONTENT[key];
      lines.push(`### ${entry.title}`);
      lines.push(`*Registry Key:* \`${key}\``);
      lines.push('');
      lines.push(`**Summary:** ${entry.summary}`);
      lines.push('');

      if (entry.details) {
        lines.push(`**Detailed Explanation:** ${entry.details}`);
        lines.push('');
      }

      if (entry.formula) {
        lines.push('```text');
        lines.push(`Formula: ${entry.formula}`);
        lines.push('```');
        lines.push('');
      }

      if (entry.example) {
        lines.push(`> **Example:** ${entry.example}`);
        lines.push('');
      }

      if (entry.caveats) {
        lines.push(`> [!WARNING]`);
        lines.push(`> **Caveat:** ${entry.caveats}`);
        lines.push('');
      }

      if (entry.seeAlso && entry.seeAlso.length > 0) {
        lines.push(`**See Also:** ${entry.seeAlso.map((k) => `\`${k}\``).join(', ')}`);
        lines.push('');
      }

      if (entry.docsAnchor) {
        lines.push(`**Documentation Reference:** [${entry.docsAnchor}](${entry.docsAnchor})`);
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

const markdown = generateMarkdown();
fs.writeFileSync(glossaryPath, markdown, 'utf8');
console.log(`Successfully generated GLOSSARY.md with ${Object.keys(HELP_CONTENT).length} entries at ${glossaryPath}`);
