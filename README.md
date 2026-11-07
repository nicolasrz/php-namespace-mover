# PHP Refactor Kit

[English](#english) · [Français](#français)

## English

Like PhpStorm, this extension can:

- **Update the namespace when you move or rename a PHP file**, along with every `use` and reference in the project (YAML/XML config included).
- **Implement interface methods**: generates the missing methods of an interface or abstract class (project or `vendor/`).
- **Remove unused imports**.
- **Fill new PHP files** with `<?php`, the right namespace and the class declaration.
- **Fix a namespace** that no longer matches its folder.

Everything is in the command palette under **PHP Refactor Kit:** and in the quick fix menu (`Cmd+.` / `Ctrl+.`).
Namespaces are computed from the PSR-4 rules of your `composer.json`.

![Move a file](images/demo-move.gif)

![Implement methods](images/demo-implement.gif)

![Remove unused imports](images/demo-imports.gif)

## Français

Comme PhpStorm, cette extension permet de :

- **Mettre à jour le namespace quand on déplace ou renomme un fichier PHP**, ainsi que tous les `use` et références du projet (config YAML/XML comprise).
- **Implémenter les méthodes d'une interface** : génère les méthodes manquantes d'une interface ou classe abstraite (projet ou `vendor/`).
- **Supprimer les imports inutilisés**.
- **Remplir les nouveaux fichiers PHP** avec `<?php`, le bon namespace et la déclaration de classe.
- **Corriger un namespace** qui ne correspond plus à son dossier.

Tout est dans la palette de commandes sous **PHP Refactor Kit:** et dans le menu des corrections rapides (`Cmd+.` / `Ctrl+.`).
Les namespaces sont calculés à partir des règles PSR-4 de votre `composer.json`.
