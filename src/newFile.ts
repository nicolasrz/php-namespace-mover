import * as path from 'node:path';
import * as vscode from 'vscode';
import { findComposerJson, namespaceForDirectory, readPsr4Roots } from './composer';
import { isIdentifier } from './php';
import { guessKind, phpSkeleton, SKELETON_KINDS, SkeletonKind } from './skeleton';

export function registerNewFileSkeleton(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles(async ({ files }) => {
      try {
        const phpFiles = files.filter((uri) => uri.fsPath.endsWith('.php'));
        for (const uri of phpFiles) await fillSkeleton(uri, phpFiles.length === 1);
      } catch (error) {
        vscode.window.showErrorMessage(`PHP Refactor Kit: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
  );
}

async function fillSkeleton(uri: vscode.Uri, reveal: boolean): Promise<void> {
  const config = vscode.workspace.getConfiguration('phpRefactorKit.newFile');
  if (!config.get<boolean>('skeleton', true)) return;
  if ((await vscode.workspace.fs.stat(uri)).size > 0) return;

  const folder = vscode.workspace.getWorkspaceFolder(uri);
  const name = path.basename(uri.fsPath, '.php');
  const dir = path.dirname(uri.fsPath);
  const composerJson = folder && isIdentifier(name) ? findComposerJson(dir, folder.uri.fsPath) : undefined;
  const namespace = composerJson && namespaceForDirectory(dir, readPsr4Roots(composerJson));
  if (!namespace) return;

  const kind = await chooseKind(name, config.get<string>('defaultKind', 'class'));
  if (!kind) return;

  const editorConfig = vscode.workspace.getConfiguration('editor', { uri, languageId: 'php' });
  const indent = editorConfig.get<boolean>('insertSpaces', true) ? ' '.repeat(editorConfig.get<number>('tabSize', 4)) : '\t';
  const eol = vscode.workspace.getConfiguration('files', uri).get<string>('eol') === '\r\n' ? '\r\n' : '\n';
  const { text, cursor } = phpSkeleton(namespace, name, kind, { strictTypes: config.get<boolean>('strictTypes', false), eol, indent });

  const edit = new vscode.WorkspaceEdit();
  edit.insert(uri, new vscode.Position(0, 0), text);
  if (!(await vscode.workspace.applyEdit(edit))) return;
  const document = await vscode.workspace.openTextDocument(uri);
  await document.save();

  if (reveal) {
    const position = new vscode.Position(cursor.line, cursor.character);
    await vscode.window.showTextDocument(document, { selection: new vscode.Range(position, position) });
  }
}

async function chooseKind(name: string, defaultKind: string): Promise<SkeletonKind | undefined> {
  const guessed = guessKind(name);
  if (defaultKind !== 'ask') return guessed ?? (defaultKind as SkeletonKind);

  const preselected = guessed ?? 'class';
  const items = [preselected, ...SKELETON_KINDS.filter((k) => k !== preselected)];
  return vscode.window.showQuickPick(items, { title: `New PHP file: ${name}` }) as Promise<SkeletonKind | undefined>;
}
