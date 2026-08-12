import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

function readJson(path: string) {
  return JSON.parse(readFileSync(join(projectRoot, path), "utf8")) as Record<
    string,
    unknown
  >;
}

describe("Base UI migration contract", () => {
  it("uses Base Luma without direct Radix dependencies", () => {
    const components = readJson("components.json");
    const packageJson = readJson("package.json");
    const dependencies = packageJson.dependencies as Record<string, string>;

    expect(components.style).toBe("base-luma");
    expect(dependencies["@base-ui/react"]).toBeDefined();
    expect(
      Object.keys(dependencies).filter(
        (name) => name === "radix-ui" || name.startsWith("@radix-ui/"),
      ),
    ).toEqual([]);
  });

  it("keeps production UI wrappers free of Radix imports", () => {
    const uiDirectory = join(projectRoot, "src/components/ui");
    const radixImports = readdirSync(uiDirectory)
      .filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
      .flatMap((name) => {
        const source = readFileSync(join(uiDirectory, name), "utf8");
        return /from ["'](?:radix-ui|@radix-ui\/)/.test(source) ? [name] : [];
      });

    expect(radixImports).toEqual([]);
  });
});
