import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const EN_PATH = path.join(projectRoot, "public", "i18n", "en.json");
const IT_PATH = path.join(projectRoot, "public", "i18n", "it.json");

const LEAF_TYPES = new Set(["string", "number", "boolean"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function flattenDictionary(input, prefix = "") {
  const result = new Map();

  if (!isObject(input)) {
    return result;
  }

  for (const [key, value] of Object.entries(input)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (isObject(value)) {
      result.set(fullKey, "object");
      const nested = flattenDictionary(value, fullKey);
      for (const [nestedKey, nestedType] of nested.entries()) {
        result.set(nestedKey, nestedType);
      }
      continue;
    }

    const valueType = typeof value;
    if (LEAF_TYPES.has(valueType)) {
      result.set(fullKey, "leaf");
      continue;
    }

    result.set(fullKey, `invalid:${valueType}`);
  }

  return result;
}

function collectIssues(sourceName, sourceMap, targetName, targetMap) {
  const missing = [];
  const typeMismatches = [];

  for (const [key, sourceType] of sourceMap.entries()) {
    if (!targetMap.has(key)) {
      if (sourceType === "leaf") {
        missing.push(key);
      }
      continue;
    }

    const targetType = targetMap.get(key);
    if (sourceType !== targetType) {
      typeMismatches.push({ key, sourceType, targetType });
    }
  }

  return { sourceName, targetName, missing, typeMismatches };
}

async function readJsonFile(jsonPath) {
  const raw = await readFile(jsonPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!isObject(parsed)) {
    throw new Error(`Dictionary at ${jsonPath} must be a JSON object`);
  }

  return parsed;
}

function printSection(title, lines) {
  console.log(`\n${title}`);
  if (lines.length === 0) {
    console.log("- none");
    return;
  }

  for (const line of lines) {
    console.log(`- ${line}`);
  }
}

async function main() {
  const en = await readJsonFile(EN_PATH);
  const it = await readJsonFile(IT_PATH);

  const enFlat = flattenDictionary(en);
  const itFlat = flattenDictionary(it);

  const enVsIt = collectIssues("en", enFlat, "it", itFlat);
  const itVsEn = collectIssues("it", itFlat, "en", enFlat);

  const invalidTypes = [
    ...[...enFlat.entries()].filter(([, type]) => String(type).startsWith("invalid:"))
      .map(([key, type]) => `en -> ${key} (${type})`),
    ...[...itFlat.entries()].filter(([, type]) => String(type).startsWith("invalid:"))
      .map(([key, type]) => `it -> ${key} (${type})`),
  ];

  const missingInIt = enVsIt.missing;
  const missingInEn = itVsEn.missing;
  const typeMismatches = [
    ...enVsIt.typeMismatches.map((entry) => `${entry.key} (en=${entry.sourceType}, it=${entry.targetType})`),
    ...itVsEn.typeMismatches.map((entry) => `${entry.key} (it=${entry.sourceType}, en=${entry.targetType})`),
  ];

  printSection("Missing keys in it", missingInIt);
  printSection("Missing keys in en", missingInEn);
  printSection("Type mismatches", typeMismatches);
  printSection("Invalid value types", invalidTypes);

  const hasIssues = missingInIt.length > 0
    || missingInEn.length > 0
    || typeMismatches.length > 0
    || invalidTypes.length > 0;

  if (hasIssues) {
    console.error("\ni18n consistency check failed.");
    process.exit(1);
  }

  console.log("\ni18n consistency check passed.");
}

main().catch((error) => {
  console.error("i18n consistency check failed with an unexpected error:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});