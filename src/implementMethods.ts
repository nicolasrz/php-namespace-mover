import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { createClassLocator } from './autoload';
import { builtinClassSource } from './builtins';
import { findComposerJson } from './composer';
import { lineEdits } from './diff';
import { ClassReader, Implementation, implementMissingMethods } from './implement';
import { parsePhpClass } from './parse';

const COMMAND = 'phpRefactorKit.implementMethods';

export function registerImplementMethods(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ language: 'php' }, { provideCodeActions }, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    vscode.commands.registerTextEditorCommand(COMMAND, async (editor) => {
      const implementation = implement(editor.document);
      if (implementation?.unresolved.length) {
        vscode.window.showWarningMessage(`Introuvable(s) : ${implementation.unresolved.join(', ')}`);
      }
      if (!implementation?.methods.length) {
        vscode.window.setStatusBarMessage('Aucune méthode à implémenter', 3000);
        return;
      }
      await vscode.workspace.applyEdit(toWorkspaceEdit(editor.document, implementation));
    }),
  );
}

function provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
  const target = parsePhpClass(document.getText());
  if (!target) return [];
  const header = new vscode.Range(document.positionAt(target.declarationStart), document.positionAt(target.bodyStart));
  if (!header.contains(range.start)) return [];

  const implementation = implement(document);
  if (!implementation?.methods.length) return [];
  const action = new vscode.CodeAction(
    `Implémenter les méthodes (${implementation.methods.join(', ')})`,
    vscode.CodeActionKind.QuickFix,
  );
  action.edit = toWorkspaceEdit(document, implementation);
  action.isPreferred = true;
  return [action];
}

function implement(document: vscode.TextDocument): Implementation | undefined {
  const body = vscode.workspace
    .getConfiguration('phpRefactorKit.implement')
    .get<string>('methodBody', "throw new \\LogicException('Not implemented.');");
  return implementMissingMethods(document.getText(), classReader(document.uri), body);
}

function toWorkspaceEdit(document: vscode.TextDocument, implementation: Implementation): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  for (const e of lineEdits(document.getText(), implementation.text)) {
    edit.replace(document.uri, new vscode.Range(e.startLine, e.startCharacter, e.endLine, e.endCharacter), e.text);
  }
  return edit;
}

function classReader(uri: vscode.Uri): ClassReader {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  const composerJson = folder && findComposerJson(path.dirname(uri.fsPath), folder.uri.fsPath);
  const locate = composerJson ? createClassLocator(composerJson) : () => undefined;
  return (fqcn) => {
    const file = locate(fqcn);
    if (file) {
      const open = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === file);
      return open ? open.getText() : fs.readFileSync(file, 'utf8');
    }
    return builtinClassSource(fqcn);
  };
}
