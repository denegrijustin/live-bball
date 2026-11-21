/** Sportsbook-style signed line: -3.5, +3.5, PK */
export function fmtLine(x: number): string {
  if (Math.abs(x) < 0.05) return 'PK';
  const v = Math.round(x * 10) / 10;
  return v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
}

export function fmtSigned(x: number, digits = 1): string {
  const v = x.toFixed(digits);
  return x > 0 ? `+${v}` : v;
}

export function fmtPct(x: number, digits = 1): string {
  return `${x.toFixed(digits)}%`;
}

export function fmtMoney(x: number): string {
  const v = Math.round(x * 100) / 100;
  return `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`;
}
