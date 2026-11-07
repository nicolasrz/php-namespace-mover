import * as vscode from 'vscode';
import { registerImplementMethods } from './implementMethods';
import { registerMoveNamespace } from './moveNamespace';

export function activate(context: vscode.ExtensionContext): void {
  registerMoveNamespace(context);
  registerImplementMethods(context);
}
