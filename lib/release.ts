export const FAULTCITE_RELEASE = "0.3.3";

export function displayEnvironment(value: string | undefined) {
  return value === "production" || value === "staging" ? value : "local";
}
