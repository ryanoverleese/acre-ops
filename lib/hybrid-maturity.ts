/**
 * Hybrid maturity display helpers.
 * Pioneer and Channel corn naming only — do not invent other brand codes.
 * Water Recs keeps its own parser so display changes here cannot move black-layer clocks.
 */

export type HybridMaturityInfo = {
  label: string;
  title: string;
  /** Corn comparative relative maturity when known */
  relativeMaturity?: number;
};

/** Pioneer P1457 / 1457 -> 114 RM. Channel 215-96STXRIB -> 115 RM (first three digits - 100). */
export function parseCornRelativeMaturity(hybrid: string): number | null {
  const normalized = hybrid.trim().toUpperCase();

  // Channel / Bayer style: 215-96STXRIB, 213-19VT2PRIB → RM = NNN - 100
  const channel = normalized.match(/^(\d{3})-\d{2}/);
  if (channel) {
    const rm = Number(channel[1]) - 100;
    if (rm >= 60 && rm <= 125) return rm;
  }

  // Occasional Channel C-prefix: C217-01ST → 117
  const channelC = normalized.match(/^C(\d{3})-\d{2}/);
  if (channelC) {
    const rm = Number(channelC[1]) - 100;
    if (rm >= 60 && rm <= 125) return rm;
  }

  // Pioneer: P1457 / 1457… first two digits after optional P are RM - 100 when 00–25
  const pioneer = normalized.match(/^P?(\d{2})\d{2}/);
  if (pioneer) {
    const prefix = Number(pioneer[1]);
    if (prefix >= 0 && prefix <= 25) return 100 + prefix;
  }

  // Literal 80–125 rating somewhere in the string
  const literal = normalized.match(/(?:^|\D)(8\d|9\d|1[01]\d|12[0-5])(?:\D|$)/);
  return literal ? Number(literal[1]) : null;
}

/** Pioneer soybean P23Z58 → MG 2.3. Channel-ish 2926 / 2339XF → MG 2.9 / 2.3 when crop is soy. */
export function parseSoybeanMaturityGroup(hybrid: string): number | null {
  const normalized = hybrid.trim().toUpperCase();
  const pioneer = normalized.match(/^P?(\d)(\d)[A-Z]/);
  if (pioneer) return Number(`${pioneer[1]}.${pioneer[2]}`);

  // Channel / numeric soy codes: 2926, 2339XF, 2950E3, 2009XF
  const channelSoy = normalized.match(/^(\d)(\d)\d{2}(?:\D|$)/);
  if (channelSoy) {
    const group = Number(`${channelSoy[1]}.${channelSoy[2]}`);
    if (group >= 0 && group <= 5) return group;
  }

  // Explicit "Beck's 2.0"
  const explicit = normalized.match(/(?:^|\s)(\d(?:\.\d)?)\s*$/);
  if (explicit) {
    const group = Number(explicit[1]);
    if (group >= 0 && group <= 5) return group;
  }

  return null;
}

export function getHybridMaturityLabel(crop: string, hybrid: string): HybridMaturityInfo | null {
  if (!hybrid?.trim()) return null;
  const cropName = crop.toLowerCase();

  if (cropName.includes('corn') && !cropName.includes('soy')) {
    const relativeMaturity = parseCornRelativeMaturity(hybrid);
    if (relativeMaturity != null) {
      return {
        label: `${relativeMaturity} RM`,
        title: 'Comparative relative maturity from hybrid code (Pioneer / Channel). Not calendar days after planting.',
        relativeMaturity,
      };
    }
  }

  if (cropName.includes('soy') || cropName.includes('bean')) {
    const maturityGroup = parseSoybeanMaturityGroup(hybrid);
    if (maturityGroup != null) {
      return {
        label: `MG ${maturityGroup.toFixed(1)}`,
        title: 'Soybean maturity group from hybrid code. Not a calendar-day rating.',
      };
    }
  }

  return null;
}
