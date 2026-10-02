// Builds src/data/skills.json from the SKILL.md frontmatter in .skills/.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const skills = readdirSync('.skills', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map(({ name }) => {
    const md = readFileSync(`.skills/${name}/SKILL.md`, 'utf8');
    const front = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const raw = front.match(/^description:\s*(.*)$/m)?.[1]?.trim() ?? '';
    const description = raw.startsWith('"') ? JSON.parse(raw) : raw;
    return { name, command: `/anthropic-skills:${name}`, description };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync('src/data/skills.json', JSON.stringify(skills, null, 2) + '\n');
console.info(`${skills.length} skills`);
