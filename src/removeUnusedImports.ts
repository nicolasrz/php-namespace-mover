import * as vscode from 'vscode';
import { lineEdits } from './diff';
import { removeUnusedImports } from './imports';

const COMMAND = 'phpRefactorKit.removeUnusedImports';
const TITLE = 'Remove unused imports';

export function registerRemoveUnusedImports(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ language: 'php' }, { provideCodeActions }, {
      providedCodeActionKinds: [vscode.CodeActionKind.SourceOrganizeImports, vscode.CodeActionKind.QuickFix],
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

function provideCodeActions(
  document: vscode.TextDocument,
  _range: vscode.Range,
  context: vscode.CodeActionContext,
): vscode.CodeAction[] {
  const organize = context.only?.contains(vscode.CodeActionKind.SourceOrganizeImports) ?? false;
  if (!organize && context.triggerKind !== vscode.CodeActionTriggerKind.Invoke) return [];
  const { edit, removed } = buildEdit(document);
  if (!removed.length) return [];
  const kind = organize ? vscode.CodeActionKind.SourceOrganizeImports : vscode.CodeActionKind.QuickFix;
  const action = new vscode.CodeAction(organize ? TITLE : `${TITLE} (${removed.length})`, kind);
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
