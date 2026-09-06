export function isAdult(birthDateIso: string, minAge = 18): boolean {
  const birthDate = new Date(birthDateIso);
  if (Number.isNaN(birthDate.getTime())) return false;

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= minAge;
}
