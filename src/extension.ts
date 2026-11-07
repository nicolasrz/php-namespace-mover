import * as vscode from 'vscode';
import { registerImplementMethods } from './implementMethods';
import { registerMoveNamespace } from './moveNamespace';
import { registerNewFileSkeleton } from './newFile';
import { registerRemoveUnusedImports } from './removeUnusedImports';

export function activate(context: vscode.ExtensionContext): void {
  registerMoveNamespace(context);
  registerImplementMethods(context);
  registerRemoveUnusedImports(context);
  registerNewFileSkeleton(context);
}
