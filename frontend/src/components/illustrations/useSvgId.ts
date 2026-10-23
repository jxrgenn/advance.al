import { useId } from "react";

/**
 * Stable, document-unique prefix for SVG <defs> ids (gradients, clip paths,
 * filters). React's useId() contains ":" which is awkward inside url(#…),
 * so it is stripped. Two copies of the same illustration on one page never
 * share ids.
 */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/:/g, "")}`;
}
