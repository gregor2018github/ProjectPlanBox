// Local ESLint rules that enforce PlanBox's architecture (see docs/ARCHITECTURE.md §2).
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "src");

/** Libraries only src/ui/ may import (so swapping them stays local). */
const UI_ONLY_PACKAGES = ["@base-ui/", "@dnd-kit/"];

/** Returns "modules/<id>", "core", "ui", "app", ... for a file inside src, else null. */
function areaOf(file) {
  const rel = path.relative(SRC, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const [top, second] = rel.split(path.sep);
  if (top === "modules" && second && !second.includes(".")) return `modules/${second}`;
  return top ?? null;
}

const boundaries = {
  meta: {
    type: "problem",
    docs: { description: "Module boundaries and the ui/ wrapper rule" },
    schema: [],
    messages: {
      crossModule: "Module '{{from}}' may not import from '{{to}}'. Go through core instead.",
      coreToModule: "'{{from}}' may not import from feature modules.",
      baseUi: "Use the wrappers in src/ui/ instead of importing {{lib}} directly.",
    },
  },
  create(context) {
    const file = context.filename;
    const from = areaOf(file);
    if (from === null) return {};

    function check(node, source) {
      if (typeof source !== "string") return;
      const wrapped = UI_ONLY_PACKAGES.find((prefix) => source.startsWith(prefix));
      if (wrapped !== undefined && from !== "ui") {
        context.report({ node, messageId: "baseUi", data: { lib: wrapped.slice(0, -1) } });
        return;
      }
      if (!source.startsWith(".")) return;
      const to = areaOf(path.resolve(path.dirname(file), source));
      if (to === null || to === from) return;
      if (from.startsWith("modules/") && to.startsWith("modules/")) {
        context.report({ node, messageId: "crossModule", data: { from, to } });
      } else if ((from === "core" || from === "ui") && to.startsWith("modules")) {
        context.report({ node, messageId: "coreToModule", data: { from } });
      }
    }

    return {
      ImportDeclaration: (node) => check(node, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node, node.source.value),
      ExportAllDeclaration: (node) => check(node, node.source.value),
      ImportExpression: (node) => node.source.type === "Literal" && check(node, node.source.value),
    };
  },
};

const isComponentName = (name) => /^[A-Z][A-Za-z0-9]*$/.test(name);

const oneComponentPerFile = {
  meta: {
    type: "suggestion",
    docs: { description: "At most one React component per .tsx file" },
    schema: [],
    messages: { many: "One component per file: found {{names}}." },
  },
  create(context) {
    if (!context.filename.endsWith(".tsx") || context.filename.endsWith(".test.tsx")) return {};
    return {
      Program(program) {
        const names = [];
        for (const statement of program.body) {
          const decl =
            statement.type === "ExportNamedDeclaration" ||
            statement.type === "ExportDefaultDeclaration"
              ? statement.declaration
              : statement;
          if (!decl) continue;
          if (decl.type === "FunctionDeclaration" && decl.id && isComponentName(decl.id.name)) {
            names.push(decl.id.name);
          }
          if (decl.type === "VariableDeclaration") {
            for (const d of decl.declarations) {
              const fn = d.init;
              if (
                d.id.type === "Identifier" &&
                isComponentName(d.id.name) &&
                fn &&
                (fn.type === "ArrowFunctionExpression" || fn.type === "FunctionExpression")
              ) {
                names.push(d.id.name);
              }
            }
          }
        }
        if (names.length > 1) {
          context.report({ node: program, messageId: "many", data: { names: names.join(", ") } });
        }
      },
    };
  },
};

export default {
  meta: { name: "planbox" },
  rules: { boundaries, "one-component-per-file": oneComponentPerFile },
};
