# Générateur et Lecteur Factur-X

Application web complète pour créer et extraire des métadonnées Factur-X (profil MINIMUM) dans vos factures PDF.

Accès à l'application : 

[https://rdmediation.github.io/factureX/]: https://rdmediation.github.io/factureX/



## Description

L'application fonctionne entièrement localement. Aucune donnée n'est remontée sur le serveur.

Cette application permet de :

### Mode Création
1. Uploader une facture au format PDF
2. Remplir un formulaire avec les informations minimales requises par Factur-X (automatique avec les facture de Dolibarr)
3. Générer automatiquement le fichier XML conforme au profil MINIMUM
4. Embarquer ce XML dans le PDF original
5. Télécharger la facture PDF enrichie au format Factur-X

### Mode Extraction
1. Uploader une facture Factur-X existante
2. Extraire automatiquement le XML embarqué
3. Visualiser une synthèse formatée des informations
4. Consulter le XML brut
5. Télécharger le fichier XML

## Profil Factur-X MINIMUM

Le profil MINIMUM inclut les informations essentielles suivantes :
- Numéro de facture
- Type de document (Facture ou Avoir)
- Date d'émission
- Nom du vendeur
- Nom de l'acheteur
- Devise
- Montants (HT, TVA, TTC, À payer)

## Utilisation

### Méthode 1 : Utilisation locale (simple)

1. Ouvrez simplement le fichier `index.html` dans votre navigateur web
2. L'application fonctionnera directement sans serveur

### Méthode 2 : Avec un serveur local

Si vous préférez utiliser un serveur local :

```bash
# Avec Python 3
python3 -m http.server 8000

# Avec Node.js (npx)
npx http-server

# Avec PHP
php -S localhost:8000
```

Puis ouvrez votre navigateur à l'adresse `http://localhost:8000`

## Fonctionnalités

### Création de Factur-X
- Interface intuitive et responsive avec système d'onglets
- **Détection automatique des factures Dolibarr** avec préremplissage des champs
- Date du jour automatiquement renseignée
- Sauvegarde et restauration du nom du vendeur (localStorage)
- Calcul automatique du montant TTC
- Validation des champs obligatoires
- Génération XML conforme au standard Factur-X
- Embarquement du XML comme pièce jointe dans le PDF
- Téléchargement du PDF enrichi (compatible Mac/Safari)
- **Timestamping blockchain avec OpenTimestamps** (preuve d'existence décentralisée)

### Extraction et Lecture
- Extraction automatique du XML embarqué dans un PDF Factur-X
- Affichage formaté des informations sous forme de synthèse
- Visualisation du XML brut avec coloration syntaxique
- Téléchargement du fichier XML extrait
- **Vérification des timestamps blockchain** (.ots)
- Gestion d'erreurs avec messages explicites

## Détection automatique Dolibarr

Lorsque vous uploadez une facture PDF générée par Dolibarr, l'application détecte automatiquement les informations et prérempli les champs :

- **Numéro de facture** : Format FA1910-0084, FA2024-0001, etc.
- **Date d'émission** : Convertie automatiquement au format requis
- **Nom du vendeur** : Extrait et sauvegardé dans localStorage
- **Nom de l'acheteur** : Détecté depuis les informations client
- **Montants** : Total HT, TVA et TTC extraits automatiquement

Si la facture n'est pas au format Dolibarr, le formulaire reste vide et vous pouvez le remplir manuellement.

## Timestamping Blockchain avec OpenTimestamps

L'application intègre **OpenTimestamps**, une solution de timestamping décentralisée et gratuite qui utilise la blockchain Bitcoin pour certifier l'existence d'un document à un instant précis.

### Génération d'un timestamp

Après avoir généré votre facture Factur-X :

1. Cliquez sur **"Générer le timestamp blockchain (.ots)"**
2. Le hash SHA256 de votre PDF est envoyé aux serveurs OpenTimestamps
3. Un fichier `.ots` est créé contenant la preuve cryptographique
4. Téléchargez le fichier `.ots` pour le conserver avec votre facture

**Important** : Le timestamp n'est pas immédiatement confirmé sur la blockchain. Il faut attendre quelques heures (généralement 1-6h) pour que le timestamp soit ancré dans un bloc Bitcoin.

### Vérification d'un timestamp

Dans l'onglet **"Extraire XML"** :

1. Uploadez votre facture PDF originale
2. Uploadez le fichier `.ots` correspondant
3. Cliquez sur **"Vérifier le timestamp"**
4. L'application affiche :
   - La date et l'heure exacte du timestamp
   - Le hash SHA256 du fichier
   - Le numéro de bloc Bitcoin contenant la preuve

**Avantages d'OpenTimestamps** :
- ✓ Gratuit et open source
- ✓ Décentralisé (aucune autorité centrale)
- ✓ Preuve cryptographique inaltérable
- ✓ Vérifie que le document existait à une date précise
- ✓ Détecte toute modification ultérieure du fichier

## Technologies utilisées

- HTML5
- CSS3
- JavaScript (Vanilla)
- [pdf-lib](https://pdf-lib.js.org/) - Bibliothèque pour manipuler les PDF
- [pdf.js](https://mozilla.github.io/pdf.js/) - Extraction de texte des PDF
- [pako](https://github.com/nodeca/pako) - Décompression des streams PDF
- [OpenTimestamps](https://opentimestamps.org/) - Timestamping blockchain décentralisé

## Structure des fichiers

```
Facture-x/
├── index.html      # Page principale
├── style.css       # Styles de l'application
├── app.js          # Logique JavaScript
├── spec.md         # Spécifications techniques
└── README.md       # Documentation
```

## Conformité

Le XML généré est conforme au standard Factur-X version 1.0, profil MINIMUM, basé sur la norme UN/CEFACT Cross Industry Invoice (CII).

## Notes techniques

- Le fichier XML est embarqué sous le nom `factur-x.xml`
- Le type MIME utilisé est `text/xml`
- Le PDF résultant conserve toutes les propriétés du PDF original
- L'application fonctionne entièrement côté client (aucune donnée n'est envoyée à un serveur)

## Licence

Ce projet est fourni tel quel, libre d'utilisation.
