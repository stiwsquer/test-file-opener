import * as vscode from "vscode";
import * as path from "path";
import OpenAI from "openai";
import { Uri } from "vscode";

function getTestFileNameSearchPattern(fileName: string, extension: string) {
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

function getApiKey() {
  return vscode.workspace.getConfiguration().get<string>("openAI.apiKey");
}

function setApiKey(apiKey: string) {
  vscode.workspace
    .getConfiguration()
    .update("openAI.apiKey", apiKey, vscode.ConfigurationTarget.Global);
}

async function promptForApiKey() {
  return await vscode.window.showInputBox({
    prompt: "Please enter your OpenAI API key to use test generation feature.",
    placeHolder: "API key",
  });
}

async function checkApiKey() {
  const apiKey = getApiKey();
  if (!apiKey) {
    const newApiKey = await promptForApiKey();
    if (newApiKey) setApiKey(newApiKey);
    return newApiKey;
  }
  return apiKey;
}

async function tryToCreateTestFile(
  testFileUri: vscode.Uri,
  fileExtension: string,
  implementationFileContent: string,
  apiKey?: string
) {
  const openAiApiKey = apiKey ?? (await checkApiKey());
  if (!openAiApiKey) return;

  try {
    const completion = await generateTestFileContent(
      openAiApiKey,
      fileExtension,
      implementationFileContent
    );
    const content = completion.choices[0].message.content;
    createTestFile(testFileUri, content!);
  } catch (err) {
    if ((err as { status: number }).status === 401) {
      vscode.window.showErrorMessage(
        "Invalid OpenAI API key. Please update your API key."
      );
      const newApiKey = await promptForApiKey();
      if (newApiKey) {
        setApiKey(newApiKey);
        tryToCreateTestFile(
          testFileUri,
          fileExtension,
          implementationFileContent,
          newApiKey
        );
      }
      return;
    }
    vscode.window.showErrorMessage(
      "Failed to generate test file. Please try again."
    );
    return;
  }
}

async function generateTestFileContent(
  openAiApiKey: string,
  fileExtension: string,
  implementationFileContent: string
) {
  const openai = new OpenAI({
    apiKey: openAiApiKey,
  });
  return await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content: `You are a program that based on the provided implementation file, generates the test file in programming language which files has ${fileExtension} extension. 
            You are returning only the test file content as plain text - no explanations and no code formatting.`,
        // For .tsx files, when mocking imports instead of using jest.mock use anonymous function, for example: jest.mock('react-router', () => ({useParams: () => ({queryParam: "param"}) }));???
      },
      {
        role: "user",
        content: `Write a test file for this code: ${implementationFileContent}`,
      },
    ],
  });
}

async function createTestFile(testFileLocation: vscode.Uri, content: string) {
  await vscode.workspace.fs.writeFile(
    testFileLocation,
    new TextEncoder().encode(content!)
  );
  vscode.window.showTextDocument(testFileLocation, { preview: false });
}

export async function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "test-file-opener" is now active!'
  );
  await checkApiKey();

  let disposable = vscode.commands.registerCommand(
    "test-file-opener.openTestFile",
    async () => {
      const activeTextEditor = vscode.window.activeTextEditor;
      if (!activeTextEditor) return;

      const implFilePath = activeTextEditor.document.uri.fsPath;
      const dirname = path.dirname(implFilePath);
      const implFileExtension = path.extname(implFilePath);
      const implFileNameWithoutExtension = path.basename(
        implFilePath,
        implFileExtension
      );

      const testFileNameSearchPattern = getTestFileNameSearchPattern(
        implFileNameWithoutExtension,
        implFileExtension
      );
      if (!testFileNameSearchPattern) {
        vscode.window.showInformationMessage(
          `File extension is unsupported: ${implFileExtension}`
        );
        return;
      }

      const foundFiles = await vscode.workspace.findFiles(
        `**/${testFileNameSearchPattern}`,
        "**/node_modules/**",
        10
      );

      if (foundFiles.length === 0) {
        const response = await vscode.window.showInformationMessage(
          `No test files found. Do you want to create a test file for ${implFileNameWithoutExtension}${implFileExtension}?`,
          "Yes",
          "No"
        );
        if (response !== "Yes") return;

        tryToCreateTestFile(
          Uri.file(
            dirname +
              `/${implFileNameWithoutExtension}.test${implFileExtension}`
          ),
          implFileExtension,
          activeTextEditor.document.getText()
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
