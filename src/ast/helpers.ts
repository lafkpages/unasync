import type { Binding, NodePath, Scope } from "@babel/traverse";
import type { TSType, VariableDeclaration } from "@babel/types";

import {
  identifier,
  isIdentifier,
  isImportDeclaration,
  isTSAnyKeyword,
  isTSBooleanKeyword,
  isTSNumberKeyword,
  isTSStringKeyword,
  isTSTypeAnnotation,
  isTSTypeParameterInstantiation,
  isTSTypeQuery,
  isTSTypeReference,
  isTSUnknownKeyword,
  tsTypeParameterInstantiation,
  tsTypeReference,
} from "@babel/types";

export function tsAwaitedType(tsType: TSType) {
  // If the type is already a primitive, return it as-is
  if (
    isTSAnyKeyword(tsType) ||
    isTSBooleanKeyword(tsType) ||
    isTSNumberKeyword(tsType) ||
    isTSStringKeyword(tsType) ||
    isTSUnknownKeyword(tsType)
  )
    return tsType;

  return tsTypeReference(
    identifier("Awaited"),
    tsTypeParameterInstantiation([tsType]),
  );
}

export function getInnerPromiseType(tsType: TSType, scope: Scope) {
  // TODO: does this actually handle overwriting via `type Promise = ...`?
  if (scope.hasOwnBinding("Promise")) {
    return null;
  }

  if (
    isTSTypeReference(tsType) &&
    isIdentifier(tsType.typeName) &&
    tsType.typeName.name === "Promise" &&
    isTSTypeParameterInstantiation(tsType.typeArguments)
  ) {
    if (tsType.typeArguments.params.length !== 1) {
      throw new Error(
        "Promise type parameter instantiation must have exactly one type argument",
      );
    }

    return tsType.typeArguments.params[0]!;
  }

  return null;
}

export function getUnasyncedVariableDeclarationBinding(
  path: NodePath<VariableDeclaration>,
): { unasyncedName: string; binding: Binding } | null {
  if (!path.node.declare) return null;

  const declaration = path.node.declarations[0]!;

  if (
    !isIdentifier(declaration.id) ||
    !isTSTypeAnnotation(declaration.id.typeAnnotation) ||
    !isTSTypeReference(declaration.id.typeAnnotation.typeAnnotation) ||
    !isIdentifier(declaration.id.typeAnnotation.typeAnnotation.typeName) ||
    declaration.id.typeAnnotation.typeAnnotation.typeName.name !== "Unasynced"
  ) {
    return null;
  }

  const unasyncedTypeIdentifier = path.scope.getBinding("Unasynced")?.path;

  if (unasyncedTypeIdentifier) {
    if (
      isImportDeclaration(unasyncedTypeIdentifier.parent) &&
      unasyncedTypeIdentifier.parent.specifiers.length === 1 &&
      unasyncedTypeIdentifier.parent.importKind === "type"
    ) {
      unasyncedTypeIdentifier.parentPath.remove();
    } else {
      unasyncedTypeIdentifier.remove();
    }
  }

  if (path.node.declarations.length !== 1) {
    throw new Error(
      `Expected exactly one declaration, got ${path.node.declarations.length}`,
    );
  }

  if (
    !isTSTypeParameterInstantiation(
      declaration.id.typeAnnotation.typeAnnotation.typeArguments,
    ) ||
    declaration.id.typeAnnotation.typeAnnotation.typeArguments.params.length !==
      1 ||
    !isTSTypeQuery(
      declaration.id.typeAnnotation.typeAnnotation.typeArguments.params[0],
    ) ||
    !isIdentifier(
      declaration.id.typeAnnotation.typeAnnotation.typeArguments.params[0]
        .exprName,
    )
  ) {
    throw new Error("Invalid Unasynced type annotation");
  }

  const asyncFunctionIdentifier =
    declaration.id.typeAnnotation.typeAnnotation.typeArguments.params[0]
      .exprName;

  const binding = path.scope.getBinding(asyncFunctionIdentifier.name);

  if (!binding)
    throw new Error(`Binding not found for "${asyncFunctionIdentifier.name}"`);

  if (!binding.identifier.loc) {
    throw new Error(
      "AST was parsed without locations, which are required by unasync",
    );
  }

  console.debug(
    "Rewriting",
    declaration.id.name,
    "as sync version of",
    binding.identifier.loc!.identifierName,
  );

  return {
    unasyncedName: declaration.id.name,
    binding,
  };
}
