export type ToolKind =
  | 'web_ui'
  | 'mobile_ui'
  | 'api'
  | 'performance'
  | 'visual'
  | 'accessibility'
  | 'security';

export const TOOL_KINDS: readonly ToolKind[] = [
  'web_ui',
  'mobile_ui',
  'api',
  'performance',
  'visual',
  'accessibility',
  'security',
] as const;
