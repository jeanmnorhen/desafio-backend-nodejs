import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadKnowledgeBase(basePath: string): Promise<string> {
  try {
    const files = await readdir(basePath);
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    
    let content = '';
    for (const file of mdFiles) {
      const text = await readFile(join(basePath, file), 'utf-8');
      content += `\n\n---\n\n${text}`;
    }
    
    return content.trim();
  } catch (err) {
    console.error('Error loading knowledge base:', err);
    return '';
  }
}

let cached: string | null = null;
export async function getKnowledgeBase(basePath: string): Promise<string> {
  if (cached) return cached;
  cached = await loadKnowledgeBase(basePath);
  return cached;
}
