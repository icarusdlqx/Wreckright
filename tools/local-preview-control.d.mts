export interface PreviewConfiguration {
  root: string; identity: string; label: string; domain: string; target: string;
  directory: string; stateDirectory: string; ports: number[]; plistPath: string;
  stdoutPath: string; stderrPath: string; arguments: string[];
}
export const PREVIEW_PORTS: number[];
export function previewShutdownState(ports: readonly number[]): Promise<{
  stopped: boolean; listeners: { port: number; status: 'listening' | 'closed' | 'unknown' }[];
}>;
export function previewConfiguration(projectRoot: string, executable: string, uid: number): PreviewConfiguration;
export function previewPlist(config: PreviewConfiguration): string;
