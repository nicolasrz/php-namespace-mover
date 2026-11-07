import * as vscode from 'vscode';
import { registerImplementMethods } from './implementMethods';
import { registerMenu } from './menu';
import { registerMoveNamespace } from './moveNamespace';
import { registerRemoveUnusedImports } from './removeUnusedImports';

export function activate(context: vscode.ExtensionContext): void {
  registerMoveNamespace(context);
  registerImplementMethods(context);
  registerRemoveUnusedImports(context);
  registerMenu(context);
}
