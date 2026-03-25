export function isAdminOrEditor(role: string | undefined): boolean {
  return role === "admin" || role === "editor";
}

export function editorTierFilter(role: string | undefined): Record<string, any> | null {
  if (role === "admin") return null;
  return null;
}
