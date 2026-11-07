import * as vscode from 'vscode';
import { implement, toWorkspaceEdit } from './implementMethods';
import { applyClassMoves, namespaceFix } from './moveNamespace';
import { buildEdit } from './removeUnusedImports';

interface MenuItem extends vscode.QuickPickItem {
  run: () => Thenable<unknown>;
}

export function registerMenu(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('phpRefactorKit.menu', async (editor) => {
      const items = await availableActions(editor.document);
      if (!items.length) {
        vscode.window.setStatusBarMessage('PHP Refactor Kit: nothing to do here', 3000);
        return;
      }
      const choice = await vscode.window.showQuickPick(items, { title: 'PHP Refactor Kit' });
      await choice?.run();
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

async function availableActions(document: vscode.TextDocument): Promise<MenuItem[]> {
  const items: MenuItem[] = [];

  const implementation = implement(document);
  if (implementation?.unresolved.length) {
    vscode.window.showWarningMessage(`PHP Refactor Kit: not found: ${implementation.unresolved.join(', ')}`);
  }
  if (implementation?.methods.length) {
    items.push({
      label: '$(symbol-method) Implement methods',
      description: implementation.methods.join(', '),
      run: () => vscode.workspace.applyEdit(toWorkspaceEdit(document, implementation)),
    });
  }

  const imports = buildEdit(document);
  if (imports.removed.length) {
    items.push({
      label: '$(trash) Remove unused imports',
      description: imports.removed.map((fqcn) => fqcn.split('\\').pop()).join(', '),
      run: () => vscode.workspace.applyEdit(imports.edit),
    });
  }

  const move = await namespaceFix(document.uri);
  if (move) {
    items.push({
      label: '$(symbol-namespace) Fix namespace',
      description: `${move.oldFqcn} → ${move.newFqcn}`,
      run: () => applyClassMoves(new Map([[document.uri.fsPath, move]])),
    });
  }

  return items;
}
