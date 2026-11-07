# PHP Refactor Kit

Les refactorings PHP de PhpStorm qui manquent à VS Code.

## Namespace mis à jour au déplacement

Quand on déplace (ou renomme) un fichier ou un dossier PHP depuis l'explorateur, l'extension met à jour :

- le `namespace` du fichier, calculé depuis les règles PSR-4 (`autoload` / `autoload-dev`) du `composer.json` le plus proche ;
- le nom de la classe si le fichier a été renommé ;
- les `use`, FQCN (`\App\...`) et chaînes échappées (`'App\\...'`) dans tout le projet, YAML/XML/NEON compris ;
- les `use` à ajouter pour les classes qui partageaient le namespace et étaient donc utilisées sans import.

## Implémenter les méthodes

Sur la déclaration d'une classe qui implémente une interface ou étend une classe abstraite, `Cmd+.` propose
**Implémenter les méthodes** (aussi disponible dans la palette : *PHP: Implémenter les méthodes*).
Chaque méthode manquante est générée avec sa signature et un corps qui lève une exception :

```php
public function find(int $id): ?User
{
    throw new \LogicException('Not implemented.');
}
```

Les interfaces sont trouvées dans le projet et dans `vendor/` (via l'autoload Composer), interfaces héritées,
classes parentes et traits compris. Les `use` nécessaires sont ajoutés. Les interfaces natives courantes
(`Countable`, `ArrayAccess`, `IteratorAggregate`, `JsonSerializable`, `Stringable`…) sont connues.

## Limites

- Seuls les déplacements faits dans VS Code sont détectés (pas `mv` ou `git mv` dans un terminal).
- Analyse lexicale légère, pas d'AST : les `use` groupés (`use App\{A, B};`) ne sont pas réécrits.
- Un nom court présent dans un commentaire peut provoquer un `use` superflu lors d'un déplacement.

## Réglages

| Réglage | Défaut |
|---|---|
| `phpRefactorKit.namespace.updateOnMove` | `true` |
| `phpRefactorKit.namespace.exclude` | `**/{vendor,node_modules,var,.git}/**` |
| `phpRefactorKit.namespace.referenceFiles` | `**/*.{yaml,yml,xml,neon}` |
| `phpRefactorKit.namespace.preview` | `false` — aperçu de refactoring avant application |
| `phpRefactorKit.namespace.autoSave` | `true` |
| `phpRefactorKit.implement.methodBody` | `throw new \LogicException('Not implemented.');` |
