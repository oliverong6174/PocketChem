import type { FunctionalGroupPattern } from "./types";

type ValidationIssueLevel = "error" | "warning";

type ValidationIssue = {
  level: ValidationIssueLevel;
  message: string;
  groupName?: string;
  detail?: string;
};

function addIssue(
  issues: ValidationIssue[],
  level: ValidationIssueLevel,
  message: string,
  groupName?: string,
  detail?: string
) {
  issues.push({ level, message, groupName, detail });
}

function findDuplicates(items: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of items) {
    if (seen.has(item)) duplicates.add(item);
    seen.add(item);
  }

  return [...duplicates];
}

export function validateFunctionalGroupPatterns(
  groups: FunctionalGroupPattern[]
) {
  const issues: ValidationIssue[] = [];

  const names = groups.map((group) => group.name);
  const duplicateNames = findDuplicates(names);

  duplicateNames.forEach((name) =>
    addIssue(issues, "error", "Duplicate functional group name", name)
  );

  const smarts = groups.map((group) => group.smarts).filter(Boolean);
  const duplicateSmarts = findDuplicates(smarts);

  duplicateSmarts.forEach((smartsPattern) =>
    addIssue(
      issues,
      "warning",
      "Duplicate detection SMARTS",
      undefined,
      smartsPattern
    )
  );

  for (const group of groups) {
    if (!group.smarts || group.smarts.trim() === "") {
      addIssue(issues, "error", "Missing detection SMARTS", group.name);
    }

    if (!group.displaySmarts || group.displaySmarts.trim() === "") {
      addIssue(issues, "warning", "Missing display SMARTS", group.name);
    }

    if (!group.suffix || group.suffix.trim() === "") {
      addIssue(issues, "warning", "Missing suffix", group.name);
    }

    if (!group.prefix || group.prefix.trim() === "") {
      addIssue(issues, "warning", "Missing prefix", group.name);
    }

    if (!group.mcatNote || group.mcatNote.trim() === "") {
      addIssue(issues, "warning", "Missing MCAT note", group.name);
    }

    if (group.priority === undefined || Number.isNaN(group.priority)) {
      addIssue(issues, "error", "Invalid priority", group.name);
    }

    if (
      group.nomenclaturePriority === undefined ||
      Number.isNaN(group.nomenclaturePriority)
    ) {
      addIssue(issues, "error", "Invalid nomenclature priority", group.name);
    }
  }

  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");

  console.groupCollapsed(
    `%cPocketChem Functional Group Validator: ${errors.length} errors, ${warnings.length} warnings`,
    errors.length > 0 ? "color: red; font-weight: bold;" : "color: orange;"
  );

  console.log(`Groups loaded: ${groups.length}`);

  for (const issue of issues) {
    const method = issue.level === "error" ? console.error : console.warn;

    method(
      `[${issue.level.toUpperCase()}] ${issue.message}`,
      issue.groupName ? `Group: ${issue.groupName}` : "",
      issue.detail ? `Detail: ${issue.detail}` : ""
    );
  }

  if (issues.length === 0) {
    console.log("No functional group pattern issues found.");
  }

  console.groupEnd();

  return {
    issues,
    errors,
    warnings,
  };
}