# Talent Engine — version multipage

## Pages
- `index.html` : tableau de bord et statistiques.
- `formulaire.html` : formulaire de saisie d'une candidature.
- `candidatures.html` : liste, recherche, filtres, détails et export CSV.
- `app.js` : logique commune aux pages.
- `style.css` : styles communs et responsive.

## Comment les données circulent
Lorsqu'un formulaire est soumis, la candidature est enregistrée dans `localStorage` du navigateur sous la clé `talentEngineCandidates_v1`. La page redirige ensuite vers le tableau de bord, qui relit ce stockage et actualise les statistiques et le classement. La page Candidatures lit le même stockage.

## Lancer le projet
1. Décompressez le ZIP.
2. Ouvrez `index.html` dans un navigateur.
3. Cliquez sur « Formulaire de candidature » pour ajouter un profil.
4. Après validation, vous revenez au tableau de bord et les statistiques sont actualisées.

## Limite à connaître
Le stockage est local à un navigateur et à un appareil. Il ne synchronise pas les candidatures entre plusieurs appareils ou recruteurs. Pour un véritable déploiement en ligne, il faut connecter un serveur et une base de données. Ne stockez pas de données sensibles dans cette version de démonstration.
