import ts from "npm:typescript";

export type Metadata = {
  functionName: string;
  doc?: string;
  parameters: { name: string; type: string; optional: boolean }[];
  returnType: string;
};

export default function introspect(source: string) {
  const program = ts.createProgram([source], { experimentalDecorators: true });
  const files = program
    .getSourceFiles()
    .filter((file) => !file.isDeclarationFile);

  if (!files.length) {
    throw new Error("No source file found");
  }

  const checker = program.getTypeChecker();
  const metadata: Metadata[] = [];

  for (const file of files) {
    ts.forEachChild(file, (node) => {
      if (ts.isFunctionDeclaration(node)) {
        const signature = checker.getSignatureFromDeclaration(node);
        const returnType = checker.getReturnTypeOfSignature(signature!);
        const parameters = signature!.getParameters().map((parameter) => {
          const parameterType = checker.getTypeOfSymbolAtLocation(
            parameter,
            parameter.valueDeclaration!
          );
          const parameterName = parameter.getName();
          const parameterTypeString = checker.typeToString(parameterType);
          const optional = isOptional(parameter);
          return { parameterName, parameterTypeString, optional };
        });
        const functionName = node.name!.getText();
        const docTags = ts.getJSDocTags(node);
        const returnTypeString = checker.typeToString(returnType);

        if (
          docTags.filter((tag) => tag.tagName.getText() === "function")
            .length === 0
        ) {
          return;
        }

        metadata.push({
          functionName,
          doc: docTags
            .map((tag) => tag.comment)
            .find((comment) => comment) as string,
          parameters: parameters.map(
            ({ parameterName, parameterTypeString, optional }) => ({
              name: parameterName,
              type: parameterTypeString,
              optional,
            })
          ),
          returnType: returnTypeString,
        });
      }
    });
  }
  return metadata;
}

function isOptional(param: ts.Symbol): boolean {
  const declarations = param.getDeclarations();

  // Only check if the parameters actually have declarations
  if (declarations && declarations.length > 0) {
    const parameterDeclaration = declarations[0];

    // Convert the symbol declaration into Parameter
    if (ts.isParameter(parameterDeclaration)) {
      return (
        parameterDeclaration.questionToken !== undefined ||
        parameterDeclaration.initializer !== undefined
      );
    }
  }

  return false;
}

console.log(introspect("mod.ts"));
