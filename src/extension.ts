import * as vscode from "vscode";
import * as path from "path";

function getTestFileName(fileName: string, extension: string) {
  if ([".tsx", ".jsx", ".js", ".ts"].includes(extension))
    return `${fileName}.**${extension}`;
  if ([".cs", ".swift"].includes(extension))
    return `${fileName}Tests${extension}`;
  if ([".java", ".php"].includes(extension))
    return `${fileName}Test${extension}`;
  if ([".py"].includes(extension)) return `test_${fileName}${extension}`;
  if ([".rb", ".go", ".cpp"].includes(extension))
    return `${fileName}_**${extension}`;
}

async function getFileToOpen(foundFiles: vscode.Uri[]) {
  if (foundFiles.length === 1) {
    return foundFiles[0].path;
  }

  const formattedFiles = foundFiles.map((file) => {
    return {
      label: path.basename(file.fsPath),
      detail: file.fsPath,
    };
  });

  const file = await vscode.window.showQuickPick(formattedFiles, {
    matchOnDetail: true,
  });

  if (!file) return;
  return file?.detail;
}

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "test-file-opener" is now active!'
  );

  let disposable = vscode.commands.registerCommand(
    "test-file-opener.openTestFile",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const filePath = editor.document.uri.fsPath;
      const extension = path.extname(filePath);
      const fileName = path.basename(filePath, extension);

      const fileToSearch = getTestFileName(fileName, extension);

      if (!fileToSearch) {
        vscode.window.showInformationMessage(
          `File extension is unsupported: ${extension}`
        );
        return;
      }

      const foundFiles = await vscode.workspace.findFiles(
        `**/${fileToSearch}`,
        "**/node_modules/**",
        10
      );

      if (foundFiles.length === 0) {
        vscode.window.showInformationMessage(
          `No test files found for ${fileName}${extension}`
        );
        return;
      }

      let fileToOpen = await getFileToOpen(foundFiles);
      if (!fileToOpen) return;

      let document = await vscode.workspace.openTextDocument(fileToOpen);
      vscode.window.showTextDocument(document);
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
