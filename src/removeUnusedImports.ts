import * as vscode from 'vscode';
import { lineEdits } from './diff';
import { removeUnusedImports } from './imports';

const COMMAND = 'phpRefactorKit.removeUnusedImports';
const TITLE = 'Remove unused imports';

export function registerRemoveUnusedImports(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ language: 'php' }, { provideCodeActions }, {
      providedCodeActionKinds: [vscode.CodeActionKind.SourceOrganizeImports],
    }),
    vscode.commands.registerTextEditorCommand(COMMAND, async (editor) => {
      const { edit, removed } = buildEdit(editor.document);
      if (!removed.length) {
        vscode.window.setStatusBarMessage('No unused imports', 3000);
        return;
      }
      await vscode.workspace.applyEdit(edit);
      vscode.window.setStatusBarMessage(`$(check) Removed ${removed.length} unused import(s)`, 3000);
    }),
  );
}

function provideCodeActions(document: vscode.TextDocument): vscode.CodeAction[] {
  const { edit, removed } = buildEdit(document);
  if (!removed.length) return [];
  const action = new vscode.CodeAction(TITLE, vscode.CodeActionKind.SourceOrganizeImports);
  action.edit = edit;
  return [action];
}

function buildEdit(document: vscode.TextDocument): { edit: vscode.WorkspaceEdit; removed: string[] } {
  const before = document.getText();
  const { text, removed } = removeUnusedImports(before);
  const edit = new vscode.WorkspaceEdit();
  for (const e of lineEdits(before, text)) {
    edit.replace(document.uri, new vscode.Range(e.startLine, e.startCharacter, e.endLine, e.endCharacter), e.text);
  }
  return { edit, removed };
}
