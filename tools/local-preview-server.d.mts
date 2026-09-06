export interface PreviewHeaderRule { path: string; headers: [string, string | null][] }
export const PREVIEW_HEALTH_PATH: string;
export function parseReleaseHeaders(text: string): PreviewHeaderRule[];
export function headersForPath(rules: readonly PreviewHeaderRule[], path: string): Record<string, string>;
export function inspectRelease(directory: string): Promise<{ root: string; index: string; rules: PreviewHeaderRule[] }>;
export function startPreviewServer(options: {
  directory: string; ports?: readonly number[]; identity?: string;
}): Promise<{ ports: number[]; close: () => Promise<void> }>;
