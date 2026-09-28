import type { Binding, NodePath } from "@babel/traverse";
import type { File, VariableDeclaration } from "@babel/types";

import traverse from "@babel/traverse";
import {
  isCallExpression,
  isExportNamedDeclaration,
  isIdentifier,
  isTSFunctionType,
  isTSTypeAnnotation,
} from "@babel/types";

import {
  getInnerPromiseType,
  getUnasyncedVariableDeclarationBinding,
  tsAwaitedType,
} from "./helpers";

export type FunctionsToUnasync = WeakMap<
  Binding,
  { unasyncedName: string; path: NodePath<VariableDeclaration> }
>;

export function findFunctionsToUnasync(ast: File) {
  const functionsToUnasync: FunctionsToUnasync = new WeakMap();
  let count = 0;

  traverse(ast, {
    VariableDeclaration(path) {
      const binding = getUnasyncedVariableDeclarationBinding(path);

      if (!binding) return;

      if (binding.binding.path.parentPath.isExportDefaultDeclaration()) {
        throw new Error(
          "Export default functions are not supported by unasync",
        );
      }

      functionsToUnasync.set(binding.binding, {
        unasyncedName: binding.unasyncedName,
        path,
      });
      count++;
    },
  });

  return [functionsToUnasync, count] as const;
}

export function unasyncTraversal(
  ast: File,
  sourceCode: string,
  functionsToUnasync: FunctionsToUnasync,
) {
  // The original (async) source of each unasynced function, spliced back into
  // the generated output right before its sync counterpart.
  const splices: { line: number; text: string }[] = [];

  traverse(ast, {
    FunctionDeclaration(path) {
      if (!path.node.id) return;

      const selfBinding = path.scope.getBinding(path.node.id.name);
      if (!selfBinding) return;

      const unasyncPath = functionsToUnasync.get(selfBinding);
      if (!unasyncPath) return;

      if (path.node.generator)
        throw new Error("Generator functions are not yet supported by unasync");

      if (!path.node.async)
        throw new Error("Functions to unasync must be async");

      path.node.async = false;
      path.node.id.name = unasyncPath.unasyncedName;

      if (path.node.returnType) {
        if (!isTSTypeAnnotation(path.node.returnType))
          throw new Error("Invalid return type");

        const innerPromiseType = getInnerPromiseType(
          path.node.returnType.typeAnnotation,
          path.scope,
        );

        if (innerPromiseType) {
          path.node.returnType.typeAnnotation = innerPromiseType;
        } else {
          path.node.returnType.typeAnnotation = tsAwaitedType(
            path.node.returnType.typeAnnotation,
          );
        }
      }

      path.get("body").traverse({
        AwaitExpression(subpath) {
          if (isCallExpression(subpath.node.argument)) {
            if (!isIdentifier(subpath.node.argument.callee)) {
              throw new Error("Await expressions must call bare identifiers");
            }

            const binding = subpath.scope.getBinding(
              subpath.node.argument.callee.name,
            );

            if (!binding) {
              throw new Error(
                `No binding found for "${subpath.node.argument.callee.name}"`,
              );
            }

            if (!binding.path.parentPath.isFunctionDeclaration()) {
              throw new Error(
                "Only functions passed via parameters can be awaited in a function to unasync",
              );
            }

            if (
              !isTSTypeAnnotation(binding.identifier.typeAnnotation) ||
              !isTSFunctionType(
                binding.identifier.typeAnnotation.typeAnnotation,
              ) ||
              !isTSTypeAnnotation(
                binding.identifier.typeAnnotation.typeAnnotation.returnType,
              )
            ) {
              throw new Error(
                `Expected a TS function type annotation with a return type for "${subpath.node.argument.callee.name}"`,
              );
            }

            const innerPromiseType = getInnerPromiseType(
              binding.identifier.typeAnnotation.typeAnnotation.returnType
                .typeAnnotation,
              subpath.scope,
            );

            if (innerPromiseType) {
              binding.identifier.typeAnnotation.typeAnnotation.returnType.typeAnnotation =
                innerPromiseType;
            } else {
              binding.identifier.typeAnnotation.typeAnnotation.returnType.typeAnnotation =
                tsAwaitedType(
                  binding.identifier.typeAnnotation.typeAnnotation.returnType
                    .typeAnnotation,
                );
            }
          } else {
            throw new Error(
              "Unasync does not yet support non-call await expressions",
            );
          }

          subpath.skip();
          subpath.replaceWith(subpath.node.argument);
        },
      });
      path.skip();

      const prefix = isExportNamedDeclaration(unasyncPath.path.parent)
        ? "export "
        : "";

      unasyncPath.path.remove();

      if (selfBinding.referenced) {
        splices.push({
          line: path.node.loc!.start.line,
          text:
            prefix +
            sourceCode.slice(
              path.node.loc!.start.index,
              path.node.loc!.end.index,
            ),
        });
      }
    },
  });

  return splices;
}
