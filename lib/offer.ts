export function checkBand(baseSalary: number, bandMin: number, bandMax: number) {
  return {
    withinBand: baseSalary >= bandMin && baseSalary <= bandMax,
    variance:
      baseSalary < bandMin
        ? baseSalary - bandMin
        : baseSalary > bandMax
          ? baseSalary - bandMax
          : 0,
  };
}
