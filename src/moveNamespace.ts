import * as path from 'node:path';
import * as vscode from 'vscode';
import { findComposerJson, namespaceForDirectory, readPsr4Roots } from './composer';
import { lineEdits } from './diff';
import { ClassMove, isIdentifier, parseClassName, parseNamespace, replaceFqcnReferences, rewriteFile, splitFqcn } from './php';

type FileRename = { readonly oldUri: vscode.Uri; readonly newUri: vscode.Uri };

const decoder = new TextDecoder();

export function registerMoveNamespace(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles(async ({ files }) => {
      try {
        await onFilesMoved(files);
      } catch (error) {
        vscode.window.showErrorMessage(`PHP Refactor Kit : ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
    vscode.commands.registerTextEditorCommand('phpRefactorKit.fixNamespace', async (editor) => {
      const move = await namespaceFix(editor.document.uri);
      if (!move) {
        vscode.window.setStatusBarMessage('Namespace already matches the folder', 3000);
        return;
      }
      await applyClassMoves(new Map([[editor.document.uri.fsPath, move]]));
    }),
  );
}

async function onFilesMoved(files: readonly FileRename[]): Promise<void> {
  const config = vscode.workspace.getConfiguration('phpRefactorKit.namespace');
  if (!config.get<boolean>('updateOnMove', true)) return;

  const movesByPath = new Map<string, ClassMove>();
  for (const { oldPath, newUri } of await expandToPhpFiles(files)) {
    const move = await resolveMove(oldPath, newUri);
    if (move) movesByPath.set(newUri.fsPath, move);
  }
  await applyClassMoves(movesByPath);
}

/** Classe dont le namespace déclaré ne correspond pas à son dossier, par exemple après un `git mv`. */
async function namespaceFix(uri: vscode.Uri): Promise<ClassMove | undefined> {
  return resolveMove(uri.fsPath, uri);
}

async function applyClassMoves(movesByPath: ReadonlyMap<string, ClassMove>): Promise<void> {
  const config = vscode.workspace.getConfiguration('phpRefactorKit.namespace');
  if (!movesByPath.size) return;
  const moves = [...movesByPath.values()];
  const oldNames = moves.map((m) => splitFqcn(m.oldFqcn).name);

  const exclude = config.get<string>('exclude') || undefined;
  const phpFiles = await readAll(await vscode.workspace.findFiles('**/*.php', exclude));

  const classesByNamespace = new Map<string, Set<string>>();
  for (const { text } of phpFiles) {
    const namespace = parseNamespace(text);
    const name = parseClassName(text);
    if (namespace && name) classesByNamespace.set(namespace, (classesByNamespace.get(namespace) ?? new Set()).add(name));
  }

  const changes: { uri: vscode.Uri; before: string; after: string }[] = [];
  for (const { uri, text } of phpFiles) {
    const ownMove = movesByPath.get(uri.fsPath);
    if (!ownMove && !oldNames.some((name) => text.includes(name))) continue;
    const after = rewriteFile(text, ownMove, moves, classesByNamespace);
    if (after !== text) changes.push({ uri, before: text, after });
  }

  const referenceGlob = config.get<string>('referenceFiles');
  if (referenceGlob) {
    for (const { uri, text } of await readAll(await vscode.workspace.findFiles(referenceGlob, exclude))) {
      const after = replaceFqcnReferences(text, moves);
      if (after !== text) changes.push({ uri, before: text, after });
    }
  }
  if (!changes.length) return;

  const needsConfirmation = config.get<boolean>('preview', false);
  const edit = new vscode.WorkspaceEdit();
  for (const { uri, before, after } of changes) {
    for (const e of lineEdits(before, after)) {
      const range = new vscode.Range(e.startLine, e.startCharacter, e.endLine, e.endCharacter);
      edit.replace(uri, range, e.text, { label: 'Update PHP namespace', needsConfirmation });
    }
  }
  if (!(await vscode.workspace.applyEdit(edit))) return;

  if (config.get<boolean>('autoSave', true)) {
    await Promise.all(changes.map(async ({ uri }) => (await vscode.workspace.openTextDocument(uri)).save()));
  }
  vscode.window.setStatusBarMessage(`$(check) PHP namespace: ${changes.length} file(s) updated`, 5000);
}

async function expandToPhpFiles(files: readonly FileRename[]): Promise<{ oldPath: string; newUri: vscode.Uri }[]> {
  const result: { oldPath: string; newUri: vscode.Uri }[] = [];
  for (const { oldUri, newUri } of files) {
    const stat = await vscode.workspace.fs.stat(newUri);
    if (stat.type & vscode.FileType.Directory) {
      for (const uri of await vscode.workspace.findFiles(new vscode.RelativePattern(newUri, '**/*.php'))) {
        result.push({ oldPath: path.join(oldUri.fsPath, path.relative(newUri.fsPath, uri.fsPath)), newUri: uri });
      }
    } else if (newUri.fsPath.endsWith('.php')) {
      result.push({ oldPath: oldUri.fsPath, newUri });
    }
  }
  return result;
}

async function resolveMove(oldPath: string, newUri: vscode.Uri): Promise<ClassMove | undefined> {
  const folder = vscode.workspace.getWorkspaceFolder(newUri);
  if (!folder) return undefined;

  const text = await readText(newUri);
  const namespace = parseNamespace(text);
  const className = parseClassName(text);
  if (!namespace || !className) return undefined;

  const newDir = path.dirname(newUri.fsPath);
  const composerJson = findComposerJson(newDir, folder.uri.fsPath);
  const newNamespace = composerJson && namespaceForDirectory(newDir, readPsr4Roots(composerJson));
  if (!newNamespace) return undefined;

  const oldBase = path.basename(oldPath, '.php');
  const newBase = path.basename(newUri.fsPath, '.php');
  const newName = className === oldBase && isIdentifier(newBase) ? newBase : className;

  const move = { oldFqcn: `${namespace}\\${className}`, newFqcn: `${newNamespace}\\${newName}` };
  return move.oldFqcn === move.newFqcn ? undefined : move;
}

async function readAll(uris: readonly vscode.Uri[]): Promise<{ uri: vscode.Uri; text: string }[]> {
  return Promise.all(uris.map(async (uri) => ({ uri, text: await readText(uri) })));
}

async function readText(uri: vscode.Uri): Promise<string> {
  const open = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
  return open ? open.getText() : decoder.decode(await vscode.workspace.fs.readFile(uri));
}
