# PHP Namespace Mover

Équivalent VS Code du comportement de PhpStorm : quand on déplace (ou renomme) un fichier ou un dossier PHP
depuis l'explorateur, l'extension met à jour :

- le `namespace` du fichier, calculé depuis les règles PSR-4 (`autoload` / `autoload-dev`) du `composer.json` le plus proche ;
- le nom de la classe si le fichier a été renommé ;
- les `use`, FQCN (`\App\...`) et chaînes échappées (`'App\\...'`) dans tout le projet, YAML/XML/NEON compris ;
- les `use` à ajouter pour les classes qui partageaient le namespace et étaient donc utilisées sans import.

## Limites

- Seuls les déplacements faits dans VS Code sont détectés (pas `mv` ou `git mv` dans un terminal).
- Analyse par expressions régulières, pas par AST : les `use` groupés (`use App\{A, B};`) ne sont pas réécrits.
- Un nom court présent dans un commentaire peut provoquer un `use` superflu.

## Réglages

`phpNamespaceMover.enabled`, `.exclude`, `.referenceFiles`, `.preview` (aperçu de refactoring avant application), `.autoSave`.
