export function alkylNameToAlkoxyName(alkylName: string) {
  // ethyl -> ethoxy
  // 2-hydroxyethyl -> 2-hydroxyethoxy
  // 3-chloropropyl -> 3-chloropropoxy
  if (
    /(methyl|ethyl|propyl|butyl|pentyl|hexyl|heptyl|octyl|nonyl)$/.test(
      alkylName
    )
  ) {
    return alkylName.replace(/yl$/, "oxy");
  }

  // propan-2-yl -> propan-2-yloxy
  // cyclohexyl -> cyclohexyloxy
  if (alkylName.endsWith("yl")) {
    return `${alkylName}oxy`;
  }

  return "alkoxy";
}