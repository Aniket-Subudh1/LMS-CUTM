// 07 §1: half away from zero at `decimals` places; toPrecision(15) absorbs binary noise such as 1.005 × 100 = 100.49999….
export function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const shifted = Math.abs(value) * factor;
  const rounded = Math.round(Number(shifted.toPrecision(15)));
  return (Math.sign(value) * rounded) / factor;
}
