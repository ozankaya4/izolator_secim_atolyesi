import { openDB } from 'idb';
import type { Project } from './types';
const database = () =>
  openDB('izolator-atolyesi', 1, {
    upgrade(db) {
      db.createObjectStore('projects');
      db.createObjectStore('draft');
    },
  });
export async function saveDraft(project: Project) {
  const db = await database();
  await db.put('draft', project, 'last');
}
export async function getDraft(): Promise<unknown> {
  const db = await database();
  return db.get('draft', 'last');
}
export async function saveProject(project: Project) {
  const db = await database();
  await db.put('projects', { project, savedAt: new Date().toISOString() }, project.name);
}
export async function listProjects(): Promise<{ project: Project; savedAt: string }[]> {
  const db = await database();
  return db.getAll('projects');
}
export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(name: string, headers: string[], rows: (number | string)[][]) {
  const quote = (x: number | string) => '"' + String(x).replaceAll('"', '""') + '"';
  download(
    name,
    '\uFEFF' + [headers, ...rows].map((row) => row.map(quote).join(';')).join('\r\n'),
    'text/csv;charset=utf-8',
  );
}
