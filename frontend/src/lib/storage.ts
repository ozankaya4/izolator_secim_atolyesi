import { openDB } from 'idb';
import type { Project } from './types';
import { parseScenarios, type Scenario } from './scenarios';
let connection: ReturnType<typeof openDB> | undefined;
const database = () =>
  (connection ??= openDB('izolator-atolyesi', 1, {
    upgrade(db) {
      db.createObjectStore('projects');
      db.createObjectStore('draft');
    },
    blocking(_currentVersion, _blockedVersion, event) {
      (event.target as IDBDatabase).close();
      connection = undefined;
    },
  }));
let scenarioConnection: ReturnType<typeof openDB> | undefined;
const scenarioDatabase = () =>
  (scenarioConnection ??= openDB('izolator-senaryolar', 1, {
    upgrade(db) {
      db.createObjectStore('comparisons');
    },
    blocking(_currentVersion, _blockedVersion, event) {
      (event.target as IDBDatabase).close();
      scenarioConnection = undefined;
    },
  }));
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
  return (await db.getAll('projects')).filter(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      entry.project &&
      typeof entry.project === 'object' &&
      typeof entry.project.name === 'string' &&
      typeof entry.savedAt === 'string',
  );
}
export async function listScenarios(): Promise<Scenario[]> {
  const db = await scenarioDatabase();
  return parseScenarios(await db.get('comparisons', 'items'));
}
export async function editScenarios(
  edit: (current: Scenario[]) => Scenario[],
): Promise<Scenario[]> {
  const db = await scenarioDatabase();
  const tx = db.transaction('comparisons', 'readwrite');
  try {
    const next = edit(parseScenarios(await tx.store.get('items')));
    if (next.length > 4)
      throw new Error(
        'En fazla dört senaryo karşılaştırılabilir. Önce bir senaryoyu karşılaştırmadan çıkarın.',
      );
    await tx.store.put(next, 'items');
    await tx.done;
    return next;
  } catch (error) {
    tx.abort();
    await tx.done.catch(() => {});
    throw error;
  }
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
  download(name, csvContent(headers, rows), 'text/csv;charset=utf-8');
}
export function csvContent(headers: string[], rows: (number | string)[][]) {
  const quote = (value: number | string) => {
    // Spreadsheet-facing text must not become a formula; numeric negative values stay numeric.
    const text =
      typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@＝＋－＠]/u.test(value)
        ? '\t' + value
        : String(value);
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(quote).join(';')).join('\r\n');
}
