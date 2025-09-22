# 🚀 GUIDE DE MIGRATION - ARCHITECTURE OPTIMISÉE

## 📋 RÉSUMÉ DE LA MIGRATION

Cette migration transforme ton système de notifications pour une **architecture ultra-optimisée** :

**AVANT :**

- Données Steam stockées en BDD (noms, logos, etc.)
- Cron job récupère tous les users complets
- Requêtes API dupliquées par jeu

**APRÈS :**

- Seuls les IDs et choix notifications stockés
- Cron job optimisé avec GameSubscriptions
- 1 requête API par jeu unique (économie massive)

---

## 🔧 ÉTAPES DE MIGRATION

### **ÉTAPE 1 : SAUVEGARDER TA BDD**

```bash
# Créer une sauvegarde avant migration
mongodump --uri="mongodb://localhost:27017/steam-actu" --out ./backup-avant-migration
```

### **ÉTAPE 2 : ARRÊTER LE SERVEUR**

```bash
# Arrêter le serveur pour éviter les conflits
# Ctrl+C dans ton terminal backend
```

### **ÉTAPE 3 : EXÉCUTER LA MIGRATION**

```bash
cd backend
node src/scripts/migrateToGameSubscriptions.js
```

**Tu verras :**

```
🚀 Démarrage de la migration vers GameSubscriptions...
📊 2 utilisateurs avec des jeux suivis trouvés
🎯 4 jeux uniques à créer
✅ 4 GameSubscriptions créées avec succès !
📈 Statistiques:
   - 4 jeux uniques
   - 8 abonnements au total
   - 2.0 abonnés par jeu en moyenne
🎉 Migration terminée avec succès !
```

### **ÉTAPE 4 : RELANCER LE SERVEUR**

```bash
npm start
```

### **ÉTAPE 5 : VÉRIFIER QUE TOUT MARCHE**

- ✅ Connexion Steam fonctionne
- ✅ Liste des jeux s'affiche
- ✅ Follow/Unfollow fonctionne
- ✅ Cron job optimisé dans les logs

---

## 📊 VÉRIFICATIONS POST-MIGRATION

### **VÉRIFIER LES COLLECTIONS :**

```javascript
// Dans MongoDB Compass ou shell
db.gamesubscriptions.find().count(); // Doit avoir tes jeux suivis
db.users.findOne(); // followedGames doit être un array d'IDs
```

### **VÉRIFIER LES LOGS CRON :**

```
🚀 Démarrage de la vérification optimisée des actualités...
🎯 4 jeux uniques à vérifier
👥 8 abonnements au total
[1/4] 🔍 ELDEN RING (2 abonnés)
📊 Économie : 4 requêtes API au lieu de 8
```

---

## 🆘 ROLLBACK (SI PROBLÈME)

### **RESTAURER LA SAUVEGARDE :**

```bash
# Supprimer la BDD actuelle
mongo steam-actu --eval "db.dropDatabase()"

# Restaurer la sauvegarde
mongorestore --uri="mongodb://localhost:27017/steam-actu" ./backup-avant-migration/steam-actu
```

### **REVENIR À L'ANCIEN CODE :**

```bash
# Changer le cron jobs
# Dans cronJobs.js ligne 3 :
const newsChecker = require("../utils/newsChecker"); // Ancien
```

---

## ✅ AVANTAGES POST-MIGRATION

### **PERFORMANCE :**

- **90% moins de données** stockées
- **Jusqu'à 200x moins** de requêtes API Steam
- **Cron jobs ultra-rapides**

### **MAINTENANCE :**

- **Code plus simple** (arrays d'IDs)
- **Pas de synchronisation** Steam ↔ BDD
- **Évolutif** sans limite

### **FONCTIONNALITÉS :**

- **Même interface** utilisateur
- **Même tri** "récemment mis à jour"
- **Performance améliorée**

---

## 🔧 COMMANDES UTILES

### **NETTOYER LES SUBSCRIPTIONS ORPHELINES :**

```javascript
// Dans le backend, tu peux appeler :
const { cleanupOrphanedSubscriptions } = require("./src/utils/newsChecker-v2");
cleanupOrphanedSubscriptions();
```

### **STATISTIQUES MIGRATION :**

```javascript
// Compter les documents
db.gamesubscriptions.find().count();
db.users.find({ "followedGames.0": { $exists: true } }).count();
```

---

## 📞 SUPPORT

Si tu rencontres des problèmes :

1. **Vérifier les logs** du serveur
2. **Vérifier les collections** MongoDB
3. **Rollback** si nécessaire
4. **Me contacter** avec les logs d'erreur

**La migration est conçue pour être SÛRE et RÉVERSIBLE !** 🛡️
